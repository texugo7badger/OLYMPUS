/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

/**
 * OnboardingWizard — 4-step first-run wizard (v2).
 *
 * Shows on first launch (gated by ~/.olympus/onboarding-completed flag).
 *
 * Steps:
 *   1. Editor detection — auto-detect installed editors, let the user pick.
 *   2. Auth detection — check if OpenCode GO is authorized. If yes, skip
 *      to step 4. If no, show step 3.
 *   3. Free-tier config — guides the user to add Groq and/or OpenRouter API
 *      keys inside OpenCode (`olympus opencode` → Settings → Providers).
 *      One key is enough (OpenRouter recommended); a second adds the Groq
 *      path. Free models are picked automatically from the live provider
 *      lists (scripts/refresh-free-models.js).
 *   4. Strategy apply + first dispatch — apply the recommended strategy
 *      and let the user dispatch a first task to Apollo.
 *
 * The wizard is skippable (top-right "Skip" link) — the user can always
 * come back via Settings → "Run onboarding wizard again".
 *
 * Key UX changes from v1:
 *   - Step 2 detects GO plan auth (not just "OpenCode is authorized").
 *     If GO is detected, step 3 (free-tier config) is skipped entirely.
 *   - Step 3 has actual input fields for Groq + OpenRouter keys (not just
 *     instructions to edit a JSON file). The keys are saved via the
 *     /api/olympus/providers/keys endpoint, which also applies the
 *     recommended free strategy (free-openrouter) automatically.
 *   - Step 4 shows the active strategy + lets the user dispatch a first
 *     task. If no strategy is active, applies the recommended one.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Rocket, Check, AlertCircle, Loader2, ChevronRight, ChevronLeft, X,
  Terminal, Edit, Zap, Key, ExternalLink, ShieldCheck, Sparkles, RefreshCw,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DetectedEditor {
  id: string;
  displayName: string;
  binPath: string | null;
  source: 'PATH' | 'known-location' | null;
  homepage: string;
  tagline: string;
}

interface AuthStatus {
  configured: boolean;
  recommended_strategy: string;
  recommended_reason: string;
  go_plan: {
    configured: boolean;
    source: 'auth.json' | 'opencode.jsonc' | null;
    providers: string[];
    detail: string;
  };
  zen_plan: {
    configured: boolean;
    source: 'auth.json' | 'env' | null;
    detail: string;
  };
  free_tier: {
    groq_key: boolean;
    openrouter_key: boolean;
    nvidia_key: boolean;
    both_keys: boolean;
    source: string | null;
    sources: { groq: string | null; openrouter: string | null; nvidia: string | null };
    detail: string;
  };
  active_strategy: {
    strategy: string | null;
    applied_at: string | null;
    agent_count: number | null;
    god_prompts: string;
    demigods_loaded: boolean | null;
    detail: string;
  } | null;
  recommendations: Array<{ severity: string; action: string; command?: string }>;
}

/** Human label for the store a key was authorized in. */
function sourceLabel(src: string | null | undefined): string {
  if (src === 'auth.json') return 'via OpenCode auth';
  if (src === 'env') return 'via ~/.olympus/.env';
  if (src === 'llm-providers.json') return 'via legacy file';
  return '';
}

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [detected, setDetected] = useState<DetectedEditor[]>([]);
  const [preferred, setPreferred] = useState<string>('auto');
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstPrompt, setFirstPrompt] = useState('Plan a hello world React app with a single button that counts clicks.');
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);

  // Strategy application (step 3)
  const [applyingStrategy, setApplyingStrategy] = useState(false);
  const [strategyApplied, setStrategyApplied] = useState(false);

  // Load editor detection + auth status on open.
  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [editorStatus, auth] = await Promise.all([
        fetch('/api/olympus/editor/status', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/olympus/auth/status', { cache: 'no-store' }).then(r => r.json()),
      ]);
      setDetected(editorStatus?.detected || []);
      setPreferred(editorStatus?.config?.preferred || 'auto');
      setAuthStatus(auth);
    } catch (e) {
      console.error('Failed to load status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDispatchResult(null);
    setStrategyApplied(false);
    setAuthStatus(null);
    loadStatus();
  }, [open]);

  // After loading, if GO plan is configured, jump to step 3 (skip free-tier config)
  useEffect(() => {
    if (!loading && authStatus?.go_plan?.configured && step === 0) {
      // Don't auto-skip — let the user see the GO detection message on step 1
      // They can click "Next" to go to step 2 (auth status) which will show
      // the GO detection + auto-skip option
    }
  }, [loading, authStatus, step]);

  const markComplete = useCallback(async () => {
    try {
      await fetch('/api/olympus/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      });
    } catch {}
    onClose();
  }, [onClose]);

  const setEditor = useCallback(async (editorId: string) => {
    setPreferred(editorId);
    try {
      await fetch('/api/olympus/editor/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred: editorId }),
      });
    } catch {}
  }, []);

  const applyRecommendedStrategy = useCallback(async () => {
    if (!authStatus?.recommended_strategy || authStatus.recommended_strategy === '(none)') {
      toast.error('No strategy to apply — configure auth first');
      return false;
    }
    setApplyingStrategy(true);
    try {
      // Use the providers/keys endpoint with applyStrategy=true (it runs
      // apply-strategy.js with the recommended strategy)
      const r = await fetch('/api/olympus/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: authStatus.recommended_strategy }),
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        toast.success(`Strategy "${authStatus.recommended_strategy}" applied`);
        setStrategyApplied(true);
        await loadStatus();
        return true;
      } else {
        throw new Error(d.error || `HTTP ${r.status}`);
      }
    } catch (e: any) {
      // The /api/olympus/strategy endpoint may not exist in some versions.
      // Fall back to instructing the user to run apply-strategy.js manually.
      toast.error(`Could not auto-apply strategy: ${e.message}. Run: node scripts/apply-strategy.js --strategy ${authStatus?.recommended_strategy}`);
      return false;
    } finally {
      setApplyingStrategy(false);
    }
  }, [authStatus, loadStatus]);

  const dispatchFirstPrompt = useCallback(async () => {
    setDispatching(true);
    setDispatchResult(null);
    try {
      const r = await fetch('/api/olympus/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prompt', text: firstPrompt }),
      });
      const d = await r.json();
      if (r.ok) {
        setDispatchResult('Task dispatched to Apollo! Check the Interactive Terminal tab for the response.');
        toast.success('First task dispatched to Apollo');
      } else {
        throw new Error(d.error || `HTTP ${r.status}`);
      }
    } catch (e: any) {
      setDispatchResult(`Error: ${e.message}`);
      toast.error(`Dispatch failed: ${e.message}`);
    } finally {
      setDispatching(false);
    }
  }, [firstPrompt]);

  // Build steps dynamically based on auth status
  const isGoPath = authStatus?.go_plan?.configured === true;
  const isZenPath = !isGoPath && authStatus?.zen_plan?.configured === true;
  const steps = isGoPath
    ? [
        { icon: Edit, label: 'Editor', title: 'Pick your editor' },
        { icon: ShieldCheck, label: 'GO Plan', title: 'OpenCode GO detected' },
        { icon: Zap, label: 'Dispatch', title: 'Apply strategy + dispatch' },
      ]
    : isZenPath
      ? [
          { icon: Edit, label: 'Editor', title: 'Pick your editor' },
          { icon: ShieldCheck, label: 'ZEN', title: 'OpenCode ZEN detected' },
          { icon: Zap, label: 'Dispatch', title: 'Apply strategy + dispatch' },
        ]
      : [
          { icon: Edit, label: 'Editor', title: 'Pick your editor' },
          { icon: ShieldCheck, label: 'Auth', title: 'Choose your auth path' },
          { icon: Key, label: 'Free Keys', title: 'Configure free-tier API keys' },
          { icon: Zap, label: 'Dispatch', title: 'Apply strategy + dispatch' },
        ];

  return (
    <Dialog open={open} onOpenChange={(b) => !b && markComplete()}>
      <DialogContent className="bg-olympus-panel border-olympus-gold/20 text-olympus-text max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-olympus-gold flex items-center gap-2">
            <Rocket size={16} />
            Welcome to OLYMPUS
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-4">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={i} className="flex items-center flex-1">
                <div className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wide transition-all',
                  isActive ? 'bg-olympus-gold/20 text-olympus-gold ring-1 ring-olympus-gold/40' :
                  isDone ? 'text-olympus-green' : 'text-olympus-text-dim',
                )}>
                  {isDone ? <Check size={11} /> : <Icon size={11} />}
                  <span>{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={cn('h-px flex-1 mx-1', isDone ? 'bg-olympus-green/30' : 'bg-olympus-gold/10')} />
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={markComplete}
            className="ml-2 text-[10px] font-mono text-olympus-text-dim hover:text-olympus-text focus:outline-none"
          >
            Skip <X size={9} className="inline" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-olympus-text-dim text-[11px] font-mono">
            <Loader2 size={14} className="animate-spin mr-2" /> Detecting auth status...
          </div>
        ) : (
          <>
            {/* Step 0: Editor detection */}
            {step === 0 && (
              <div>
                <h3 className="text-sm font-mono text-olympus-text mb-2">{steps[0].title}</h3>
                <p className="text-[11px] text-olympus-text-dim font-mono mb-3 leading-relaxed">
                  OLYMPUS doesn't ship a built-in code editor. Pick which installed editor OLYMPUS should launch
                  when you click "Open in Editor". You can change this later in Settings.
                </p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scroll">
                  {detected.filter(e => e.binPath).map(ed => (
                    <button
                      key={ed.id}
                      onClick={() => setEditor(ed.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded border text-left transition-all',
                        preferred === ed.id
                          ? 'border-olympus-gold/40 bg-olympus-gold/10'
                          : 'border-olympus-gold/10 hover:bg-olympus-gold/5',
                      )}
                    >
                      {preferred === ed.id && <Check size={12} className="text-olympus-gold" />}
                      <div className="flex-1 min-w-0">
                        <div className={cn('text-[12px] font-mono font-semibold', preferred === ed.id ? 'text-olympus-gold' : 'text-olympus-text')}>
                          {ed.displayName}
                        </div>
                        <div className="text-[9px] font-mono text-olympus-text-dim truncate">{ed.binPath}</div>
                      </div>
                    </button>
                  ))}
                  {detected.filter(e => e.binPath).length === 0 && (
                    <div className="text-[11px] font-mono text-olympus-red bg-olympus-red/10 border border-olympus-red/20 rounded p-3">
                      <AlertCircle size={12} className="inline mr-1" />
                      No editors detected. Install Zed, VSCode, VSCodium, or Cursor, then refresh.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 1: Auth detection */}
            {step === 1 && (
              <div>
                <h3 className="text-sm font-mono text-olympus-text mb-2">{steps[1].title}</h3>

                {isGoPath ? (
                  /* GO plan detected — show success + skip to dispatch */
                  <div className="space-y-3">
                    <div className="text-[11px] font-mono text-olympus-green bg-olympus-green/10 border border-olympus-green/20 rounded p-3">
                      <ShieldCheck size={12} className="inline mr-1" />
                      OpenCode GO plan detected!
                      <div className="text-[10px] mt-1 text-olympus-text-dim">
                        {authStatus?.go_plan.detail}
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-olympus-text-dim leading-relaxed">
                      You're ready for the full OLYMPUS experience: 10 gods + 118 demigods = 128 agents,
                      all 8 plugins, full prompt fidelity. Click <strong>Next</strong> to apply the
                      recommended strategy and dispatch your first task.
                    </div>
                    <div className="text-[10px] font-mono text-olympus-amber-soft bg-olympus-amber-soft/5 border border-olympus-amber-soft/20 rounded p-2">
                      <Sparkles size={10} className="inline mr-1" />
                      Recommended strategy: <strong>{authStatus?.recommended_strategy}</strong>
                      <div className="text-[9px] mt-0.5 text-olympus-text-dim">{authStatus?.recommended_reason}</div>
                    </div>
                  </div>
                ) : isZenPath ? (
                  /* Zen plan detected — show success + skip to dispatch */
                  <div className="space-y-3">
                    <div className="text-[11px] font-mono text-olympus-green bg-olympus-green/10 border border-olympus-green/20 rounded p-3">
                      <ShieldCheck size={12} className="inline mr-1" />
                      OpenCode ZEN detected!
                      <div className="text-[10px] mt-1 text-olympus-text-dim">
                        {authStatus?.zen_plan.detail}
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-olympus-text-dim leading-relaxed">
	                      You're ready for the full 128-agent OLYMPUS experience on ZEN's pay-as-you-go models
	                      (opencode/&lt;id&gt;) — no request caps, zero-retention. Click <strong>Next</strong> to apply
                      the recommended strategy and dispatch your first task.
                    </div>
                    <div className="text-[10px] font-mono text-olympus-amber-soft bg-olympus-amber-soft/5 border border-olympus-amber-soft/20 rounded p-2">
                      <Sparkles size={10} className="inline mr-1" />
                      Recommended strategy: <strong>{authStatus?.recommended_strategy}</strong>
                      <div className="text-[9px] mt-0.5 text-olympus-text-dim">{authStatus?.recommended_reason}</div>
                    </div>
                  </div>
                ) : (
                  /* No GO/Zen plan — show options */
                  <div className="space-y-3">
                    <p className="text-[11px] text-olympus-text-dim font-mono leading-relaxed">
                      OLYMPUS uses OpenCode as its CLI. You need to authorize OpenCode with a GO plan
                      account (paid, best quality), an OpenCode Zen key (pay-as-you-go, no request caps),
                      or free-tier API keys (OpenRouter and/or NVIDIA Build — both free).
                    </p>

                    <div className="text-[11px] font-mono text-olympus-amber-soft bg-olympus-amber-soft/10 border border-olympus-amber-soft/20 rounded p-3">
                      <AlertCircle size={12} className="inline mr-1" />
                      No GO/Zen plan detected. Choose one of these options:
                    </div>

                    {/* Option A: GO plan */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-mono text-olympus-text-dim uppercase">
                        Option A: GO plan (recommended for full quality)
                      </div>
                      <pre className="text-[10px] font-mono text-olympus-text bg-olympus-bg border border-olympus-gold/10 rounded p-2 overflow-x-auto">
{`# Run in a terminal, sign in with your GO account, then exit:
olympus opencode

# Or sign in at https://opencode.ai/docs/go/`}
                      </pre>
                      <div className="text-[10px] font-mono text-olympus-text-dim">
                        After signing in, click <em>Refresh</em> or restart OLYMPUS to detect the GO plan.
                      </div>
                    </div>

                    {/* Option C: Zen plan (pay-as-you-go) */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-mono text-olympus-text-dim uppercase">
                        Option B: ZEN Plan (pay-as-you-go — full 128 agents, no caps)
                      </div>
                      <pre className="text-[10px] font-mono text-olympus-text bg-olympus-bg border border-olympus-gold/10 rounded p-2 overflow-x-auto">
{`# Run in a terminal, then /connect and pick OpenCode Zen:
olympus opencode`}
                      </pre>
                      <div className="text-[10px] font-mono text-olympus-text-dim leading-relaxed">
	                        Paste your ZEN API key (opencode.ai/zen). Zero-retention, charged per request — no
                        request caps, so the full 128-agent OLYMPUS runs on it. Learn more:
                        <a href="https://opencode.ai/docs/zen/" target="_blank" rel="noopener noreferrer" className="text-olympus-gold ml-1">
                          opencode.ai/docs/zen <ExternalLink size={9} className="inline" />
                        </a>
                      </div>
                    </div>

                    {/* Option C: Free-tier */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-mono text-olympus-text-dim uppercase">
                        Option C: Free-tier (no plan needed)
                      </div>
                      <div className="text-[11px] font-mono text-olympus-text leading-relaxed">
                        Get a free API key (one provider is enough — OpenRouter is the most reliable; NVIDIA Build adds the GLM-5.3 / Nemotron endpoints):
                      </div>
                      <div className="flex gap-2">
                        <a
                          href="https://openrouter.ai/keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] font-mono text-olympus-gold hover:text-olympus-gold/80 border border-olympus-gold/20 rounded px-2 py-1"
                        >
                          OpenRouter keys <ExternalLink size={9} />
                        </a>
                        <a
                          href="https://build.nvidia.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] font-mono text-olympus-gold hover:text-olympus-gold/80 border border-olympus-gold/20 rounded px-2 py-1"
                        >
                          NVIDIA Build keys <ExternalLink size={9} />
                        </a>
                      </div>
                      <div className="text-[10px] font-mono text-olympus-amber-soft bg-olympus-amber-soft/5 border border-olympus-amber-soft/20 rounded p-2">
                        <strong>One key is enough.</strong> The Free strategy routes gods to the strongest free models
                        currently live (nemotron-3-ultra-550b with 1M context, super-120b, ling-3.0-flash) — refreshed
                        automatically from the provider lists. A Groq key adds the second path; an NVIDIA Build key unlocks the free GLM-5.3 / Nemotron endpoints.
                      </div>
                      <div className="text-[10px] font-mono text-olympus-text-dim">
                        Click <strong>Next</strong> for step-by-step instructions on adding the keys inside OpenCode (Step 2).
                      </div>
                    </div>

                    <Button
                      onClick={loadStatus}
                      variant="ghost"
                      className="text-[10px] font-mono text-olympus-text-dim hover:text-olympus-text h-7"
                    >
                      <Loader2 size={10} className="mr-1" /> Re-check auth status
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Free-tier key config (only on free path) */}
            {step === 2 && !isGoPath && !isZenPath && (
              <div>
                <h3 className="text-sm font-mono text-olympus-text mb-2">{steps[2].title}</h3>
                <p className="text-[11px] text-olympus-text-dim font-mono mb-3 leading-relaxed">
                  OLYMPUS uses OpenCode's own provider system for free-tier API keys.
                  Configure your Groq, OpenRouter and/or NVIDIA Build keys inside OpenCode's settings.
                </p>

                <div className="space-y-3">
                  {/* Instructions */}
                  <div className="bg-olympus-bg border border-olympus-gold/10 rounded p-3 space-y-2">
                    <div className="text-[11px] font-mono text-olympus-text">
                      <strong>1.</strong> Run this command in a terminal:
                    </div>
                    <pre className="text-[10px] font-mono text-olympus-gold bg-olympus-bg/50 border border-olympus-gold/10 rounded p-2 overflow-x-auto">
{`olympus opencode`}
                    </pre>
                    <div className="text-[11px] font-mono text-olympus-text">
                      <strong>2.</strong> Inside OpenCode's interface, open <strong>Settings</strong>.
                    </div>
                    <div className="text-[11px] font-mono text-olympus-text">
                      <strong>3.</strong> Add <strong>Groq</strong>, <strong>OpenRouter</strong> and/or <strong>NVIDIA Build</strong> as API providers with your keys.
                    </div>
                    <div className="text-[11px] font-mono text-olympus-text">
                      <strong>4.</strong> Exit OpenCode (Ctrl+C) and click <strong>Refresh</strong> below.
                    </div>

                    <div className="flex gap-2 mt-2">
                      <a
                        href="https://console.groq.com/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] font-mono text-olympus-gold hover:text-olympus-gold/80 border border-olympus-gold/20 rounded px-2 py-1"
                      >
                        Get Groq key <ExternalLink size={9} />
                      </a>
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] font-mono text-olympus-gold hover:text-olympus-gold/80 border border-olympus-gold/20 rounded px-2 py-1"
                      >
                        Get OpenRouter key <ExternalLink size={9} />
                      </a>
                      <a
                        href="https://build.nvidia.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] font-mono text-olympus-gold hover:text-olympus-gold/80 border border-olympus-gold/20 rounded px-2 py-1"
                      >
                        Get NVIDIA Build key <ExternalLink size={9} />
                      </a>
                    </div>
                  </div>

                  {/* Auth status */}
                  <div className="text-[11px] font-mono">
                    {authStatus?.free_tier &&
                    (authStatus.free_tier.groq_key ||
                      authStatus.free_tier.openrouter_key ||
                      authStatus.free_tier.nvidia_key) ? (
                      <div className="text-olympus-green bg-olympus-green/10 border border-olympus-green/20 rounded p-2 space-y-0.5">
                        <div className="flex items-center gap-1">
                          <Check size={11} className="inline mr-1" />
                          Keys authorized in OpenCode:
                        </div>
                        {([
                          { key: 'groq', label: 'Groq' },
                          { key: 'openrouter', label: 'OpenRouter' },
                          { key: 'nvidia', label: 'NVIDIA Build' },
                        ] as Array<{ key: 'groq' | 'openrouter' | 'nvidia'; label: string }>)
                          .filter(p => authStatus?.free_tier?.[`${p.key}_key`])
                          .map(p => (
                            <div key={p.key} className="pl-5 text-olympus-green">
                              {p.label}{' '}
                              <span className="text-olympus-text-dim/80">
                                ✓ {sourceLabel(authStatus?.free_tier?.sources?.[p.key])}
                              </span>
                            </div>
                          ))}
                        {authStatus?.active_strategy?.strategy && (
                          <div className="pl-5 text-olympus-text-dim/80">
                            Active strategy: {authStatus.active_strategy.strategy}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-olympus-amber-soft bg-olympus-amber-soft/10 border border-olympus-amber-soft/20 rounded p-2">
                        <AlertCircle size={11} className="inline mr-1" />
                        No free-tier keys detected yet.
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={loadStatus}
                    variant="ghost"
                    className="w-full bg-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/30 border-olympus-gold/30 font-mono text-[11px] h-8"
                  >
                    <RefreshCw size={12} className="mr-1" />
                    Refresh — check for configured keys
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2 (GO/Zen path) / Step 3 (free path): Strategy + dispatch */}
            {((isGoPath && step === 2) || (isZenPath && step === 2) || (!isGoPath && !isZenPath && step === 3)) && (
              <div>
                <h3 className="text-sm font-mono text-olympus-text mb-2">{steps[isGoPath || isZenPath ? 2 : 3].title}</h3>

                {/* Strategy status */}
                <div className="space-y-2 mb-3">
                  {authStatus?.active_strategy?.strategy ? (
                    <div className="text-[11px] font-mono text-olympus-green bg-olympus-green/10 border border-olympus-green/20 rounded p-2">
                      <Check size={11} className="inline mr-1" />
                      Strategy <strong>{authStatus.active_strategy.strategy}</strong> active
                      <div className="text-[9px] mt-0.5 text-olympus-text-dim">
                        {authStatus.active_strategy.agent_count} agents ·{' '}
                        {authStatus.active_strategy.demigods_loaded ? '128 demigods loaded' : '10 gods only'} ·{' '}
                        god prompts: {authStatus.active_strategy.god_prompts}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-olympus-amber-soft bg-olympus-amber-soft/10 border border-olympus-amber-soft/20 rounded p-2">
                      <AlertCircle size={11} className="inline mr-1" />
                      No strategy applied yet. Click below to apply the recommended strategy.
                    </div>
                  )}

                  {!authStatus?.active_strategy?.strategy && authStatus?.recommended_strategy && authStatus.recommended_strategy !== '(none)' && (
                    <Button
                      onClick={applyRecommendedStrategy}
                      disabled={applyingStrategy}
                      className="w-full bg-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/30 border-olympus-gold/30 font-mono text-[11px] h-8"
                    >
                      {applyingStrategy ? <Loader2 size={12} className="animate-spin mr-1" /> : <Zap size={12} className="mr-1" />}
                      Apply strategy: {authStatus.recommended_strategy}
                    </Button>
                  )}
                  {strategyApplied && (
                    <div className="text-[10px] font-mono text-olympus-green">Strategy applied successfully.</div>
                  )}
                </div>

                {/* First dispatch */}
                <p className="text-[11px] text-olympus-text-dim font-mono mb-2 leading-relaxed">
                  Try dispatching a task to Apollo. Apollo will plan the task and dispatch to specialist gods
                  (Athena for frontend, Hephaestus for backend, etc.) via Symphony.
                </p>
                <textarea
                  value={firstPrompt}
                  onChange={e => setFirstPrompt(e.target.value)}
                  className="w-full bg-olympus-bg border border-olympus-gold/20 text-olympus-text font-mono text-[11px] p-2 rounded resize-none h-20"
                  placeholder="Describe a task for Apollo..."
                />
                <Button
                  onClick={dispatchFirstPrompt}
                  disabled={dispatching || !firstPrompt.trim() || !authStatus?.active_strategy?.strategy}
                  className="w-full mt-2 bg-olympus-gold text-olympus-bg hover:bg-olympus-gold/90 font-mono text-[11px] h-8"
                >
                  {dispatching ? <Loader2 size={12} className="animate-spin mr-1" /> : <Zap size={12} className="mr-1" />}
                  Dispatch to Apollo
                </Button>
                {!authStatus?.active_strategy?.strategy && (
                  <div className="text-[9px] font-mono text-olympus-text-dim mt-1">
                    Apply a strategy above before dispatching.
                  </div>
                )}
                {dispatchResult && (
                  <div className={cn(
                    'text-[10px] font-mono mt-2 p-2 rounded border',
                    dispatchResult.startsWith('Error')
                      ? 'text-olympus-red bg-olympus-red/10 border-olympus-red/20'
                      : 'text-olympus-green bg-olympus-green/10 border-olympus-green/20',
                  )}>
                    {dispatchResult}
                  </div>
                )}
                {dispatchResult && !dispatchResult.startsWith('Error') && (
                  <Button
                    onClick={markComplete}
                    className="w-full mt-2 bg-olympus-green/20 text-olympus-green hover:bg-olympus-green/30 border-olympus-green/30 font-mono text-[11px] h-8"
                  >
                    <Check size={12} className="mr-1" /> Done — take me to OLYMPUS
                  </Button>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-olympus-gold/10">
              <Button
                variant="ghost"
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
                className="text-olympus-text-dim hover:text-olympus-text hover:bg-olympus-gold/5 font-mono text-[11px] h-7"
              >
                <ChevronLeft size={12} className="mr-1" /> Back
              </Button>
              <div className="text-[9px] font-mono text-olympus-text-dim">
                Step {step + 1} of {steps.length}
              </div>
              {step < steps.length - 1 ? (
                <Button
                  onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))}
                  className="bg-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/30 border-olympus-gold/30 font-mono text-[11px] h-7"
                >
                  Next <ChevronRight size={12} className="ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={markComplete}
                  className="bg-olympus-green/20 text-olympus-green hover:bg-olympus-green/30 border-olympus-green/30 font-mono text-[11px] h-7"
                >
                  Finish <Check size={12} className="ml-1" />
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
