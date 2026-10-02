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

import { Sparkles, type LucideIcon } from 'lucide-react';
import { GOD_ICONS } from '@/lib/olympus-store';
import { cn } from '@/lib/utils';

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
}

/**
 * Renders the Parthenon header and cards only. The surrounding rail (border,
 * scroll) belongs to the terminal so sibling panels can share one column.
 */
export default function GodPanel({ states, focusedGod, onFocus, children }: GodPanelProps) {
  const ordered = orderGodStates(states);
  const active = ordered.filter(s => s.status === 'working').length;

  return (
    <>
      <div className="px-2 py-1.5 text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide sticky top-0 bg-olympus-panel border-b border-olympus-gold/10 flex items-center gap-1">
        <Sparkles size={10} style={{ color: '#D4A574' }} />
        <span>Parthenon</span>
        <span className="ml-auto normal-case tracking-normal">
          {active} active / {ordered.length}
        </span>
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
              title={selected ? 'Show every god' : `Focus the stream on ${DISPLAY_NAMES[s.god] || s.god}`}
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
              {s.lastEvent && s.lastEvent !== s.task && (
                <div className="text-[8px] font-mono text-[#4A4A4A] ml-4 truncate">
                  {s.lastEvent}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {children}
    </>
  );
}