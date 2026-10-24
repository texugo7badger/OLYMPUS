/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * Issue #42 — the Parthenon panel.
 *
 * One card per god, in the order a reader cares about: Apollo is always the
 * masthead, everything else is ordered by recency of its last event. Each card
 * carries the four things you want to know at a glance while a fleet runs —
 * which god, what it is doing right now, the tool in its hand, and how many
 * steps it has banked.
 *
 * Clicking a card focuses the stream on that god. The parent owns the filter;
 * this component never touches messages.
 */

'use client';

import { ChevronsLeft, ChevronsRight, Sparkles, type LucideIcon } from 'lucide-react';
import { GOD_ICONS } from '@/lib/olympus-store';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import TaskSheetModal, { type TaskRecord } from './task-sheet-modal';
import type { DemigodLive } from '@/lib/tasks-sheet';

/** Coarse status bucket. Finer wire phases collapse into these. */
export type ParthenonStatus = 'idle' | 'working' | 'blocked' | 'done';

/**
 * Live state for one god. Written only by the terminal's `updateGodActivity`
 * — never reconstructed from the message log.
 */
export interface GodState {
  god: string;
  status: ParthenonStatus;
  /** What the god is doing right now, in the user's words. */
  task?: string;
  /** The tool currently in hand, e.g. `edit`. */
  currentTool?: string;
  /** Most recent event label, shown as the card's subtitle tail. */
  lastEvent?: string;
  /** Steps this god has completed in the current run. */
  steps: number;
  /** Epoch ms of the last event — drives recency ordering. */
  lastTs: number;
  /** #PANTHEON-RAIL: the files this god's hop is creating (from the
   *  dispatch plan's artifacts — "what each god is coding", at a glance). */
  artifacts?: string[];
}

const DISPLAY_NAMES: Record<string, string> = {
  apollo: 'Apollo', atlas: 'Atlas', hephaestus: 'Hephaestus', athena: 'Athena',
  hermes: 'Hermes', artemis: 'Artemis', dionysus: 'Dionysus',
  persephone: 'Persephone', prometheus: 'Prometheus', callimachus: 'Callimachus',
};

const STATUS_COLOR: Record<ParthenonStatus, string> = {
  idle: '#5A5A5A',
  working: '#7BAE8E',
  blocked: '#C4756A',
  done: '#D4A574',
};

const STATUS_LABEL: Record<ParthenonStatus, string> = {
  idle: 'idle',
  working: 'working',
  blocked: 'blocked',
  done: 'done',
};

/** Apollo leads; the rest are most-recent-first. */
export function orderGodStates(states: GodState[]): GodState[] {
  return [...states].sort((a, b) => {
    if (a.god === 'apollo') return -1;
    if (b.god === 'apollo') return 1;
    return b.lastTs - a.lastTs;
  });
}

interface GodPanelProps {
  states: GodState[];
  focusedGod: string | null;
  onFocus: (god: string | null) => void;
  /** Rendered under the cards — the TODO block today, the plan panel next. */
  children?: React.ReactNode;
  /** #PANTHEON-RAIL: the collapse control — when set, the header carries a
   *  minimize button (the rail collapses to god icons only, freeing the
   *  chat surface). */
  onCollapse?: () => void;
}

/**
 * Renders the Parthenon header and cards only. The surrounding rail (border,
 * scroll) belongs to the terminal so sibling panels can share one column.
 */
export default function GodPanel({ states, focusedGod, onFocus, children, onCollapse }: GodPanelProps) {
  const ordered = orderGodStates(states);
  const active = ordered.filter(s => s.status === 'working').length;

  // W1-3 (v0.0.4): the god's OWN task list from the hop runtime's
  // artifacts — every task this god owns in the active campaign, with
  // state, timer, and tokens. Clicking a task opens the TASK SHEET (the
  // drill-down: thinking, files, tokens — the "what did he do" answer).
  const [tasks, setTasks] = useState<Record<string, TaskRecord[]>>({});
  // W-D3: the campaign stats — the header's N/M progress + the projected
  // time-to-finish (the user's headline ask).
  const [campaignStats, setCampaignStats] = useState<null | { total: number; completed: number; parked: number; projectedRemainingMs: number }>(null);
  // The god's LIVE demigod dispatches (the arsenal in action — the
  // parallelism-of-parallelism surface: god → demigod chips).
  const [demigods, setDemigods] = useState<Record<string, DemigodLive[]>>({});
  const [sheetHop, setSheetHop] = useState<string | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/olympus/tasks', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        const byGod: Record<string, TaskRecord[]> = {};
        for (const t of (d?.tasks || []) as TaskRecord[]) {
          (byGod[t.god] ||= []).push(t);
        }
        setTasks(byGod);
        if (d?.stats) setCampaignStats(d.stats);
        setDemigods(d?.gods
          ? Object.fromEntries(Object.entries(d.gods as Record<string, { demigods?: DemigodLive[] }>)
              .map(([g, v]) => [g, v.demigods || []]))
          : {});
      } catch { /* decorative — the panel works without tasks */ }
    };
    load();
    const iv = setInterval(load, 15_000);
    // W1-1: the live second tick — running durations count up in real time.
    // #195: slowed 1s -> 5s (the tick re-rendered every god card each
    // second; running durations tolerate a 5s grain).
    const tk = setInterval(() => setTick(n => n + 1), 5_000);
    return () => { cancelled = true; clearInterval(iv); clearInterval(tk); };
  }, []);

  return (
    <>
      <div className="px-2 py-1.5 text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide sticky top-0 bg-olympus-panel border-b border-olympus-gold/10 flex items-center gap-1">
        <Sparkles size={10} style={{ color: '#D4A574' }} />
        <span>Parthenon</span>
        <span className="ml-auto normal-case tracking-normal flex items-center gap-1.5">
          <span>{active} active / {ordered.length}</span>
          {/* W-D3: the persistent campaign header — N/M hops + the projected
              time-to-finish (the user's headline ask) + the parked badge.
              Nothing when no campaign is live (the honest empty). */}
          {campaignStats && campaignStats.total > 0 && (
            <>
              <span className="text-olympus-cyan">
                · {campaignStats.completed}/{campaignStats.total} hops
              </span>
              {campaignStats.parked > 0 && (
                <span className="text-olympus-red">· {campaignStats.parked} parked</span>
              )}
              {campaignStats.completed < campaignStats.total && campaignStats.projectedRemainingMs > 0 && (
                <span className="text-olympus-text-dim">
                  · ~{campaignStats.projectedRemainingMs >= 60_000
                    ? `${Math.round(campaignStats.projectedRemainingMs / 60_000)}m`
                    : `${Math.round(campaignStats.projectedRemainingMs / 1000)}s`} left
                </span>
              )}
            </>
          )}
        </span>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            data-tip="Minimize the Parthenon to god icons (more room for the chat)"
            aria-label="Minimize the Parthenon"
            className="ml-1 text-olympus-text-dim hover:text-olympus-gold transition-colors"
          >
            <ChevronsRight size={10} />
          </button>
        )}
      </div>

      <div className="py-1">
        {ordered.map(s => {
          const Icon: LucideIcon = GOD_ICONS[s.god] || Sparkles;
          const color = STATUS_COLOR[s.status];
          const selected = focusedGod === s.god;
          const spinning = s.status === 'working';

          return (
            <button
              key={s.god}
              type="button"
              onClick={() => onFocus(selected ? null : s.god)}
              aria-pressed={selected}
              data-tip={selected ? 'Show every god' : `Focus the stream on ${DISPLAY_NAMES[s.god] || s.god}`}
              className={cn(
                'w-full text-left px-2 py-1.5 border-b border-olympus-gold/5 transition-colors',
                selected ? 'bg-olympus-gold/10' : 'hover:bg-olympus-gold/5',
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon
                  size={12}
                  style={{ color }}
                  className={cn('shrink-0', spinning && 'animate-pulse')}
                />
                <span className="text-[10px] font-mono font-semibold truncate" style={{ color }}>
                  {DISPLAY_NAMES[s.god] || s.god}
                </span>
                {s.steps > 0 && (
                  <span className="text-[8px] font-mono text-[#5A5A5A]">
                    {s.steps} step{s.steps === 1 ? '' : 's'}
                  </span>
                )}
                <span className="text-[8px] font-mono text-[#5A5A5A] ml-auto shrink-0">
                  {STATUS_LABEL[s.status]}
                </span>
              </div>

              {s.task && (
                <div className="text-[9px] font-mono text-olympus-text-dim ml-4 truncate">
                  {s.currentTool ? `${s.currentTool} — ` : ''}
                  {s.task}
                </div>
              )}
              {/* #PANTHEON-RAIL: WHAT the god is creating — the hop's
                  deliverable files (from the dispatch plan), the first three
                  + a count. The "each file created" ask, at a glance. */}
              {s.artifacts && s.artifacts.length > 0 && s.status === 'working' && (
                <div className="text-[8px] font-mono text-[#6B8F71] ml-4 space-y-0.5">
                  {s.artifacts.slice(0, 3).map(f => (
                    <div key={f} className="truncate">↳ {f}</div>
                  ))}
                  {s.artifacts.length > 3 && (
                    <div className="text-[#5A5A5A]">↳ +{s.artifacts.length - 3} more</div>
                  )}
                </div>
              )}
              {s.lastEvent && s.lastEvent !== s.task && (
                <div className="text-[8px] font-mono text-[#4A4A4A] ml-4 truncate">
                  {s.lastEvent}
                </div>
              )}
              {/* W1-3: the god's task list — click any task for the full sheet. */}
              {(tasks[s.god] || []).length > 0 && (
                <div className="ml-4 mt-1 space-y-0.5" onClick={(e) => e.stopPropagation()}>
                  {tasks[s.god].slice(0, 5).map(t => {
                    const dot = t.status === 'completed' ? '#7BAE8E'
                      : t.status === 'running' ? '#D4A574'
                      : t.status === 'parked' ? '#C4756A' : '#5A5A5A';
                    // W-D2: the running chip ticks from startedAt — the
                    // inFlight ground truth (telemetry lands only at settle).
                    const runStart = t.startedAt || t.ts;
                    const dur = t.status === 'running' && runStart
                      ? `${Math.max(0, Math.round((Date.now() - new Date(runStart).getTime()) / 1000))}s…`
                      : t.durationMs ? `${Math.round(t.durationMs / 1000)}s` : '';
                    const tok = t.tokensOut ? `${(t.tokensOut / 1000).toFixed(1)}k out` : '';
                    // The task's honest progress: completed = full; running =
                    // elapsed vs the god's own median hop duration (the lane's
                    // telemetry-derived ETA); pending/parked = no bar.
                    const pct = t.status === 'completed' ? 100
                      : t.status === 'running' && typeof t.progress === 'number' ? Math.min(95, Math.max(3, t.progress)) : 0;
                    return (
                      // NOT a <button>: the god card is already one — nested
                      // interactive content is invalid HTML (the hydration
                      // error class). role+tabIndex keep it accessible.
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e2) => { e2.stopPropagation(); setSheetHop(t.id); }}
                        onKeyDown={(e2) => { if (e2.key === 'Enter' || e2.key === ' ') { e2.stopPropagation(); e2.preventDefault(); setSheetHop(t.id); } }}
                        data-tip={`${t.id} — ${t.status}${t.files.length ? ` · ${t.files.length} file(s)` : ''} — click for the task sheet`}
                        className="flex flex-wrap items-center gap-1.5 w-full text-left hover:bg-olympus-gold/10 rounded px-1 cursor-pointer"
                      >
                        <span className="w-1 h-1 rounded-full shrink-0" style={{ background: dot }} />
                        <span className="text-[9px] font-mono truncate flex-1" style={{ color: dot }}>{t.id}</span>
                        {dur && <span className="text-[8px] font-mono text-[#6B8F71] shrink-0">{dur}</span>}
                        {tok && <span className="text-[8px] font-mono text-[#5A5A5A] shrink-0">{tok}</span>}
                        {(t.status === 'running' || t.status === 'completed') && (
                          <span className="block w-full h-0.5 rounded-full bg-olympus-text-dim/20 overflow-hidden">
                            <span
                              className="block h-full rounded-full transition-all duration-1000"
                              style={{ width: `${pct}%`, background: t.status === 'completed' ? '#7BAE8E' : '#D4A574', opacity: t.status === 'running' ? 0.9 : 0.55 }}
                            />
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {tasks[s.god].length > 5 && (
                    <div className="text-[8px] font-mono text-[#5A5A5A] px-1">+{tasks[s.god].length - 5} more</div>
                  )}
                  {(demigods[s.god] || []).length > 0 && (
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      {(demigods[s.god] || []).slice(0, 4).map((d, di) => {
                        const tone = d.status === 'done'
                          ? { dot: '#7BAE8E', text: 'text-olympus-green', ring: 'ring-olympus-green/25', bg: 'bg-olympus-green/10' }
                          : d.status === 'error'
                            ? { dot: '#C4756A', text: 'text-olympus-red', ring: 'ring-olympus-red/25', bg: 'bg-olympus-red/10' }
                            : { dot: '#D4A574', text: 'text-olympus-gold', ring: 'ring-olympus-gold/25', bg: 'bg-olympus-gold/10' };
                        const elapsed = d.durationMs != null
                          ? (d.durationMs >= 1000 ? `${(d.durationMs / 1000).toFixed(1)}s` : `${d.durationMs}ms`)
                          : null;
                        return (
                          <div
                            key={`${d.id}-${d.dispatchId || di}`}
                            data-tip={`${d.id} — ${d.status}${d.task ? ` — ${d.task}` : ''}${d.skill ? ` — skill ${d.skill}` : ''}${d.mcp ? ` — mcp ${d.mcp}` : ''}`}
                            className={cn('rounded px-1.5 py-1 ring-1 min-w-0', tone.bg, tone.ring)}
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              <span className={cn('w-1 h-1 rounded-full shrink-0', d.status === 'running' && 'animate-pulse')} style={{ background: tone.dot }} />
                              <span className={cn('text-[8px] font-mono truncate flex-1', tone.text)}>{d.id}</span>
                              {elapsed && <span className="text-[7px] font-mono text-olympus-text-dim shrink-0">{elapsed}</span>}
                            </div>
                            {d.task && (
                              <div className="text-[7px] font-mono text-olympus-text-dim truncate mt-0.5">{d.task}</div>
                            )}
                            <div className="flex items-center gap-1 mt-0.5 min-w-0">
                              {d.skill && <span className="text-[7px] font-mono text-olympus-blue truncate">skill:{d.skill}</span>}
                              {d.mcp && <span className="text-[7px] font-mono text-olympus-cyan truncate">mcp:{d.mcp}</span>}
                              {d.tokensOut > 0 && <span className="text-[7px] font-mono text-olympus-text-dim ml-auto shrink-0">{d.tokensOut} out</span>}
                            </div>
                          </div>
                        );
                      })}
                      {(demigods[s.god] || []).length > 4 && (
                        <span className="text-[8px] font-mono text-olympus-purple/60 col-span-2">+{(demigods[s.god] || []).length - 4} more</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {children}
      {sheetHop && <TaskSheetModal hopId={sheetHop} onClose={() => setSheetHop(null)} />}
    </>
  );
}

/**
 * #PANTHEON-RAIL (the 2026-10-17 UX ask): the COLLAPSED rail — god icons
 * only, a slim column beside the chat. Working gods pulse in their status
 * color; the icon tooltip carries name + the last line (the "what is he
 * coding" answer without paying screen space); a click focuses; the expand
 * button restores the full cards.
 */
export function ParthenonRailCollapsed({ states, focusedGod, onFocus, onExpand }: {
  states: GodState[];
  focusedGod: string | null;
  onFocus: (god: string | null) => void;
  onExpand: () => void;
}) {
  const ordered = orderGodStates(states);
  const active = ordered.filter(s => s.status === 'working').length;
  return (
    <div className="w-9 shrink-0 border-l border-olympus-gold/10 bg-olympus-panel flex flex-col min-h-0">
      <button
        type="button"
        onClick={onExpand}
        data-tip="Expand the Parthenon (god cards + the plan)"
        aria-label="Expand the Parthenon"
        className="shrink-0 px-2 py-1.5 border-b border-olympus-gold/10 flex items-center justify-center text-olympus-text-dim hover:text-olympus-gold transition-colors"
      >
        <ChevronsLeft size={10} />
      </button>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll py-1 flex flex-col items-center gap-1">
        {ordered.map(s => {
          const Icon: LucideIcon = GOD_ICONS[s.god] || Sparkles;
          const color = STATUS_COLOR[s.status];
          const selected = focusedGod === s.god;
          const spinning = s.status === 'working';
          const title = `${DISPLAY_NAMES[s.god] || s.god} — ${s.task || s.lastEvent || STATUS_LABEL[s.status]}${s.artifacts && s.artifacts.length ? `\n${s.artifacts.slice(0, 4).join('\n')}` : ''}`;
          return (
            <button
              key={s.god}
              type="button"
              onClick={() => onFocus(selected ? null : s.god)}
              aria-pressed={selected}
              data-tip={title}
              className={cn(
                'relative w-7 h-7 rounded flex items-center justify-center transition-colors',
                selected ? 'bg-olympus-gold/15 ring-1 ring-olympus-gold/40' : 'hover:bg-olympus-gold/10',
              )}
            >
              <Icon size={13} style={{ color }} className={cn(spinning && 'animate-pulse')} />
              {s.status === 'working' && (
                <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-olympus-green animate-pulse" />
              )}
              {s.steps > 0 && (
                <span className="absolute bottom-0 right-0.5 text-[7px] font-mono" style={{ color }}>
                  {s.steps}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="shrink-0 py-1 text-center text-[8px] font-mono text-[#5A5A5A] border-t border-olympus-gold/10">
        {active}
      </div>
    </div>
  );
}