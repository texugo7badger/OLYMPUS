/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { GOD_ICONS } from '@/lib/olympus-store';
import { DollarSign, Zap, Server, CheckCircle2, ChevronRight, ChevronDown, Cpu, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { demigodShortDescription } from '@/lib/demigod-short-desc';
import DemigodPromptModal from './demigod-prompt-modal';

interface GodCost {
 god: string;
 icon: string;
 model: string;
 requests: number;
 inputTokens: number;
 outputTokens: number;
 cachedTokens: number;
 spend: number;
 cap5h: number | null;
 pctOfCap: number | null;
 avgLatencyMs: number;
 successRate: number;
 sparkline: number[];
}
interface ProviderInfo {
 name: string; type: string; isFree: boolean;
 displayName: string; capsDisplay: string;
 cost_per_1m_tokens: { input: number; output: number };
}
interface CostSummary {
 totalSpend: number; totalReqs: number; totalInput: number; totalOutput: number;
 avgLatency: number; avgSuccess: number; cap5h: number | null; pctOfCap: number | null;
 activeGods: number; costs: GodCost[]; provider: ProviderInfo;
}

/** Static demigod catalog per god (mirrors dispatch-graph route). */
interface DemigodEntry {
 task: string;
 agent: string;
 // `skill` field REMOVED (was pre-set, now dynamic).
 // Kept as optional for backward-compat with any cached responses.
 skill?: string;
 // Dynamic skill suggestion — the god evaluates the task at dispatch time
 // and equips the best-matching skill. This is a HINT, not a fixed assignment.
 suggestedSkill?: string | null;
 // LIVE usage block (added by the dispatch-graph API).
 usage?: {
 count: number;
 lastUsed: string | null;
 tokens: { input: number; output: number };
 lastOutcome: string | null;
 };
}
interface GodDispatchInfo {
 god: string;
 demigods: DemigodEntry[];
 subAgentCount: number;
 // Live usage aggregates surfaced from the dispatch-graph API.
 activeDemigodCount?: number;
 liveCost?: {
 spend: number;
 requests: number;
 inputTokens: number;
 outputTokens: number;
 cachedTokens: number;
 };
}

// Includes all 9 gods including Callimachus.
// Mirrors src/lib/olympus.ts GOD_ICON_KEYS.
const GOD_IDS_FULL = [
 'apollo', 'atlas', 'hephaestus', 'athena', 'hermes', 'artemis', 'dionysus',
 'persephone', 'prometheus', 'callimachus',
];

function fallbackCostSummary(): CostSummary {
 return {
 totalSpend: 0, totalReqs: 0, totalInput: 0, totalOutput: 0,
 avgLatency: 0, avgSuccess: 0, cap5h: null, pctOfCap: null,
 activeGods: 0,
 costs: GOD_IDS_FULL.map(god => ({
 // Callimachus uses deepseek-v4-flash (cheaper brain-curation model). Atlas uses Hy3.
 god, icon: god,
 model: god === 'atlas' ? 'opencode-go/hy3' : god === 'callimachus' ? 'opencode-go/deepseek-v4-flash' : 'opencode-go/glm-5.2',
 requests: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0,
 spend: 0, cap5h: null, pctOfCap: null, avgLatencyMs: 0, successRate: 0, sparkline: [],
 })),
 provider: {
 name: 'opencode-go', type: 'opencode', isFree: false,
 displayName: 'Reconnecting to OpenCode telemetry…',
 // Actionable reconnect message with retry hint.
 capsDisplay: 'Reconnecting — retry in 10s',
 cost_per_1m_tokens: { input: 0, output: 0 },
 },
 };
}

/**
 * Fetch the dispatch catalog for every god in parallel.
 * The dispatch-graph API now also returns LIVE usage
 * counts per demigod (from live.jsonl) and LIVE per-god spend
 * (from cost.jsonl), so we surface those here instead of the static
 * catalog alone.
 */
async function fetchAllDispatchCatalogs(): Promise<Record<string, GodDispatchInfo>> {
 const entries: GodDispatchInfo[] = await Promise.all(
 GOD_IDS_FULL.map(async (god): Promise<GodDispatchInfo> => {
 try {
 const ctrl = new AbortController();
 const timeout = setTimeout(() => ctrl.abort(), 4000);
 const r = await fetch(`/api/olympus/god/dispatch-graph?god=${god}`, { signal: ctrl.signal });
 clearTimeout(timeout);
 if (!r.ok) return { god, demigods: [], subAgentCount: 0 };
 const d = await r.json();
 const demigods: DemigodEntry[] = Array.isArray(d.demigods) ? d.demigods : [];
 return {
 god,
 demigods,
 subAgentCount: demigods.length,
 activeDemigodCount: typeof d.activeDemigodCount === 'number' ? d.activeDemigodCount : 0,
 liveCost: d.liveCost,
 };
 } catch {
 return { god, demigods: [], subAgentCount: 0 };
 }
 })
 );
 const out: Record<string, GodDispatchInfo> = {};
 for (const e of entries) out[e.god] = e;
 return out;
}

/* ------------------------------------------------------------------ */
/* Per-God Cost Dashboard — impeccable refactor. */
/* */
/* Changes from the legacy version: */
/* - Includes Callimachus (9th god, vault curator). */
/* - Per-god rows expand to show the demigods that god can */
/* dispatch to (static catalog from /api/olympus/god/dispatch- */
/* graph). Sub-agent cost currently rolls up to the parent god */
/* (the cost.jsonl schema logs `god`, not `subagent`). */
/* - Dropped the "Avg latency" + "Avg success" summary cards — */
/* they weren't cost-focused. Replaced with "Sub-agent routes" */
/* (total ECC dispatch capacity across all gods) and "Burn rate" */
/* (spend per hour over the 5h window). */
/* - Tightened copy throughout. Provider banner is one line. */
/* ------------------------------------------------------------------ */
export default function CostDashboard() {
 const [data, setData] = useState<CostSummary | null>(null);
 const [dispatch, setDispatch] = useState<Record<string, GodDispatchInfo>>({});
 // Active strategy (fetched from /api/olympus/strategy) and
 // a per-god dispatch pulse tracker. When a god's request count increments
 // between polls, we flash its row gold for 500ms.
 const [strategy, setStrategy] = useState<string | null>(null);
 const [pulseGods, setPulseGods] = useState<Set<string>>(new Set());
 const prevReqRef = useRef<Record<string, number>>({});

 useEffect(() => {
 let cancelled = false;
 const load = async () => {
 try {
 const ctrl = new AbortController();
 const timeout = setTimeout(() => ctrl.abort(), 5000);
 // Cache: 'no-store' so the dashboard always reflects
 // the latest cost.jsonl events instead of a stale Next.js fetch cache.
 const r = await fetch('/api/olympus/costs', { signal: ctrl.signal, cache: 'no-store' });
 clearTimeout(timeout);
 if (!r.ok) throw new Error(`API ${r.status}`);
 const d = await r.json();
 if (cancelled) return;
 // Detect per-god request count increments and trigger
 // a 500ms gold pulse on each god that dispatched since the last poll.
 const next: Record<string, number> = {};
 const pulsed = new Set<string>();
 for (const c of (d.costs ?? []) as GodCost[]) {
 next[c.god] = c.requests;
 const prev = prevReqRef.current[c.god] ?? 0;
 if (c.requests > prev) pulsed.add(c.god);
 }
 prevReqRef.current = next;
 if (pulsed.size > 0) {
 setPulseGods(pulsed);
 setTimeout(() => setPulseGods(new Set()), 500);
 }
 setData(d);
 } catch {
 if (cancelled) return;
 setData(fallbackCostSummary());
 }
 };
 load();
 const iv = setInterval(load, 10000);

 // Fetch the active strategy once on mount. The strategy
 // only changes when the user explicitly switches via Settings → LLM
 // strategy, so we don't poll it. The settings dialog triggers a
 // custom event on strategy change; we listen for it to refresh.
 const loadStrategy = async () => {
 try {
 const r = await fetch('/api/olympus/strategy', { cache: 'no-store' });
 if (!r.ok) return;
 const d = await r.json();
 if (!cancelled && d?.strategy) setStrategy(d.strategy);
 } catch { /* silent — chip just won't render */ }
 };
 loadStrategy();
 const onStrategyChange = () => loadStrategy();
 window.addEventListener('olympus:strategy-changed', onStrategyChange);

 // Refresh the dispatch catalog too. The catalog now
 // carries LIVE usage counts (per-ECC-agent) that change as gods dispatch.
 // Refresh on the same 10s cadence as costs so the "X active / Y total"
 // badge in the Sub-agents column stays current.
 const loadDispatch = () => fetchAllDispatchCatalogs().then(d => { if (!cancelled) setDispatch(d); });
 loadDispatch();
 const ivDispatch = setInterval(loadDispatch, 10000);
 // Listen for demigod creation events so new demigods appear
 // immediately (not waiting up to 10s for the next poll).
 const onDemigodsChanged = () => loadDispatch();
 window.addEventListener('olympus:demigods-changed', onDemigodsChanged);

 return () => {
 cancelled = true;
 clearInterval(iv);
 clearInterval(ivDispatch);
 window.removeEventListener('olympus:strategy-changed', onStrategyChange);
 window.removeEventListener('olympus:demigods-changed', onDemigodsChanged);
 };
 }, []);

 if (!data) {
 return (
 <div className="h-full flex flex-col items-center justify-center text-olympus-text-dim bg-olympus-bg gap-2">
 <div className="w-8 h-8 rounded-full border-2 border-olympus-gold/30 border-t-olympus-gold animate-spin" />
 <span className="text-[10px] font-mono">loading costs…</span>
 </div>
 );
 }

 const prov = data.provider;
 const hasRealCosts = data.totalReqs > 0;
 const totalSubAgentRoutes = Object.values(dispatch).reduce((s: number, d: any) => s + (d?.subAgentCount ?? 0), 0);
 // Burn rate: spend per hour over the 5h window (or since first event).
 const burnRate = hasRealCosts ? data.totalSpend / 5 : 0;
 // Token usage — the free strategies have no spend, so the dashboard shows
 // tokens used instead of a dollar figure.
 const totalTokens = data.totalInput + data.totalOutput;
 const tokenRate = hasRealCosts ? totalTokens / 5 : 0;

 return (
 <div className="h-full overflow-y-auto custom-scroll bg-olympus-bg p-4">
 {/* Header — one line */}
 <div className="flex items-center gap-2 mb-4 flex-wrap">
 <DollarSign size={16} className={prov.isFree ? 'text-olympus-green' : 'text-olympus-gold'} />
 <h2 className="text-sm font-semibold text-olympus-gold">Cost</h2>
 {/* LIVE indicator pulses when cost.jsonl has been
 written in the last 30s (i.e. the olympus-hooks plugin is loaded
 and capturing). When gray, the plugin hasn't loaded or no
 dispatches have happened yet. */}
 <span className={cn('w-1.5 h-1.5 rounded-full',
 hasRealCosts ? 'bg-olympus-green animate-pulse' : 'bg-olympus-text-dim/30')}
 title={hasRealCosts ? 'Live — cost.jsonl receiving events' : 'No cost events yet — dispatch a task to Apollo'}
 />
 {/* Active strategy chip. Reads from the new
 /api/olympus/strategy endpoint which returns the active strategy
 from ~/.olympus/llm-providers.json. When the API is unreachable,
 we don't render the chip (the provider banner already shows the
 reconnect state). */}
 {strategy && (
 <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-olympus-gold/10 text-olympus-gold ring-1 ring-olympus-gold/30 uppercase tracking-wide">
 STRATEGY: {strategy}
 </span>
 )}
 <span className={cn(
 'text-[9px] text-olympus-text-dim font-mono ml-auto flex items-center gap-1',
 !hasRealCosts && 'animate-pulse',
 )}>
 {!hasRealCosts && <span className="w-1 h-1 rounded-full bg-olympus-amber-soft" />}
 {prov.capsDisplay} · refresh 10s
 </span>
 </div>

 {/* Polished empty-state banner (replaces the old
 "No cost events yet. Costs appear here once the Olympus overlay
 plugin loads…" copy). Educates the user on what to do next
 WITHOUT apologizing or being condescending. */}
 {!hasRealCosts && (
 <div className="rounded-lg border border-olympus-gold/20 bg-olympus-card p-3 mb-3 text-[10px] font-mono text-olympus-text leading-relaxed">
 <div className="flex items-center gap-1.5 text-olympus-gold mb-1">
 <Zap size={11} />
 <strong className="uppercase tracking-wide">Awaiting first dispatch</strong>
 </div>
 <p>
 The dashboard populates from <code className="text-olympus-cyan">cost.jsonl</code> —
 a per-event ledger written by the Olympus overlay plugin on every tool call.
 Send a prompt to Apollo (e.g. <code className="text-olympus-gold">hi</code>) and the
 per-god rows below will fill in within seconds.
 </p>
 </div>
 )}

 {/* Provider banner — single line */}
 <div className={cn(
 'rounded-lg border p-2.5 mb-3 flex items-center gap-2 text-[11px] font-mono',
 prov.isFree
 ? 'border-olympus-green/30 bg-olympus-green/5'
 : 'border-olympus-gold/15 bg-olympus-card',
 )}>
 <Server size={12} className={prov.isFree ? 'text-olympus-green' : 'text-olympus-gold'} />
 <span className="text-olympus-text truncate flex-1">{prov.displayName}</span>
 {prov.isFree && (
 <span className="text-[9px] px-1.5 py-0.5 rounded bg-olympus-green/20 text-olympus-green ring-1 ring-olympus-green/30">FREE</span>
 )}
 </div>

	 {/* Summary cards — 4 cost-focused metrics */}
	 <div className="grid grid-cols-4 gap-2 mb-3">
	 {prov.isFree ? (
	 <SummaryCard
	 icon={FileText}
	 label="Tokens (5h)"
	 value={fmt(totalTokens)}
	 sub={hasRealCosts ? 'input + output' : 'idle — free, no spend'}
	 color="green"
	 />
	 ) : (
	 <SummaryCard
	 icon={DollarSign}
	 label="Spend (5h)"
	 value={`$${data.totalSpend.toFixed(2)}`}
	 sub={hasRealCosts ? 'this window' : 'idle'}
	 pct={data.pctOfCap ?? undefined}
	 color="green"
	 />
	 )}
	 <SummaryCard icon={Zap} label="Requests" value={fmt(data.totalReqs)} sub={`${data.activeGods} gods active`} color="gold" />
	 <SummaryCard icon={Cpu} label="Sub-agent routes" value={String(totalSubAgentRoutes)} sub="total across all gods" color="teal" />
	 {prov.isFree ? (
	 <SummaryCard icon={CheckCircle2} label="Token rate" value={hasRealCosts ? `${fmt(tokenRate)}/h` : '—'} sub="5h avg" color="green" />
	 ) : (
	 <SummaryCard icon={CheckCircle2} label="Burn rate" value={hasRealCosts ? `$${burnRate.toFixed(3)}/h` : '—'} sub="5h avg" color="green" />
	 )}
	 </div>

 {/* Budget progress — only when provider has a real cap */}
 {data.cap5h != null && (
 <div className="rounded-lg border border-olympus-gold/15 bg-olympus-card p-3 mb-3">
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide">5h budget burn</span>
 <span className={cn('text-[11px] font-mono font-bold',
 (data.pctOfCap ?? 0) > 80 ? 'text-olympus-red' :
 (data.pctOfCap ?? 0) > 60 ? 'text-olympus-amber-soft' : 'text-olympus-green')}>
 {data.pctOfCap ?? 0}%
 </span>
 </div>
 <div className="h-2.5 bg-olympus-bg rounded-full overflow-hidden">
 <div
 className={cn('h-full rounded-full transition-all duration-700',
 (data.pctOfCap ?? 0) > 80 ? 'bg-olympus-red' :
 (data.pctOfCap ?? 0) > 60 ? 'bg-olympus-amber-soft' :
 'bg-olympus-green')}
 style={{ width: `${Math.min(data.pctOfCap ?? 0, 100)}%` }}
 />
 </div>
 <div className="flex justify-between mt-1 text-[9px] font-mono text-olympus-text-dim">
 <span>${data.totalSpend.toFixed(2)} spent</span>
 <span>${(data.cap5h - data.totalSpend).toFixed(2)} remaining</span>
 </div>
 </div>
 )}

 {/* Per-god table — expandable to show demigods */}
 <div className="rounded-lg border border-olympus-gold/15 bg-olympus-card overflow-hidden">
 <div className="grid grid-cols-[1.5fr_1fr_0.8fr_1.2fr_0.8fr] gap-2 px-3 py-2 text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide border-b border-olympus-gold/10 bg-olympus-panel">
	 <span>God</span>
	 <span>Model</span>
	 <span>Reqs</span>
	 <span>{prov.isFree ? 'Tokens' : `Spend ${data.cap5h != null ? '/ Cap' : ''}`}</span>
	 <span>Sub-agents</span>
	 </div>
	 {data.costs.map(c => (
	 <GodRow
	 key={c.god}
	 c={c}
	 cap={data.cap5h}
	 isFree={prov.isFree}
	 dispatchInfo={dispatch[c.god]}
	 pulsing={pulseGods.has(c.god)}
	 />
	 ))}
 </div>

 {/* Token breakdown — kept (cost-relevant) */}
 <div className="mt-3 rounded-lg border border-olympus-gold/15 bg-olympus-card p-3">
 <div className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide mb-2">Token throughput</div>
 <div className="grid grid-cols-3 gap-3">
 <TokenStat label="Input" value={data.totalInput} color="text-olympus-cyan" />
 <TokenStat label="Output" value={data.totalOutput} color="text-olympus-gold" />
 <TokenStat label="Cached" value={data.costs.reduce((s, c) => s + c.cachedTokens, 0)} color="text-olympus-purple" />
 </div>
 </div>
 </div>
 );
}

function GodRow({
 c, cap, isFree, dispatchInfo, pulsing,
}: {
 c: GodCost;
 cap: number | null;
 isFree: boolean;
 dispatchInfo?: GodDispatchInfo;
 pulsing?: boolean;
}) {
 const [expanded, setExpanded] = useState(false);
 // When set, opens the DemigodPromptModal showing the
 // agent's full Identity .txt prompt. Set by clicking a demigod row.
 const [viewingDemigod, setViewingDemigod] = useState<{ god: string; agent: string; shortDesc: string } | null>(null);
 const hasData = c.requests > 0;
 const Icon = GOD_ICONS[c.god] || GOD_ICONS[c.icon];
 const subAgentCount = dispatchInfo?.subAgentCount ?? 0;
 const hasSubAgents = subAgentCount > 0;
 // LIVE active ECC count (from live.jsonl dispatch events).
 const activeDemigodCount = dispatchInfo?.activeDemigodCount ?? 0;

 return (
 <div className={cn(
 'border-b border-olympus-gold/5 last:border-b-0 transition-colors duration-500',
 pulsing && 'bg-olympus-gold/10',
 )}>
 <button
 onClick={() => hasSubAgents && setExpanded(e => !e)}
 className={cn(
 'w-full grid grid-cols-[1.5fr_1fr_0.8fr_1.2fr_0.8fr] gap-2 px-3 py-2 text-[11px] font-mono items-center transition-colors',
 hasSubAgents ? 'hover:bg-olympus-gold/5 ' : '',
 )}
 >
 <span className="flex items-center gap-1.5 text-olympus-gold">
 {hasSubAgents && (
 expanded
 ? <ChevronDown size={11} className="text-olympus-text-dim shrink-0" />
 : <ChevronRight size={11} className="text-olympus-text-dim shrink-0" />
 )}
 {Icon ? <Icon size={13} /> : null}
 {/* Capitalize god name */}
 <span>{c.god.charAt(0).toUpperCase() + c.god.slice(1)}</span>
 </span>
 <span className="text-olympus-cyan text-[10px] truncate">{c.model.replace(/^[^/]+\//, '')}</span>
 <span className={hasData ? 'text-olympus-text' : 'text-[#5A5A5A]'}>{fmt(c.requests)}</span>
	 <div className="flex flex-col gap-0.5">
	 {isFree ? (
	 <>
	 <div className="flex items-center gap-1.5">
	 <span className={cn('font-bold', !hasData ? 'text-[#5A5A5A]' : 'text-olympus-green')}>
	 {fmt(c.inputTokens + c.outputTokens)} tok
	 </span>
	 </div>
	 {hasData && <span className="text-olympus-text-dim text-[9px]">{fmt(c.inputTokens)} in / {fmt(c.outputTokens)} out</span>}
	 </>
	 ) : (
	 <>
	 <div className="flex items-center gap-1.5">
	 <span className={cn('font-bold',
	 !hasData ? 'text-[#5A5A5A]' :
	 (c.pctOfCap ?? 0) > 80 ? 'text-olympus-red' :
	 (c.pctOfCap ?? 0) > 60 ? 'text-olympus-amber-soft' : 'text-olympus-green')}>
	 ${c.spend.toFixed(2)}
	 </span>
	 {cap != null && <span className="text-olympus-text-dim text-[9px]">/ ${cap}</span>}
	 </div>
	 {cap != null && (
	 <div className="h-1 bg-olympus-bg rounded-full overflow-hidden">
	 <div
	 className={cn('h-full rounded-full',
	 (c.pctOfCap ?? 0) > 80 ? 'bg-olympus-red' :
	 (c.pctOfCap ?? 0) > 60 ? 'bg-olympus-amber-soft' : 'bg-olympus-green')}
	 style={{ width: `${Math.min(c.pctOfCap ?? 0, 100)}%` }}
	 />
	 </div>
	 )}
	 </>
	 )}
	 </div>
 {/* Sub-agent column now shows live `active / total`
 instead of a static number. Active = demigods that have at
 least one dispatch event in the activity feed. */}
 <span className={hasSubAgents ? 'text-olympus-cyan' : 'text-[#5A5A5A]'}>
 {hasSubAgents ? (
 <>
 <span className={activeDemigodCount > 0 ? 'text-olympus-green' : ''}>{activeDemigodCount}</span>
 <span className="text-[#5A5A5A]"> / </span>
 <span>{subAgentCount}</span>
 </>
 ) : '—'}
 </span>
 </button>

 {/* Expanded: list the demigods this god can dispatch to,
 with live usage counts from the activity feed. */}
 {expanded && dispatchInfo && dispatchInfo.demigods.length > 0 && (
 <div className="px-3 pb-2 pt-1 bg-olympus-bg/40 border-t border-olympus-gold/5">
 <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide mb-1.5 mt-1">
 demigods — click to read full prompt · live usage from activity feed
 </div>
 <div className="space-y-1">
 {dispatchInfo.demigods.map((a, i) => {
 const usage = a.usage;
 const usedRecently = usage && usage.count > 0;
 // Show a SHORT one-line phrase derived from the
 // demigod's agent name instead of the verbose Identity sentence.
 // The full .txt prompt opens in a modal on click.
 const shortDesc = demigodShortDescription(a.agent);
 return (
 <button
 key={`${a.agent}-${i}`}
 onClick={() => setViewingDemigod({ god: c.god, agent: a.agent, shortDesc })}
 className="w-full flex items-center gap-2 text-[10px] font-mono py-0.5 px-1 -mx-1 rounded hover:bg-olympus-gold/5 transition-colors text-left group"
 title={`Open ${a.agent} prompt`}
 >
 <Cpu size={9} className={usedRecently ? 'text-olympus-green' : 'text-olympus-text-dim'} />
 <span className="text-olympus-text-dim group-hover:text-olympus-gold transition-colors shrink-0">
 {a.agent.replace(/[-_]/g, '-')}
 </span>
 <span className="text-olympus-text flex-1 truncate group-hover:text-olympus-gold transition-colors">
 {shortDesc}
 </span>
 {usage && usedRecently && (
 <span className="text-[9px] text-olympus-green shrink-0">
 {usage.count}× · {(usage.tokens.input + usage.tokens.output).toLocaleString()} tok
 {usage.lastOutcome === 'failure' && <span className="text-olympus-red ml-1">✗ fail</span>}
 </span>
 )}
 <FileText size={9} className="text-olympus-text-dim group-hover:text-olympus-gold shrink-0 transition-colors" />
 </button>
 );
 })}
 </div>
 <div className="text-[9px] font-mono text-[#5A5A5A] mt-2 leading-relaxed">
 <span className="text-olympus-green">{activeDemigodCount}</span> active of <span>{subAgentCount}</span> total dispatch routes. Usage updates every 10s from <code className="text-olympus-gold">live.jsonl</code>.
 </div>
 </div>
 )}

 {/* DemigodPromptModal. Opens when the user clicks a
 demigod row in the expanded list. Shows the agent's full Identity
 .txt prompt as scrollable markdown. */}
 {viewingDemigod && (
 <DemigodPromptModal
 god={viewingDemigod.god}
 agent={viewingDemigod.agent}
 shortDescription={viewingDemigod.shortDesc}
 onClose={() => setViewingDemigod(null)}
 />
 )}
 </div>
 );
}

function SummaryCard({ icon: Icon, label, value, sub, pct, color }: { icon: any; label: string; value: string; sub?: string; pct?: number; color: string }) {
 const colorMap: Record<string, string> = {
 green: 'text-olympus-green bg-olympus-green/10 ring-olympus-green/20',
 gold: 'text-olympus-gold bg-olympus-gold/10 ring-olympus-gold/20',
 teal: 'text-olympus-cyan bg-olympus-cyan/10 ring-olympus-cyan/20',
 };
 return (
 <div className={cn('rounded-lg p-2.5 border border-olympus-gold/10 ring-1', colorMap[color])}>
 <div className="flex items-center justify-between mb-1">
 <Icon size={12} />
 {pct != null && <span className="text-[9px] font-mono opacity-70">{pct}%</span>}
 </div>
 <div className="text-base font-bold font-mono">{value}</div>
 <div className="text-[9px] text-olympus-text-dim mt-0.5">{label}</div>
 {sub && <div className="text-[8px] text-[#5A5A5A] mt-0.5">{sub}</div>}
 </div>
 );
}

function TokenStat({ label, value, color }: { label: string; value: number; color: string }) {
 return (
 <div>
 <div className="text-[9px] font-mono text-olympus-text-dim uppercase">{label}</div>
 <div className={cn('text-sm font-mono font-bold', value > 0 ? color : 'text-[#5A5A5A]')}>{fmt(value)}</div>
 <div className="text-[8px] font-mono text-olympus-text-dim">{(value / 1_000_000).toFixed(2)}M tokens</div>
 </div>
 );
}

function fmt(n: number): string {
 if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
 if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
 return String(n);
}
