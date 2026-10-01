/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';
import { useOlympus, GOD_ICONS, GOD_IDS } from '@/lib/olympus-store';
import {
 BookMarked, BookOpen, BookOpenText, BrainCircuit, ChevronRight, ChevronDown, Lightbulb, FolderTree, Library,
 RefreshCw, AlertCircle, TrendingUp, Clock, HeartPulse, Waypoints,
} from 'lucide-react';
import { cn } from '@/lib/utils';
// InstinctDetailModal lets the user click an instinct name and read its full markdown.
// InstinctDetailModal fetches the file itself, via /api/vault/file/read?path=<vault-relative path> (not /api/olympus/fs/read).
import InstinctDetailModal from './instinct-detail-modal';

/* ------------------------------------------------------------------ */
/* Vault Summary — read-only panel. Callimachus handles curation, */
/* so this is a summary display without edit affordances. */
/* Shows: vault totals, per-category breakdown, per-god instinct */
/* evolution, and recent additions. Refreshes every 30s. */
/* ------------------------------------------------------------------ */

interface VaultSummary {
 totalNotes: number;
 byCategory: {
 instincts: number;
 skills: number;
 references: number;
 knowledge: number;
 projects: number;
 };
 perGodInstincts: Record<string, number>;
 recentAdditions: Array<{
 path: string;
 name: string;
 category: string;
 ts: string;
 }>;
 vaultHealth: {
 orphans: number;
 contradictions: number;
 pending_evolutions: number;
 last_compaction: string | null;
 };
}

interface GraphData {
 nodes: Array<{ id: string; type: string; god?: string }>;
 links: Array<{ source: string; target: string }>;
}

interface BrainHealth {
 total_instincts: number;
 total_skills: number;
 total_agents: number;
 total_mcps?: number;
 total_plugins?: number;
 total_commands?: number;
 gods?: number;
 subagents?: number;
 orphans: number;
 contradictions: number;
 pending_evolutions: number;
 last_compaction?: string | null;
 avg_confidence?: number;
 avgConfidence?: number;
 total_knowledge?: number;
	 // SUM of per-god seed-instinct counts. The CategoryCard
 // "Skills Mastered" total + the CompactInstinctTable per-god "Mastered"
 // column both derive from this same source, so the total always equals
 // the sum of the per-god column.
 mastered_skills?: number;
 per_god_mastered_skills?: Record<string, number>;
}

// Per-god instinct breakdown from /api/olympus/brain-stats.
// Replaces the mock `id.includes('empirical')` filter on graph skill nodes
// with REAL counts from the instinct files on disk.
//
// InstinctNames added so the Vault Summary can show
// the actual NAMES of instincts in each tier, not just the count.
interface InstinctNameEntry {
 id: string;
 name: string;
 confidence: number;
 trigger?: string;
 demigod?: string;
	 // Absolute path to the instinct .md file.
 // Used to open the file in the IDE when the user clicks the name.
 path?: string;
}
interface PerGodInstinctStats {
 instinctCounts: {
 seed: number; // Mastered — immutable baselines
 empirical: number; // Learning — live, learned from real dispatches
 archived: number; // Quick Circuits — pruned/stale instincts
 total: number;
 };
 instinctNames?: {
 seed: InstinctNameEntry[];
 empirical: InstinctNameEntry[];
 archived: InstinctNameEntry[];
 };
 shortCircuitHitRate: number;
 dispatchCount: number;
 avgConfidence: number;
 learningVelocity: number;
}
interface BrainStatsResponse {
 perGod?: Record<string, PerGodInstinctStats>;
}

const EMPTY: VaultSummary = {
 totalNotes: 0,
 byCategory: { instincts: 0, skills: 0, references: 0, knowledge: 0, projects: 0 },
 perGodInstincts: {},
 recentAdditions: [],
 vaultHealth: { orphans: 0, contradictions: 0, pending_evolutions: 0, last_compaction: null },
};

function timeAgo(ts: string): string {
 const diff = Date.now() - new Date(ts).getTime();
 const mins = Math.floor(diff / 60000);
 if (mins < 1) return 'just now';
 if (mins < 60) return `${mins}m ago`;
 const hrs = Math.floor(mins / 60);
 if (hrs < 24) return `${hrs}h ago`;
 return `${Math.floor(hrs / 24)}d ago`;
}

export default function VaultSummary() {
 const [summary, setSummary] = useState<VaultSummary | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
	 // Store skill nodes in state so the "Learned & Upgraded
 // Skills" section can access them in the render scope.
 const [skillNodes, setSkillNodes] = useState<Array<{ id: string; type: string; god?: string }>>([]);
	 // Store health data for accurate skill count (matches status bar).
 const [healthData, setHealthData] = useState<BrainHealth | null>(null);
	 // Store per-god brain-stats so the Mastered/Learning/
 // Quick Circuits section shows REAL counts from instinct files on disk
 // (was previously a mock filter on graph skill node IDs).
 const [brainStats, setBrainStats] = useState<Record<string, PerGodInstinctStats> | null>(null);

 const load = async () => {
	 // Add a timeout so the vault never gets stuck in
 // "reading vault..." forever if a fetch hangs.
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 10000);
 try {
	 // All fetches use cache: 'no-store' so the dashboard
 // always reflects the current state of the vault (was previously
 // showing stale data because Next.js / the browser cached the
 // responses for the 30s refresh interval).
 const [graphRes, healthRes, brainStatsRes] = await Promise.all([
 fetch('/api/olympus/graph', { signal: controller.signal, cache: 'no-store' }),
 fetch('/api/olympus/health', { signal: controller.signal, cache: 'no-store' }).catch(() => null),
 fetch('/api/olympus/brain-stats', { signal: controller.signal, cache: 'no-store' }).catch(() => null),
 ]);

 clearTimeout(timeout);
 if (!graphRes.ok) throw new Error(`Graph API returned ${graphRes.status}`);
 const graphData: { graph: GraphData; health: BrainHealth } = await graphRes.json();
 const health: BrainHealth | null = healthRes?.ok ? await healthRes.json() : null;
 const brainStatsData: BrainStatsResponse | null = brainStatsRes?.ok ? await brainStatsRes.json() : null;

 const nodes = graphData.graph?.nodes ?? [];
	 // Use graphData.health for the live skill /
 // knowledge / instinct counts. The previous code set `healthData` from
 // the /api/olympus/health endpoint (system health — ports, CPU, etc.),
 // which does NOT return total_skills / total_knowledge / total_instincts.
 // That's why the Skills card always fell back to the graph node count.
 // graphData.health comes from brainHealth() in src/lib/olympus.ts which
 // scans the actual disk (.opencode/skills/, ~/OLYMPUS-VAULT/04_Knowledge/,
 // ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/).
 const brainHealthData: BrainHealth | null = graphData.health ?? null;
	 // The "Mastered" card should show the count of skills
 // that gods have actually MASTERED (from the mastered-skills profiles
 // in the vault-brain), NOT the total installed skills (360). The
 // `mastered_skills` field in brainHealth() is the sum of mastered
 // skills across all 9 gods. On a fresh install this is 0; as gods
 // master new skills, it grows. The total installed count (360) is
 // shown in the status bar — the Vault Summary shows the mastered count.
 const masteredCount = brainHealthData?.mastered_skills ?? 0;
 const counts: VaultSummary = {
 totalNotes: nodes.length,
 byCategory: {
 instincts: brainHealthData?.total_instincts ?? nodes.filter(n => n.type === 'instinct').length,
 skills: masteredCount,
 references: brainHealthData?.total_knowledge ?? nodes.filter(n => n.type === 'reference' || n.type === 'knowledge').length,
 knowledge: nodes.filter(n => n.type === 'knowledge').length,
 projects: nodes.filter(n => n.type === 'project').length,
 },
 perGodInstincts: {},
 recentAdditions: [],
 vaultHealth: {
 orphans: brainHealthData?.orphans ?? 0,
 contradictions: brainHealthData?.contradictions ?? 0,
 pending_evolutions: brainHealthData?.pending_evolutions ?? 0,
 last_compaction: brainHealthData?.last_compaction ?? null,
 },
 };

 // Per-god instinct counts (how is each god evolving?).
 for (const god of GOD_IDS) {
 counts.perGodInstincts[god] = nodes.filter(
 n => n.type === 'instinct' && (n.god === god || n.id?.includes(`:${god}:`))
 ).length;
 }

	 // Store skill nodes in state for the "Learned &
 // Upgraded Skills" section.
 setSkillNodes(nodes.filter(n => n.type === 'skill'));
	 // Store brain health from the graph endpoint (NOT
 // the system health endpoint). graphData.health has total_skills /
 // total_knowledge / total_instincts from brainHealth() in olympus.ts.
 setHealthData(brainHealthData);
	 // Store per-god brain-stats for the real
 // Mastered/Learning/Quick Circuits breakdown.
 setBrainStats(brainStatsData?.perGod ?? null);

 // Recent additions — fetch the activity feed for the last 5 instinct writes.
 try {
 const actRes = await fetch('/api/olympus/episodes', { cache: 'no-store' });
 if (actRes.ok) {
 const actData = await actRes.json();
 const episodes = Array.isArray(actData.episodes) ? actData.episodes : [];
 counts.recentAdditions = episodes
 .filter((e: any) => e.source === 'vault' || e.god)
 .slice(0, 5)
 .map((e: any) => ({
 path: e.id || '',
 name: e.summary?.slice(0, 80) || e.id || '—',
 category: 'instinct',
 ts: e.ts,
 }));
 }
 } catch {}

 setSummary(counts);
 setError(null);
 } catch (e: any) {
 clearTimeout(timeout);
 const msg = e.name === 'AbortError' ? 'Request timed out (10s).' : (e.message || 'Failed to load vault summary');
 setError(msg);
 setSummary(EMPTY);
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 load();
	 // Poll every 10s (was 30s) so the mastered skills count
 // updates dynamically when gods master new skills. The brainHealth()
 // function reads the mastered-skills profiles from disk on every call,
 // so this gives near-real-time updates.
 const iv = setInterval(load, 10000);
 return () => clearInterval(iv);
 }, []);

 if (loading && !summary) {
 return (
 <div className="w-full h-full flex flex-col items-center justify-center text-olympus-text-dim bg-olympus-bg gap-2">
 <Loader size={20} />
 <span className="text-[10px] font-mono">reading vault…</span>
 </div>
 );
 }

 if (error && !summary) {
 return (
 <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-olympus-bg text-olympus-text-dim px-6">
 <AlertCircle size={24} className="text-olympus-red" />
 <p className="text-xs font-mono text-olympus-red">{error}</p>
 <button
 onClick={load}
 className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-olympus-gold/15 text-olympus-gold text-[11px] font-mono hover:bg-olympus-gold/25"
 >
 <RefreshCw size={11} /> Retry
 </button>
 </div>
 );
 }

 const s = summary ?? EMPTY;
 const totalInstincts = Object.values(s.perGodInstincts).reduce((a: number, b: any) => a + (Number(b) || 0), 0);

	 // Derived values for the new Vault health card.
 //
 // quickCircuitTotal — sum of archived instinct counts across all gods.
 // The "Quick-Circuits" card at the top shows this number; it represents
 // demigod+tool combinations that have been used enough times to be
 // promoted to a reusable circuit (currently sourced from the _archive/
 // instinct tier — these are stale instincts kept for pattern matching).
 // As Callimachus's LINK stage detects cross-god dispatch chains with
 // ≥10 samples and ≥0.85 success rate, those chains become Quick-Circuits
 // and the count grows.
 const quickCircuitTotal = brainStats
 ? Object.values(brainStats).reduce((acc, st: any) => acc + (st?.instinctCounts?.archived ?? 0), 0)
 : 0;

 // circuitHealthPct + totalDispatches — short-circuit hit rate across all
 // gods, plus the total dispatch count. Sourced from the brain-stats
 // per-god aggregate. A high hit rate means the Brain is correctly
 // short-circuiting known dispatches (skipping deliberation when an
 // instinct with confidence ≥ 0.85 already matches the task signature).
 // A low hit rate with high dispatch count means the Brain is still
 // cold-starting — every dispatch is going through full deliberation.
 const totalDispatches = brainStats
 ? Object.values(brainStats).reduce((acc, st: any) => acc + (st?.dispatchCount ?? 0), 0)
 : 0;
 const circuitHealthPct = brainStats && totalDispatches > 0
 ? (Object.values(brainStats).reduce((acc, st: any) => acc + (st?.shortCircuitHitRate ?? 0) * (st?.dispatchCount ?? 0), 0) / totalDispatches) * 100
 : 0;

 // curationStatus — a colored pill (top-right of the Vault health card)
 // that tells the user at a glance whether Calimachus's 7-stage
 // heartbeat has run recently. The heartbeat fires automatically on
 // session.idle; the user can also trigger it via the Compact Brain
 // button. The `last_compaction` field in vaultHealth comes from
 // brainHealth() in src/lib/olympus.ts (currently always null on a
 // cold-start install — see Patch 2 notes for how to wire it to the
 // ~/.olympus/callimachus.last-heartbeat.json file in a future patch).
 const curationStatus = (() => {
 const ts = s.vaultHealth.last_compaction;
 if (!ts) {
 return {
 label: 'awaiting first curation',
 color: 'bg-olympus-amber-soft/10 text-olympus-amber-soft',
 dot: 'bg-olympus-amber-soft',
 };
 }
 const ageHrs = (Date.now() - new Date(ts).getTime()) / 3600000;
 if (ageHrs < 24) {
 return {
 label: 'curated recently',
 color: 'bg-olympus-green/10 text-olympus-green',
 dot: 'bg-olympus-green',
 };
 }
 if (ageHrs < 168) { // 7 days
 return {
 label: `curated ${Math.floor(ageHrs / 24)}d ago`,
 color: 'bg-olympus-amber-soft/10 text-olympus-amber-soft',
 dot: 'bg-olympus-amber-soft',
 };
 }
 return {
 label: 'curation stale — run Compact Brain',
 color: 'bg-olympus-red/10 text-olympus-red',
 dot: 'bg-olympus-red',
 };
 })();

 return (
 <div className="w-full h-full overflow-y-auto custom-scroll bg-olympus-bg">
 {/* Header */}
 <div className="flex items-center gap-2 px-4 py-3 border-b border-olympus-gold/10 bg-olympus-panel">
	 {/* Changed to Library icon to match the Vault tab. */}
 <Library size={14} className="text-olympus-gold shrink-0" />
 <span className="text-[11px] font-mono font-semibold text-olympus-gold">Vault Summary</span>
 <span className="text-[9px] font-mono text-olympus-text-dim ml-auto">
 {s.totalNotes} notes · read-only
 </span>
 <button
 onClick={load}
 aria-label="Refresh vault summary"
 className="text-olympus-text-dim hover:text-olympus-gold transition-colors ml-1"
 >
 <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
 </button>
 </div>

 <div className="p-4 space-y-3">
	 {/* Category breakdown reduced to THREE cards:
 Instincts / Knowledge / Quick-Circuits. The Brain now centers on
 these three categories (see Patch 1), so the Vault-Summary mirrors
 the same focus. Skills Mastered and Projects were removed because
 the Brain no longer surfaces them and the user wants a minimal,
 didactic view of the Brain's progression.
 - Instincts → from brainHealth().total_instincts (seed + empirical)
 - Knowledge → from brainHealth().total_knowledge (reference docs)
 - Quick-Circuits → archived instinct count (the CompactInstinctTable
 below breaks this down per god) */}
 <div className="grid grid-cols-3 gap-2">
 <CategoryCard
 icon={Lightbulb}
 label="Instincts"
 value={healthData?.total_instincts ?? s.byCategory.instincts}
 color="text-olympus-green bg-olympus-green/10 ring-olympus-green/20"
 />
 <CategoryCard
 icon={BookOpenText}
 label="Knowledge"
 value={healthData?.total_knowledge ?? s.byCategory.references}
 color="text-olympus-cyan bg-olympus-cyan/10 ring-olympus-cyan/20"
 />
 <CategoryCard
 icon={BrainCircuit}
 label="Quick-Circuits"
 value={quickCircuitTotal}
 color="text-olympus-purple bg-olympus-purple/10 ring-olympus-purple/20"
 />
 </div>

	 {/* Canonical Olympus totals card. Live counts from
 opencode.json + .mcp.json + .opencode/skills + .opencode/commands.
 Replaces the static "9 gods · 118 demigods · 330 skills" hard-coded
 summary with REAL numbers that stay accurate as the install
 evolves. Data comes from brainHealth() via /api/olympus/health. */}
	 {/* REMOVED "Brain Atlas · live install" section.
 The counts there were confusing because they differed from the
 status bar counts (which come from the same source). The status
 bar already shows skills/agents/gods — no need to duplicate. */}

	 {/* Vault health, REIMAGINED.

 Calimachus runs a 7-stage brain lifecycle on every session.idle
 (and on-demand via the Compact Brain button):
 INTAKE → CLASSIFY → EXTRACT → SCOPE → LINK → RECALIBRATE → PRUNE

 This card surfaces the LIVE state of that workflow as four
 vitality indicators, so the user can see at a glance whether
 the Brain is healthy, learning, or needs attention:

 1. Curation status — green if last heartbeat < 24h, amber if
 < 7d, red if older / never run.
 2. Pending evolutions — count of empirical instincts waiting
 to be promoted to seed (currently
 sourced from brainHealth().pending_evolutions).
 3. Circuit health — short-circuit hit rate across all gods
 (higher = the Brain is correctly
 short-circuiting known dispatches).
 4. Orphans + Contradictions — vault-lint findings, relocated
 here from the God-Intelligence dashboard
 per Task 2.

 The four Orphans / Contradictions / Pending evolutions / Total
 instincts KPIs that used to live in god-intelligence-dashboard.tsx
 (lines 187-194) are now consolidated here. Total instincts is
 already shown in the Instincts card above; the other three live
 in this card. */}
 <div className="rounded-lg border border-olympus-gold/15 bg-olympus-card p-3">
 <div className="flex items-center gap-2 mb-2">
 <HeartPulse size={12} className="text-olympus-gold" />
 <span className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide">Vault health</span>
 <span className={cn('text-[9px] font-mono ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded', curationStatus.color)}>
 <span className={cn('w-1.5 h-1.5 rounded-full', curationStatus.dot)} />
 {curationStatus.label}
 </span>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <HealthStat
 label="Pending evolutions"
 value={s.vaultHealth.pending_evolutions}
 warning={s.vaultHealth.pending_evolutions > 10}
 hint="empirical instincts ready to promote"
 />
 <HealthStat
 label="Circuit health"
 value={`${circuitHealthPct.toFixed(0)}%`}
 warning={circuitHealthPct < 0.2 && totalDispatches > 0}
 hint={`${totalDispatches} dispatches observed`}
 />
 <HealthStat
 label="Orphans"
 value={s.vaultHealth.orphans}
 warning={s.vaultHealth.orphans > 5}
 hint="knowledge nodes with no links"
 />
 <HealthStat
 label="Contradictions"
 value={s.vaultHealth.contradictions}
 warning={s.vaultHealth.contradictions > 0}
 hint="conflicting instincts detected"
 />
 </div>
 {s.vaultHealth.last_compaction && (
 <div className="text-[9px] font-mono text-[#5A5A5A] mt-2 pt-2 border-t border-olympus-gold/5 flex items-center gap-1">
 <Clock size={9} /> last curation: {timeAgo(s.vaultHealth.last_compaction)}
 </div>
 )}
 {!s.vaultHealth.last_compaction && (
 <div className="text-[9px] font-mono text-[#5A5A5A] mt-2 pt-2 border-t border-olympus-gold/5">
 Calimachus will run the first curation on the next idle session.
 </div>
 )}
 </div>

 {/* Per-god instinct evolution */}
 <div className="rounded-lg border border-olympus-gold/15 bg-olympus-card p-3">
 <div className="flex items-center gap-2 mb-2.5">
 <TrendingUp size={12} className="text-olympus-green" />
 <span className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide">
 Per-god instincts · {totalInstincts} total
 </span>
 </div>
 <div className="space-y-1">
 {GOD_IDS.map(god => {
 const count = s.perGodInstincts[god] ?? 0;
 const pct = totalInstincts > 0 ? (count / totalInstincts) * 100 : 0;
 const Icon = GOD_ICONS[god];
 return (
 <div key={god} className="flex items-center gap-2 text-[10px] font-mono">
 {Icon && <Icon size={11} className="text-olympus-gold shrink-0" />}
 <span className="w-20 text-olympus-text-dim shrink-0">{god.charAt(0).toUpperCase() + god.slice(1)}</span>
 <div className="flex-1 h-2 bg-olympus-bg rounded-full overflow-hidden">
 <div
 className="h-full bg-olympus-gold/60 rounded-full transition-all duration-500"
 style={{ width: `${Math.max(2, pct)}%` }}
 />
 </div>
 <span className="w-6 text-right text-olympus-text">{count}</span>
 </div>
 );
 })}
 </div>
 </div>

 {/* Recent additions */}
 {s.recentAdditions.length > 0 && (
 <div className="rounded-lg border border-olympus-gold/15 bg-olympus-card p-3">
 <div className="flex items-center gap-2 mb-2">
 <Clock size={12} className="text-olympus-cyan" />
 <span className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide">Recent additions</span>
 </div>
 <div className="space-y-1.5">
 {s.recentAdditions.map((r, i) => (
 <div key={`${r.path}-${i}`} className="flex items-center gap-2 text-[10px] font-mono">
 <span className="w-1.5 h-1.5 rounded-full bg-olympus-green shrink-0" />
 <span className="flex-1 truncate text-olympus-text">{r.name}</span>
 <span className="text-[#5A5A5A] shrink-0">{timeAgo(r.ts)}</span>
 </div>
 ))}
 </div>
 </div>
 )}

	 {/* Compact per-god Mastered/Learning/Quick Circuits table.
 Shows ALL 9 gods at once in a single table (no clicking required).
 Columns: God | Mastered (seed) | Learning (empirical) | Quick Circuits (archived) | Total
 Data comes from /api/olympus/brain-stats which reads the actual
 instinct files on disk (~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/).
 This replaces the previous expandable card UI that required clicking
 each god individually to see their breakdown. */}
 <CompactInstinctTable brainStats={brainStats} healthData={healthData} masteredSkillCount={healthData?.mastered_skills ?? 0} />

 {/* Footer note */}
 <div className="text-[9px] font-mono text-[#5A5A5A] leading-relaxed pt-1">
 Callimachus curates the vault automatically — instinct merges, dedup, and link repair
 run on the 7-stage brain maintenance loop. Use <code className="text-olympus-gold">Compact Brain</code> in the
 status bar for on-demand deep cleanup.
 </div>
 </div>
 </div>
 );
}

function CategoryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
 return (
 <div className={cn('rounded-lg p-2.5 border border-olympus-gold/10 ring-1', color)}>
 <Icon size={12} className="mb-1" />
 <div className="text-base font-bold font-mono">{value}</div>
 <div className="text-[9px] text-olympus-text-dim mt-0.5">{label}</div>
 </div>
 );
}

/**
 * AtlasStat: a single-cell stat for the canonical totals card.
 * Live counts from opencode.json / .mcp.json / .opencode/skills / .opencode/commands.
 */
function AtlasStat({ label, value, color }: { label: string; value: number; color: string }) {
 return (
 <div className="rounded-md bg-olympus-bg/50 py-1.5 px-1">
 <div className={cn('text-base font-bold font-mono leading-tight', color)}>{value}</div>
 <div className="text-[8px] text-olympus-text-dim uppercase tracking-wider mt-0.5">{label}</div>
 </div>
 );
}

// HealthStat now accepts an optional `hint` prop
// shown as a one-line caption under the value. Used by the new Vault health
// card to explain what each metric means (e.g. "empirical instincts ready to
// promote", "knowledge nodes with no links"). Keeps the minimalist aesthetic
// while making the card self-documenting.
function HealthStat({
 label,
 value,
 warning,
 hint,
}: {
 label: string;
 value: number | string;
 warning: boolean;
 hint?: string;
}) {
 return (
 <div>
 <div className="text-[9px] font-mono text-olympus-text-dim uppercase">{label}</div>
 <div className={cn(
 'text-sm font-mono font-bold',
 warning ? 'text-olympus-amber-soft' : 'text-olympus-green',
 )}>{value}</div>
 {hint && (
 <div className="text-[8px] font-mono text-[#5A5A5A] mt-0.5 leading-tight">{hint}</div>
 )}
 </div>
 );
}

function Loader({ size }: { size: number }) {
 return (
 <div
 className="rounded-full border-2 border-olympus-gold/30 border-t-olympus-gold animate-spin"
 style={{ width: size, height: size }}
 />
 );
}

/**
 * CompactInstinctTable: a single table showing all 9 gods and their
 * Mastered (seed) / Learning (empirical) / Quick Circuits (archived) instinct
 * counts. Replaces the previous expandable card UI.
 *
 * Design rationale: the user wanted a quick overview of the Vault Brain's
 * status — NOT a list of every skill. This table shows the LEARNING STATE
 * per god at a glance. When all numbers are 0, the brain is in cold-start.
 * As gods dispatch, the Learning column fills in. Quick Circuits grow as
 * Callimachus archives stale instincts.
 *
 * Data source: /api/olympus/brain-stats → reads actual .md files under
 * ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/{seed,empirical,_archive}/
 */
function CompactInstinctTable({
 brainStats,
 healthData,
 masteredSkillCount,
}: {
 brainStats: Record<string, PerGodInstinctStats> | null;
 healthData: BrainHealth | null;
 masteredSkillCount?: number;
}) {
	 // Show MASTERED skills count (not total installed).
 // masteredSkillCount is passed from the parent (computed from graph nodes).
	 // Previously `masteredSkillCount` was NOT destructured from
 // props, so referencing it here threw `ReferenceError: masteredSkillCount
 // is not defined`, which crashed the entire VaultSummary panel. The fix
 // is to destructure it (done above in the function signature).
 const totalSkills = masteredSkillCount ?? healthData?.total_skills ?? 0;
	 // Per-god "Mastered" column fallback. The brain-stats
 // endpoint is the primary source (`instinctCounts.seed`), but if it
 // hasn't loaded yet (or returns no per-god breakdown), fall back to
 // `per_god_mastered_skills` from brainHealth() — which now uses the
 // SAME disk source as `mastered_skills`. This guarantees the per-god
 // column sum always equals the total at the top of the card.
 const perGodMastered = healthData?.per_god_mastered_skills ?? {};
 const grandTotals = GOD_IDS.reduce((acc, god) => {
 const s = brainStats?.[god]?.instinctCounts;
 // Mastered column prefers brain-stats (more granular — includes
 // dispatch metrics in the same response), falls back to brainHealth's
 // per-god seed count, then 0.
 const seedForGod = s?.seed ?? perGodMastered[god] ?? 0;
 if (s) {
 acc.seed += seedForGod;
 acc.empirical += s.empirical;
 acc.archived += s.archived;
 acc.total += s.total;
 } else {
 // brain-stats not loaded — at least contribute the seed count so
 // the totals row matches the per-god column.
 acc.seed += seedForGod;
 }
 return acc;
 }, { seed: 0, empirical: 0, archived: 0, total: 0 });

	 // TotalInstinctsForHeader: fallback for the
 // header counter when healthData is null. Sums the grandTotals.total
 // (which already aggregates instinctCounts.total across all 9 gods from
 // /api/olympus/brain-stats). When healthData IS available, we use
 // healthData.total_instincts (which comes from brainHealth() scanning
 // the actual disk) as the more authoritative count.
 const totalInstinctsForHeader = grandTotals.total;

	 // Expand/collapse state for clickable god rows.
 // When a god row is clicked, it expands to show the actual instinct file
 // names (seed + empirical + archived, up to 10 each — capped by the
 // /api/olympus/brain-stats route). Each instinct name is clickable and
 // opens the InstinctDetailModal showing the instinct's full markdown
 // document (frontmatter + body).
 const [expandedGod, setExpandedGod] = useState<string | null>(null);
	 // When set, opens InstinctDetailModal showing the
 // instinct file's full markdown. Set by clicking an instinct name in
 // the expanded row. Cleared by the modal's onClose.
 const [selectedInstinct, setSelectedInstinct] = useState<{ relPath: string; name: string } | null>(null);

 return (
 <div className="rounded-lg border border-olympus-gold/15 bg-olympus-card p-3">
 {/* Header */}
 <div className="flex items-center gap-2 mb-2.5">
 <Waypoints size={12} className="text-olympus-cyan" />
 <span className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide">
 Mastered / Learning / Quick Circuits
 </span>
 <span className="text-[9px] font-mono text-[#5A5A5A] ml-auto">
	 {/* Was `{totalSkills} mastered` referring
 to the 37 mastered skills. Now shows the total instinct count
 (41 in the base set) to match the Brain's new instinct-centric
 focus. The per-god table below already counts instincts
 (instinctCounts.total from /api/olympus/brain-stats), so the
 header counter now matches the table's grand total. */}
 {healthData?.total_instincts ?? totalInstinctsForHeader} instincts
 </span>
 </div>

 {/* Table header */}
 <div className="grid grid-cols-[1fr_60px_60px_80px_50px] gap-1 px-1 pb-1 mb-1 border-b border-olympus-gold/10 text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide">
 <span>God</span>
 <span className="text-right text-olympus-gold">Mastered</span>
 <span className="text-right text-olympus-green">Learning</span>
 <span className="text-right text-olympus-purple">Quick Circuits</span>
 <span className="text-right">Total</span>
 </div>

	 {/* Rows — one per god.
	 Each god row is now CLICKABLE. Clicking expands
 the row to show the actual instinct file names (seed + empirical +
 archived, up to 10 each). Each instinct name is clickable and opens
 the InstinctDetailModal showing the instinct's full markdown document.
 This lets the user browse the Brain's evolution at the document level
 without leaving the Vault-Summary panel. */}
 <div className="space-y-0.5">
 {GOD_IDS.map(god => {
 const s = brainStats?.[god]?.instinctCounts;
	 // Mastered column fallback chain (see grandTotals
 // comment above): brain-stats → per_god_mastered_skills → 0.
 const seed = s?.seed ?? perGodMastered[god] ?? 0;
 const empirical = s?.empirical ?? 0;
 const archived = s?.archived ?? 0;
 const total = s?.total ?? 0;
 const Icon = GOD_ICONS[god];
 const godName = god.charAt(0).toUpperCase() + god.slice(1);
 const isExpanded = expandedGod === god;
	 // The instinct names for this god (up to 10 per
 // tier, capped by /api/olympus/brain-stats). Each entry has
 // { id, name, confidence, trigger, demigod, path }. We only
 // show the expanded panel if there are any names to show AND
 // the row is expanded.
 const names = brainStats?.[god]?.instinctNames;
 const hasNames = names && (
 (names.seed?.length ?? 0) > 0 ||
 (names.empirical?.length ?? 0) > 0 ||
 (names.archived?.length ?? 0) > 0
 );
 return (
 <div key={god}>
 <div
 onClick={() => hasNames && setExpandedGod(prev => prev === god ? null : god)}
 onKeyDown={(e) => {
 if (hasNames && (e.key === 'Enter' || e.key === ' ')) {
 e.preventDefault();
 setExpandedGod(prev => prev === god ? null : god);
 }
 }}
 role={hasNames ? 'button' : undefined}
 tabIndex={hasNames ? 0 : undefined}
 className={cn(
 'grid grid-cols-[1fr_60px_60px_80px_50px] gap-1 px-1 py-1 rounded transition-colors text-[10px] font-mono items-center',
 hasNames ? 'hover:bg-olympus-gold/5 ' : '',
 isExpanded && 'bg-olympus-gold/5',
 )}
 title={hasNames ? `Click to ${isExpanded ? 'collapse' : 'expand'} ${godName}'s instincts` : undefined}
 >
 <span className="flex items-center gap-1.5 text-olympus-text-dim truncate">
 {hasNames && (
 isExpanded
 ? <ChevronDown size={10} className="text-olympus-gold shrink-0" />
 : <ChevronRight size={10} className="text-olympus-gold shrink-0" />
 )}
 {Icon && <Icon size={11} className="text-olympus-gold shrink-0" />}
 <span className="truncate">{godName}</span>
 </span>
 <span className={cn('text-right', seed > 0 ? 'text-olympus-gold' : 'text-[#5A5A5A]')}>{seed}</span>
 <span className={cn('text-right', empirical > 0 ? 'text-olympus-green' : 'text-[#5A5A5A]')}>{empirical}</span>
 <span className={cn('text-right', archived > 0 ? 'text-olympus-purple' : 'text-[#5A5A5A]')}>{archived}</span>
 <span className={cn('text-right font-bold', total > 0 ? 'text-olympus-text' : 'text-[#5A5A5A]')}>{total}</span>
 </div>
	 {/* Expanded panel: lists the instinct file
 names grouped by tier. Each name is a clickable button
 that opens the InstinctDetailModal. */}
 {isExpanded && hasNames && names && (
 <div className="pl-6 pr-1 py-1.5 ml-1 mb-0.5 border-l-2 border-olympus-gold/20 bg-olympus-bg/30 rounded-r-md space-y-1.5">
 <ExpandedTier
 label="Mastered (seed)"
 color="text-olympus-gold"
 entries={names.seed}
 onSelect={(entry) => entry.relPath && setSelectedInstinct({ relPath: entry.relPath, name: entry.name })}
 />
 <ExpandedTier
 label="Learning (empirical)"
 color="text-olympus-green"
 entries={names.empirical}
 onSelect={(entry) => entry.relPath && setSelectedInstinct({ relPath: entry.relPath, name: entry.name })}
 />
 <ExpandedTier
 label="Quick Circuits (archived)"
 color="text-olympus-purple"
 entries={names.archived}
 onSelect={(entry) => entry.relPath && setSelectedInstinct({ relPath: entry.relPath, name: entry.name })}
 />
 </div>
 )}
 </div>
 );
 })}
 </div>

 {/* Totals row */}
 <div className="grid grid-cols-[1fr_60px_60px_80px_50px] gap-1 px-1 pt-1.5 mt-1 border-t border-olympus-gold/10 text-[10px] font-mono font-bold">
 <span className="text-olympus-text-dim uppercase tracking-wide">Total</span>
 <span className="text-right text-olympus-gold">{grandTotals.seed}</span>
 <span className="text-right text-olympus-green">{grandTotals.empirical}</span>
 <span className="text-right text-olympus-purple">{grandTotals.archived}</span>
 <span className="text-right text-olympus-text">{grandTotals.total}</span>
 </div>

 {/* Help text */}
 <div className="text-[9px] font-mono text-[#5A5A5A] leading-relaxed mt-2 pt-2 border-t border-olympus-gold/5">
 Mastered = seed instincts (immutable baselines) · Learning = empirical instincts (live, from dispatch outcomes) · Quick Circuits = archived (stale, kept for pattern matching).
	 {/* Hint that god rows are now clickable. */}
 <br />
 Click a god row to expand its instinct list · click an instinct name to read its document.
 </div>

	 {/* InstinctDetailModal. Opens when the user clicks an
 instinct name in any expanded god row. Shows the instinct file's
 full markdown (frontmatter + body) as a scrollable document. */}
 {selectedInstinct && (
 <InstinctDetailModal
 instinctRelPath={selectedInstinct.relPath}
 instinctName={selectedInstinct.name}
 onCloseAction={() => setSelectedInstinct(null)}
 />
 )}
 </div>
 );
}

/**
 * ExpandedTier sub-component.
 *
 * Renders a single tier (Mastered/Learning/Quick Circuits) inside an
 * expanded god row. Each entry is a clickable button that opens the
 * InstinctDetailModal (via the onSelect callback). Entries without a
 * `path` field are rendered as non-clickable text (defensive — the
 * brain-stats API always returns `path`, but older caches might not).
 *
 * If the tier has no entries, nothing is rendered (the tier is omitted
 * entirely rather than showing an empty "0 entries" line — keeps the
 * expanded panel minimal).
 */
function ExpandedTier({
 label,
 color,
 entries,
 onSelect,
}: {
 label: string;
 color: string;
 entries: { id: string; name: string; confidence?: number; path?: string; relPath?: string }[] | undefined;
 onSelect: (entry: { id: string; name: string; confidence?: number; path?: string; relPath?: string }) => void;
}) {
	 // Show a placeholder for empty tiers (using the tier's
 // color) instead of hiding them entirely. The user wants to see all three
 // tiers (Mastered / Learning / Quick Circuits) even when the count is zero,
 // so the Brain's structure is always visible.
 if (!entries || entries.length === 0) {
 return (
 <div>
 <div className={cn('text-[8px] font-mono uppercase tracking-wide mb-0.5', color)}>
 {label} (0)
 </div>
 <div className="px-1.5 py-0.5">
 <span className={cn('text-[9px] font-mono italic', color)}>-- none --</span>
 </div>
 </div>
 );
 }
 return (
 <div>
 <div className={cn('text-[8px] font-mono uppercase tracking-wide mb-0.5', color)}>
 {label} ({entries.length})
 </div>
 <div className="space-y-0.5">
 {entries.map((entry, i) => (
 <button
 key={`${entry.id}-${i}`}
 onClick={() => onSelect(entry)}
 disabled={!entry.relPath}
 className="w-full text-left flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-olympus-gold/5 transition-colors text-[10px] font-mono disabled:opacity-60 disabled:hover:bg-transparent"
 title={entry.relPath ? `Open ${entry.name}` : 'no vault path available'}
 >
 <span className="text-olympus-text-dim truncate flex-1">{entry.name}</span>
 {typeof entry.confidence === 'number' && (
 <span className={cn(
 'text-[8px] shrink-0',
 entry.confidence >= 0.7 ? 'text-olympus-green' :
 entry.confidence >= 0.4 ? 'text-olympus-amber-soft' :
 'text-olympus-text-dim'
 )}>
	 {/* Show confidence as 0.90 format (not 90%) */}
 {entry.confidence.toFixed(2)}
 </span>
 )}
 </button>
 ))}
 </div>
 </div>
 );
}

/**
 * LearnedSkillsSection (REWIRED for live data).
 *
 * Previously: a mock filter on graph skill-node IDs (`s.id.includes('empirical')`)
 * which produced zero results because graph nodes have IDs like `skill:planner`,
 * not `skill:empirical-planner`. The section always showed "No skills yet".
 *
 * Now: uses REAL per-god instinct counts from /api/olympus/brain-stats:
 * - Mastered = seed instinct count (immutable baselines from
 * ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/seed/)
 * - Learning = empirical instinct count (live, learned from dispatch
 * outcomes — ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/empirical/)
 * - Quick Circuits = archived instinct count (pruned/stale, kept for
 * historical pattern matching — .../<god>/_archive/)
 *
 * Also surfaces dispatch count, short-circuit hit rate, avg confidence,
 * and learning velocity per god — all LIVE from the brain-stats API.
 *
 * When a god is selected, the right panel shows the three counts as cards
 * (not the previous broken mock skill list). The god selector chips show
 * the live total instinct count next to each god's name.
 */
interface SkillNode {
 id: string;
 type: string;
 god?: string;
}

function LearnedSkillsSection({
 skillNodes,
 healthData,
 brainStats,
}: {
 skillNodes: SkillNode[];
 healthData: BrainHealth | null;
 brainStats: Record<string, PerGodInstinctStats> | null;
}) {
 const [selectedGod, setSelectedGod] = useState<string | null>(null);

 // All 9 canonical gods always render (so the user sees Callimachus too).
 // Previously used the byGod map which only had gods with skill nodes —
 // that excluded Callimachus because the static GOD_SKILLS map omits it.
 const godList = GOD_IDS;

	 // Show MASTERED skills count (not total installed).
 // The mastered count comes from the god profiles in the vault-brain.
 // On a fresh install this is 0; as gods master skills, it grows.
 const totalSkills = healthData?.mastered_skills ?? 0;

 // Get the live instinct breakdown for the selected god.
 const selectedStats = selectedGod ? (brainStats?.[selectedGod] ?? null) : null;

 return (
 <div className="rounded-lg border border-olympus-gold/15 bg-olympus-card p-3">
 {/* Header */}
 <div className="flex items-center gap-2 mb-2.5">
 <Waypoints size={12} className="text-olympus-cyan" />
 <span className="text-[10px] font-mono text-olympus-text-dim uppercase tracking-wide">
 Mastered / Learning / Quick Circuits
 </span>
 <span className="text-[9px] font-mono text-[#5A5A5A] ml-auto">
	 {/* Was `{totalSkills} mastered`; now shows instincts. */}
 {healthData?.total_instincts ?? 0} instincts
 </span>
 </div>

 {/* God selector — horizontal list of clickable god icons with LIVE instinct totals */}
 <div className="flex items-center gap-1 mb-2 pb-2 border-b border-olympus-gold/10 overflow-x-auto custom-scroll">
 {godList.map(god => {
 const Icon = GOD_ICONS[god];
 const isSelected = selectedGod === god;
 const liveTotal = brainStats?.[god]?.instinctCounts.total ?? 0;
 const godName = god.charAt(0).toUpperCase() + god.slice(1);
 return (
 <button
 key={god}
 onClick={() => setSelectedGod(isSelected ? null : god)}
 className={cn(
 'flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono transition-all shrink-0',
 isSelected
 ? 'bg-olympus-gold/20 text-olympus-gold ring-1 ring-olympus-gold/30'
 : 'text-olympus-text-dim hover:text-olympus-gold hover:bg-olympus-gold/10',
 )}
 >
 {Icon && <Icon size={11} />}
 <span>{godName}</span>
 {liveTotal > 0 && <span className="text-olympus-cyan">({liveTotal})</span>}
 </button>
 );
 })}
 </div>

 {/* Content — three live stat cards per god */}
 {selectedGod ? (
 <div>
 {selectedStats ? (
 <>
 {/* Three cards: Mastered (seed), Learning (empirical), Quick Circuits (archived).
 Each card now shows the actual instinct
 NAMES, not just the count. Up to 10 names are listed; if
 there are more, "and N more" is shown. */}
 <div className="grid grid-cols-3 gap-2 mb-3">
 <InstinctCard
 label="Mastered"
 sublabel="seed instincts"
 value={selectedStats.instinctCounts.seed}
 color="text-olympus-gold"
 dotColor="bg-olympus-gold"
 />
 <InstinctCard
 label="Learning"
 sublabel="empirical instincts"
 value={selectedStats.instinctCounts.empirical}
 color="text-olympus-green"
 dotColor="bg-olympus-green"
 />
 <InstinctCard
 label="Quick Circuits"
 sublabel="archived instincts"
 value={selectedStats.instinctCounts.archived}
 color="text-olympus-purple"
 dotColor="bg-olympus-purple"
 />
 </div>

 {/* Live dispatch metrics for this god */}
 <div className="grid grid-cols-4 gap-2 mb-2">
 <LiveStat label="Dispatches" value={String(selectedStats.dispatchCount)} />
 <LiveStat label="Short-circuit %" value={`${Math.round(selectedStats.shortCircuitHitRate * 100)}%`} />
 <LiveStat label="Avg confidence" value={selectedStats.avgConfidence.toFixed(2)} />
 <LiveStat label="7d velocity" value={String(selectedStats.learningVelocity)} />
 </div>

 <div className="text-[9px] font-mono text-[#5A5A5A] leading-relaxed">
 Live data from <code className="text-olympus-gold">/api/olympus/brain-stats</code> — reads
 <code className="text-olympus-cyan">~/OLYMPUS-VAULT/05_Auto_Learning/instincts/{selectedGod}/</code>
 every 30s. Mastered = seed, Learning = empirical, Quick Circuits = _archive.
 </div>
 </>
 ) : (
 <div className="text-[10px] font-mono text-olympus-text-dim/50 py-3 text-center">
 No instinct data yet for {selectedGod.charAt(0).toUpperCase() + selectedGod.slice(1)}.
 <br />
 <span className="text-[9px] text-[#5A5A5A]">
 Run <code className="text-olympus-gold">python3 scripts/seed-vault.py</code> to seed initial instincts,
 or dispatch a task to this god to start empirical learning.
 </span>
 </div>
 )}
 </div>
 ) : (
 <div className="text-[10px] font-mono text-olympus-text-dim/50 py-3 text-center">
 Click a god above to see their Mastered / Learning / Quick Circuits breakdown
 from the instinct files on disk.
 </div>
 )}
 </div>
 );
}

/**
 * InstinctCard — renders the count for one tier (Mastered / Learning /
 * Quick Circuits). Minimalist: just the number + label, no name lists.
 */
function InstinctCard({ label, sublabel, value, color, dotColor }: {
 label: string;
 sublabel: string;
 value: number;
 color: string;
 dotColor: string;
}) {
 return (
 <div className="rounded-md bg-olympus-bg/50 p-2.5">
 <div className="flex items-center gap-1.5 mb-1">
 <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />
 <span className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide">{label}</span>
 </div>
 <div className={cn('text-base font-bold font-mono leading-tight', value > 0 ? color : 'text-[#5A5A5A]')}>{value}</div>
 <div className="text-[8px] text-[#5A5A5A] mt-0.5">{sublabel}</div>
 </div>
 );
}

/** Single live dispatch-metric stat. */
function LiveStat({ label, value }: { label: string; value: string }) {
 return (
 <div className="rounded-md bg-olympus-bg/30 p-1.5 text-center">
 <div className="text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide">{label}</div>
 <div className="text-sm font-mono font-bold text-olympus-text mt-0.5">{value}</div>
 </div>
 );
}

