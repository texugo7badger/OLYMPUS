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
import { useLanguage, t } from '@/lib/i18n';
import TaskSigil, { sigilFor } from './task-sigil';

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
  const language = useLanguage();
  if (items.length === 0) return null;

  const done = items.filter(i => i.status === 'done').length;
  const pct = Math.round((done / Math.max(1, items.length)) * 100);

  return (
    <div className="border-t border-olympus-gold/10 bg-olympus-panel/60">
      <div className="px-2 py-1.5 text-[9px] font-mono text-olympus-text-dim uppercase tracking-wide flex items-center gap-1.5">
        <ListChecks size={10} className="text-olympus-gold" />
        <span>{t('terminal.buildQueue', language)}</span>
        <span className="text-olympus-text-dim/70 normal-case">· {t('terminal.chosenTasks', language)}</span>
        <span className="ml-auto normal-case tracking-normal tabular-nums">{done}/{items.length}</span>
        <span className="w-14 h-1 rounded-full bg-olympus-bg overflow-hidden ring-1 ring-olympus-gold/10" aria-hidden>
          <span className="block h-full w-full rounded-full bg-olympus-gold origin-left transition-transform duration-500" style={{ transform: `scaleX(${pct / 100})` }} />
        </span>
      </div>

      <div className="flex gap-1.5 px-2 pb-2 overflow-x-auto custom-scroll overscroll-x-contain">
        {items.map(item => {
          const nested = !!item.god && item.god !== 'apollo';
          const isDone = item.status === 'done';
          const isActive = item.status === 'in_progress';
          const kind = sigilFor(item.content, item.god);
          const Glyph = isDone ? CheckCircle2 : isActive ? Loader2 : Circle;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              data-tip={isDone ? 'Mark pending' : 'Mark done'}
              aria-pressed={isDone}
              className={cn(
                'group relative shrink-0 w-[204px] text-left rounded-lg border p-2 transition-transform duration-200 hover:-translate-y-0.5',
                isDone
                  ? 'border-olympus-green/20 bg-olympus-card/50 opacity-60'
                  : isActive
                    ? 'border-olympus-gold/45 bg-olympus-gold/10 shadow-sm'
                    : 'border-olympus-gold/12 bg-olympus-card hover:border-olympus-gold/35',
              )}
            >
              <div className="flex items-start gap-1.5">
                <span className={cn(
                  'w-7 h-7 rounded-md flex items-center justify-center shrink-0 ring-1',
                  isDone ? 'bg-olympus-bg/40 ring-olympus-green/25' : 'bg-olympus-bg/55 ring-olympus-gold/15',
                )}>
                  <TaskSigil kind={kind} size={22} active={isActive} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[7px] font-mono uppercase tracking-wider text-olympus-cyan/70">
                    {t('common.build', language)} · {kind}{nested && item.god ? ` · ${DISPLAY_NAMES[item.god] || item.god}` : ''}
                  </span>
                  <span className={cn(
                    'block text-[9.5px] font-mono leading-snug mt-0.5 line-clamp-2',
                    isDone ? 'text-olympus-text-dim line-through' : 'text-olympus-text',
                  )}>
                    {item.content}
                  </span>
                </span>
                <Glyph
                  size={11}
                  className={cn(
                    'shrink-0 mt-0.5',
                    isDone ? 'text-olympus-green' : isActive ? 'text-olympus-gold animate-spin' : 'text-olympus-text-dim/70',
                  )}
                />
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                {item.god && (
                  <span className={cn(
                    'text-[7px] font-mono px-1 py-0.5 rounded ring-1 truncate',
                    isDone ? 'text-olympus-text-dim ring-olympus-text-dim/15' : 'text-olympus-gold ring-olympus-gold/20 bg-olympus-gold/5',
                  )}>
                    {DISPLAY_NAMES[item.god] || item.god}
                  </span>
                )}
                <span className={cn(
                  'ml-auto text-[7px] font-mono uppercase tracking-wide',
                  isDone ? 'text-olympus-green' : isActive ? 'text-olympus-gold' : 'text-olympus-text-dim/70',
                )}>
                  {isDone ? t('common.done', language) : isActive ? t('common.inFlight', language) : t('common.queued', language)}
                </span>
              </div>
              {isActive && (
                <span className="absolute left-2 right-2 bottom-0 h-px bg-olympus-gold/60 animate-pulse" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}