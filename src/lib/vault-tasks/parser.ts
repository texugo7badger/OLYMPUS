/**
 * Olympus Vault Tasks — Metadata Parser
 * =======================================
 *
 * Extracts `god`, `priority`, `due`, and `project` from a raw task row
 * by combining:
 *   - inline markers in the task text (`@god`, `!!high`, `📅 YYYY-MM-DD`)
 *   - the note's frontmatter (`god:`, `priority:`, `due:`)
 *   - the note's path (`02_Projects/<project>/...` → `project`)
 *
 * Pure functions — no IO. The query layer calls these to enrich raw
 * `tasks` table rows into full `Task` objects.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { Task, TaskPriority, TaskStatus } from './types';

// Inline markers (Dataview / Tasks-plugin compatible):
//   @god         — god attribution
//   !!high       — priority (low|normal|high|critical)
//   📅 2026-07-20 — due date ( Dataview/Tasks-style emoji)
//   ⏫ / 🔼 / 🔻 — priority shorthand (high/medium/low) — Tasks-plugin
const RE_GOD = /@([a-z][a-z0-9_-]+)/i;
const RE_PRIORITY_BANG = /!!(low|normal|high|critical)\b/i;
const RE_PRIORITY_EMOJI = /(⏫|🔼|🔻)/;
const RE_DUE_EMOJI = /📅\s*(\d{4}-\d{2}-\d{2})/;
const RE_DUE_BRACKET = /\[due::\s*(\d{4}-\d{2}-\d{2})\]/i;

/** Map an emoji priority to a `TaskPriority`. */
function emojiToPriority(emoji: string): TaskPriority {
  switch (emoji) {
    case '⏫': return 'critical';
    case '🔼': return 'high';
    case '🔻': return 'low';
    default: return 'normal';
  }
}

/** Parse a YYYY-MM-DD string into a Date (UTC midnight). Returns undefined on failure. */
function parseDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

/**
 * Derive the project slug from a note path: `02_Projects/<slug>/...` → `<slug>`.
 * Returns undefined if the note is not under `02_Projects/`.
 */
export function deriveProject(notePath: string): string | undefined {
  const parts = notePath.split('/');
  if (parts.length < 2) return undefined;
  // Match 02_Projects/<slug>/... case-insensitively.
  const idx = parts.findIndex((p) => /^02_Projects$/i.test(p));
  if (idx < 0 || idx + 1 >= parts.length) return undefined;
  const slug = parts[idx + 1];
  return slug || undefined;
}

/**
 * Normalize a raw status string from the `tasks` table to a `TaskStatus`.
 * The v1 parser only emits 'pending', 'done', 'cancelled'; we also accept
 * 'in-progress' for forward-compat with `[>]` markers.
 */
export function normalizeStatus(raw: string): TaskStatus {
  const s = raw.toLowerCase();
  if (s === 'done' || s === 'x') return 'done';
  if (s === 'cancelled' || s === '-') return 'cancelled';
  if (s === 'in-progress' || s === '>' || s === 'in_progress') return 'in-progress';
  return 'pending';
}

export interface ParsedTaskMeta {
  god?: string;
  priority?: TaskPriority;
  due?: Date;
}

/**
 * Parse inline metadata from the task text.
 *
 * @example
 *   parseInlineMeta('Review PR #42 @hephaestus !!high 📅 2026-07-20')
 *   // → { god: 'hephaestus', priority: 'high', due: Date('2026-07-20') }
 */
export function parseInlineMeta(text: string): ParsedTaskMeta {
  const meta: ParsedTaskMeta = {};

  const godMatch = RE_GOD.exec(text);
  if (godMatch) meta.god = godMatch[1].toLowerCase();

  const bangMatch = RE_PRIORITY_BANG.exec(text);
  if (bangMatch) {
    meta.priority = bangMatch[1].toLowerCase() as TaskPriority;
  } else {
    const emojiMatch = RE_PRIORITY_EMOJI.exec(text);
    if (emojiMatch) meta.priority = emojiToPriority(emojiMatch[1]);
  }

  const dueEmoji = RE_DUE_EMOJI.exec(text);
  const dueBracket = RE_DUE_BRACKET.exec(text);
  const dueStr = dueEmoji?.[1] || dueBracket?.[1];
  meta.due = parseDate(dueStr);

  return meta;
}

/**
 * Enrich a raw task row with metadata from frontmatter + path + inline markers.
 *
 * Frontmatter values take precedence over inline markers (the note author
 * explicitly declared them at the file level). Inline markers take precedence
 * over... nothing else — they're per-task.
 *
 * @param row Raw row from the `tasks` table.
 * @param fm The note's frontmatter (parsed). Empty object if none.
 */
export function enrichTask(
  row: { note_path: string; line: number; text: string; status: string },
  fm: Record<string, unknown>,
): Task {
  const inline = parseInlineMeta(row.text);
  const project = deriveProject(row.note_path);

  // Frontmatter overrides inline (file-level declaration wins).
  const fmGod = typeof fm.god === 'string' ? fm.god.toLowerCase() : undefined;
  const fmPriority =
    typeof fm.priority === 'string'
      ? ((fm.priority as string).toLowerCase() as TaskPriority)
      : undefined;
  const fmDue =
    fm.due instanceof Date
      ? fm.due
      : typeof fm.due === 'string'
        ? parseDate(fm.due)
        : undefined;

  return {
    notePath: row.note_path,
    line: row.line,
    text: row.text,
    status: normalizeStatus(row.status),
    god: fmGod || inline.god,
    project,
    priority: fmPriority || inline.priority,
    due: fmDue || inline.due,
  };
}
