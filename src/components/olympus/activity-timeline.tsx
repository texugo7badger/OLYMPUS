/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useOlympus, GOD_ICONS } from '@/lib/olympus-store';
import { useDocVisible } from '@/lib/use-doc-visible';
import { groupEpisodesByCampaign, campaignLabel, campaignDuration, type CampaignGroup } from '@/lib/campaign-groups';
import {
  History, Activity, Clock, AlertCircle, CheckCircle2, GitBranch, Wrench, ArrowRight, Timer, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import AnimatedNumber from './animated-number';
import TaskSheetModal, { type TaskRecord } from './task-sheet-modal';

interface Episode {
  id: string;
  god: string;
  /** Lucide icon key (matches GOD_ICONS in store). */
  icon?: string;
  ts: string;
  impact: string;
  confidence: number;
  summary: string;
  outcome: string;
  tools: string[];
  source: 'vault' | 'simulated' | 'live';
  /** LIVE events: the feed action (tool_call / dispatch / hop / …). */
  action?: string;
  /** LIVE dispatch events: the demigod that received the delegation. */
  demigod?: string | null;
  /** 'delegation' on dispatch-shaped events. */
  type?: string;
  /** #183: the dispatch DNA chips. */
  dispatchId?: string | null;
  skill?: string | null;
  mcp?: string | null;
  instinct?: string | null;
  shortCircuited?: boolean;
  tokens?: { input: number; output: number } | null;
  durationMs?: number | null;
  toolCalls?: number | null;
  findings?: string | null;
  /** v0.0.24 (#226) campaign keys. */
  campaignId?: string | null;
  project?: string | null;
  hop?: string | null;
  lane?: string | null;
  artifacts?: string[] | null;
}

const IMPACT_COLORS: Record<string, string> = {
  high: 'text-olympus-red bg-olympus-red/10 ring-olympus-red/20',
  medium: 'text-olympus-amber-soft bg-olympus-amber-soft/10 ring-olympus-amber-soft/20',
  low: 'text-olympus-text-dim bg-olympus-text-dim/10 ring-olympus-text-dim/20',
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

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/* ------------------------------------------------------------------ */
/* Activity Timeline.                                                  */
/*                                                                     */
/* Features:                                                           */
/*  - Empty state when no episodes.                                    */
/*  - Uses GOD_ICONS instead of emoji glyphs.                          */
/*  - Pastel palette throughout.                                       */
/* ------------------------------------------------------------------ */
export default function ActivityTimeline() {
  const docVisible = useDocVisible();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState<{ hasMore: boolean; nextCursor: string | null; total: number }>({ hasMore: false, nextCursor: null, total: 0 });
  const newestTsRef = useRef<string | null>(null);
  const [filterGod, setFilterGod] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // W1-5: the drill-down — click a hop/task row for the full sheet.
  const [sheetHop, setSheetHop] = useState<string | null>(null);
  // The PARITY poll (v0.0.4): the same /api/olympus/tasks the Parthenon
  // reads — the running hop rows get their live progress bar here too.
  // W-D3: the campaign stats ride the same poll — the ETA card (the
  // projected time-to-finish) lives in the summary grid.
  const [taskById, setTaskById] = useState<Record<string, TaskRecord>>({});
  const [campaignStats, setCampaignStats] = useState<null | { total: number; completed: number; parked: number; projectedRemainingMs: number }>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/olympus/tasks', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        const next: Record<string, TaskRecord> = {};
        for (const t of (d?.tasks || []) as TaskRecord[]) next[t.id] = t;
        setTaskById(next);
        if (d?.stats) setCampaignStats(d.stats);
      } catch { /* decorative */ }
    };
    load();
    if (!docVisible) { cancelled = true; return; }
    const iv = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [docVisible]);
  const setActiveGod = useOlympus(s => s.setActiveGod);
  const pushEvent = useOlympus(s => s.pushEvent);

  const mergeEpisodes = (incoming: Episode[], mode: 'prepend' | 'append') => {
    setEpisodes((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      const fresh = incoming.filter((e) => !seen.has(e.id));
      if (fresh.length === 0) return prev;
      const next = mode === 'prepend' ? [...fresh, ...prev] : [...prev, ...fresh];
      return next.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    });
  };

  const loadInitial = async () => {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch('/api/olympus/episodes?limit=60', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timeout);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const d = await r.json();
      const rows: Episode[] = Array.isArray(d?.episodes) ? d.episodes : [];
      setEpisodes(rows);
      setPage({
        hasMore: Boolean(d?.page?.hasMore),
        nextCursor: d?.page?.nextCursor ?? null,
        total: d?.page?.total ?? rows.length,
      });
      newestTsRef.current = rows[0]?.ts ?? null;
      setLoading(false);
    } catch {
      setEpisodes([]);
      setPage({ hasMore: false, nextCursor: null, total: 0 });
      setLoading(false);
    }
  };

  const loadDelta = async () => {
    const since = newestTsRef.current;
    if (!since) return;
    try {
      const r = await fetch(`/api/olympus/episodes?since=${encodeURIComponent(since)}&limit=100`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const rows: Episode[] = Array.isArray(d?.episodes) ? d.episodes : [];
      mergeEpisodes(rows, 'prepend');
      if (rows[0]?.ts) newestTsRef.current = rows[0].ts;
    } catch { /* a delta failure keeps the current page */ }
  };

  const loadOlder = async () => {
    if (!page.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/olympus/episodes?before=${encodeURIComponent(page.nextCursor)}&limit=60`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const rows: Episode[] = Array.isArray(d?.episodes) ? d.episodes : [];
      mergeEpisodes(rows, 'append');
      setPage((p) => ({
        hasMore: Boolean(d?.page?.hasMore),
        nextCursor: d?.page?.nextCursor ?? null,
        total: d?.page?.total ?? p.total,
      }));
    } catch { /* keep the loaded page */ }
    finally { setLoadingMore(false); }
  };

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (!docVisible) return;
    const iv = setInterval(() => { void loadDelta(); }, 15_000);
    return () => clearInterval(iv);
  }, [docVisible]);

  const filtered = filterGod ? episodes.filter(e => e.god === filterGod) : episodes;
  // #226 — the minitask chain: one collapsible group per campaign, current
  // campaign first. Legacy rows (no campaignId) land in one "Earlier" bucket.
  const groups = groupEpisodesByCampaign(filtered as any);
  const toggleGroup = (key: string) => setExpandedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const highImpact = filtered.filter(e => e.impact === 'high').length;
  // Count delegations — episodes where the outcome mentions "delegated" or the type field is delegation.
  // (The Activity Timeline now absorbs the Delegation History view — user request.)
  // W0-D: TASKS — hop starts count (the hop runtime IS the delegation
  // path; "Delegations 0" while hops flowed was a lie).
  const tasks = filtered.filter(e =>
    e.action === 'hop' || e.action === 'dispatch' || e.action === 'symphony-dispatch' ||
    (e as any).type === 'delegation' ||
    e.outcome?.toLowerCase().includes('delegat')
  ).length;

  return (
    <div className="h-full overflow-y-auto custom-scroll bg-olympus-bg p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <History size={16} className="text-olympus-cyan" />
        <h2 className="text-sm font-semibold text-olympus-cyan">Recent Activity</h2>
        <span className="text-[9px] text-olympus-text-dim font-mono ml-auto">last 24h · refresh 15s</span>
      </div>

      {/* Summary stats — replaced "avg conf" (overused everywhere) with "delegations" */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="rounded-lg p-2.5 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-cyan/15">
          <div className="flex items-center gap-1 mb-0.5">
            <Clock size={10} className="text-olympus-cyan" />
            <span className="text-[8px] font-mono text-olympus-text-dim uppercase">episodes</span>
          </div>
          <div className="text-base font-bold font-mono text-olympus-cyan">
            <AnimatedNumber value={filtered.length} />
          </div>
        </div>
        <div className="rounded-lg p-2.5 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-red/15">
          <div className="flex items-center gap-1 mb-0.5">
            <AlertCircle size={10} className="text-olympus-red" />
            <span className="text-[8px] font-mono text-olympus-text-dim uppercase">high impact</span>
          </div>
          <div className="text-base font-bold font-mono text-olympus-red">
            <AnimatedNumber value={highImpact} />
          </div>
        </div>
        <div className="rounded-lg p-2.5 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-gold/15">
          <div className="flex items-center gap-1 mb-0.5">
            <ArrowRight size={10} className="text-olympus-gold" />
            <span className="text-[8px] font-mono text-olympus-text-dim uppercase">tasks</span>
          </div>
          <div className="text-base font-bold font-mono text-olympus-gold">
            <AnimatedNumber value={tasks} />
          </div>
        </div>
        {/* W-D3: the projected time-to-finish — the campaign's honest ETA
            (the critical-path model from the tasks sheet). The honest "—"
            when no campaign is live; "done" when nothing remains. */}
        <div className="rounded-lg p-2.5 bg-olympus-card border border-olympus-gold/10 ring-1 ring-olympus-cyan/15">
          <div className="flex items-center gap-1 mb-0.5">
            <Timer size={10} className="text-olympus-cyan" />
            <span className="text-[8px] font-mono text-olympus-text-dim uppercase">eta</span>
          </div>
          <div className="text-base font-bold font-mono text-olympus-cyan">
            {!campaignStats || campaignStats.total === 0 ? '—'
              : campaignStats.completed >= campaignStats.total ? 'done'
              : `~${campaignStats.projectedRemainingMs >= 60_000
                ? `${Math.round(campaignStats.projectedRemainingMs / 60_000)}m`
                : `${Math.round(campaignStats.projectedRemainingMs / 1000)}s`}`}
          </div>
          {campaignStats && campaignStats.total > 0 && (
            <div className="text-[8px] font-mono text-olympus-text-dim mt-0.5">
              {campaignStats.completed}/{campaignStats.total} hops{campaignStats.parked > 0 ? ` · ${campaignStats.parked} parked` : ''}
            </div>
          )}
        </div>
      </div>

      {/* God filter chips (uses GOD_ICONS, not emoji) */}
      <div className="flex flex-wrap gap-1 mb-3">
        <FilterChip label="all" active={!filterGod} onClick={() => setFilterGod(null)} />
        {(Array.from(new Set(episodes.map(e => e.god))) as string[]).map((g) => {
          const Icon = GOD_ICONS[g];
          return (
            <FilterChip
              key={g}
              icon={Icon}
              label={g}
              active={filterGod === g}
              onClick={() => setFilterGod(filterGod === g ? null : g)}
            />
          );
        })}
      </div>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-linear-to-b from-olympus-gold/30 via-olympus-gold/10 to-transparent" />
        {loading && (
          <div className="text-center py-8 text-olympus-text-dim text-xs font-mono">loading episodes…</div>
        )}
        {/* Issue 4 — clean empty state on first load */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-olympus-gold/10 border border-olympus-gold/20 mb-3">
              <Activity size={18} className="text-olympus-gold" />
            </div>
            <p className="text-olympus-text text-xs font-mono mb-1">No activity yet.</p>
            <p className="text-olympus-text-dim text-[11px] font-mono max-w-xs mx-auto leading-relaxed">
              Dispatch a task to Apollo to see real-time events.
            </p>
          </div>
        )}
        {groups.map((g, gi) => {
          const key = g.campaignId ?? '__legacy__';
          const isOpen = g.status === 'running' || gi === 0 || expandedGroups.has(key);
          const statusTone = g.status === 'running'
            ? 'text-olympus-gold ring-olympus-gold/30'
            : g.status === 'parked'
              ? 'text-olympus-red ring-olympus-red/30'
              : g.status === 'legacy'
                ? 'text-olympus-text-dim ring-olympus-text-dim/20'
                : 'text-olympus-green ring-olympus-green/30';
          return (
            <div key={key} className="mb-1.5">
              <button
                onClick={() => toggleGroup(key)}
                className="sticky top-0 z-10 w-full text-left pl-8 pr-2 py-1.5 bg-olympus-bg/95 backdrop-blur-sm border-b border-olympus-gold/10 hover:bg-olympus-gold/5 transition-colors"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ChevronRight size={10} className={cn('text-olympus-text-dim transition-transform', isOpen && 'rotate-90')} />
                  <span className="text-[10px] font-mono font-semibold text-olympus-gold">
                    {campaignLabel(g.campaignId)}
                  </span>
                  {g.project && <span className="text-[9px] font-mono text-olympus-text-dim">· {g.project}</span>}
                  <span className="text-[8.5px] font-mono text-olympus-text-dim">
                    {g.hopCount} hop{g.hopCount === 1 ? '' : 's'}{g.parkedHops > 0 ? ` · ${g.parkedHops} parked` : ''} · {campaignDuration(g)}
                  </span>
                  <span className={cn('text-[8px] font-mono px-1 py-0.5 rounded ring-1 uppercase', statusTone)}>
                    {g.status}
                  </span>
                  {!isOpen && <span className="text-[8px] font-mono text-olympus-text-dim ml-auto">expand</span>}
                </div>
              </button>
              {isOpen && g.rows.map((ep, i) => {
                const hopId = ep.hop ?? (ep.action === 'hop' ? ep.summary.match(/Hop '([^']+)'/)?.[1] ?? null : null);
                const hopTask = hopId ? taskById[hopId] : undefined;
                return (
                  <TimelineItem
                    key={ep.id}
                    ep={ep as any}
                    isLast={i === g.rows.length - 1}
                    onClick={() => {
                      setActiveGod(ep.god);
                      pushEvent({ type: 'timeline_select', god: ep.god, msg: `Focused ${ep.god} from timeline`, ts: new Date().toISOString() });
                      if (hopId) setSheetHop(hopId);
                    }}
                    hopId={hopId}
                    hopTask={hopTask}
                  />
                );
              })}
            </div>
          );
        })}
        {!loading && episodes.length > 0 && (
          <div className="pl-8 pr-2 py-2 flex items-center gap-2">
            <span className="text-[9px] font-mono text-olympus-text-dim">
              showing {filtered.length} of {page.total || episodes.length}
            </span>
            <button
              onClick={() => void loadOlder()}
              disabled={!page.hasMore || loadingMore}
              className="ml-auto text-[9px] font-mono px-2 py-1 rounded border border-olympus-gold/20 text-olympus-gold hover:bg-olympus-gold/10 disabled:opacity-40"
            >
              {loadingMore ? 'loading…' : page.hasMore ? 'Load older' : 'end of feed'}
            </button>
          </div>
        )}
      </div>
      {sheetHop && <TaskSheetModal hopId={sheetHop} onClose={() => setSheetHop(null)} />}
    </div>
  );
}

function TimelineItem({ ep, isLast, onClick, hopId, hopTask }: { ep: Episode; isLast: boolean; onClick: () => void; hopId?: string | null; hopTask?: TaskRecord }) {
  const Icon = GOD_ICONS[ep.god] || GOD_ICONS[ep.icon || ''];
  // The running-hop progress (the same telemetry-derived pct the Parthenon
  // shows — the panels tell ONE story).
  const runningPct = hopTask?.status === 'running' && typeof hopTask.progress === 'number'
    ? Math.min(95, Math.max(3, hopTask.progress)) : null;
  return (
    <button
      onClick={onClick}
      data-tip={hopId ? `Open the ${hopId} task sheet — thinking, files, tokens` : undefined}
      className={cn(
        'relative w-full text-left pl-8 pr-2 py-2.5 hover:bg-olympus-gold/5 rounded-lg transition-colors group',
        hopId && 'cursor-pointer',
      )}
    >
      <div className={cn(
        'absolute left-2 top-3.5 w-3 h-3 rounded-full border-2 border-olympus-bg z-10',
        ep.impact === 'high' ? 'bg-olympus-red shadow-[0_0_8px_rgba(196,117,106,0.6)]' :
        ep.impact === 'medium' ? 'bg-olympus-amber-soft shadow-[0_0_6px_rgba(196,162,101,0.5)]' :
        'bg-olympus-text-dim',
      )} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {Icon ? <Icon size={13} className="text-olympus-gold" /> : null}
            <span className="text-[11px] font-mono text-olympus-gold capitalize">{ep.god}</span>
            {ep.demigod ? (
              <span className="text-[10px] font-mono text-olympus-cyan">→ {ep.demigod}</span>
            ) : null}
            {ep.action ? (
              <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-cyan/10 text-olympus-cyan ring-1 ring-olympus-cyan/20">
                {ep.action}
              </span>
            ) : null}
            <span className={cn('text-[8px] font-mono px-1 py-0.5 rounded ring-1', IMPACT_COLORS[ep.impact])}>
              {ep.impact}
            </span>
            {ep.source === 'vault' && (
              <span className="text-[8px] font-mono text-olympus-green flex items-center gap-0.5">
                <CheckCircle2 size={8} /> vault
              </span>
            )}
          </div>
          <div className="text-[11px] text-olympus-text leading-snug mb-1">{ep.summary}</div>
          {runningPct !== null && (
            <div className="flex items-center gap-1.5 mb-1">
              <span className="block flex-1 h-1 rounded-full bg-olympus-text-dim/20 overflow-hidden">
                <span
                  className="block h-full rounded-full transition-all duration-1000 animate-pulse"
                  style={{ width: `${runningPct}%`, background: '#D4A574' }}
                />
              </span>
              <span className="text-[8px] font-mono text-olympus-gold shrink-0">{runningPct}%</span>
            </div>
          )}
          <div className="text-[10px] text-olympus-text-dim leading-snug flex items-start gap-1">
            {ep.outcome ? (
              <>
                <GitBranch size={9} className="text-olympus-text-dim mt-0.5 shrink-0" />
                <span>{ep.outcome}</span>
              </>
            ) : (
              <span className="font-mono">{formatTime(ep.ts)}</span>
            )}
          </div>
          {ep.tools.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {ep.tools.slice(0, 4).map(t => (
                <span key={t} className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-card/50 text-olympus-text-dim flex items-center gap-0.5">
                  <Wrench size={7} /> {t}
                </span>
              ))}
            </div>
          )}
          {/* #183: the dispatch DNA — demigod, skill, MCP, instinct, cost. */}
          {(ep.demigod || ep.skill || ep.mcp || ep.instinct || ep.tokens || ep.durationMs != null) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {ep.demigod && (
                <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-purple/15 text-olympus-purple ring-1 ring-olympus-purple/25">
                  demigod: {ep.demigod}
                </span>
              )}
              {ep.skill && (
                <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-blue/15 text-olympus-blue ring-1 ring-olympus-blue/25">
                  skill: {ep.skill}
                </span>
              )}
              {ep.mcp && (
                <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-cyan/15 text-olympus-cyan ring-1 ring-olympus-cyan/25">
                  mcp: {ep.mcp}
                </span>
              )}
              {ep.instinct && (
                <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-green/15 text-olympus-green ring-1 ring-olympus-green/25">
                  instinct{ep.shortCircuited ? ' ⚡' : ''}: {ep.instinct}
                </span>
              )}
              {ep.tokens && (ep.tokens.input + ep.tokens.output) > 0 && (
                <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-card/60 text-olympus-text-dim">
                  {ep.tokens.input + ep.tokens.output} tok
                </span>
              )}
              {ep.durationMs != null && (
                <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-olympus-card/60 text-olympus-text-dim">
                  {ep.durationMs >= 1000 ? `${(ep.durationMs / 1000).toFixed(1)}s` : `${ep.durationMs}ms`}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[9px] font-mono text-olympus-text-dim">{formatTime(ep.ts)}</div>
          <div className="text-[9px] font-mono text-[#5A5A5A]">{timeAgo(ep.ts)}</div>
          <div className={cn('text-[9px] font-mono font-bold mt-0.5',
            ep.confidence >= 0.85 ? 'text-olympus-green' : ep.confidence >= 0.7 ? 'text-olympus-amber-soft' : 'text-olympus-text-dim')}>
            {ep.confidence.toFixed(2)}
          </div>
        </div>
      </div>
    </button>
  );
}

function FilterChip({ label, icon: Icon, active, onClick }: { label: string; icon?: any; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-[9px] font-mono px-2 py-0.5 rounded-full transition-all capitalize flex items-center gap-1',
        active
          ? 'bg-olympus-gold/20 text-olympus-gold ring-1 ring-olympus-gold/40'
          : 'bg-olympus-card/50 text-olympus-text-dim hover:bg-olympus-card hover:text-olympus-text',
      )}
    >
      {Icon ? <Icon size={9} /> : null}
      {label}
    </button>
  );
}
