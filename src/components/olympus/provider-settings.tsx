/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { useOlympus, type LLMStrategy } from '@/lib/olympus-store';
import { SlidersHorizontal, AlertCircle, Terminal, Zap, Loader2, Check, ArrowRight, ExternalLink, Lock, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { strategyApiRequirement } from '@/lib/model-strategies';

interface AuthStatus {
  configured: boolean;
  recommended_strategy: string;
  go_plan: { configured: boolean; source: string | null; providers: string[]; detail: string };
  zen_plan: { configured: boolean; source: string | null; detail: string };
  free_tier: { groq_key: boolean; openrouter_key: boolean; nvidia_key: boolean; both_keys: boolean; source: string | null; sources: { groq: string | null; openrouter: string | null; nvidia: string | null }; detail: string };
  active_strategy: { strategy: string | null; applied_at: string | null; agent_count: number | null; god_prompts: string; demigods_loaded: boolean | null; detail: string } | null;
  recommendations: Array<{ severity: string; action: string; command?: string }>;
}

/** Free-tier providers surfaced in the panel — id → display label + key page. */
const FREE_PROVIDERS: Array<{ id: 'openrouter' | 'nvidia'; label: string; keyUrl: string }> = [
  { id: 'openrouter', label: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'nvidia', label: 'NVIDIA Build', keyUrl: 'https://build.nvidia.com' },
];

/** Which free strategy needs which provider key. */
const FREE_STRATEGY_PROVIDER: Record<string, 'openrouter' | 'nvidia'> = {
  'free-openrouter': 'openrouter',
  'free-big-pickle': 'openrouter', // the flagship default is an OpenRouter model
  'free-nvidia-build': 'nvidia',
};

/** Human label for the store a key was authorized in. */
function sourceLabel(src: string | null | undefined): string {
  if (src === 'auth.json') return 'OpenCode auth';
  if (src === 'opencode.jsonc') return 'OpenCode config';
  if (src === 'env') return '~/.olympus/.env';
  if (src === 'llm-providers.json') return 'legacy file';
  return '';
}

/* ------------------------------------------------------------------ */
/* Provider Settings — minimalist refactor.                            */
/*                                                                     */
/* impeccable `distill` pass:                                          */
/*   - Was 333 lines, mostly redundant strategy card grids + provider  */
/*     list with verbose descriptions. Now ~180 lines, single column.  */
/*   - One strategy summary at the top (the active one).               */
/*   - One-line strategy switcher (the 3 GO plans as a segmented        */
/*     control; custom strategies as a small chip row if any exist).   */
/*   - Provider summary is 2 lines (default + optional Callimachus     */
/*     override). No re-explaining what's already in the docs.         */
/*   - "Switch in Settings" callout is one sentence, not a paragraph.  */
/*                                                                     */
/* Read-only here. Switching is done via the SettingsDialog modal      */
/* (which is the canonical place for write operations).                */
/* ------------------------------------------------------------------ */

interface StrategyEntry {
  id: string;
  label: string;
  description: string;
  plan?: 'GO' | 'ZEN' | 'CUSTOM';
  tier?: 'quality' | 'balanced' | 'budget' | 'free' | 'custom';
  terminalModel?: string;
  estCostPerDay: 'low' | 'moderate' | 'higher' | 'free' | string;
  isCustom?: boolean;
}

interface ProviderSettingsData {
  strategy?: string;
  availableStrategies?: StrategyEntry[];
  customStrategies?: StrategyEntry[];
  availableProviders?: { id: string; displayName: string; isFree: boolean; description: string }[];
  default_provider?: string;
  /** ISO date the GO plan details were last verified. */
  go_plan_last_verified?: string;
  /** canonical docs URL. */
  go_plan_docs_url?: string;
  /** ISO date the Zen plan details were last verified. */
  zen_plan_last_verified?: string;
  /** canonical Zen docs URL. */
  zen_plan_docs_url?: string;
  /** per-god current model classes (from opencode.json via /providers/gods). */
  gods?: Array<{ id: string; current_class: string }>;
}

function fallbackData(): ProviderSettingsData {
  return {
    strategy: 'go-balanced',
    availableStrategies: [
	      { id: 'go-max-quality',  label: 'GO Max Quality',  description: 'Best quality. Apollo: GLM-5.2. Athena+Hephaestus: Kimi K3 (490/mo). Others: K2.7 Code. Vault: Flash. — switch to go-balanced when exhausted.', plan: 'GO',  tier: 'quality',  terminalModel: 'glm-5.2',           estCostPerDay: 'higher' },
	      { id: 'go-balanced',     label: 'GO Balanced',     description: 'Sustainable 8h/day. Apollo: GLM-5.2 (4,300/mo). Specialists: Qwen3.7 Plus (21,600/mo) + DeepSeek V4 Pro (17,150/mo).',     plan: 'GO',  tier: 'balanced', terminalModel: 'glm-5.2',           estCostPerDay: 'moderate' },
	      { id: 'go-budget',       label: 'GO Budget',       description: 'Apollo: GLM-5.2. Atlas: Hy3. All others: DeepSeek V4 Flash.',                                        plan: 'GO',  tier: 'budget',   terminalModel: 'hy3',              estCostPerDay: 'low' },
      { id: 'zen-max-quality', label: 'ZEN Max Quality', description: 'Frontier quality on OpenCode Zen (pay-as-you-go, no request caps) — proprietary APIs. Apollo: GLM-5.2. Atlas: Gemini 3.5 Flash. Athena+Hephaestus: Claude Sonnet 5. Others: GPT-5.4. Vault: Gemini 3.5 Flash.', plan: 'ZEN', tier: 'quality', terminalModel: 'opencode/glm-5.2', estCostPerDay: 'higher' },
      { id: 'zen-balanced',    label: 'ZEN Balanced', description: 'Full OLYMPUS on OpenCode Zen (pay-as-you-go, no request caps) — proprietary APIs. Apollo: GLM-5.2. Atlas: Gemini 3.5 Flash. Athena+Hephaestus: Claude Sonnet 5. Specialists: Kimi K2.7 Code. Vault: MiniMax M2.7.', plan: 'ZEN', tier: 'balanced', terminalModel: 'opencode/glm-5.2',  estCostPerDay: 'moderate' },
      { id: 'zen-budget',      label: 'ZEN Budget',   description: 'Lowest cost on OpenCode Zen (pay-as-you-go, no request caps) — proprietary APIs. Apollo: GLM-5.2. Atlas: Gemini 3.5 Flash. All others: MiniMax M2.7.', plan: 'ZEN', tier: 'budget', terminalModel: 'opencode/glm-5.2', estCostPerDay: 'low' },
      { id: 'free-openrouter', label: 'Free OpenRouter', description: 'All gods on OpenRouter\'s strongest free models live right now — primary trio on #1, specialists on #2, Callimachus on a fast background model.', plan: 'CUSTOM', tier: 'free', terminalModel: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', estCostPerDay: 'free' },
      { id: 'free-big-pickle', label: 'Free Big Pickle', description: 'All 10 gods (Callimachus included) on one free model — the strongest currently live, refreshed automatically.', plan: 'CUSTOM', tier: 'free', terminalModel: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', estCostPerDay: 'free' },
      { id: 'free-nvidia-build', label: 'Free Nvidia Build', description: 'NVIDIA Build free endpoints — the DISTRIBUTED PANTHEON: per-god model lanes on the user-pinned anchors (GLM-5.3 / GLM-5.3-Flash / Kimi K3 / Muse Glimmer), per-family client pools, no single pool, NO Nemotron (the user\'s ban). The anchor set is pinned — the refresh verifies availability, never replaces.', plan: 'CUSTOM', tier: 'free', terminalModel: 'nvidia-glm/z-ai/glm-5.3', estCostPerDay: 'free' },
    ],
    customStrategies: [],
    availableProviders: [
      { id: 'opencode-go', displayName: 'OpenCode GO', isFree: false, description: 'Paid subscription — see docs for current pricing' },
      { id: 'opencode', displayName: 'OpenCode ZEN', isFree: false, description: 'Pay-as-you-go — see docs for current pricing' },
    ],
    default_provider: 'opencode-go',
    go_plan_last_verified: '2026-07-29',
    go_plan_docs_url: 'https://opencode.ai/docs/go/',
    zen_plan_last_verified: '2026-07-31',
    zen_plan_docs_url: 'https://opencode.ai/docs/zen/',
  };
}

export default function ProviderSettings() {
  const setLlmStrategy = useOlympus(s => s.setLlmStrategy);
  const storeStrategy = useOlympus(s => s.llmStrategy);
  const setSettingsOpen = useOlympus(s => s.setSettingsOpen);
  const [data, setData] = useState<ProviderSettingsData | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [strategyWarn, setStrategyWarn] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setUsingFallback(false);

    (async () => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch('/api/olympus/providers/gods', { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const d = await res.json();
        if (cancelled) return;
        setData(d as ProviderSettingsData);
      } catch {
        if (cancelled) return;
        setData(fallbackData());
        setUsingFallback(true);
      }
    })();

    return () => { cancelled = true; };
  }, [refreshKey]);

  // Fetch auth status (detects keys from OpenCode's auth.json)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/olympus/auth/status', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setAuthStatus(d);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!data) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-olympus-text-dim bg-olympus-bg gap-2">
        <Loader2 size={18} className="animate-spin text-olympus-gold" />
        <span className="text-[10px] font-mono">loading…</span>
      </div>
    );
  }

  const allStrategies = [
    ...(data.availableStrategies ?? []),
    ...(data.customStrategies ?? []),
  ];
  const activeStrategy = allStrategies.find(s => s.id === (data.strategy ?? storeStrategy));
  const goStrategies = (data.availableStrategies ?? []).filter(s => s.plan === 'GO');
  const zenStrategies = (data.availableStrategies ?? []).filter(s => s.plan === 'ZEN');
  const freeStrategies = (data.availableStrategies ?? []).filter(s => s.plan === 'CUSTOM' && s.tier === 'free');
  const customStrategies = data.customStrategies ?? [];

  const freeKeys: Record<'openrouter' | 'nvidia', boolean> = {
    openrouter: authStatus?.free_tier?.openrouter_key ?? false,
    nvidia: authStatus?.free_tier?.nvidia_key ?? false,
  };
  const freeSources: Record<'openrouter' | 'nvidia', string | null> = {
    openrouter: authStatus?.free_tier?.sources?.openrouter ?? null,
    nvidia: authStatus?.free_tier?.sources?.nvidia ?? null,
  };
  const activeAppliedStrategy = authStatus?.active_strategy?.strategy ?? null;
  const activeFreeNeedsKey = activeAppliedStrategy?.startsWith('free-')
    ? (FREE_STRATEGY_PROVIDER[activeAppliedStrategy] ?? null)
    : null;
  const unlockedFreeStrategies = Object.entries(FREE_STRATEGY_PROVIDER)
    .filter(([, provider]) => freeKeys[provider])
    .map(([id]) => id);
  const hasGoPlan = authStatus?.go_plan?.configured || false;
  const hasZen = authStatus?.zen_plan?.configured || false;
  // While auth status is still loading (or unavailable), don't block — we
  // can't verify keys, so blocking would confuse users with valid auth.
  const authKnown = authStatus !== null;
  const isOnGoStrategy = activeStrategy?.plan === 'GO';
  const isOnZenStrategy = activeStrategy?.plan === 'ZEN';
  // Header badge — the plan the active strategy belongs to.
  const activePlan = isOnZenStrategy ? 'OpenCode ZEN' : isOnGoStrategy ? 'OpenCode GO' : 'Free tier';

  // Shared strategy-apply handler (GO / Zen / Free cards)
  const applyStrategy = async (id: string, warn: string | null) => {
    setRefreshKey(k => k+1);
    setStrategyWarn(warn);
    try {
      const r = await fetch('/api/olympus/providers/gods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: id }),
      });
      const d = await r.json();
      if (d.ok) {
        setLlmStrategy(id as LLMStrategy);
        if (data) setData({ ...data, strategy: id });
        window.dispatchEvent(new CustomEvent('olympus:strategy-changed', { detail: { strategy: id } }));
      } else {
        setStrategyWarn(d.error || 'Failed to apply strategy');
      }
    } catch (e: any) {
      setStrategyWarn(e.message);
    }
  };

  const deleteCustomStrategy = async (customStrategyId: string) => {
    if (!confirm(`Delete custom strategy ${customStrategyId}?`)) return;
    try {
      const res = await fetch(`/api/olympus/providers/gods?customStrategy=${customStrategyId}`, {
        method: 'DELETE',
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to delete custom strategy');
      setRefreshKey(k => k+1);
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scroll bg-olympus-bg p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal size={16} className="text-olympus-gold" />
        <h2 className="text-sm font-semibold text-olympus-gold">LLM Strategy</h2>
        <span className="text-[9px] text-olympus-text-dim font-mono ml-auto">{activePlan}</span>
      </div>

      {/* Fallback banner — only when offline */}
      {usingFallback && (
        <div className="flex items-start gap-2 rounded-lg border border-olympus-amber-soft/30 bg-olympus-amber-soft/5 p-2.5 mb-3">
          <AlertCircle size={12} className="text-olympus-amber-soft mt-0.5 shrink-0" />
          <div className="text-[10px] font-mono text-olympus-text leading-relaxed">
            <span className="text-olympus-amber-soft font-semibold">Offline:</span>{' '}
            showing defaults. Edits will save when the API is back.
          </div>
        </div>
      )}

      {/* Active strategy summary — one card */}
      <div className="rounded-lg border border-olympus-gold/30 bg-olympus-gold/5 p-3 mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide">Active</span>
          <span className="text-[9px] font-mono text-olympus-green uppercase tracking-wide">
            {activeStrategy?.tier === 'free' ? 'FREE' : `cost: ${activeStrategy?.estCostPerDay ?? '—'}`}
          </span>
        </div>
        <div className="text-sm font-mono font-semibold text-olympus-gold mb-1">
          {activeStrategy?.label ?? data.strategy ?? 'go-balanced'}
        </div>
        <div className="text-[10px] font-mono text-olympus-text-dim leading-relaxed">
          {activeStrategy?.description ?? 'OpenCode GO plan'}
        </div>
        {activeStrategy?.terminalModel && (
          <div className="text-[9px] font-mono text-olympus-text-dim/80 mt-1">
            terminal: <code className="text-olympus-gold">{activeStrategy.terminalModel}</code>
          </div>
        )}
      </div>

      {/* Plan APIs — GO + ZEN authorized status (one place each, same pattern as free-tier providers) */}
      <div className="rounded-lg border border-olympus-gold/15 bg-olympus-card p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Zap size={12} className="text-olympus-gold" />
          <span className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide">
            Plan APIs
          </span>
          <span className="text-[8px] px-1 py-0.5 rounded bg-olympus-gold/15 text-olympus-gold ml-auto font-mono">
            authorized inside OpenCode
          </span>
        </div>

        <div className="text-[10px] font-mono mb-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-olympus-text-dim w-28">GO API:</span>
            {hasGoPlan ? (
              <span className="text-olympus-green">✓ Configured</span>
            ) : (
              <span className="text-olympus-red/60">— Not configured</span>
            )}
            {hasGoPlan && sourceLabel(authStatus?.go_plan?.source) && (
              <span className="text-[9px] text-olympus-text-dim">({sourceLabel(authStatus?.go_plan?.source)})</span>
            )}
            <a
              href={data.go_plan_docs_url || 'https://opencode.ai/docs/go/'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] font-mono text-olympus-gold hover:text-olympus-gold/80 ml-auto"
            >
              docs <ExternalLink size={8} className="inline" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-olympus-text-dim w-28">ZEN API:</span>
            {hasZen ? (
              <span className="text-olympus-green">✓ Configured</span>
            ) : (
              <span className="text-olympus-red/60">— Not configured</span>
            )}
            {hasZen && sourceLabel(authStatus?.zen_plan?.source) && (
              <span className="text-[9px] text-olympus-text-dim">({sourceLabel(authStatus?.zen_plan?.source)})</span>
            )}
            <a
              href={data.zen_plan_docs_url || 'https://opencode.ai/docs/zen/'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] font-mono text-olympus-gold hover:text-olympus-gold/80 ml-auto"
            >
              docs <ExternalLink size={8} className="inline" />
            </a>
          </div>
        </div>

        <div className="text-[9px] font-mono text-olympus-text-dim leading-relaxed">
          GO and ZEN are authorized inside OpenCode (`olympus opencode` → sign in / `/connect`), never via
          `.env` — OLYMPUS detects what is authorized there automatically.
        </div>
      </div>

      {/* GO strategy switcher — segmented control */}
	      <div className="mb-3">
	        <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide mb-1.5">GO plan strategies</div>
	        <div className="grid grid-cols-3 gap-1.5">
	            {goStrategies.map(s => {
	              const isActive = s.id === storeStrategy || (s.id === (data?.strategy ?? 'go-balanced') && !storeStrategy);
	              const req = strategyApiRequirement(s.id);
	              const blocked = authKnown && !hasGoPlan;
	              return (
	                <button
	                  key={s.id}
	                  disabled={blocked}
	                  onClick={() => applyStrategy(s.id, null)}
	                  className={cn(
	                    'rounded-md border px-2.5 py-2 text-left transition-all',
	                    isActive
	                      ? 'border-olympus-gold/40 bg-olympus-gold/10'
	                      : 'border-olympus-gold/10 bg-olympus-card/50 hover:bg-olympus-gold/5',
	                    blocked && 'opacity-50 olympus-ban-cursor hover:bg-olympus-card/50',
	                  )}
	                >
	                  <div className="flex items-center gap-1.5 mb-0.5">
	                    {isActive && <Check size={10} className="text-olympus-gold shrink-0" />}
	                    {blocked && <Lock size={9} className="text-olympus-amber-soft shrink-0" />}
	                    <span className={cn('text-[11px] font-mono font-semibold', isActive ? 'text-olympus-gold' : blocked ? 'text-olympus-text-dim' : 'text-olympus-text')}>
	                      {s.label}
	                    </span>
	                  </div>
	                  <div className="text-[9px] font-mono uppercase tracking-wide">
	                    {blocked ? (
	                      <span className="text-olympus-amber-soft inline-flex items-center gap-1">needs {req?.label} <Lock size={9} /></span>
	                    ) : (
	                      <span className="text-olympus-text-dim">cost: {s.estCostPerDay}</span>
	                    )}
	                  </div>
	                </button>
	              );
	            })}
	        </div>
	      </div>

	      {/* ZEN strategy switcher — 3 cards, same pattern as GO plan strategies */}
	      {zenStrategies.length > 0 && (
	        <div className="mb-3">
	          <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide mb-1.5">ZEN plan strategies — pay-as-you-go</div>
	          <div className="grid grid-cols-3 gap-1.5">
	            {zenStrategies.map(s => {
	              const isActive = s.id === storeStrategy || (s.id === (data?.strategy ?? 'go-balanced') && !storeStrategy);
	              const req = strategyApiRequirement(s.id);
	              const blocked = authKnown && !hasZen;
	              return (
	                <button
	                  key={s.id}
	                  disabled={blocked}
	                  onClick={() => applyStrategy(s.id, null)}
	                  className={cn(
	                    'rounded-md border px-2.5 py-2 text-left transition-all',
	                    isActive
	                      ? 'border-olympus-gold/40 bg-olympus-gold/10'
	                      : 'border-olympus-gold/10 bg-olympus-card/50 hover:bg-olympus-gold/5',
	                    blocked && 'opacity-50 olympus-ban-cursor hover:bg-olympus-card/50',
	                  )}
	                >
	                  <div className="flex items-center gap-1.5 mb-0.5">
	                    {isActive && <Check size={10} className="text-olympus-gold shrink-0" />}
	                    {blocked && <Lock size={9} className="text-olympus-amber-soft shrink-0" />}
	                    <span className={cn('text-[11px] font-mono font-semibold', isActive ? 'text-olympus-gold' : blocked ? 'text-olympus-text-dim' : 'text-olympus-text')}>
	                      {s.label}
	                    </span>
	                  </div>
	                  <div className="text-[9px] font-mono uppercase tracking-wide">
	                    {blocked ? (
	                      <span className="text-olympus-amber-soft inline-flex items-center gap-1">needs {req?.label} <Lock size={9} /></span>
	                    ) : (
	                      <span className="text-olympus-text-dim">cost: {s.estCostPerDay}</span>
	                    )}
	                  </div>
	                </button>
	              );
	            })}
	          </div>
	          {!hasZen && (
	            <div className="text-[9px] font-mono text-olympus-amber-soft mt-1.5">
	              Run `olympus opencode`, then /connect and select OpenCode ZEN to authorize.
	            </div>
	          )}
	        </div>
	      )}

	      {/* Free-tier strategies — one card per provider (OpenRouter, Big Pickle, Nvidia Build) */}
	      {freeStrategies.map(freeStrategy => {
	        const isOnFreeStrategy = activeStrategy?.id === freeStrategy.id;
	        const needsProvider = FREE_STRATEGY_PROVIDER[freeStrategy.id];
	        const missingKey = needsProvider ? !freeKeys[needsProvider] : false;
	        const providerLabel = needsProvider ? FREE_PROVIDERS.find(p => p.id === needsProvider)?.label : null;
	        const keyHint = missingKey
	          ? `Requires a ${providerLabel} key — run \`olympus opencode\` and add ${providerLabel} as a provider`
	          : freeStrategy.description;
	        return (
	          <div className="mb-3" key={freeStrategy.id}>
	            <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide mb-1.5">No GO or ZEN plan? Free</div>
	            <button
	              disabled={authKnown && missingKey}
	              onClick={() => applyStrategy(freeStrategy.id, null)}
	              className={cn(
	                'w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all',
	                isOnFreeStrategy
	                  ? 'border-olympus-green/30 bg-olympus-green/10 ring-1 ring-olympus-green/30'
	                  : 'border-olympus-amber-soft/20 bg-olympus-amber-soft/5 hover:bg-olympus-amber-soft/10',
	                (authKnown && missingKey) && 'opacity-50 olympus-ban-cursor hover:bg-olympus-amber-soft/5',
	              )}
	            >
	              {isOnFreeStrategy && <Check size={12} className="text-olympus-green shrink-0" />}
	              {(authKnown && missingKey) && <Lock size={11} className="text-olympus-amber-soft shrink-0" />}
	              <div className="flex-1 min-w-0">
	                <div className={cn('text-[11px] font-mono font-semibold', isOnFreeStrategy ? 'text-olympus-green' : 'text-olympus-amber-soft')}>
	                  {freeStrategy.label}
	                  <span className="text-[9px] font-mono text-olympus-green ml-2">FREE</span>
	                </div>
	                <div className="text-[9px] font-mono text-olympus-text-dim">
	                  {keyHint}
	                </div>
	              </div>
	            </button>
	          </div>
	        );
	      })}

	      {/* Strategy warning banner */}
	      {strategyWarn && (
	        <div className="flex items-start gap-2 rounded-lg border border-olympus-red/20 bg-olympus-red/5 p-2.5 mb-3">
	          <AlertCircle size={12} className="text-olympus-red mt-0.5 shrink-0" />
	          <div className="text-[9px] font-mono text-olympus-text leading-relaxed">
	            {strategyWarn}
	          </div>
	        </div>
	      )}

	      
      {/* Custom strategies — chip row (only if any exist) */}
      {customStrategies.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide mb-1.5">Custom</div>
          <div className="flex flex-wrap gap-1.5">
            {customStrategies.map(s => {
              const isActive = s.id === storeStrategy || (s.id === (data?.strategy ?? 'go-balanced') && !storeStrategy);
              return (
                <div key={s.id} className="flex items-center gap-1">
                  <button
                  key={s.id}
                  onClick={() => {
                    setLlmStrategy(s.id as LLMStrategy);
                    if (data) setData({ ...data, strategy: s.id });
                  }}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono transition-all',
                    isActive
                      ? 'bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30'
                      : 'bg-olympus-card/50 text-olympus-text-dim hover:bg-olympus-gold/5',
                  )}
                >
                  {isActive && <Check size={9} />}
                  {s.label}
                  </button>
                  <button
                    onClick={() => deleteCustomStrategy(s.id)}
                    className="p-1 rounded hover:bg-olympus-red/10 text-olympus-text-dim hover:text-olympus-red transition-colors"
                    aria-label={"Delete " + s.label}
                    title="Delete custom strategy"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Free-tier API keys — authorized inside OpenCode */}
      <div className="rounded-lg border border-olympus-gold/15 bg-olympus-card p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Terminal size={12} className="text-olympus-gold" />
          <span className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide">
            Free-tier Providers
          </span>
          {activeStrategy?.id && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-olympus-gold/15 text-olympus-gold ml-auto font-mono">
              Active: {activeStrategy.label}
            </span>
          )}
        </div>

        <div className="text-[9px] font-mono text-olympus-text-dim leading-relaxed mb-2">
          Keys live inside OpenCode (Settings → Providers) — OLYMPUS detects what is authorized there and
          what each key unlocks. One key is enough (OpenRouter is the most reliable); NVIDIA Build adds the free GLM-5.3 / Nemotron endpoints. Free models are picked
          automatically from the live provider lists (refreshed daily or on demand).
        </div>

        {/* Per-provider status — configured + where the key is authorized */}
        <div className="text-[10px] font-mono mb-2 space-y-1">
          {FREE_PROVIDERS.map(p => {
            const configured = freeKeys[p.id];
            const src = sourceLabel(freeSources[p.id]);
            return (
              <div className="flex items-center gap-2" key={p.id}>
                <span className="text-olympus-text-dim w-28">{p.label}:</span>
                {configured ? (
                  <span className="text-olympus-green">✓ Configured</span>
                ) : (
                  <span className="text-olympus-red/60">— Not configured</span>
                )}
                {configured && src && (
                  <span className="text-[9px] text-olympus-text-dim">({src})</span>
                )}
                <a
                  href={p.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] font-mono text-olympus-gold hover:text-olympus-gold/80 ml-auto"
                >
                  get key <ExternalLink size={8} className="inline" />
                </a>
              </div>
            );
          })}
        </div>

        {/* Strategy alignment — what's unlocked + what the active strategy needs */}
        <div className="bg-olympus-bg border border-olympus-gold/10 rounded p-2.5 mb-2 text-[9px] font-mono space-y-1">
          <div>
            <span className="text-olympus-text-dim">Unlocked strategies: </span>
            {unlockedFreeStrategies.length > 0 ? (
              <span className="text-olympus-green">{unlockedFreeStrategies.join(' · ')}</span>
            ) : (
              <span className="text-olympus-red/60">none — add a free-tier key above</span>
            )}
          </div>
          {activeAppliedStrategy ? (
            activeFreeNeedsKey ? (
              <div>
                <span className="text-olympus-text-dim">
                  Active {activeAppliedStrategy} needs a{' '}
                  {FREE_PROVIDERS.find(p => p.id === activeFreeNeedsKey)?.label} key —{' '}
                </span>
                {freeKeys[activeFreeNeedsKey] ? (
                  <span className="text-olympus-green">✓ authorized</span>
                ) : (
                  <span className="text-olympus-red/60">✗ missing — apply another strategy or add the key</span>
                )}
              </div>
            ) : activeAppliedStrategy.startsWith('custom-') ? (
              <div className="text-olympus-text-dim">
                Active {activeAppliedStrategy} — custom strategy (key requirements depend on its config).
              </div>
            ) : (
              <div className="text-olympus-text-dim">
                Active {activeAppliedStrategy} — no free-tier key required (GO / ZEN).
              </div>
            )
          ) : (
            <div className="text-olympus-amber-soft">No strategy applied yet — pick one from the strategy cards above.</div>
          )}
        </div>

	        {/* How to configure */}
        <div className="bg-olympus-bg border border-olympus-gold/10 rounded p-2.5">
          <div className="text-[9px] font-mono text-olympus-text-dim mb-1.5">
            To add or change keys, configure them inside OpenCode:
          </div>
          <pre className="text-[9px] font-mono text-olympus-gold bg-olympus-bg/50 px-2 py-1 rounded border border-olympus-gold/10 overflow-x-auto">
{`olympus opencode  →  Settings  →  Add OpenRouter and/or NVIDIA Build as a provider`}
          </pre>
          <div className="flex gap-2 mt-2 flex-wrap">
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer"
               className="text-[9px] font-mono text-olympus-gold hover:text-olympus-gold/80 border border-olympus-gold/20 rounded px-2 py-0.5">
              Get OpenRouter key <ExternalLink size={8} className="inline" />
            </a>
            <a href="https://build.nvidia.com" target="_blank" rel="noopener noreferrer"
               className="text-[9px] font-mono text-olympus-gold hover:text-olympus-gold/80 border border-olympus-gold/20 rounded px-2 py-0.5">
              Get NVIDIA Build key <ExternalLink size={8} className="inline" />
            </a>
          </div>
        </div>
      </div>

	      {/* Footer — one sentence */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="flex items-center gap-1.5 text-[10px] font-mono text-olympus-gold hover:text-olympus-gold/80 transition-colors"
      >
        Open Settings to edit per-god model classes
        <ArrowRight size={10} />
      </button>
    </div>
  );
}
