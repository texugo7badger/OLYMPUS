/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { useOlympus } from '@/lib/olympus-store';
import {
  Plug, RefreshCw, Lock, Unlock, CheckCircle2, XCircle, Key, AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ApiConfigDialog from './api-config-dialog';

/* ------------------------------------------------------------------ */
/* MCPConfigPanel — left-pane panel for enabling/disabling MCPs.       */
/*                                                                     */
/* Reads .mcp.json (via /api/olympus/mcp/list) + API key status (via   */
/* /api/olympus/api-configs). MCPs requiring an API key appear locked  */
/* and disabled if no key is registered. A link to the API keys dialog */
/* is shown next to each locked MCP.                                   */
/*                                                                     */
/* Enable/disable state is persisted to ~/.olympus/mcp-state.json so   */
/* it survives across sessions. The olympus-router plugin reads this   */
/* file to block disabled MCPs at runtime.                             */
/* ------------------------------------------------------------------ */

interface McpServerInfo {
  name: string;
  command?: string;
  url?: string;
  description?: string;
  requiresApiKey: boolean;
  apiKeyEnvVars: string[];
  apiKeysConfigured: boolean;
  enabled: boolean;
}

interface McpListResponse {
  servers: McpServerInfo[];
}

export default function MCPConfigPanel() {
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

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

      // Determine which API keys are configured
      const configuredKeys = new Set<string>();
      for (const [key, value] of Object.entries(apiConfigs.configs || {})) {
        if (value && typeof value === 'string' && value.length > 0) {
          configuredKeys.add(key);
        }
      }

      // Load enabled state from ~/.olympus/mcp-state.json (via the API)
      const stateRes = await fetch('/api/olympus/mcp/state', { cache: 'no-store' }).catch(() => null);
      const stateData = stateRes?.ok ? await stateRes.json() : { enabled: {} };
      const enabledMap: Record<string, boolean> = stateData.enabled || {};

      const enriched: McpServerInfo[] = mcpData.servers.map(s => {
        const apiKeysConfigured = s.apiKeyEnvVars.every(v => configuredKeys.has(v));
        // Default to enabled if not in the state map (first load)
        const enabled = enabledMap[s.name] ?? true;
        return { ...s, apiKeysConfigured, enabled };
      });

      setServers(enriched);
    } catch (e: any) {
      setError(e.message || 'Failed to load MCP list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleMcp = async (name: string) => {
    const server = servers.find(s => s.name === name);
    if (!server) return;
    // Can't toggle if API key required but not configured
    if (server.requiresApiKey && !server.apiKeysConfigured) return;

    setToggling(name);
    const newEnabled = !server.enabled;
    // Optimistic update
    setServers(prev => prev.map(s => s.name === name ? { ...s, enabled: newEnabled } : s));

    try {
      const res = await fetch('/api/olympus/mcp/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, enabled: newEnabled }),
      });
      if (!res.ok) throw new Error(`Failed to toggle ${name}`);
    } catch (e: any) {
      // Revert on failure
      setServers(prev => prev.map(s => s.name === name ? { ...s, enabled: !newEnabled } : s));
      setError(e.message || `Failed to toggle ${name}`);
    } finally {
      setToggling(null);
    }
  };

  // counts must be DISJOINT so an MCP can't be both "enabled"
  // and "locked" at the same time (previously, a locked MCP that was still in
  // the default-on toggle state was counted in BOTH buckets, producing
  // impossible combinations like "28 enabled / 12 locked" with only 18 API
  // keys registered).
  //
  //   - Locked  = requires an API key AND no key is configured. (Toggle state
  //               is irrelevant — the MCP is non-functional until unlocked.)
  //   - Enabled = toggle ON AND not locked (i.e. either no key needed, or the
  //               required key is configured AND the user has turned it on).
  //   - The remaining MCPs are "available but off" — toggled off but unlocked.
  //
  // Locked + Enabled + AvailableOff = total servers, with no overlap.
  const lockedCount = servers.filter(s => s.requiresApiKey && !s.apiKeysConfigured).length;
  const enabledCount = servers.filter(
    s => s.enabled && (s.apiKeysConfigured || !s.requiresApiKey),
  ).length;
  const availableOffCount = servers.length - lockedCount - enabledCount;

  return (
    <div className="w-full h-full overflow-y-auto custom-scroll bg-olympus-bg">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-olympus-gold/10 bg-olympus-panel">
        <Plug size={14} className="text-olympus-gold shrink-0" />
        <span className="text-[11px] font-mono font-semibold text-olympus-gold">MCP Configuration</span>
        <span className="text-[9px] font-mono text-olympus-text-dim ml-auto">
          {enabledCount} enabled
          {availableOffCount > 0 && <span className="text-olympus-text-dim/60 ml-1">· {availableOffCount} off</span>}
          {lockedCount > 0 && <span className="text-olympus-amber-soft ml-1">· {lockedCount} locked</span>}
          <span className="text-[#5A5A5A] ml-1">/ {servers.length}</span>
        </span>
        <button
          onClick={load}
          aria-label="Refresh MCP list"
          className="text-olympus-text-dim hover:text-olympus-gold transition-colors ml-1"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-3 space-y-1.5">
        {/* Help text */}
        <div className="text-[9px] font-mono text-[#5A5A5A] leading-relaxed mb-2 px-1">
          Enable or disable individual MCP servers. MCPs requiring an API key appear locked until the key is registered.
        </div>

        {error && (
          <div className="rounded-md border border-olympus-red/20 bg-olympus-red/5 p-2 flex items-center gap-2 text-[10px] font-mono text-olympus-red">
            <AlertCircle size={12} className="shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* MCP list */}
        {loading && servers.length === 0 ? (
          <div className="text-[10px] font-mono text-olympus-text-dim text-center py-8">
            Loading MCPs...
          </div>
        ) : (
          servers.map(s => {
            const isLocked = s.requiresApiKey && !s.apiKeysConfigured;
            const isToggling = toggling === s.name;
            return (
              <div
                key={s.name}
                className={cn(
                  'rounded-md border p-2.5 transition-all',
                  s.enabled && !isLocked
                    ? 'border-olympus-green/20 bg-olympus-green/5'
                    : isLocked
                      ? 'border-olympus-amber-soft/20 bg-olympus-amber-soft/5'
                      : 'border-olympus-gold/10 bg-olympus-card/50',
                )}
              >
                <div className="flex items-center gap-2">
                  {/* Toggle button */}
                  <button
                    onClick={() => toggleMcp(s.name)}
                    disabled={isLocked || isToggling}
                    aria-label={s.enabled ? `Disable ${s.name}` : `Enable ${s.name}`}
                    className={cn(
                      'relative w-8 h-4 rounded-full transition-colors shrink-0',
                      s.enabled && !isLocked
                        ? 'bg-olympus-green/40'
                        : 'bg-olympus-bg/60',
                      // Locked MCPs use the custom OLYMPUS ban cursor instead
                      // of the native Windows red-circle-slash cursor — the SVG
                      // overlay (.olympus-ban-cursor in globals.css) keeps the
                      // visual language in the OLYMPUS pastel-red palette.
                      isLocked && 'olympus-ban-cursor opacity-50',
                      isToggling && 'opacity-50',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 w-3 h-3 rounded-full transition-transform',
                        s.enabled && !isLocked
                          ? 'left-4 bg-olympus-green'
                          : 'left-0.5 bg-olympus-text-dim',
                      )}
                    />
                  </button>

                  {/* Name + status icon */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('text-[11px] font-mono font-semibold truncate', s.enabled && !isLocked ? 'text-olympus-text' : 'text-olympus-text-dim')}>
                        {s.name}
                      </span>
                      {isLocked ? (
                        <Lock size={10} className="text-olympus-amber-soft shrink-0" />
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
                  </div>
                </div>

                {/* API key required banner */}
                {isLocked && (
                  <div className="mt-2 pt-2 border-t border-olympus-amber-soft/10">
                    <div className="flex items-center gap-1.5 text-[9px] font-mono text-olympus-amber-soft mb-1">
                      <Key size={9} className="shrink-0" />
                      <span>Requires API key: {s.apiKeyEnvVars.join(', ')}</span>
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

      {/* API keys dialog — opened when user clicks "Open API keys" on a locked MCP */}
      <ApiConfigDialog
        open={apiConfigOpen}
        onClose={() => {
          setApiConfigOpen(false);
          // Refresh after the dialog closes so newly-registered keys unlock MCPs
          load();
        }}
      />
    </div>
  );
}
