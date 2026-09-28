/**
 * Olympus Vault Tasks — Public API (v2.0.0)
 * =============================================
 *
 * Task board query layer over the `tasks` table in `VaultIndex`. Replaces
 * the v1 stub (which threw `'Tier 2 — not implemented'`).
 *
 * The `tasks` table is already populated by the indexer on every file
 * index (it parses `- [ ]` / `- [x]` checkboxes). This module adds:
 *   - `parseTasks(filter)` — query + enrich with frontmatter + inline metadata
 *   - `groupTasks(filter, groupBy)` — group by god/project/status/priority
 *   - `toggleTask(notePath, line)` — flip pending ↔ done in-place
 *   - `setTaskStatus(notePath, line, status)` — set any status
 *   - `createTask(notePath, text, opts)` — append a new `- [ ]` line
 *
 * Public API signatures match the v1 stub EXACTLY so the Callimachus agent's
 * calls don't break. New v2 functions (`setTaskStatus`, `createTask`) are
 * additive.
 *
 * Performance target: <50ms per operation on a 1K-note vault.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { VaultAPI } from '../vault';
import type { VaultIndex } from '../vault-index/indexer';
import type {
  CreateTaskOpts,
  Task,
  TaskFilter,
  TaskGroup,
  TaskGroupBy,
  TaskStatus,
} from './types';
import { queryTasks, groupTasksBy } from './query';
import { parseInlineMeta, deriveProject } from './parser';
import { parseFrontmatter, stringifyFrontmatter } from '../vault/frontmatter';

// ─────────────────────────────────────────────────────────────────────
// Module-level singleton: the active VaultIndex.
//
// The v1 stub didn't take a `VaultIndex` argument (it threw unconditionally).
// To preserve the exact stub signature while still giving the implementation
// access to the index, we use a module-level binding set by `bindVaultIndex()`.
// The VaultAPI facade calls `bindVaultIndex()` on construction.
// ─────────────────────────────────────────────────────────────────────

let activeIndex: VaultIndex | null = null;

/**
 * Bind a `VaultIndex` to this module. Called by `VaultAPI` on construction.
 * Subsequent calls to `parseTasks` / `groupTasks` / `toggleTask` etc. use
 * this index. Re-binding is allowed (the previous index is dropped).
 */
export function bindVaultIndex(index: VaultIndex | null): void {
  activeIndex = index;
}

/** Internal: get the active index, or throw a clear error. */
function getIndex(): VaultIndex {
  if (!activeIndex) {
    throw new Error(
      'vault-tasks: no VaultIndex bound. Construct a VaultAPI (which binds automatically) before calling task functions.',
    );
  }
  return activeIndex;
}

/** Internal: get the active VaultAPI singleton (set by `bindVaultApi()`). */
let activeApi: VaultAPI | null = null;

/**
 * Bind a `VaultAPI` to this module. Called by `VaultAPI` on construction.
 * Required for write operations (`toggleTask`, `setTaskStatus`, `createTask`)
 * which need to read+write notes via the backend.
 */
export function bindVaultApi(api: VaultAPI | null): void {
  activeApi = api;
}

// ─────────────────────────────────────────────────────────────────────
// Public API — signatures match v1 stub exactly
// ─────────────────────────────────────────────────────────────────────

/**
 * Parse all tasks across the vault matching `filter`.
 *
 * Queries the `tasks` table directly (no filesystem walk). For each row,
 * also fetches the note's frontmatter to extract `god`, `priority`, `due`.
 * Inline metadata (`@god`, `!!high`, `📅 YYYY-MM-DD`) is parsed from the
 * task text.
 *
 * @param filter Optional filter — all fields optional.
 * @returns Array of `Task` objects, sorted by `(notePath, line)`.
 */
export async function parseTasks(filter: TaskFilter = {}): Promise<Task[]> {
  const index = getIndex();
  return queryTasks(index.db, filter);
}

/**
 * Group tasks by a field (god, project, status, priority).
 *
 * @param filter Optional filter applied before grouping.
 * @param groupBy Field to group by. Default: 'status'.
 * @returns One `TaskGroup` per distinct key, in a sensible order.
 */
export async function groupTasks(
  filter: TaskFilter = {},
  groupBy: TaskGroupBy = 'status',
): Promise<TaskGroup[]> {
  const index = getIndex();
  return groupTasksBy(index.db, filter, groupBy);
}

/**
 * Toggle a task's status (pending ↔ done) in-place.
 *
 * Steps:
 *   1. Read the note via `vault_read`
 *   2. Find the line at `line` number (0-based)
 *   3. Replace the checkbox marker (`[ ]` → `[x]` or vice versa)
 *   4. Write the note back via `vault_write` (lock auto-acquired)
 *   5. Re-index that one file (force — don't wait for the watcher)
 *
 * @param notePath Path of the note containing the task.
 * @param line 0-based line number.
 * @returns The updated `Task`.
 */
export async function toggleTask(notePath: string, line: number): Promise<Task> {
  return setTaskStatus(notePath, line, null);
}

/**
 * Set a task's status to any value. If `status` is null, toggles pending ↔ done.
 *
 * @param notePath Path of the note containing the task.
 * @param line 0-based line number.
 * @param status New status, or null to toggle.
 */
export async function setTaskStatus(
  notePath: string,
  line: number,
  status: TaskStatus | null,
): Promise<Task> {
  if (!activeApi) {
    throw new Error('vault-tasks: no VaultAPI bound (required for write operations).');
  }
  if (!notePath || !Number.isFinite(line) || line < 0) {
    throw new Error(`vault-tasks: invalid (notePath, line): (${notePath}, ${line})`);
  }

  // 1. Read the note.
  const { content } = await activeApi.read(notePath);

  // The `tasks` table stores line numbers RELATIVE TO THE BODY (after
  // frontmatter stripping) — see vault/parse.ts extractTasks(). So we split
  // the body separately and reconstruct the file preserving the original
  // frontmatter raw text (so body line numbers don't shift on round-trip).
  const { frontmatterRaw, body } = parseFrontmatter(content);
  const bodyLines = body.split('\n');
  if (line >= bodyLines.length) {
    throw new Error(`vault-tasks: line ${line} out of range (note body has ${bodyLines.length} lines).`);
  }

  // 2. Find the checkbox marker on that line (within the body).
  const checkboxRe = /^(\s*[-*+]\s+)\[([ xX-])\]\s+(.*)$/;
  const m = checkboxRe.exec(bodyLines[line]);
  if (!m) {
    throw new Error(
      `vault-tasks: line ${line} of ${notePath} is not a task (no '- [ ]' marker).`,
    );
  }
  const [, prefix, currentMark, text] = m;

  // 3. Compute the new status + marker.
  const currentStatus =
    currentMark.toLowerCase() === 'x' ? 'done' :
    currentMark === '-' ? 'cancelled' :
    'pending';

  let newStatus: TaskStatus;
  if (status === null) {
    // Toggle: pending → done, done → pending, cancelled → pending, in-progress → done.
    newStatus = currentStatus === 'done' ? 'pending' : 'done';
  } else {
    newStatus = status;
  }
  const newMark =
    newStatus === 'done' ? 'x' :
    newStatus === 'cancelled' ? '-' :
    newStatus === 'in-progress' ? '>' :
    ' ';

  // 4. Replace the line (within the body).
  bodyLines[line] = `${prefix}[${newMark}] ${text}`;

  // 5. Reconstruct the full file preserving the original frontmatter raw
  // text. Using `stringifyFrontmatter` would re-serialize the YAML (possibly
  // changing formatting) AND strip a leading newline from the body, both of
  // which would shift body line numbers on subsequent calls. We preserve the
  // exact frontmatter bytes + only modify the one body line.
  const newBody = bodyLines.join('\n');
  const newContent = frontmatterRaw
    ? `---\n${frontmatterRaw}\n---\n${newBody}`
    : newBody;
  await activeApi.write(notePath, newContent);

  // 6. Force re-index that one file (immediate; don't wait for watcher).
  const index = getIndex();
  await index.indexFile(notePath);

  // 7. Return the updated Task.
  return {
    notePath,
    line,
    text,
    status: newStatus,
    god: undefined,
    project: deriveProject(notePath),
    priority: parseInlineMeta(text).priority,
    due: parseInlineMeta(text).due,
  };
}

/**
 * Append a new `- [ ]` line to a note's task section. Creates a `## Tasks`
 * section if none exists.
 *
 * @param notePath Path of the note to append to.
 * @param text Task text. May include inline markers (`@god`, `!!high`, `📅 YYYY-MM-DD`).
 * @param opts Optional metadata (priority, due, god).
 */
export async function createTask(
  notePath: string,
  text: string,
  opts: CreateTaskOpts = {},
): Promise<Task> {
  if (!activeApi) {
    throw new Error('vault-tasks: no VaultAPI bound (required for write operations).');
  }
  if (!notePath || !text) {
    throw new Error('vault-tasks: notePath and text are required.');
  }

  // Build the task line with inline markers.
  let line = `- [ ] ${text}`;
  if (opts.god && !/@\w+/i.test(text)) line += ` @${opts.god}`;
  if (opts.priority && !/!!\w+/i.test(text)) line += ` !!${opts.priority}`;
  if (opts.due && !/📅\s*\d{4}-\d{2}-\d{2}/.test(text)) {
    line += ` 📅 ${opts.due.toISOString().slice(0, 10)}`;
  }

  // Read the note (or start fresh if it doesn't exist).
  const existing = await activeApi.readIfExists(notePath);
  let content: string;
  let insertLine: number;

  if (existing === null) {
    // Create new note with a Tasks section.
    content = `---\ntype: note\n---\n\n# ${notePath.split('/').pop()?.replace(/\.md$/i, '') || 'Note'}\n\n## Tasks\n\n${line}\n`;
    insertLine = 5; // 0-based: line 5 is the task line (after `## Tasks\n\n`).
  } else {
    content = existing.content;
    const lines = content.split('\n');

    // Find an existing `## Tasks` heading.
    let headingIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Tasks\s*$/i.test(lines[i])) {
        headingIdx = i;
        break;
      }
    }

    if (headingIdx >= 0) {
      // Insert after the heading (and any blank line right after it).
      let insertIdx = headingIdx + 1;
      while (insertIdx < lines.length && lines[insertIdx].trim() === '') {
        insertIdx++;
      }
      // If the next non-blank line is another heading, insert before it.
      if (insertIdx < lines.length && /^##\s/.test(lines[insertIdx])) {
        // Insert a blank line before the task.
        lines.splice(insertIdx, 0, '', line);
        insertLine = insertIdx + 1;
      } else {
        lines.splice(insertIdx, 0, line);
        insertLine = insertIdx;
      }
      content = lines.join('\n');
    } else {
      // No Tasks section — append one.
      const needsTrailingNewline = content.length > 0 && !content.endsWith('\n');
      content =
        content +
        (needsTrailingNewline ? '\n' : '') +
        (content.length > 0 ? '\n' : '') +
        '## Tasks\n\n' +
        line +
        '\n';
      // Compute the inserted line index (0-based).
      insertLine = content.split('\n').indexOf(line);
      if (insertLine < 0) insertLine = 0;
    }

    await activeApi.write(notePath, content);
  }

  // If the note was newly created, write it.
  if (existing === null) {
    await activeApi.write(notePath, content);
  }

  // Force re-index.
  const index = getIndex();
  await index.indexFile(notePath);

  return {
    notePath,
    line: insertLine,
    text,
    status: 'pending',
    god: opts.god ? opts.god.toLowerCase() : parseInlineMeta(text).god,
    project: deriveProject(notePath),
    priority: opts.priority || parseInlineMeta(text).priority,
    due: opts.due || parseInlineMeta(text).due,
  };
}

// Re-export types for convenience.
export type {
  CreateTaskOpts,
  Task,
  TaskFilter,
  TaskGroup,
  TaskGroupBy,
  TaskPriority,
  TaskStatus,
} from './types';
