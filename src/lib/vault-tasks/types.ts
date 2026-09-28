/**
 * Olympus Vault Tasks — Type Definitions
 * ========================================
 *
 * Public types for the vault task board. A `Task` is a `- [ ]` or `- [x]`
 * checkbox line inside a Markdown note, enriched with metadata from:
 *   - the note's frontmatter (`god:`, `priority:`, `due:`)
 *   - inline markers in the task text (`@god`, `!!high`, `📅 YYYY-MM-DD`)
 *   - the note's path (`02_Projects/<project>/...` → `project`)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/** Task checkbox status (Dataview-compatible). */
export type TaskStatus = 'pending' | 'done' | 'cancelled' | 'in-progress';

/** Task priority (Dataview-compatible). */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * A single task. Matches the v1 stub signature exactly so existing
 * callers don't break — `god`, `project`, `priority`, `due` are all
 * optional (they may not be present on every task).
 */
export interface Task {
  /** Path of the note containing the task (POSIX-style, vault-relative). */
  notePath: string;
  /** 0-based line number within the note. */
  line: number;
  /** Task text (the content after the checkbox marker). */
  text: string;
  /** Checkbox status. */
  status: TaskStatus;
  /** God attribution (from frontmatter `god:` or inline `@god`). */
  god?: string;
  /** Project (derived from path: `02_Projects/<project>/...`). */
  project?: string;
  /** Priority (from inline `!!high` or frontmatter `priority:`). */
  priority?: TaskPriority;
  /** Due date (from inline `📅 YYYY-MM-DD` or frontmatter `due:`). */
  due?: Date;
}

/** Filter clause for `parseTasks` / `groupTasks`. All fields optional. */
export interface TaskFilter {
  god?: string;
  project?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueBefore?: Date;
  dueAfter?: Date;
  /** Substring match on task text (case-insensitive). */
  textContains?: string;
}

/** Group-by field for `groupTasks`. */
export type TaskGroupBy = 'god' | 'project' | 'status' | 'priority';

/** A grouped task bucket. */
export interface TaskGroup {
  /** Group key (e.g. the god name, project slug, status, or priority). */
  key: string;
  /** Tasks in this bucket. */
  tasks: Task[];
  /** Bucket size. */
  count: number;
}

/** Options for `createTask`. */
export interface CreateTaskOpts {
  priority?: TaskPriority;
  due?: Date;
  god?: string;
}

/** Internal: row shape from the `tasks` table. */
export interface TaskRow {
  note_path: string;
  line: number;
  text: string;
  status: string;
}
