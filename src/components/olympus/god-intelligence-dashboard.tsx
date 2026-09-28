/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { BrainCog, Zap, Activity, ArrowUp, ArrowDown, Minus, BrainCircuit, Sparkles, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import AnimatedNumber from './animated-number';
import { GOD_ICONS } from '@/lib/olympus-store';

// Short-circuit telemetry — live stats from the instinct gate.
interface ShortCircuitStats {
  total_evaluations: number;
  total_short_circuits: number;
  short_circuit_rate: number;
  total_tokens_saved: number;
  avg_confidence: number;
  per_god: Record<string, {
    evaluations: number;
    short_circuits: number;
    short_circuit_rate: number;
    tokens_saved: number;
    avg_confidence: number;
    top_instincts: Array<{ instinct_id: string; count: number; avg_confidence: number }>;
  }>;
  top_instincts: Array<{ instinct_id: string; count: number; avg_confidence: number; tokens_saved: number }>;
  sparkline: Array<{ date: string; evaluations: number; short_circuits: number; short_circuit_rate: number }>;
  log_file: { path: string; exists: boolean; size_bytes: number; size_mb: number };
  generated_at: string;
}

interface GodStats {
 instinctCounts: {
 seed: number;
 empirical: number;
 archived: number;
 total: number;
 };
 shortCircuitHitRate: number;
 shortCircuitCount: number;
 dispatchCount: number;
 avgConfidence: number;
 successRate: {
 '7d': number | null;
 '30d': number | null;
 allTime: number | null;
 };
 topBySamples: Array<{
 id: string;
 confidence: number;
 samples: number;
 successes: number;
 failures: number;
 trigger?: string;
 demigod?: string;
 }>;
 topByConfidence: Array<{
 id: string;
 confidence: number;
 samples: number;
 trigger?: string;
 demigod?: string;
 }>;
 learningVelocity: number;
 avgDurationMs: number | null;
}

interface BrainStats {
 generated_at: string;
 vaultbrain_version: string;
 aggregate: {
 totalDispatches: number;
 totalShortCircuits: number;
 shortCircuitHitRate: number;
 avgConfidence: number;
 totalEmpiricalInstincts: number;
 };
 sparkline: Array<{ date: string; hitRate: number; dispatches: number }>;
 currentStrategy: string;
 recommendedStrategy: string;
 strategyReasoning: string;
 perGod: Record<string, GodStats>;
}

const GOD_ORDER = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];

/**
 * God Intelligence Dashboard — v3.0 VaultBrain.
 *
 * impeccable refactor:
 * - This is now the unified view (absorbs the old BrainHealthDashboard).
 * - The header now also shows brain-health KPIs (orphans, contradictions,
 * pending evolutions, last compaction) when the `health` prop is passed.
 * - Per-god breakdown includes Callimachus (9th god).
 * - Drops the duplicated "Avg confidence" headline card — it's already
 * in the per-god table and the sparkline; the user explicitly called
 * out that "AVG conf" was overused.
 */
export default function GodIntelligenceDashboard({ health }: { health?: any }) {
 const [stats, setStats] = useState<BrainStats | null>(null);
 const [scStats, setScStats] = useState<ShortCircuitStats | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
 let mounted = true;
 const load = () => {
 	// Cache: 'no-store' so the dashboard reflects the
 // latest dispatch outcomes from live.jsonl (was previously showing
 // stale stats because Next.js cached the response between polls).
 fetch('/api/olympus/brain-stats', { cache: 'no-store' })
 .then(r => {
 if (!r.ok) throw new Error(`HTTP ${r.status}`);
 return r.json();
 })
 .then((d: BrainStats) => {
 if (mounted) {
 setStats(d);
 setError(null);
 setLoading(false);
 }
 })
 .catch(e => {
 if (mounted) {
 setError(e.message);
 setLoading(false);
 }
 });
 	// Fetch live telemetry in parallel.
 fetch('/api/olympus/shortcircuit-stats', { cache: 'no-store' })
 .then(r => r.ok ? r.json() : null)
 .then((d: ShortCircuitStats | null) => {
 if (mounted && d) setScStats(d);
 })
 .catch(() => {});
 };
 load();
 const iv = setInterval(load, 30000); // refresh every 30s
 return () => {
 mounted = false;
 clearInterval(iv);
 };
 }, []);

 if (loading) {
 return (
 <div className="h-full overflow-y-auto custom-scroll p-4 bg-olympus-bg">
 <div className="flex items-center gap-2 mb-4">
 <BrainCog size={16} className="text-olympus-gold animate-pulse" />
 <h2 className="text-sm font-semibold text-olympus-gold">God Intelligence Dashboard</h2>
 </div>
 <div className="text-[11px] text-olympus-text-dim font-mono">Loading brain stats...</div>
 </div>
 );
 }

 if (error || !stats) {
 return (
 <div className="h-full overflow-y-auto custom-scroll p-4 bg-olympus-bg">
 <div className="flex items-center gap-2 mb-4">
 <BrainCog size={16} className="text-olympus-red" />
 <h2 className="text-sm font-semibold text-olympus-red">God Intelligence Dashboard</h2>
 </div>
 <div className="text-[11px] text-olympus-red font-mono">
 Failed to load brain stats: {error || 'unknown error'}
 <br />
 <span className="text-olympus-text-dim">
 (Is the vault initialized? Run `python3 scripts/seed-vault.py` then dispatch a task.)
 </span>
 </div>
 </div>
 );
 }

 const { aggregate, sparkline, currentStrategy, recommendedStrategy, strategyReasoning, perGod } = stats;
 const strategyDiffers = recommendedStrategy !== currentStrategy;

 // Find the max sparkline hitRate for scaling
 const maxSparkHitRate = Math.max(0.1, ...sparkline.map(s => s.hitRate));

 return (
 <div className="h-full overflow-y-auto custom-scroll p-4 bg-olympus-bg">
 <div className="flex items-center gap-2 mb-4">
 <BrainCog size={16} className="text-olympus-gold" />
 <h2 className="text-sm font-semibold text-olympus-gold">God Intelligence Dashboard</h2>
 <span className="ml-auto text-[9px] text-olympus-text-dim font-mono uppercase tracking-wider">
 VaultBrain v{stats.vaultbrain_version}
 </span>
 </div>

 {/* Aggregate KPIs — dropped duplicate "Avg confidence" (already in per-god table). */}
 <div className="grid grid-cols-2 gap-2.5 mb-4">
 <KpiCard
 label="Short-circuit hit rate"
 value={aggregate.shortCircuitHitRate}
 format="pct"
 icon={Zap}
 color="text-olympus-gold"
 bg="bg-olympus-gold/10"
 ring="ring-olympus-gold/20"
 />
 <KpiCard
 label="Total dispatches"
 value={aggregate.totalDispatches}
 format="int"
 icon={Activity}
 color="text-olympus-cyan"
 bg="bg-olympus-cyan/10"
 ring="ring-olympus-cyan/20"
 />
 </div>

 {/* Brain health KPIs — from the `health` prop (absorbed from BrainHealthDashboard). */}
 {health && (
 <div className="grid grid-cols-4 gap-2 mb-4">
 <BrainHealthStat label="Orphans" value={health.orphans ?? 0} warning={(health.orphans ?? 0) > 5} />
 <BrainHealthStat label="Contradictions" value={health.contradictions ?? 0} warning={(health.contradictions ?? 0) > 0} />
 <BrainHealthStat label="Pending evolutions" value={health.pending_evolutions ?? 0} warning={(health.pending_evolutions ?? 0) > 10} />
 <BrainHealthStat label="Total instincts" value={health.total_instincts ?? 0} />
 </div>
 )}

 {/* Short-circuit hit rate sparkline (key visual) */}
 <div className="rounded-lg border border-olympus-gold/10 bg-olympus-card p-3 mb-4">
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center gap-2">
 <BrainCircuit size={13} className="text-olympus-gold" />
 <span className="text-[11px] font-semibold text-olympus-text">
 Short-Circuit Hit Rate (14 days)
 </span>
 </div>
 <span className="text-[10px] text-olympus-text-dim font-mono">
 {aggregate.shortCircuitHitRate > 0.5
 ? 'The gods are getting smarter'
 : aggregate.shortCircuitHitRate > 0.2
 ? 'The brain is learning'
 : 'The brain is still cold-starting'}
 </span>
 </div>
 <div className="flex items-end gap-0.5 h-15">
 {sparkline.map((s, i) => {
 const heightPct = (s.hitRate / maxSparkHitRate) * 100;
 const hasData = s.dispatches > 0;
 return (
 <div
 key={i}
 className="flex-1 group relative"
 title={`${s.date}: ${(s.hitRate * 100).toFixed(1)}% (${s.dispatches} dispatches)`}
 >
 <div
 className={cn(
 'w-full rounded-t-sm transition-all',
 hasData
 ? s.hitRate > 0.5
 ? 'bg-olympus-green'
 : s.hitRate > 0.2
 ? 'bg-olympus-gold'
 : 'bg-olympus-text-dim'
 : 'bg-olympus-text-dim/20'
 )}
 style={{ height: `${hasData ? Math.max(2, heightPct) : 2}%` }}
 />
 </div>
 );
 })}
 </div>
 <div className="flex justify-between mt-1 text-[8px] text-olympus-text-dim font-mono">
 <span>{sparkline[0]?.date.slice(5) ?? ''}</span>
 <span>today</span>
 </div>
 </div>

 {/* Live Short-Circuit Health panel. */}
 {scStats && scStats.log_file.exists && (
 <div className="rounded-lg border border-olympus-gold/10 bg-olympus-card p-3 mb-4">
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center gap-2">
 <Coins size={13} className="text-olympus-gold" />
 <span className="text-[11px] font-semibold text-olympus-text">
 Short-Circuit Health (live telemetry)
 </span>
 </div>
 <span className="text-[9px] text-olympus-text-dim font-mono">
 log: {scStats.log_file.size_mb} MB · {scStats.total_evaluations} evaluations
 </span>
 </div>

 {/* Aggregate KPIs */}
 <div className="grid grid-cols-4 gap-2 mb-3">
 <div className="rounded border border-olympus-gold/10 bg-olympus-bg/50 p-2">
 <div className="text-[9px] text-olympus-text-dim font-mono uppercase">Short-Circuits</div>
 <div className="text-sm font-mono text-olympus-gold font-semibold mt-0.5">
 <AnimatedNumber value={scStats.total_short_circuits} />
 </div>
 </div>
 <div className="rounded border border-olympus-gold/10 bg-olympus-bg/50 p-2">
 <div className="text-[9px] text-olympus-text-dim font-mono uppercase">Hit Rate</div>
 <div className="text-sm font-mono text-olympus-green font-semibold mt-0.5">
 <AnimatedNumber value={scStats.short_circuit_rate * 100} decimals={1} />%
 </div>
 </div>
 <div className="rounded border border-olympus-gold/10 bg-olympus-bg/50 p-2">
 <div className="text-[9px] text-olympus-text-dim font-mono uppercase">Tokens Saved</div>
 <div className="text-sm font-mono text-olympus-cyan font-semibold mt-0.5">
 <AnimatedNumber value={scStats.total_tokens_saved} />
 </div>
 </div>
 <div className="rounded border border-olympus-gold/10 bg-olympus-bg/50 p-2">
 <div className="text-[9px] text-olympus-text-dim font-mono uppercase">Avg Confidence</div>
 <div className="text-sm font-mono text-olympus-text font-semibold mt-0.5">
 <AnimatedNumber value={scStats.avg_confidence} decimals={3} />
 </div>
 </div>
 </div>

 {/* Top instincts by fire count */}
 {scStats.top_instincts.length > 0 && (
 <div className="mb-2">
 <div className="text-[9px] text-olympus-text-dim font-mono uppercase mb-1">
 Top instincts (by fire count)
 </div>
 <div className="space-y-0.5">
 {scStats.top_instincts.map((inst, i) => (
 <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
 <span className="text-olympus-text-dim w-4">{i + 1}.</span>
 <span className="text-olympus-gold truncate flex-1">{inst.instinct_id}</span>
 <span className="text-olympus-text">{inst.count}×</span>
 <span className="text-olympus-text-dim">conf={inst.avg_confidence.toFixed(2)}</span>
 <span className="text-olympus-cyan">{inst.tokens_saved} tok saved</span>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Per-god breakdown (compact) */}
 {Object.keys(scStats.per_god).length > 0 && (
 <details className="mt-2">
 <summary className="text-[9px] text-olympus-text-dim font-mono uppercase cursor-pointer hover:text-olympus-gold">
 Per-god breakdown ({Object.keys(scStats.per_god).length} gods)
 </summary>
 <div className="mt-2 space-y-1">
 {Object.entries(scStats.per_god)
 .sort(([,a], [,b]) => b.short_circuits - a.short_circuits)
 .map(([god, s]) => (
 <div key={god} className="flex items-center gap-2 text-[10px] font-mono">
 <span className="text-olympus-gold capitalize w-24 truncate">{god}</span>
 <span className="text-olympus-text">{s.short_circuits}/{s.evaluations}</span>
 <span className="text-olympus-green">{(s.short_circuit_rate * 100).toFixed(0)}%</span>
 <span className="text-olympus-cyan">{s.tokens_saved} tok</span>
 <span className="text-olympus-text-dim">conf={s.avg_confidence.toFixed(2)}</span>
 </div>
 ))}
 </div>
 </details>
 )}
 </div>
 )}

 {/* Strategy recommendation */}
 <div
 className={cn(
 'rounded-lg border p-3 mb-4',
 strategyDiffers
 ? 'border-olympus-amber-soft/40 bg-olympus-amber-soft/5'
 : 'border-olympus-gold/10 bg-olympus-card'
 )}
 >
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-[11px] font-semibold text-olympus-text">Strategy Recommendation</span>
 <div className="flex items-center gap-1.5">
 <span className="text-[10px] text-olympus-text-dim font-mono uppercase">{currentStrategy}</span>
 {strategyDiffers && (
 <>
 <ArrowRight />
 <span className="text-[10px] text-olympus-amber-soft font-mono uppercase font-bold">
 {recommendedStrategy}
 </span>
 </>
 )}
 </div>
 </div>
 <p className="text-[10px] text-olympus-text-dim leading-relaxed">{strategyReasoning}</p>
 </div>

 {/* Per-god breakdown */}
 <div className="rounded-lg border border-olympus-gold/10 bg-olympus-card p-3">
 <div className="flex items-center gap-2 mb-2.5">
 <BrainCog size={13} className="text-olympus-gold" />
 <span className="text-[11px] font-semibold text-olympus-text">Per-God Intelligence</span>
 </div>
 <div className="space-y-2">
 {GOD_ORDER.map(godId => {
 const s = perGod[godId];
 if (!s) return null;
 const Icon = GOD_ICONS[godId];
 return (
 <GodRow key={godId} godId={godId} stats={s} icon={Icon} />
 );
 })}
 </div>
 </div>
 </div>
 );
}

function ArrowRight() {
 return (
 <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-olympus-amber-soft">
 <path d="M2 5 L8 5 M5 2 L8 5 L5 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 );
}

function KpiCard({
 label,
 value,
 format,
 icon: Icon,
 color,
 bg,
 ring,
}: {
 label: string;
 value: number;
 format: 'int' | 'dec2' | 'pct';
 icon: any;
 color: string;
 bg: string;
 ring: string;
}) {
 return (
 <div
 className={cn(
 'rounded-lg p-3 border border-olympus-gold/10 backdrop-blur-sm',
 bg,
 `ring-1 ${ring}`
 )}
 >
 <div className="flex items-center justify-between mb-1.5">
 <Icon size={14} className={cn(color, 'drop-shadow-[0_0_3px_currentColor]')} />
 </div>
 <div className={cn('text-xl font-bold font-mono tabular-nums', color)}>
 {format === 'int' && <AnimatedNumber value={value} />}
 {format === 'dec2' && <AnimatedNumber value={value} decimals={2} />}
 {format === 'pct' && (
 <>
 <AnimatedNumber value={value * 100} decimals={1} />
 <span className="text-sm">%</span>
 </>
 )}
 </div>
 <div className="text-[10px] text-olympus-text-dim mt-0.5">{label}</div>
 </div>
 );
}

function GodRow({
 godId,
 stats,
 icon: Icon,
}: {
 godId: string;
 stats: GodStats;
 icon: any;
}) {
 const [expanded, setExpanded] = useState(false);

 	// Callimachus now dispatches to demigods like every other god.
 // No more special-casing: all 9 gods use the SAME layout and metrics.
 const hitRate = stats.shortCircuitHitRate;
 const hitRateColor = hitRate > 0.5
 ? 'text-olympus-green'
 : hitRate > 0.2
 ? 'text-olympus-gold'
 : 'text-olympus-text-dim';
 const successRate = stats.successRate.allTime;
 const successColor = successRate === null
 ? 'text-olympus-text-dim'
 : successRate > 0.85
 ? 'text-olympus-green'
 : successRate > 0.6
 ? 'text-olympus-gold'
 : 'text-olympus-red';

 // Trend indicator — same logic for all gods (including Callimachus).
 const trend = hitRate > 0.3 ? 'up' : hitRate > 0 ? 'flat' : 'down';

 return (
 <div
 className="rounded-md border border-olympus-gold/5 bg-olympus-bg/40 hover:border-olympus-gold/20 transition-colors"
 onClick={() => setExpanded(!expanded)}
 >
 <div className="flex items-center gap-2 p-2">
 {Icon && <Icon size={12} className="text-olympus-gold shrink-0" />}
 <span className="text-[11px] font-mono text-olympus-text capitalize shrink-0 w-20">{godId}</span>
 <div className="flex-1 grid grid-cols-4 gap-1 text-[10px] font-mono">
 <Stat label="inst" value={`${stats.instinctCounts.empirical}`} color="text-olympus-cyan" />
 <Stat label="conf" value={stats.avgConfidence.toFixed(2)} color="text-olympus-green" />
 <Stat label="sc%" value={`${(hitRate * 100).toFixed(0)}%`} color={hitRateColor} />
 <Stat
 label="ok%"
 value={successRate === null ? '--' : `${(successRate * 100).toFixed(0)}%`}
 color={successColor}
 />
 </div>
 {trend === 'up' && <ArrowUp size={10} className="text-olympus-green shrink-0" />}
 {trend === 'down' && <ArrowDown size={10} className="text-olympus-red shrink-0" />}
 {trend === 'flat' && <Minus size={10} className="text-olympus-text-dim shrink-0" />}
 </div>
 {expanded && (
 <div className="px-2 pb-2 pt-1 border-t border-olympus-gold/5 space-y-1.5">
 <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-olympus-text-dim">
 <div>seed: <span className="text-olympus-text">{stats.instinctCounts.seed}</span></div>
 <div>archived: <span className="text-olympus-text">{stats.instinctCounts.archived}</span></div>
 <div>dispatches: <span className="text-olympus-text">{stats.dispatchCount}</span></div>
 <div>velocity (7d): <span className="text-olympus-text">{stats.learningVelocity}</span></div>
 <div>avg duration: <span className="text-olympus-text">{stats.avgDurationMs !== null ? `${stats.avgDurationMs}ms` : '--'}</span></div>
 <div>success 7d: <span className="text-olympus-text">{stats.successRate['7d'] === null ? '--' : `${(stats.successRate['7d']! * 100).toFixed(0)}%`}</span></div>
 </div>
 {stats.topBySamples.length > 0 && (
 <div>
 <div className="text-[9px] text-olympus-text-dim font-mono uppercase tracking-wider mt-2 mb-1">Top by samples</div>
 {stats.topBySamples.map((i, idx) => (
 <div key={idx} className="text-[10px] font-mono text-olympus-text-dim flex justify-between gap-2">
 <span className="truncate" title={i.trigger}>{i.id}</span>
 <span className="text-olympus-cyan shrink-0">
 {i.samples}sx{i.successes}
 </span>
 </div>
 ))}
 </div>
 )}
 {stats.topByConfidence.length > 0 && (
 <div>
 <div className="text-[9px] text-olympus-text-dim font-mono uppercase tracking-wider mt-2 mb-1">Top by confidence</div>
 {stats.topByConfidence.map((i, idx) => (
 <div key={idx} className="text-[10px] font-mono text-olympus-text-dim flex justify-between gap-2">
 <span className="truncate" title={i.trigger}>{i.id}</span>
 <span className="text-olympus-green shrink-0">{i.confidence.toFixed(2)}</span>
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
 return (
 <div className="flex flex-col">
 <span className="text-[8px] text-olympus-text-dim uppercase">{label}</span>
 <span className={color}>{value}</span>
 </div>
 );
}

function BrainHealthStat({ label, value, warning }: { label: string; value: number; warning?: boolean }) {
 return (
 <div className="rounded-md border border-olympus-gold/10 bg-olympus-card/50 px-2.5 py-1.5">
 <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide">{label}</div>
 <div className={cn(
 'text-base font-mono font-bold',
 warning ? 'text-olympus-amber-soft' : 'text-olympus-green',
 )}>{value}</div>
 </div>
 );
}
