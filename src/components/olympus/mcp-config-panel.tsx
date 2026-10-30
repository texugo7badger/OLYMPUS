/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import {
  Plug, RefreshCw, Lock, Unlock, CheckCircle2, XCircle, Key, AlertCircle,
  ExternalLink, Activity, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ApiConfigDialog from './api-config-dialog';

/* ------------------------------------------------------------------ */
/* MCPConfigPanel — the ONE honest MCP surface (v0.0.24).              */
/*                                                                     */
/* The old panel listed 50 rows (22 duplicates), probed commands with   */
/* only `command[0]`, ignored args/env, and let the legacy state file  */
/* override the runtime enabled flag. This version reads the deduped    */
/* registry (28 servers), the runtime truth, and the shared probe.      */
/*                                                                     */
/* Header: 6 enabled · 0 dead · 4 locked · 18 off / 28                  */
/* ------------------------------------------------------------------ */

interface McpRequirement {
  kind: 'key' | 'service' | 'binary' | 'app' | 'optional';
  label: string;
  envVars?: string[];
  url?: string;
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
  health?: { status: 'alive' | 'dead' | 'disabled' | 'needs-auth' | 'unprobed'; error?: string; latencyMs?: number; tools?: number | null };
}

interface McpListResponse {
  servers: McpServerInfo[];
  total?: number;
  enabled?: number;
}

interface HealthSummary {
  total: number;
  enabled: number;
  alive: number;
  dead: number;
  needsAuth: number;
  tools: number;
}

export default function MCPConfigPanel() {
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [restartHint, setRestartHint] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

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
      const [mcpRes, apiRes] = await Promise.all([
        fetch('/api/olympus/mcp/list', { cache: 'no-store' }),
        fetch('/api/olympus/api-configs', { cache: 'no-store' }),
      ]);
      if (!mcpRes.ok) throw new Error(`MCP list API returned ${mcpRes.status}`);
      const mcpData: McpListResponse = await mcpRes.json();
      const apiConfigs = apiRes.ok ? await apiRes.json() : { configs: {} };

      const configuredKeys = new Set<string>();
      for (const [key, value] of Object.entries(apiConfigs.configs || {})) {
        if (value && typeof value === 'string' && value.length > 0) configuredKeys.add(key);
      }

      const enriched: McpServerInfo[] = (mcpData.servers || []).map((s) => {
        const apiKeysConfigured = s.apiKeyEnvVars.every((v) => configuredKeys.has(v));
        return { ...s, apiKeysConfigured };
      });

      setServers(enriched);
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
    if (server.requiresApiKey && !server.apiKeysConfigured) return;

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
      // A newly enabled server needs a probe.
      if (newEnabled) loadHealth(true);
    } catch (e: any) {
      setServers((prev) => prev.map((s) => (s.name === name ? { ...s, enabled: !newEnabled } : s)));
      setError(e.message || `Failed to toggle ${name}`);
    } finally {
      setToggling(null);
    }
  };

  // Disjoint buckets: an MCP is locked OR enabled OR off — never two at once.
  const lockedCount = servers.filter((s) => s.requires?.kind === 'key' && !s.apiKeysConfigured).length;
  const enabledCount = servers.filter((s) => s.enabled && !(s.requires?.kind === 'key' && !s.apiKeysConfigured)).length;
  const deadCount = servers.filter((s) => s.enabled && s.health?.status === 'dead').length;
  const offCount = Math.max(0, servers.length - lockedCount - enabledCount);

  return (
    <div className="w-full h-full overflow-y-auto custom-scroll bg-olympus-bg">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-olympus-gold/10 bg-olympus-panel">
        <Plug size={14} className="text-olympus-gold shrink-0" />
        <span className="text-[11px] font-mono font-semibold text-olympus-gold">MCP Configuration</span>
        <span className="text-[9px] font-mono text-olympus-text-dim ml-auto">
          {enabledCount} enabled
          {deadCount > 0 && <span className="text-olympus-red ml-1">· {deadCount} dead</span>}
          {lockedCount > 0 && <span className="text-olympus-amber-soft ml-1">· {lockedCount} locked</span>}
          {offCount > 0 && <span className="text-olympus-text-dim/60 ml-1">· {offCount} off</span>}
          <span className="text-[#5A5A5A] ml-1">/ {servers.length}</span>
        </span>
        <button
          onClick={() => loadHealth(true)}
          aria-label="Probe every enabled MCP"
          data-tip="Probe every enabled MCP (JSON-RPC initialize + tools/list)"
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
        {/* Help text */}
        <div className="text-[9px] font-mono text-[#5A5A5A] leading-relaxed mb-1 px-1">
          Enable or disable individual MCP servers. The enabled set is what OpenCode reads from
          <code className="text-olympus-gold/80"> opencode.json</code>; a new session picks it up.
        </div>

        {/* Health strip — the honest summary, not a wall of red dots */}
        {summary && (
          <div className={cn(
            'rounded-md border p-2 flex items-center gap-2 text-[9px] font-mono mb-2',
            summary.dead > 0
              ? 'border-olympus-red/25 bg-olympus-red/5 text-olympus-red'
              : 'border-olympus-green/20 bg-olympus-green/5 text-olympus-green',
          )}>
            <Activity size={11} className="shrink-0" />
            <span>
              Enabled {summary.alive}/{summary.enabled} healthy · {summary.tools} tools
              {summary.needsAuth > 0 ? ` · ${summary.needsAuth} need a key` : ''}
              {summary.dead > 0 ? ` · ${summary.dead} dead` : ''}
            </span>
            {probing && <span className="ml-auto text-olympus-text-dim">probing…</span>}
          </div>
        )}

        {syncNote && (
          <div className="rounded-md border border-olympus-gold/20 bg-olympus-gold/5 p-2 flex items-center gap-2 text-[9px] font-mono text-olympus-gold mb-2">
            <Wrench size={11} className="shrink-0" />
            <span className="flex-1">{syncNote}</span>
            <button onClick={() => setSyncNote(null)} className="text-olympus-text-dim hover:text-olympus-gold">dismiss</button>
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
            const isLocked = s.requires?.kind === 'key' && !s.apiKeysConfigured;
            const isToggling = toggling === s.name;
            const isDead = s.enabled && s.health?.status === 'dead';
            return (
              <div
                key={s.name}
                className={cn(
                  'rounded-md border p-2.5 transition-all',
                  s.enabled && !isLocked && !isDead
                    ? 'border-olympus-green/20 bg-olympus-green/5'
                    : isLocked
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
                      ) : isDead ? (
                        <span
                          data-tip={s.health?.error || 'MCP did not answer initialize'}
                          data-tip-side="bottom"
                          className="w-2 h-2 rounded-full bg-olympus-red shrink-0"
                        />
                      ) : s.enabled ? (
                        s.health?.status === 'alive' ? (
                          <span
                            data-tip={`alive — ${s.health.latencyMs ?? '?'}ms${s.health.tools != null ? ` · ${s.health.tools} tools` : ''}`}
                            data-tip-side="bottom"
                            className="w-2 h-2 rounded-full bg-olympus-green shrink-0"
                          />
                        ) : (
                          <CheckCircle2 size={10} className="text-olympus-green shrink-0" />
                        )
                      ) : (
                        <XCircle size={10} className="text-olympus-text-dim shrink-0" />
                      )}
                    </div>
                    {s.description && (
                      <div className="text-[9px] font-mono text-[#5A5A5A] truncate mt-0.5">
                        {s.description}
                      </div>
                    )}
                    {!s.enabled && !isLocked && s.requires && (
                      <div className="text-[8.5px] font-mono text-olympus-text-dim/70 mt-0.5">
                        off — {s.requires.label}
                      </div>
                    )}
                    {s.health?.status === 'alive' && s.health.tools != null && s.enabled && (
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
                {s.requiresApiKey && s.apiKeysConfigured && (
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
