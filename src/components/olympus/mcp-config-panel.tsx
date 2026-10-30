/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import {
  Plug, RefreshCw, Lock, Unlock, CheckCircle2, XCircle, Key, AlertCircle,
  ExternalLink, Activity, Wrench, Download, RotateCcw, Ban, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ApiConfigDialog from './api-config-dialog';

/* ------------------------------------------------------------------ */
/* MCPConfigPanel — the ONE honest MCP surface (v0.0.25).              */
/*                                                                     */
/* v0.0.24 fixed the registry (28, not 50) and the probe. v0.0.25      */
/* fixes the CLASSIFICATION: a server whose dependency is absent is    */
/* amber with the reason (needs Docker / a key / a binary / an app),   */
/* never red "dead". Red is reserved for a real failure. The panel     */
/* also meters the 128-tool provider budget and offers the one-click   */
/* cures (reset to curated, disable unavailable).                      */
/* ------------------------------------------------------------------ */

type HealthStatus =
  | 'alive'
  | 'dead'
  | 'disabled'
  | 'needs-auth'
  | 'needs-service'
  | 'needs-binary'
  | 'needs-app'
  | 'optional-unavailable'
  | 'unprobed';

interface McpRequirement {
  kind: 'key' | 'service' | 'binary' | 'app' | 'optional';
  label: string;
  envVars?: string[];
  url?: string;
  binary?: string;
}

interface McpServerInfo {
  name: string;
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  description?: string;
  requiresApiKey: boolean;
  apiKeyEnvVars: string[];
  apiKeysConfigured: boolean;
  enabled: boolean;
  registry?: 'mcpjson' | 'opencode';
  requires?: McpRequirement;
  configIssues?: string[];
  runtime?: boolean;
  catalog?: boolean;
  health?: { status: HealthStatus; error?: string; latencyMs?: number; tools?: number | null };
}

interface McpListResponse {
  servers: McpServerInfo[];
  total?: number;
  enabled?: number;
  source?: { root: string; opencodeJson: string; runtimeEntries: number; catalogEntries: number } | null;
}

interface HealthSummary {
  total: number;
  enabled: number;
  alive: number;
  dead: number;
  needsAuth: number;
  needsService: number;
  needsBinary: number;
  needsApp: number;
  unavailable: number;
  optionalUnavailable: number;
  tools: number;
  toolBudget: number;
  overBudget: boolean;
}

const NEEDS = new Set<HealthStatus>(['needs-auth', 'needs-service', 'needs-binary', 'needs-app']);
const isUnavailable = (s: HealthStatus) => NEEDS.has(s) || s === 'optional-unavailable';

export default function MCPConfigPanel() {
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [source, setSource] = useState<McpListResponse['source']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [restartHint, setRestartHint] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [staleState, setStaleState] = useState<string[]>([]);
  const [dismissedStale, setDismissedStale] = useState(false);

  const applyHealth = (results: any[], nextSummary?: HealthSummary) => {
    const healthMap: Record<string, McpServerInfo['health']> = {};
    for (const h of results || []) healthMap[h.name] = h;
    setServers((prev) => prev.map((s) => ({ ...s, health: healthMap[s.name] ?? s.health })));
    if (nextSummary) setSummary(nextSummary);
  };

  const loadHealth = (fresh = false) => {
    setProbing(true);
    fetch(`/api/olympus/mcp/health${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.results) return;
        applyHealth(d.results, d.summary);
      })
      .catch(() => {})
      .finally(() => setProbing(false));
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mcpRes, apiRes, stateRes] = await Promise.all([
        fetch('/api/olympus/mcp/list', { cache: 'no-store' }),
        fetch('/api/olympus/api-configs', { cache: 'no-store' }),
        fetch('/api/olympus/mcp/state', { cache: 'no-store' }),
      ]);
      if (!mcpRes.ok) throw new Error(`MCP list API returned ${mcpRes.status}`);
      const mcpData: McpListResponse = await mcpRes.json();
      const apiConfigs = apiRes.ok ? await apiRes.json() : { configs: {} };
      const stateData = stateRes.ok ? await stateRes.json() : {};

      const configuredKeys = new Set<string>();
      for (const [key, value] of Object.entries(apiConfigs.configs || {})) {
        if (value && typeof value === 'string' && value.length > 0) configuredKeys.add(key);
      }

      const enriched: McpServerInfo[] = (mcpData.servers || []).map((s) => {
        const apiKeysConfigured = s.apiKeyEnvVars.every((v) => configuredKeys.has(v));
        return { ...s, apiKeysConfigured };
      });

      setServers(enriched);
      setSource(mcpData.source ?? null);
      setStaleState(Array.isArray(stateData?.ignored) ? stateData.ignored : []);
      // Health is a SECOND pass — never blocks the list render.
      loadHealth(false);
    } catch (e: any) {
      setError(e.message || 'Failed to load MCP list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Idempotent canonicalization: after the v0.0.24 migration this writes
    // nothing. It exists so an upgraded install self-heals its MCP shape.
    fetch('/api/olympus/mcp/sync', { method: 'POST', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.changed) {
          setSyncNote(`Repaired ${d.normalized ?? 0} MCP entr${d.normalized === 1 ? 'y' : 'ies'} — backup saved.`);
        }
      })
      .catch(() => {})
      .finally(() => load());
  }, []);

  const toggleMcp = async (name: string) => {
    const server = servers.find((s) => s.name === name);
    if (!server) return;
    if (server.requires?.kind === 'key' && !server.apiKeysConfigured) return;

    setToggling(name);
    const newEnabled = !server.enabled;
    setServers((prev) => prev.map((s) => (s.name === name ? { ...s, enabled: newEnabled } : s)));

    try {
      const res = await fetch('/api/olympus/mcp/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, enabled: newEnabled }),
      });
      if (!res.ok) throw new Error(`Failed to toggle ${name}`);
      setRestartHint(true);
      // A newly enabled server needs a probe (and its dependency preflight).
      loadHealth(true);
    } catch (e: any) {
      setServers((prev) => prev.map((s) => (s.name === name ? { ...s, enabled: !newEnabled } : s)));
      setError(e.message || `Failed to toggle ${name}`);
    } finally {
      setToggling(null);
    }
  };

  const bulk = async (action: 'reset-curated' | 'disable-unavailable' | 'enable-available') => {
    setBulkBusy(action);
    setError(null);
    try {
      const r = await fetch('/api/olympus/mcp/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      const n = Array.isArray(d.changed) ? d.changed.length : 0;
      setSyncNote(
        action === 'reset-curated'
          ? `Reset to the curated six (${n} change${n === 1 ? '' : 's'}).`
          : action === 'disable-unavailable'
            ? `Disabled ${n} unavailable server${n === 1 ? '' : 's'}.`
            : `Enabled ${n} available server${n === 1 ? '' : 's'}.`,
      );
      setRestartHint(true);
      setStaleState([]);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Bulk action failed');
    } finally {
      setBulkBusy(null);
    }
  };

  const downloadDiagnostics = async () => {
    try {
      const r = await fetch('/api/olympus/mcp/diagnostics?probe=0', { cache: 'no-store' });
      const d = await r.json();
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `olympus-mcp-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || 'Could not collect diagnostics');
    }
  };

  const statusOf = (s: McpServerInfo): HealthStatus => s.health?.status ?? (s.enabled ? 'unprobed' : 'disabled');
  const enabledCount = servers.filter((s) => s.enabled).length;
  const lockedCount = servers.filter((s) => s.enabled && statusOf(s) === 'needs-auth').length;
  const unavailableCount = servers.filter((s) => s.enabled && isUnavailable(statusOf(s))).length;
  const deadCount = servers.filter((s) => statusOf(s) === 'dead').length;
  const offCount = Math.max(0, servers.length - enabledCount);

  const tools = summary?.tools ?? 0;
  const budget = summary?.toolBudget ?? 128;
  const overBudget = summary?.overBudget ?? tools > budget;

  return (
    <div className="w-full h-full overflow-y-auto custom-scroll bg-olympus-bg">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-olympus-gold/10 bg-olympus-panel">
        <Plug size={14} className="text-olympus-gold shrink-0" />
        <span className="text-[11px] font-mono font-semibold text-olympus-gold">MCP Configuration</span>
        <span className="text-[9px] font-mono text-olympus-text-dim ml-auto">
          {enabledCount} enabled
          {lockedCount > 0 && <span className="text-olympus-amber-soft ml-1">· {lockedCount} locked</span>}
          {unavailableCount > 0 && <span className="text-olympus-amber-soft ml-1">· {unavailableCount} unavailable</span>}
          {deadCount > 0 && <span className="text-olympus-red ml-1">· {deadCount} dead</span>}
          {offCount > 0 && <span className="text-olympus-text-dim/60 ml-1">· {offCount} off</span>}
          <span className="text-[#5A5A5A] ml-1">/ {servers.length}</span>
        </span>
        <button
          onClick={() => loadHealth(true)}
          aria-label="Probe every enabled MCP"
          data-tip="Probe every enabled MCP (dependency preflight + JSON-RPC initialize + tools/list)"
          data-tip-side="bottom"
          className={cn('text-olympus-text-dim hover:text-olympus-gold transition-colors ml-1', probing && 'text-olympus-gold')}
        >
          <Activity size={11} className={probing ? 'animate-pulse' : ''} />
        </button>
        <button
          onClick={() => load()}
          aria-label="Refresh MCP list"
          data-tip="Refresh the merged registry"
          data-tip-side="bottom"
          className="text-olympus-text-dim hover:text-olympus-gold transition-colors"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-3 space-y-1.5">
        {/* Registry source — a 24-vs-28 mismatch can never be a mystery again. */}
        {source && (
          <div
            className="text-[8.5px] font-mono text-[#5A5A5A] px-1 truncate"
            data-tip={`${source.opencodeJson} — ${source.runtimeEntries} runtime entries · ${source.catalogEntries} catalog entries`}
            data-tip-side="bottom"
          >
            registry: opencode.json · {source.runtimeEntries} runtime · {source.catalogEntries} catalog
          </div>
        )}

        {/* Help text */}
        <div className="text-[9px] font-mono text-[#5A5A5A] leading-relaxed mb-1 px-1">
          Enable or disable individual MCP servers. The enabled set is what OpenCode reads from
          <code className="text-olympus-gold/80"> opencode.json</code>; a new session picks it up.
        </div>

        {/* Health strip — the honest summary, not a wall of red dots */}
        {summary && (
          <div className={cn(
            'rounded-md border p-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-mono mb-2',
            deadCount > 0
              ? 'border-olympus-red/25 bg-olympus-red/5 text-olympus-red'
              : 'border-olympus-green/20 bg-olympus-green/5 text-olympus-green',
          )}>
            <Activity size={11} className="shrink-0" />
            <span>
              Enabled {summary.alive}/{summary.enabled} healthy
              {summary.unavailable > 0 ? ` · ${summary.unavailable} unavailable` : ''}
              {summary.optionalUnavailable > 0 ? ` · ${summary.optionalUnavailable} optional idle` : ''}
              {deadCount > 0 ? ` · ${deadCount} dead` : ''}
            </span>
            <span
              className={cn('ml-auto', overBudget ? 'text-olympus-red font-semibold' : 'text-olympus-text-dim')}
              data-tip={overBudget
                ? `The provider registry caps at ${budget} tools. ${tools} are loaded — later tools are truncated. Reset to curated or disable heavy servers.`
                : `Tool budget: ${tools} of ${budget} used`}
              data-tip-side="bottom"
            >
              tools {tools}/{budget}{overBudget ? ' ⚠' : ''}
            </span>
          </div>
        )}

        {/* One-click cures */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1">
          <button
            onClick={() => bulk('reset-curated')}
            disabled={bulkBusy !== null}
            className="flex items-center gap-1 text-[8.5px] font-mono px-1.5 py-0.5 rounded ring-1 ring-olympus-gold/25 text-olympus-gold hover:bg-olympus-gold/10 disabled:opacity-40"
            data-tip="Enable the measured six (44 tools) and disable everything else"
            data-tip-side="bottom"
          >
            <RotateCcw size={9} /> Reset to curated
          </button>
          <button
            onClick={() => bulk('disable-unavailable')}
            disabled={bulkBusy !== null}
            className="flex items-center gap-1 text-[8.5px] font-mono px-1.5 py-0.5 rounded ring-1 ring-olympus-amber-soft/25 text-olympus-amber-soft hover:bg-olympus-amber-soft/10 disabled:opacity-40"
            data-tip="Turn off every enabled server whose dependency (key/service/binary/app) is absent"
            data-tip-side="bottom"
          >
            <Ban size={9} /> Disable unavailable
          </button>
          <button
            onClick={() => bulk('enable-available')}
            disabled={bulkBusy !== null}
            className="flex items-center gap-1 text-[8.5px] font-mono px-1.5 py-0.5 rounded ring-1 ring-olympus-green/25 text-olympus-green hover:bg-olympus-green/10 disabled:opacity-40"
            data-tip="Enable every server whose dependencies are satisfied right now"
            data-tip-side="bottom"
          >
            <ShieldCheck size={9} /> Enable available
          </button>
          <button
            onClick={downloadDiagnostics}
            className="flex items-center gap-1 text-[8.5px] font-mono px-1.5 py-0.5 rounded ring-1 ring-olympus-cyan/25 text-olympus-cyan hover:bg-olympus-cyan/10"
            data-tip="Download a per-server diagnostic JSON (command, deps, key presence, errors)"
            data-tip-side="bottom"
          >
            <Download size={9} /> Diagnostics
          </button>
        </div>

        {syncNote && (
          <div className="rounded-md border border-olympus-gold/20 bg-olympus-gold/5 p-2 flex items-center gap-2 text-[9px] font-mono text-olympus-gold mb-2">
            <Wrench size={11} className="shrink-0" />
            <span className="flex-1">{syncNote}</span>
            <button onClick={() => setSyncNote(null)} className="text-olympus-text-dim hover:text-olympus-gold">dismiss</button>
          </div>
        )}

        {staleState.length > 0 && !dismissedStale && (
          <div className="rounded-md border border-olympus-amber-soft/20 bg-olympus-amber-soft/5 p-2 flex items-center gap-2 text-[9px] font-mono text-olympus-amber-soft mb-2">
            <AlertCircle size={11} className="shrink-0" />
            <span className="flex-1">
              {staleState.length} stale “on” toggle{staleState.length === 1 ? '' : 's'} from an older build are no longer applied
              (v0.0.24 made opencode.json authoritative).
            </span>
            <button onClick={() => bulk('reset-curated')} className="hover:text-olympus-gold">reset</button>
            <button onClick={() => setDismissedStale(true)} className="text-olympus-text-dim hover:text-olympus-amber-soft">dismiss</button>
          </div>
        )}

        {restartHint && (
          <div className="rounded-md border border-olympus-amber-soft/20 bg-olympus-amber-soft/5 p-2 flex items-center gap-2 text-[9px] font-mono text-olympus-amber-soft mb-2">
            <AlertCircle size={11} className="shrink-0" />
            <span className="flex-1">The running session keeps its current tool list — start a new session (or Reset) to apply.</span>
            <button onClick={() => setRestartHint(false)} className="text-olympus-text-dim hover:text-olympus-amber-soft">dismiss</button>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-olympus-red/20 bg-olympus-red/5 p-2 flex items-center gap-2 text-[10px] font-mono text-olympus-red">
            <AlertCircle size={12} className="shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* MCP list */}
        {loading && servers.length === 0 ? (
          <div className="text-[10px] font-mono text-olympus-text-dim text-center py-8">
            Loading MCPs…
          </div>
        ) : (
          servers.map((s) => {
            const st = statusOf(s);
            const isLocked = st === 'needs-auth';
            const isUnavail = isUnavailable(st) && !isLocked;
            const isDead = st === 'dead';
            const isToggling = toggling === s.name;
            const healthy = st === 'alive';
            return (
              <div
                key={s.name}
                className={cn(
                  'rounded-md border p-2.5 transition-all',
                  healthy
                    ? 'border-olympus-green/20 bg-olympus-green/5'
                    : isLocked || isUnavail
                      ? 'border-olympus-amber-soft/20 bg-olympus-amber-soft/5'
                      : isDead
                        ? 'border-olympus-red/25 bg-olympus-red/5'
                        : 'border-olympus-gold/10 bg-olympus-card/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleMcp(s.name)}
                    disabled={isLocked || isToggling}
                    aria-label={s.enabled ? `Disable ${s.name}` : `Enable ${s.name}`}
                    className={cn(
                      'relative w-8 h-4 rounded-full transition-colors shrink-0',
                      s.enabled && !isLocked ? 'bg-olympus-green/40' : 'bg-olympus-bg/60',
                      isLocked && 'olympus-ban-cursor opacity-50',
                      isToggling && 'opacity-50',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 w-3 h-3 rounded-full transition-transform',
                        s.enabled && !isLocked ? 'left-4 bg-olympus-green' : 'left-0.5 bg-olympus-text-dim',
                      )}
                    />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('text-[11px] font-mono font-semibold truncate', s.enabled && !isLocked ? 'text-olympus-text' : 'text-olympus-text-dim')}>
                        {s.name}
                      </span>
                      {s.registry === 'opencode' && (
                        <span
                          data-tip="This entry exists in opencode.json — OpenCode reads it at spawn"
                          data-tip-side="bottom"
                          className="text-[8px] font-mono px-1 py-px rounded ring-1 ring-olympus-cyan/30 text-olympus-cyan shrink-0"
                        >
                          oc
                        </span>
                      )}
                      {s.type === 'remote' && (
                        <span className="text-[8px] font-mono px-1 py-px rounded ring-1 ring-olympus-purple/30 text-olympus-purple shrink-0">
                          remote
                        </span>
                      )}
                      {isLocked ? (
                        <Lock size={10} className="text-olympus-amber-soft shrink-0" />
                      ) : isUnavail ? (
                        <AlertCircle size={10} className="text-olympus-amber-soft shrink-0" />
                      ) : isDead ? (
                        <span
                          data-tip={s.health?.error || 'MCP did not answer initialize'}
                          data-tip-side="bottom"
                          className="w-2 h-2 rounded-full bg-olympus-red shrink-0"
                        />
                      ) : healthy ? (
                        <span
                          data-tip={`alive — ${s.health?.latencyMs ?? '?'}ms${s.health?.tools != null ? ` · ${s.health.tools} tools` : ''}`}
                          data-tip-side="bottom"
                          className="w-2 h-2 rounded-full bg-olympus-green shrink-0"
                        />
                      ) : s.enabled ? (
                        <CheckCircle2 size={10} className="text-olympus-green shrink-0" />
                      ) : (
                        <XCircle size={10} className="text-olympus-text-dim shrink-0" />
                      )}
                    </div>
                    {s.description && (
                      <div className="text-[9px] font-mono text-[#5A5A5A] truncate mt-0.5">
                        {s.description}
                      </div>
                    )}

                    {/* The honest requirement line — shown WHEN IT MATTERS
                        (enabled and not alive), not only when the server is off. */}
                    {(isLocked || isUnavail) && s.requires && (
                      <div className="text-[8.5px] font-mono text-olympus-amber-soft/90 mt-0.5">
                        unavailable — {s.health?.error || s.requires.label}
                      </div>
                    )}
                    {isDead && s.health?.error && (
                      <div className="text-[8.5px] font-mono text-olympus-red/90 mt-0.5 truncate" data-tip={s.health.error} data-tip-side="bottom">
                        {s.health.error}
                      </div>
                    )}
                    {!s.enabled && !isLocked && s.requires && (
                      <div className="text-[8.5px] font-mono text-olympus-text-dim/70 mt-0.5">
                        off — {s.requires.label}
                      </div>
                    )}
                    {healthy && s.health?.tools != null && s.enabled && (
                      <div className="text-[8.5px] font-mono text-olympus-green/70 mt-0.5">
                        {s.health.tools} tools · {s.health.latencyMs ?? '?'}ms
                      </div>
                    )}
                    {(s.configIssues?.length ?? 0) > 0 && (
                      <div className="text-[8.5px] font-mono text-olympus-amber-soft/80 mt-0.5 truncate" data-tip={s.configIssues?.join('; ')} data-tip-side="bottom">
                        repaired: {s.configIssues?.join('; ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* API key required banner */}
                {isLocked && (
                  <div className="mt-2 pt-2 border-t border-olympus-amber-soft/10">
                    <div className="flex items-center gap-1.5 text-[9px] font-mono text-olympus-amber-soft mb-1">
                      <Key size={9} className="shrink-0" />
                      <span>{s.requires?.label || `Requires: ${s.apiKeyEnvVars.join(', ')}`}</span>
                    </div>
                    <div className="text-[9px] font-mono text-[#5A5A5A] mb-1.5">
                      This MCP requires an API key to function. Register the key to enable it.
                    </div>
                    <button
                      onClick={() => setApiConfigOpen(true)}
                      className="flex items-center gap-1 text-[9px] font-mono text-olympus-gold hover:text-olympus-gold/80 transition-colors"
                    >
                      <ExternalLink size={9} />
                      Open API keys
                    </button>
                  </div>
                )}

                {/* API key configured badge */}
                {s.requires?.kind === 'key' && s.apiKeysConfigured && (
                  <div className="mt-1.5 flex items-center gap-1 text-[9px] font-mono text-olympus-green">
                    <Unlock size={9} />
                    <span>API key configured</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <ApiConfigDialog
        open={apiConfigOpen}
        onClose={() => {
          setApiConfigOpen(false);
          load();
        }}
      />
    </div>
  );
}
