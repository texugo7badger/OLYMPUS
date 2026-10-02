/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * Issue #43 — the Plan panel.
 *
 * A todo list is a plan, and a plan that scrolls away is not a plan. This
 * panel pins to the bottom of the Parthenon column so the checklist stays on
 * screen while the stream scrolls behind it.
 *
 * PAYLOAD NOTE (honest): no component in this repository emits a `todo`
 * event. The only in-repo description of the wire shape is the activity-feed
 * envelope — `{ action: 'todo', god, msg, meta: { status } }` (see
 * `src/lib/handoff-prompt-builder.ts` and `src/lib/activity-feed.ts`) — while
 * the terminal's legacy handler expects `{ type: 'todo', id, text|msg }` plus
 * a separate `todo_done`. Both are accepted here so the panel works whichever
 * emitter shows up; `normalizeTodoEvent` is the single place that maps either
 * shape onto one item.
 */

'use client';

import { CheckCircle2, Circle, Loader2, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PlanStatus = 'pending' | 'in_progress' | 'done';

export interface PlanItem {
  id: string;
  content: string;
  status: PlanStatus;
  /** Emitting god. Anything other than Apollo is a demigod and renders nested. */
  god?: string;
}

const DISPLAY_NAMES: Record<string, string> = {
  apollo: 'Apollo', atlas: 'Atlas', hephaestus: 'Hephaestus', athena: 'Athena',
  hermes: 'Hermes', artemis: 'Artemis', dionysus: 'Dionysus',
  persephone: 'Persephone', prometheus: 'Prometheus', callimachus: 'Callimachus',
};

/** Collapse every status spelling anyone might send into the three we render. */
export function normalizeStatus(raw: unknown): PlanStatus {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['done', 'complete', 'completed', 'finished', 'success'].includes(s)) return 'done';
  if (['in_progress', 'in-progress', 'inprogress', 'active', 'running', 'started', 'doing'].includes(s)) {
    return 'in_progress';
  }
  return 'pending';
}

/**
 * Map any of the accepted todo wire shapes onto a PlanItem.
 * Returns null for frames that carry no todo content, so a stray `todo_done`
 * for an unknown id can never invent an empty row.
 */
export function normalizeTodoEvent(ev: any): PlanItem[] | null {
  const kind = String(ev?.type ?? ev?.action ?? '').toLowerCase();

  // Completion-only frame: `todo_done`, or a `todo` action whose status is a
  // terminal one. It updates an existing row rather than adding one.
  if (kind === 'todo_done' || kind === 'todo.done' || kind === 'todo_completed') {
    const id = ev?.id ?? ev?.todoId ?? '';
    if (!id) return null;
    return [{ id: String(id), content: ev?.text || ev?.msg || '', status: 'done' }];
  }
  if (kind !== 'todo' && kind !== 'todo.created' && kind !== 'todo_write') return null;

  // `items`/`todos` arrays carry a whole checklist in one frame (the
  // todowrite shape). Normalize each entry so a bulk write fills the panel in
  // one pass instead of needing a frame per row.
  const bulk = Array.isArray(ev?.items) ? ev.items : Array.isArray(ev?.todos) ? ev.todos : null;
  if (bulk) {
    const rows: PlanItem[] = bulk.map((raw: any, i: number) => ({
      id: String(raw?.id ?? `${ev?.id ?? 'todo'}-${i}`),
      content: String(raw?.content ?? raw?.text ?? raw?.title ?? raw?.msg ?? '').trim(),
      status: normalizeStatus(raw?.status),
      god: ev?.god,
    })).filter(it => it.content);
    return rows.length > 0 ? rows : null;
  }

  const content = String(ev?.content ?? ev?.text ?? ev?.msg ?? '').trim();
  if (!content) return null;

  return [{
    id: String(ev?.id ?? ev?.todoId ?? `${ev?.god ?? 'apollo'}:${content}`),
    content,
    status: normalizeStatus(ev?.status ?? ev?.meta?.status),
    god: ev?.god,
  }];
}

interface PlanPanelProps {
  items: PlanItem[];
  onToggle: (id: string) => void;
}

export default function PlanPanel({ items, onToggle }: PlanPanelProps) {
  if (items.length === 0) return null;

  const done = items.filter(i => i.status === 'done').length;
  const active = items.find(i => i.status === 'in_progress');

  return (
    <div className="border-t border-olympus-gold/10 bg-olympus-panel/60">
      <div className="px-2 py-1.5 text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide flex items-center gap-1">
        <ListChecks size={10} style={{ color: '#D4A574' }} />
        <span>Plan</span>
        <span className="ml-auto normal-case tracking-normal">{done}/{items.length}</span>
      </div>

      {active && (
        <div className="px-2 pb-1 text-[9px] font-mono truncate" style={{ color: '#7BAE8E' }}>
          ▸ {active.content}
        </div>
      )}

      <div className="pb-1">
        {items.map(item => {
          const nested = !!item.god && item.god !== 'apollo';
          const isDone = item.status === 'done';
          const isActive = item.status === 'in_progress';
          const Glyph = isDone ? CheckCircle2 : isActive ? Loader2 : Circle;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              title={isDone ? 'Mark pending' : 'Mark done'}
              className={cn(
                'w-full text-left px-2 py-1 flex items-start gap-1.5 transition-colors hover:bg-olympus-gold/5',
                nested && 'pl-4',
              )}
            >
              <Glyph
                size={11}
                className={cn(
                  'shrink-0 mt-px',
                  isDone ? 'text-olympus-green' : isActive ? 'text-olympus-gold animate-spin' : 'text-[#5A5A5A]',
                )}
              />
              <span
                className={cn(
                  'text-[9px] font-mono',
                  isDone ? 'text-[#5A5A5A] line-through' : isActive ? 'text-olympus-text' : 'text-olympus-text-dim',
                )}
              >
                {item.content}
              </span>
              {nested && item.god && (
                <span className="text-[8px] font-mono ml-auto shrink-0 text-[#5A5A5A]">
                  {DISPLAY_NAMES[item.god] || item.god}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}