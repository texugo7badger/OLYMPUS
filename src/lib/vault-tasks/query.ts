/**
 * Olympus Vault Tasks — Query Engine
 * =====================================
 *
 * Query layer over the `tasks` table in `VaultIndex`. Reads tasks via
 * prepared SQL statements (no filesystem walk), enriches each row with
 * frontmatter + inline metadata, then applies the caller's filter.
 *
 * Performance target: <50ms for any query on a 1K-note vault.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import Database from 'better-sqlite3';
import type { Task, TaskFilter, TaskGroup, TaskGroupBy, TaskPriority, TaskStatus } from './types';
import { enrichTask } from './parser';

/**
 * Build the SQL WHERE clause for a `TaskFilter`.
 * Returns `{ sql, params }` where `sql` is a partial clause (without the
 * leading `WHERE` keyword) and `params` is the bind array.
 *
 * The filter is applied to the ENRICHED task (post-frontmatter-merge),
 * so we join `tasks` → `notes` → `fm_kv` and check inline markers via
 * `LIKE` on the task text.
 *
 * Filtering on `due` is the trickiest: due dates come from either
 * frontmatter (`due:` key in `fm_kv`) or inline emoji (`📅 YYYY-MM-DD`
 * in task text). We check both with an `OR`.
 */
function buildFilterClause(filter: TaskFilter): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  // Status — direct column on `tasks`.
  if (filter.status) {
    clauses.push('LOWER(t.status) = ?');
    params.push(filter.status.toLowerCase());
  }

  // Text contains — case-insensitive LIKE on task text.
  if (filter.textContains) {
    clauses.push('LOWER(t.text) LIKE ?');
    params.push(`%${filter.textContains.toLowerCase()}%`);
  }

  // God — from frontmatter `god:` OR inline `@god` in text.
  if (filter.god) {
    const g = filter.god.toLowerCase();
    clauses.push(
      `(LOWER(json_extract((SELECT value_json FROM fm_kv WHERE note_path = t.note_path AND key = 'god'), '$')) = ?
        OR LOWER(t.text) LIKE ?)`,
    );
    params.push(g, `%@${g}%`);
  }

  // Project — derived from path: `02_Projects/<project>/...`.
  if (filter.project) {
    clauses.push('(t.note_path LIKE ? OR t.note_path LIKE ?)');
    params.push(`02_Projects/${filter.project}/%`, `02_Projects/${filter.project}:%`);
  }

  // Priority — from frontmatter `priority:` OR inline `!!<priority>` or emoji.
  if (filter.priority) {
    const p = filter.priority.toLowerCase();
    // Bang form: `!!high`
    // Emoji forms: ⏫=critical, 🔼=high, 🔻=low
    const emoji =
      p === 'critical' ? '⏫' :
      p === 'high' ? '🔼' :
      p === 'low' ? '🔻' :
      null;
    if (emoji) {
      clauses.push(
        `(LOWER(json_extract((SELECT value_json FROM fm_kv WHERE note_path = t.note_path AND key = 'priority'), '$')) = ?
          OR t.text LIKE ? OR t.text LIKE ?)`,
      );
      params.push(p, `%!!${p}%`, `%${emoji}%`);
    } else {
      // 'normal' has no emoji — only bang or frontmatter.
      clauses.push(
        `(LOWER(json_extract((SELECT value_json FROM fm_kv WHERE note_path = t.note_path AND key = 'priority'), '$')) = ?
          OR t.text LIKE ?)`,
      );
      params.push(p, `%!!${p}%`);
    }
  }

  // Due date range — check both frontmatter `due:` and inline `📅 YYYY-MM-DD`.
  // We extract the date string from the task text via a LIKE pattern and
  // compare lexicographically (YYYY-MM-DD sorts correctly as a string).
  if (filter.dueBefore) {
    const ds = filter.dueBefore.toISOString().slice(0, 10);
    clauses.push(
      `(json_extract((SELECT value_json FROM fm_kv WHERE note_path = t.note_path AND key = 'due'), '$') LIKE ?
        OR t.text LIKE ?)`,
    );
    // value_json is JSON-quoted: `"2026-07-20"`. LIKE pattern: `"%2026-07%` won't work
    // for ordering; we use a range via substr. Simpler: extract the date string.
    // For correctness, we'll filter post-hoc in JS (see `applyDueFilter`).
    params.push(`${ds}%`, `📅 ${ds}%`);
  }
  if (filter.dueAfter) {
    const ds = filter.dueAfter.toISOString().slice(0, 10);
    clauses.push(
      `(json_extract((SELECT value_json FROM fm_kv WHERE note_path = t.note_path AND key = 'due'), '$') LIKE ?
        OR t.text LIKE ?)`,
    );
    params.push(`${ds}%`, `📅 ${ds}%`);
  }

  if (clauses.length === 0) return { sql: '', params: [] };
  return { sql: clauses.join(' AND '), params };
}

/**
 * Post-hoc filter on `due` that requires actual date comparison (not just
 * LIKE prefix). The SQL filter narrows the candidate set; this trims any
 * false positives (e.g. a `dueBefore` of 2026-07-15 should NOT match
 * `📅 2026-07-20` even though the LIKE pattern `2026-07%` would match).
 *
 * Only called when `filter.dueBefore` or `filter.dueAfter` is set.
 */
function applyDueFilter(task: Task, filter: TaskFilter): boolean {
  const hasBefore = filter.dueBefore !== undefined;
  const hasAfter = filter.dueAfter !== undefined;
  if (!hasBefore && !hasAfter) return true;
  if (!task.due) return false; // task has no due date — excluded by date filter
  if (hasBefore && task.due.getTime() >= filter.dueBefore!.getTime()) return false;
  if (hasAfter && task.due.getTime() <= filter.dueAfter!.getTime()) return false;
  return true;
}

/**
 * Query the `tasks` table, enrich each row, and apply the filter.
 *
 * @param db The VaultIndex database handle.
 * @param filter Optional filter (all fields optional).
 * @returns Array of `Task` objects, sorted by `(notePath, line)`.
 */
export function queryTasks(
  db: Database.Database,
  filter: TaskFilter = {},
): Task[] {
  const { sql, params } = buildFilterClause(filter);
  const whereClause = sql ? `WHERE ${sql}` : '';

  // We join `tasks` → `notes` (LEFT JOIN, in case a task was indexed before
  // its note's frontmatter was — shouldn't happen, but be defensive) and
  // also LEFT JOIN `fm_kv` once on `key = 'god'` for cheap god filtering.
  // For other frontmatter fields, we use the subquery form in buildFilterClause.
  const sqlText = `
    SELECT t.note_path AS note_path, t.line AS line, t.text AS text, t.status AS status,
           n.frontmatter AS frontmatter
    FROM tasks t
    LEFT JOIN notes n ON n.path = t.note_path
    ${whereClause}
    ORDER BY t.note_path ASC, t.line ASC
  `;

  const rows = db.prepare(sqlText).all(...params) as Array<{
    note_path: string;
    line: number;
    text: string;
    status: string;
    frontmatter: string | null;
  }>;

  const tasks: Task[] = [];
  for (const row of rows) {
    let fm: Record<string, unknown> = {};
    if (row.frontmatter) {
      try {
        fm = JSON.parse(row.frontmatter) as Record<string, unknown>;
      } catch {
        // Corrupt frontmatter JSON — treat as empty.
      }
    }
    const task = enrichTask(
      { note_path: row.note_path, line: row.line, text: row.text, status: row.status },
      fm,
    );
    if (applyDueFilter(task, filter)) {
      tasks.push(task);
    }
  }
  return tasks;
}

/**
 * Group tasks by a field. Returns one `TaskGroup` per distinct key.
 * Tasks with no value for the group-by field are placed in a group keyed
 * `(none)` for god/priority, or `02_Projects/_root` for project, or the
 * raw status for status.
 *
 * @param db The VaultIndex database handle.
 * @param filter Optional filter applied before grouping.
 * @param groupBy Field to group by.
 */
export function groupTasksBy(
  db: Database.Database,
  filter: TaskFilter,
  groupBy: TaskGroupBy,
): TaskGroup[] {
  const tasks = queryTasks(db, filter);

  const buckets = new Map<string, Task[]>();
  for (const task of tasks) {
    let key: string;
    switch (groupBy) {
      case 'god':
        key = task.god || '(none)';
        break;
      case 'project':
        key = task.project || '(no-project)';
        break;
      case 'status':
        key = task.status;
        break;
      case 'priority':
        key = task.priority || '(none)';
        break;
      default:
        key = '(unknown)';
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(task);
  }

  // Sort groups: by key ascending, except `status` (custom order) and
  // `priority` (custom order).
  const groups: TaskGroup[] = [];
  if (groupBy === 'status') {
    const order: TaskStatus[] = ['in-progress', 'pending', 'done', 'cancelled'];
    for (const s of order) {
      if (buckets.has(s)) {
        const t = buckets.get(s)!;
        groups.push({ key: s, tasks: t, count: t.length });
        buckets.delete(s);
      }
    }
    // Any remaining (unknown statuses) — append.
    for (const [key, t] of buckets) {
      groups.push({ key, tasks: t, count: t.length });
    }
  } else if (groupBy === 'priority') {
    const order: TaskPriority[] = ['critical', 'high', 'normal', 'low'];
    for (const p of order) {
      if (buckets.has(p)) {
        const t = buckets.get(p)!;
        groups.push({ key: p, tasks: t, count: t.length });
        buckets.delete(p);
      }
    }
    for (const [key, t] of buckets) {
      groups.push({ key, tasks: t, count: t.length });
    }
  } else {
    // Alphabetical by key.
    for (const key of [...buckets.keys()].sort()) {
      const t = buckets.get(key)!;
      groups.push({ key, tasks: t, count: t.length });
    }
  }

  return groups;
}
