/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { X, Key, ExternalLink, Check, Lock, RefreshCw, Eye, EyeOff, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
// MCP API requirements come from a shared module so the dialog renders
// the same grouping as the /api/olympus/mcp route.
import {
  MCP_API_REQUIREMENTS,
  type McpApiRequirement,
  type McpEnvVarRequirement,
} from '@/lib/mcp-api-requirements';

/* ------------------------------------------------------------------ */
/* API Config Dialog                                                   */
/*                                                                     */
/* Renders env var inputs for MCPs that ship with OLYMPUS and require  */
/* API keys. Single-field MCPs (GitHub, Figma) render as flat inputs.  */
/* Multi-field MCPs (Grafana) render as a grouped card with all env    */
/* vars stacked inside.                                                */
/* ------------------------------------------------------------------ */

const GOD_COLOR = '#D4A574';

interface ApiConfig {
  OPENCODE_GO_API_KEY?: string;
  GITHUB_PERSONAL_ACCESS_TOKEN?: string;
  [k: string]: string | undefined;
}

type Section = 'llm' | 'mcps';

export default function ApiConfigDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [configs, setConfigs] = useState<ApiConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('mcps');

  async function loadConfigs() {
    setLoading(true);
    try {
      const res = await fetch('/api/olympus/api-configs');
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || {});
      }
    } catch {
      setError('Failed to load API configs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    loadConfigs();
  }, [open]);

  async function saveConfigs() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Only send STRING values in the POST body.
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(configs)) {
        if (typeof v === 'string' && v.trim()) {
          payload[k] = v.trim();
        }
      }
      const res = await fetch('/api/olympus/api-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || `HTTP ${res.status}`;
        const rejected = Array.isArray(data.rejected) ? data.rejected.join('; ') : '';
        setError(rejected ? `${msg}: ${rejected}` : msg);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to save API configs');
    } finally {
      setSaving(false);
    }
  }

  function updateConfig(key: string, value: string) {
    setConfigs(prev => ({ ...prev, [key]: value }));
  }

  // Safe helpers for the mixed-type configs state.
  function isKeyConfigured(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().length > 0;
    return false;
  }
  function keyValue(value: unknown): string {
    if (typeof value === 'string') return value;
    return '';
  }

  if (!open) return null;

  // Count individual env vars configured across all MCPs.
  let mcpCount = 0;
  let mcpTotal = 0;
  for (const req of MCP_API_REQUIREMENTS) {
    for (const v of req.envVars) {
      mcpTotal++;
      if (isKeyConfigured(configs[v.key])) mcpCount++;
    }
  }
  const totalCount = mcpCount;

  // Split MCPs into single-field (flat list) and multi-field (grouped
  // cards) so the user can scan the simple ones first.
  const singleFieldMcps = MCP_API_REQUIREMENTS.filter(r => r.envVars.length === 1);
  const multiFieldMcps = MCP_API_REQUIREMENTS.filter(r => r.envVars.length > 1);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-olympus-panel border border-olympus-gold/20 rounded-xl w-[600px] max-w-[90vw] max-h-[85vh] flex flex-col shadow-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-olympus-gold/10">
          <h2 className="text-sm font-mono font-semibold flex items-center gap-2" style={{ color: GOD_COLOR }}>
            <Key size={16} /> API Keys
          </h2>
          <button onClick={onClose} className="text-olympus-text-dim hover:text-olympus-text" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Info banner */}
        <div className="px-5 py-2 bg-olympus-gold/5 border-b border-olympus-gold/10 text-[10px] font-mono text-olympus-text-dim leading-relaxed">
          Keys are saved in <code style={{ color: GOD_COLOR }}>.env</code> — only MCPs that need them receive the APIs.
        </div>

        {/* Section tab — MCP keys only (GO plan API key configured in OpenCode) */}
        <div className="flex items-center gap-1 px-5 py-2 border-b border-olympus-gold/10 bg-olympus-bg/30">
          <SectionTab active={section === 'mcps'} onClick={() => setSection('mcps')} icon={Key} label="MCPs" count={mcpCount} total={mcpTotal} />
        </div>

        {/* Config list */}
        <div className="flex-1 overflow-y-auto custom-scroll px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-olympus-text-dim text-xs font-mono">
              <RefreshCw size={14} className="animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="space-y-4">
              {/* ── Single-field MCPs (flat list) ─────────────────────── */}
              <div className="space-y-3">
                {singleFieldMcps.map(req => {
                  const ev = req.envVars[0];
                  const isConfigured = isKeyConfigured(configs[ev.key]);
                  return (
                    <ApiKeyInput
                      key={ev.key}
                      req={ev}
                      mcpLabel={req.label}
                      value={keyValue(configs[ev.key])}
                      isConfigured={isConfigured}
                      onChange={v => updateConfig(ev.key, v)}
                    />
                  );
                })}
              </div>

              {/* ── Multi-field MCPs (grouped cards) ──────────────────── */}
              {multiFieldMcps.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-1.5 px-1 text-[9px] text-[#5A5A5A] font-mono uppercase tracking-wider">
                    <Server size={10} /> Multi-field MCPs
                  </div>
                  {multiFieldMcps.map(req => (
                    <MultiFieldMcpCard
                      key={req.names.join('+')}
                      req={req}
                      configs={configs}
                      isKeyConfigured={isKeyConfigured}
                      keyValue={keyValue}
                      onChange={updateConfig}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-olympus-gold/10">
          <div className="text-[10px] font-mono text-olympus-text-dim">
            {mcpCount} of {mcpTotal} MCP keys configured
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-[10px] font-mono text-olympus-red">{error}</span>}
            {saved && <span className="text-[10px] font-mono text-olympus-green">Saved</span>}
            <button
              onClick={onClose}
              className="text-[11px] font-mono px-3 py-1.5 rounded-md text-olympus-text-dim hover:bg-olympus-gold/5"
            >
              Close
            </button>
            <button
              onClick={saveConfigs}
              disabled={saving}
              className={cn(
                'flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded-md',
                'bg-olympus-gold/15 ring-1 ring-olympus-gold/30 hover:bg-olympus-gold/25',
                saving && 'opacity-50'
              )}
              style={{ color: GOD_COLOR }}
            >
              {saving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
              Save keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTab({
  active, onClick, icon: Icon, label, count, total,
}: {
  active: boolean; onClick: () => void; icon: any; label: string; count: number; total: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono transition-all',
        active
          ? 'bg-olympus-gold/15 text-olympus-gold ring-1 ring-olympus-gold/30'
          : 'text-olympus-text-dim hover:bg-olympus-gold/5 hover:text-olympus-gold',
      )}
    >
      <Icon size={11} />
      {label}
      <span className={cn(
        'text-[9px] px-1 py-0.5 rounded',
        count > 0 ? 'bg-olympus-green/15 text-olympus-green' : 'bg-olympus-card/50 text-olympus-text-dim',
      )}>
        {count}/{total}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* MultiFieldMcpCard — grouped card for MCPs with multiple env vars.    */
/* Shows a header with MCP label, note, and X/Y configured badge, then */
/* stacks all env var inputs inside a bordered container.              */
/* ------------------------------------------------------------------ */
function MultiFieldMcpCard({
  req,
  configs,
  isKeyConfigured,
  keyValue,
  onChange,
}: {
  req: McpApiRequirement;
  configs: ApiConfig;
  isKeyConfigured: (v: unknown) => boolean;
  keyValue: (v: unknown) => string;
  onChange: (key: string, value: string) => void;
}) {
  const configuredCount = req.envVars.filter(v => isKeyConfigured(configs[v.key])).length;
  const total = req.envVars.length;
  const allConfigured = configuredCount === total;

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        allConfigured
          ? 'border-olympus-green/30 bg-olympus-green/5'
          : 'border-olympus-gold/20 bg-olympus-bg/40',
      )}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-olympus-gold/10 bg-olympus-gold/5">
        <div className="flex items-center gap-2 min-w-0">
          <Server size={12} style={{ color: GOD_COLOR }} className="shrink-0" />
          <span className="text-[11px] font-mono font-semibold text-olympus-text truncate">
            {req.label}
          </span>
          {/* MCP names shown as small chips */}
          <span className="flex flex-wrap gap-1 shrink-0">
            {req.names.map(n => (
              <span
                key={n}
                className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-card/60 text-olympus-text-dim"
              >
                {n}
              </span>
            ))}
          </span>
        </div>
        <span
          className={cn(
            'text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ml-2',
            allConfigured
              ? 'bg-olympus-green/15 text-olympus-green'
              : configuredCount > 0
                ? 'bg-olympus-gold/15 text-olympus-gold'
                : 'bg-olympus-card/50 text-olympus-text-dim',
          )}
        >
          {configuredCount}/{total}
        </span>
      </div>

      {/* MCP-level note */}
      {req.note && (
        <div className="px-3 pt-2 text-[9px] font-mono text-olympus-text-dim leading-relaxed">
          {req.note}
        </div>
      )}

      {/* Stacked env var inputs */}
      <div className="p-3 space-y-3">
        {req.envVars.map(ev => (
          <ApiKeyInput
            key={ev.key}
            req={ev}
            mcpLabel={req.label}
            value={keyValue(configs[ev.key])}
            isConfigured={isKeyConfigured(configs[ev.key])}
            onChange={v => onChange(ev.key, v)}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ApiKeyInput — password input with show/hide toggle.                  */
/*                                                                     */
/* Always type="password" by default (masked). Eye/eye-off toggle per  */
/* key lets the user verify what they typed without revealing all keys. */
/* Accepts optional mcpLabel prop for context inside multi-field cards.*/
/* ------------------------------------------------------------------ */
function ApiKeyInput({
  req,
  mcpLabel,
  value,
  isConfigured,
  onChange,
}: {
  req: McpEnvVarRequirement;
  mcpLabel?: string;
  value: string;
  isConfigured: boolean;
  onChange: (v: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-mono font-semibold text-olympus-text flex items-center gap-2">
          {isConfigured ? (
            <Check size={12} className="text-olympus-green" />
          ) : (
            <Lock size={12} style={{ color: GOD_COLOR }} />
          )}
          {req.label}
          {mcpLabel && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-olympus-card/40 text-olympus-text-dim font-normal">
              {mcpLabel}
            </span>
          )}
        </label>
        <a
          href={req.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[9px] font-mono text-olympus-gold hover:text-olympus-gold/80 shrink-0 ml-2"
        >
          <ExternalLink size={9} /> Get key
        </a>
      </div>
      {req.note && (
        <div className="text-[9px] font-mono text-olympus-text-dim leading-relaxed">{req.note}</div>
      )}
      <div className="relative">
        <input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={isConfigured ? '••••••••••••••••' : `Enter ${req.key}…`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full bg-olympus-bg border border-olympus-gold/15 rounded-md px-3 py-2 pr-9 text-[11px] font-mono text-olympus-text outline-none focus:border-olympus-gold/40"
        />
        <button
          type="button"
          onClick={() => setRevealed(r => !r)}
          aria-label={revealed ? 'Hide key' : 'Show key'}
          title={revealed ? 'Hide key' : 'Show key'}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-olympus-text-dim hover:text-olympus-text transition-colors p-1"
          tabIndex={-1}
        >
          {revealed ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      </div>
    </div>
  );
}
