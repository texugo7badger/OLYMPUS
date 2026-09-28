/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { X, Server, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * McpDetailPanel — side panel showing an MCP's metadata + API key status.
 *
 * created for AUX 7 (clickable MCPs) + AUX 3 (API key
 * gating visibility). Fetches metadata from /api/olympus/mcp?name=<mcp>.
 * Shows the _comment, command, args, env, and — critically — whether each
 * required env var is configured. The user can see at a glance which MCPs
 * are ready to invoke and which need API keys.
 */
export default function McpDetailPanel({
 mcpName,
 onClose,
}: {
 mcpName: string;
 onClose: () => void;
}) {
 const [loading, setLoading] = useState(true);
 const [data, setData] = useState<any>(null);
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
 let cancelled = false;
 setLoading(true);
 setError(null);
 (async () => {
 try {
 const r = await fetch(`/api/olympus/mcp?name=${encodeURIComponent(mcpName)}`, { cache: 'no-store' });
 if (!r.ok) throw new Error(`API ${r.status}`);
 const d = await r.json();
 if (cancelled) return;
 setData(d);
 } catch (e: any) {
 if (!cancelled) setError(e.message);
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => { cancelled = true; };
 }, [mcpName]);

 return (
 <div className="absolute right-0 top-0 bottom-0 w-[420px] bg-olympus-card border-l border-olympus-gold/20 shadow-2xl flex flex-col z-30">
 <div className="flex items-center gap-2 px-3 py-2 border-b border-olympus-gold/15 bg-olympus-panel">
 <Server size={13} className="text-olympus-gold" />
 <span className="text-[11px] font-mono text-olympus-gold truncate flex-1">{mcpName}</span>
 <button
 aria-label="Close"
 onClick={onClose}
 className="w-6 h-6 rounded hover:bg-olympus-gold/10 flex items-center justify-center text-olympus-text-dim hover:text-olympus-gold"
 >
 <X size={12} />
 </button>
 </div>

 <div className="flex-1 overflow-y-auto custom-scroll p-3">
 {loading && (
 <div className="flex items-center gap-2 text-olympus-text-dim text-[10px] font-mono">
 <Loader2 size={11} className="animate-spin" /> loading MCP…
 </div>
 )}
 {error && (
 <div className="text-[10px] font-mono text-olympus-red leading-relaxed">
 Failed to load: {error}
 </div>
 )}
 {!loading && !error && data && (
 <div className="space-y-3 text-[10px] font-mono">
 {data.comment && (
 <div>
 <div className="text-[9px] uppercase tracking-wide text-olympus-text-dim mb-1">Description</div>
 <p className="text-olympus-text leading-relaxed">{data.comment}</p>
 </div>
 )}
 <div>
 <div className="text-[9px] uppercase tracking-wide text-olympus-text-dim mb-1">Command</div>
 <code className="text-olympus-cyan bg-olympus-bg px-1.5 py-1 rounded block">{data.command}</code>
 </div>
 {Array.isArray(data.args) && data.args.length > 0 && (
 <div>
 <div className="text-[9px] uppercase tracking-wide text-olympus-text-dim mb-1">Args</div>
 <code className="text-olympus-cyan bg-olympus-bg px-1.5 py-1 rounded block">{data.args.join(' ')}</code>
 </div>
 )}

 {/* API key status — the heart of the panel */}
 {data.requiresApiKey ? (
 <div className={cn(
 'rounded-lg border p-2.5',
 data.allConfigured
 ? 'border-olympus-green/30 bg-olympus-green/5'
 : 'border-olympus-amber-soft/30 bg-olympus-amber-soft/5',
 )}>
 <div className="flex items-center gap-1.5 mb-1.5">
 {data.allConfigured ? (
 <CheckCircle2 size={11} className="text-olympus-green" />
 ) : (
 <AlertCircle size={11} className="text-olympus-amber-soft" />
 )}
 <strong className={cn(
 'uppercase tracking-wide',
 data.allConfigured ? 'text-olympus-green' : 'text-olympus-amber-soft',
 )}>
 {data.allConfigured ? 'API keys configured' : 'API keys missing'}
 </strong>
 </div>
 <div className="space-y-1">
 {data.requiredEnvVars.map((k: string) => (
 <div key={k} className="flex items-center justify-between gap-2">
 <code className="text-olympus-text">{k}</code>
 {data.configuredEnvVars[k] ? (
 <span className="text-olympus-green text-[9px]">✓ set</span>
 ) : (
 <span className="text-olympus-red text-[9px]">✗ missing</span>
 )}
 </div>
 ))}
 </div>
 {!data.allConfigured && (
 <p className="text-[9px] text-olympus-text-dim mt-2 leading-relaxed">
 Configure via Settings → API Keys. This MCP will be BLOCKED at runtime
 until all required keys are present.
 </p>
 )}
 {data.note && (
 <p className="text-[9px] text-olympus-text-dim mt-1 italic">{data.note}</p>
 )}
 </div>
 ) : (
 <div className="rounded-lg border border-olympus-green/30 bg-olympus-green/5 p-2.5 flex items-center gap-1.5">
 <CheckCircle2 size={11} className="text-olympus-green" />
 <span className="text-olympus-green uppercase tracking-wide text-[9px]">
 No API key required
 </span>
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 );
}
