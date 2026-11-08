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

import { ChevronsLeft, ChevronsRight, Sparkles, MessageSquare, type LucideIcon } from 'lucide-react';
import { GOD_ICONS } from '@/lib/olympus-store';
import { cn } from '@/lib/utils';
import { useDocVisible } from '@/lib/use-doc-visible';
import { useEffect, useMemo, useState } from 'react';
import TaskSheetModal, { type TaskRecord } from './task-sheet-modal';
import GodChatModal from './god-chat-modal';
import ParthenonCommand from './parthenon-command';
import { useLanguage, godName, getLanguage } from '@/lib/i18n';
import type { DemigodLive } from '@/lib/tasks-sheet';
import { formatEta } from '@/lib/eta';

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
  // #231 — always mounted; pause both polls in a hidden tab.
  const docVisible = useDocVisible();
  // W1-3 (v0.0.4): the god's OWN task list from the hop runtime's
  // artifacts — every task this god owns in the active campaign, with
  // state, timer, and tokens. Clicking a task opens the TASK SHEET (the
  // drill-down: thinking, files, tokens — the "what did he do" answer).
  // Declared before `ordered` because the overlay below reads it.
  const [tasks, setTasks] = useState<Record<string, TaskRecord[]>>({});
  // v0.0.86 — the panel is campaign-global: every god is present, and the
  // tasks API overlays the terminal's live event state. A god working a hop
  // is visible even when the terminal has never streamed a frame for it.
  const ordered = useMemo(() => {
    const by = new Map(states.map((s) => [s.god, s]));
    for (const god of Object.keys(DISPLAY_NAMES)) {
      if (!by.has(god)) by.set(god, { god, status: 'idle', steps: 0, lastTs: 0 });
    }
    for (const [god, list] of Object.entries(tasks)) {
      const current = (list || []).find((t) => t.status === 'running');
      const parked = (list || []).find((t) => t.status === 'parked');
      const latest = current || parked;
      if (!latest) continue;
      const base = by.get(god) ?? { god, status: 'idle' as ParthenonStatus, steps: 0, lastTs: 0 };
      const ts = Date.parse(latest.startedAt || latest.ts || '') || base.lastTs;
      if (ts < (base.lastTs || 0) && base.status !== 'idle') continue;
      const completed = (list || []).filter((t) => t.status === 'completed').length;
      by.set(god, {
        ...base,
        status: current ? 'working' : 'blocked',
        task: `${latest.id}${latest.promptExcerpt ? ` — ${latest.promptExcerpt.replace(/\s+/g, ' ').slice(0, 90)}` : ''}`,
        currentTool: latest.lastTool || base.currentTool,
        artifacts: latest.artifacts?.length ? latest.artifacts : base.artifacts,
        steps: completed || base.steps,
        lastTs: Math.max(base.lastTs || 0, ts),
      });
    }
    return orderGodStates([...by.values()]);
  }, [states, tasks]);
  const active = ordered.filter(s => s.status === 'working').length;

  // v0.0.76 — the Parthenon chat: ask the focused god directly.
  const [chatGod, setChatGod] = useState<string | null>(null);
  // v0.0.90 — a live-preview mark opens Athena's chat: the user must SEE the
  // planning turn (the old route wrote the inbox silently and the mark looked
  // lost). Any surface can request a god's chat with this event.
  useEffect(() => {
    const open = (e: Event) => {
      const god = String((e as CustomEvent<{ god?: string }>)?.detail?.god || 'athena');
      setChatGod(god);
    };
    window.addEventListener('olympus:open-god-chat', open);
    return () => window.removeEventListener('olympus:open-god-chat', open);
  }, []);

  // W-D3: the campaign stats — the header's N/M progress + the projected
  // time-to-finish (the user's headline ask).
  const [campaignStats, setCampaignStats] = useState<null | {
    total: number; completed: number; parked: number; projectedRemainingMs: number;
    eta50Ms?: number; eta90Ms?: number; etaNextVisibleMs?: number;
    etaConfidence?: string; etaParkRate?: number; etaBasis?: string;
    designScore?: number | null; designSource?: string | null;
    estimatedCostUsd?: number; tokensPerCompletedHop?: number; costPerCompletedHop?: number | null;
  }>(null);
  // v0.0.87 — Atlas's deterministic patrol rides the same tasks poll.
  const [atlasPatrol, setAtlasPatrol] = useState<null | { summary: string; parked: number; stuck: number; verdict: string | null; hopId: string | null; nextLane: string | null }>(null);
  const [campaignHealth, setCampaignHealth] = useState<null | {
    verdict: string; line: string; reasons: string[]; completed: number; total: number;
    running: number; generation: number; etaMs: number | null;
    eta50Ms?: number | null; eta90Ms?: number | null; etaConfidence?: string | null; parkRate?: number | null;
    parked: { hopId: string; reason: string } | null;
    nextPlan: { added: number; removed: number; changed: number } | null;
  }>(null);
  const [projectSlug, setProjectSlug] = useState<string | null>(null);
  const [applyingPlan, setApplyingPlan] = useState(false);
  // The god's LIVE demigod dispatches (the arsenal in action — the
  // parallelism-of-parallelism surface: god → demigod chips).
  const language = useLanguage();
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
        setAtlasPatrol(d?.atlasPatrol ?? null);
        setCampaignHealth(d?.campaignHealth ?? null);
        setProjectSlug(d?.project ?? null);
        setDemigods(d?.gods
          ? Object.fromEntries(Object.entries(d.gods as Record<string, { demigods?: DemigodLive[] }>)
              .map(([g, v]) => [g, v.demigods || []]))
          : {});
      } catch { /* decorative — the panel works without tasks */ }
    };
    if (!docVisible) return;
    load();
    const iv = setInterval(load, 15_000);
    // W1-1: the live second tick — running durations count up in real time.
    // #195: slowed 1s -> 5s (the tick re-rendered every god card each
    // second; running durations tolerate a 5s grain).
    const tk = setInterval(() => setTick(n => n + 1), 5_000);
    return () => { cancelled = true; clearInterval(iv); clearInterval(tk); };
  }, [docVisible]);

  return (
    <>
      <div className="sticky top-0 z-10 bg-olympus-panel border-b border-olympus-gold/10">
        <div className="px-2 py-1.5 text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide flex items-center gap-1.5">
          <img
            src="/diagrams/parthenon-mark-static.svg"
            alt=""
            aria-hidden
            className="h-4 w-4 shrink-0 opacity-90"
          />
          <span className="shrink-0">Parthenon</span>
          <span className="normal-case tracking-normal whitespace-nowrap shrink-0">{active} active / {ordered.length}</span>
          {campaignHealth && (
            <span
              className={cn(
                'rounded px-1 py-0.5 text-[7px] font-mono uppercase tracking-wide whitespace-nowrap shrink-0',
                campaignHealth.verdict === 'HEALTHY' ? 'bg-olympus-green/15 text-olympus-green'
                  : campaignHealth.verdict === 'DONE' ? 'bg-olympus-green/15 text-olympus-green'
                  : campaignHealth.verdict === 'NEEDS-YOU' ? 'bg-olympus-red/15 text-olympus-red'
                  : campaignHealth.verdict === 'BLOCKED' ? 'bg-olympus-red/15 text-olympus-red'
                  : 'bg-olympus-gold/15 text-olympus-gold',
              )}
              data-tip={`${campaignHealth.line}\n${(campaignHealth.reasons || []).join('\n')}`}
            >
              {campaignHealth.verdict}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setChatGod(focusedGod ?? ordered[0]?.god ?? 'apollo')}
              data-tip={`Chat with ${godName(focusedGod ?? ordered[0]?.god ?? 'apollo', language as any)}`}
              aria-label={`Chat with ${godName(focusedGod ?? ordered[0]?.god ?? 'apollo', language as any)}`}
              className="text-olympus-text-dim hover:text-olympus-gold transition-colors"
            >
              <MessageSquare size={11} />
            </button>
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                data-tip="Minimize the Parthenon to god icons (more room for the chat)"
                aria-label="Minimize the Parthenon"
                className="text-olympus-text-dim hover:text-olympus-gold transition-colors"
              >
                <ChevronsRight size={10} />
              </button>
            )}
          </span>
        </div>

        {/* v0.0.91 — metrics on their own wrapped row. The old single row
            clipped at narrow rail widths; every value now lives in a pill
            with whitespace-nowrap, and the band replaces the lone "~40m". */}
        {campaignStats && campaignStats.total > 0 && (
          <div className="px-2 pb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[8px] font-mono">
            <span className="rounded bg-olympus-cyan/10 px-1.5 py-0.5 text-olympus-cyan whitespace-nowrap tabular-nums">
              {campaignStats.completed}/{campaignStats.total} hops
            </span>
            {campaignStats.parked > 0 && (
              <span className="rounded bg-olympus-red/10 px-1.5 py-0.5 text-olympus-red whitespace-nowrap tabular-nums">
                {campaignStats.parked} parked
              </span>
            )}
            {(campaignStats.eta50Ms || campaignStats.projectedRemainingMs) > 0 && (
              <span
                className="rounded bg-olympus-gold/10 px-1.5 py-0.5 text-olympus-gold whitespace-nowrap tabular-nums"
                data-tip={campaignStats.etaBasis || 'critical-path estimate'}
              >
                {formatEta(campaignStats.eta50Ms || campaignStats.projectedRemainingMs)}
                {campaignStats.eta90Ms && campaignStats.eta90Ms > (campaignStats.eta50Ms || campaignStats.projectedRemainingMs)
                  ? ` · p90 ${formatEta(campaignStats.eta90Ms)}`
                  : ''}
              </span>
            )}
            {campaignStats.etaNextVisibleMs && campaignStats.etaNextVisibleMs > 0 && (
              <span className="rounded bg-olympus-card/60 px-1.5 py-0.5 text-olympus-text-dim whitespace-nowrap tabular-nums" data-tip="Time until the next hop settles">
                next {formatEta(campaignStats.etaNextVisibleMs)}
              </span>
            )}
            {campaignHealth?.generation ? (
              <span className="text-olympus-text-dim whitespace-nowrap">gen {campaignHealth.generation}</span>
            ) : null}
            {campaignStats.etaConfidence && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 whitespace-nowrap uppercase tracking-wide text-[7px]',
                  campaignStats.etaConfidence === 'high' ? 'bg-olympus-green/10 text-olympus-green'
                    : campaignStats.etaConfidence === 'medium' ? 'bg-olympus-gold/10 text-olympus-gold'
                    : 'bg-olympus-red/10 text-olympus-red',
                )}
                data-tip={`ETA confidence: ${campaignStats.etaConfidence}${campaignStats.etaParkRate != null ? ` · ${Math.round(campaignStats.etaParkRate * 100)}% park` : ''}`}
              >
                {campaignStats.etaConfidence}
              </span>
            )}
            {campaignStats.designScore != null && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 whitespace-nowrap tabular-nums text-[7px]',
                  campaignStats.designScore >= 7 ? 'bg-olympus-green/10 text-olympus-green' : 'bg-olympus-red/10 text-olympus-red',
                )}
                data-tip={`Latest design review: ${campaignStats.designScore.toFixed(1)} (${campaignStats.designSource || 'unknown file'}) — the gate is 7`}
              >
                design {campaignStats.designScore.toFixed(1)}
              </span>
            )}
            {campaignStats.costPerCompletedHop != null && (
              <span
                className="rounded bg-olympus-gold/10 px-1.5 py-0.5 whitespace-nowrap tabular-nums text-[7px] text-olympus-gold"
                data-tip={`${(campaignStats.tokensPerCompletedHop || 0).toLocaleString()} tokens/completed hop · $${campaignStats.costPerCompletedHop.toFixed(4)}/hop · $${(campaignStats.estimatedCostUsd || 0).toFixed(2)} list value — invoice unknown`}
              >
                ${(campaignStats.estimatedCostUsd || 0).toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>

      <ParthenonCommand
        health={campaignHealth}
        patrol={atlasPatrol}
        projectSlug={projectSlug}
        onChat={(god) => setChatGod(god)}
      />

      {atlasPatrol && (
        <div
          className="px-2 py-1 text-[8px] font-mono text-olympus-gold/90 bg-olympus-gold/5 border-b border-olympus-gold/10 flex items-center gap-1.5"
          data-tip={atlasPatrol.summary}
        >
          <span className="uppercase tracking-wide text-olympus-text-dim">Atlas patrol</span>
          <span>{atlasPatrol.parked} parked · {atlasPatrol.stuck} stuck</span>
          {atlasPatrol.verdict && <span className="text-olympus-cyan">· {atlasPatrol.verdict}</span>}
          {atlasPatrol.nextLane && <span className="truncate">→ {atlasPatrol.nextLane}</span>}
          {campaignHealth?.nextPlan && projectSlug && (
            <button
              type="button"
              disabled={applyingPlan}
              onClick={async () => {
                setApplyingPlan(true);
                try {
                  const r = await fetch('/api/olympus/walk/plan', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slug: projectSlug, action: 'apply' }),
                  });
                  const d = await r.json().catch(() => ({}));
                  if (!d?.ok) throw new Error(d?.error || `HTTP ${r.status}`);
                  window.location.reload();
                } catch (e) { console.warn('apply next plan', e); }
                setApplyingPlan(false);
              }}
              className="shrink-0 rounded border border-olympus-gold/30 px-1 py-0.5 text-[7px] text-olympus-gold hover:bg-olympus-gold/10 disabled:opacity-40"
              data-tip={`Staged next generation: +${campaignHealth.nextPlan.added} / -${campaignHealth.nextPlan.removed} / ~${campaignHealth.nextPlan.changed}. Applies only at a hop boundary.`}
            >
              {applyingPlan ? 'applying…' : `apply +${campaignHealth.nextPlan.added}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setChatGod('atlas')}
            className="ml-auto shrink-0 rounded border border-olympus-gold/25 px-1 py-0.5 text-[7px] hover:bg-olympus-gold/10"
            data-tip="Open Atlas's terminal and ask for the full analysis/replan"
          >
            ask Atlas
          </button>
        </div>
      )}

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
              data-tip={selected ? 'Show every god' : `Focus the stream on ${godName(s.god, language)}`}
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
                  {godName(s.god, language)}
                </span>
                {s.steps > 0 && (
                  <span className="text-[8px] font-mono text-olympus-text-dim">
                    {s.steps} step{s.steps === 1 ? '' : 's'}
                  </span>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setChatGod(s.god); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setChatGod(s.god); } }}
                  aria-label={`Chat with ${godName(s.god, language)}`}
                  data-tip={`Open ${godName(s.god, language)}'s terminal — mark, task and hop context`}
                  className="ml-auto shrink-0 rounded p-0.5 text-olympus-text-dim hover:text-olympus-gold"
                >
                  <MessageSquare size={9} />
                </span>
                <span className="text-[8px] font-mono text-olympus-text-dim ml-1 shrink-0">
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
                    <div className="text-olympus-text-dim">↳ +{s.artifacts.length - 3} more</div>
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
                    const tps = t.tokensPerSec ? `${t.tokensPerSec.toFixed(1)} tok/s` : '';
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
                        {tok && <span className="text-[8px] font-mono text-olympus-text-dim shrink-0">{tok}</span>}
                        {tps && <span className="text-[8px] font-mono text-olympus-cyan shrink-0" data-tip="Measured output tokens per second (settled hop, includes tool time)">{tps}</span>}
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
                    <div className="text-[8px] font-mono text-olympus-text-dim px-1">+{tasks[s.god].length - 5} more</div>
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
                              {d.tokensOut > 0 && <span className="text-[7px] font-mono text-olympus-text-dim shrink-0">{d.tokensOut} out</span>}
                              {d.tokensPerSec ? <span className="text-[7px] font-mono text-olympus-cyan ml-auto shrink-0" data-tip="Measured output tok/s for this demigod dispatch">{d.tokensPerSec.toFixed(1)} tok/s</span> : null}
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
      {chatGod && <GodChatModal godId={chatGod} onClose={() => setChatGod(null)} />}
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
          const title = `${godName(s.god, getLanguage())} — ${s.task || s.lastEvent || STATUS_LABEL[s.status]}${s.artifacts && s.artifacts.length ? `\n${s.artifacts.slice(0, 4).join('\n')}` : ''}`;
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
      <div className="shrink-0 py-1 text-center text-[8px] font-mono text-olympus-text-dim border-t border-olympus-gold/10">
        {active}
      </div>
    </div>
  );
}