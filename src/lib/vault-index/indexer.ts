/**
 * Olympus Vault Index — Indexer + Watcher
 * =========================================
 *
 * Builds and maintains `~/.olympus/vault-index.db`. The indexer:
 *
 * - On `init()`: walks the vault, reindexes files whose `mtime > indexed_at`,
 *   or does a full walk if the DB is empty.
 * - On `chokidar` events (`add` / `change` / `unlink`): upserts or removes
 *   rows in a single transaction. Target <50ms per file.
 * - Exposes query helpers used by `vault/search.ts`, `vault/wikilinks.ts`,
 *   and `vault-query/executor.ts`.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { VaultBackend } from '../vault/backend';
import { parseNote } from '../vault/parse';
import { resolveWikilink } from '../vault/wikilinks';
import type { ParsedNote, SearchResult, VaultEntry } from '../vault/types';
import type { Unsubscribe, VaultEvent } from '../vault/backend';
import { applySchema, SCHEMA_VERSION } from './schema';
import { invalidateQueryCache } from '../vault-query/executor';

const DEFAULT_DB_PATH = () =>
  path.join(process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'vault-index.db');

export interface VaultIndexOptions {
  /** SQLite DB path. Defaults to `~/.olympus/vault-index.db`. */
  dbPath?: string;
  /** Skip chokidar watcher (tests). Default: false. */
  noWatcher?: boolean;
}

interface NoteRow {
  path: string;
  name: string;
  dir: string;
  size: number;
  modified: number;
  frontmatter: string | null;
  title: string | null;
  tags_json: string;
  links_json: string;
  tasks_json: string;
  body_text: string | null;
  indexed_at: number;
}

interface FmKvRow {
  note_path: string;
  key: string;
  value_json: string;
}

interface LinkRow {
  source_path: string;
  target: string;
  target_path: string | null;
  line: number;
}

interface TaskRow {
  note_path: string;
  line: number;
  text: string;
  status: string;
}

/**
 * The vault index. Construct, call `init()`, then `startWatcher()`.
 */
export class VaultIndex {
  readonly dbPath: string;
  readonly db: Database.Database;
  private backend: VaultBackend;
  private watcherUnsubs: Unsubscribe[] = [];
  private noWatcher: boolean;
  private open = true;

  constructor(backend: VaultBackend, opts: VaultIndexOptions = {}) {
    this.backend = backend;
    this.dbPath = opts.dbPath || DEFAULT_DB_PATH();
    this.noWatcher = opts.noWatcher ?? false;
    // Ensure parent dir exists.
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    // v2: incremental auto-vacuum for compaction without blocking the whole DB.
    try { this.db.pragma('auto_vacuum = INCREMENTAL'); } catch { /* read-only */ }
    // v2: 64MB cache (up from default 2MB) — keeps hot index pages in RAM.
    try { this.db.pragma('cache_size = -65536'); } catch { /* ignore */ }
    // v2: set a busy timeout so concurrent writers don't immediately fail.
    try { this.db.pragma('busy_timeout = 5000'); } catch { /* ignore */ }
    applySchema(this.db);
    // Pre-compile statements (better-sqlite3 caches them, but we cache
    // references for clarity).
    this.stmtUpsertNote = this.db.prepare(
      `INSERT INTO notes (path, name, dir, size, modified, frontmatter, title, tags_json, links_json, tasks_json, body_text, indexed_at)
       VALUES (@path, @name, @dir, @size, @modified, @frontmatter, @title, @tags_json, @links_json, @tasks_json, @body_text, @indexed_at)
       ON CONFLICT(path) DO UPDATE SET
         name=excluded.name,
         dir=excluded.dir,
         size=excluded.size,
         modified=excluded.modified,
         frontmatter=excluded.frontmatter,
         title=excluded.title,
         tags_json=excluded.tags_json,
         links_json=excluded.links_json,
         tasks_json=excluded.tasks_json,
         body_text=excluded.body_text,
         indexed_at=excluded.indexed_at`,
    );
    this.stmtDeleteFmKv = this.db.prepare('DELETE FROM fm_kv WHERE note_path = ?');
    this.stmtInsertFmKv = this.db.prepare(
      'INSERT OR REPLACE INTO fm_kv (note_path, key, value_json) VALUES (?, ?, ?)',
    );
    this.stmtDeleteTags = this.db.prepare('DELETE FROM tags WHERE note_path = ?');
    this.stmtInsertTag = this.db.prepare(
      'INSERT OR IGNORE INTO tags (tag, note_path) VALUES (?, ?)',
    );
    this.stmtDeleteLinks = this.db.prepare('DELETE FROM links WHERE source_path = ?');
    this.stmtInsertLink = this.db.prepare(
      'INSERT OR IGNORE INTO links (source_path, target, target_path, line) VALUES (?, ?, ?, ?)',
    );
    this.stmtDeleteTasks = this.db.prepare('DELETE FROM tasks WHERE note_path = ?');
    this.stmtInsertTask = this.db.prepare(
      'INSERT OR REPLACE INTO tasks (note_path, line, text, status) VALUES (?, ?, ?, ?)',
    );
    this.stmtDeleteFts = this.db.prepare('DELETE FROM notes_fts WHERE path = ?');
    this.stmtInsertFts = this.db.prepare(
      'INSERT INTO notes_fts (path, body_text) VALUES (?, ?)',
    );
    this.stmtDeleteNote = this.db.prepare('DELETE FROM notes WHERE path = ?');
    this.stmtGetNote = this.db.prepare('SELECT * FROM notes WHERE path = ?');
    this.stmtGetNoteModified = this.db.prepare('SELECT modified, indexed_at FROM notes WHERE path = ?');
    this.stmtLogEvent = this.db.prepare(
      'INSERT INTO index_log (event, path, ts, duration_ms) VALUES (?, ?, ?, ?)',
    );
  }

  // Prepared statements (typed)
  private stmtUpsertNote: Database.Statement;
  private stmtDeleteFmKv: Database.Statement;
  private stmtInsertFmKv: Database.Statement;
  private stmtDeleteTags: Database.Statement;
  private stmtInsertTag: Database.Statement;
  private stmtDeleteLinks: Database.Statement;
  private stmtInsertLink: Database.Statement;
  private stmtDeleteTasks: Database.Statement;
  private stmtInsertTask: Database.Statement;
  private stmtDeleteFts: Database.Statement;
  private stmtInsertFts: Database.Statement;
  private stmtDeleteNote: Database.Statement;
  private stmtGetNote: Database.Statement;
  private stmtGetNoteModified: Database.Statement;
  private stmtLogEvent: Database.Statement;

  // ─────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    // Check whether DB is empty → full walk; otherwise incremental.
    const count = this.db.prepare('SELECT COUNT(*) as n FROM notes').get() as { n: number };
    if (count.n === 0) {
      await this.reindexAll();
    } else {
      await this.reindexChanged();
    }
  }

  /**
   * Reindex any file whose `mtime > indexed_at`. Cheap on steady state.
   */
  async reindexChanged(): Promise<{ reindexed: number; durationMs: number }> {
    const t0 = Date.now();
    let reindexed = 0;
    const entries = await this.backend.listRecursive();
    for (const entry of entries) {
      if (entry.type !== 'file') continue;
      if (!entry.name.endsWith('.md')) continue;
      const row = this.stmtGetNoteModified.get(entry.path) as
        | { modified: number; indexed_at: number }
        | undefined;
      if (!row || entry.modified.getTime() > row.indexed_at) {
        await this.indexFile(entry.path);
        reindexed++;
      }
    }
    // Detect deleted files (in DB but not on disk).
    const dbPaths = new Set(
      (this.db.prepare('SELECT path FROM notes').all() as { path: string }[]).map((r) => r.path),
    );
    const diskPaths = new Set(entries.filter((e) => e.type === 'file' && e.name.endsWith('.md')).map((e) => e.path));
    for (const p of dbPaths) {
      if (!diskPaths.has(p)) {
        this.removeFile(p);
      }
    }
    return { reindexed, durationMs: Date.now() - t0 };
  }

  /**
   * Full reindex: drop all rows, walk the vault, index every .md file.
   * After all notes are indexed, run a second pass to re-resolve links
   * (links can only resolve once both source AND target are indexed).
   */
  async reindexAll(): Promise<{ reindexed: number; durationMs: number }> {
    const t0 = Date.now();
    this.db.exec('DELETE FROM notes');
    this.db.exec('DELETE FROM fm_kv');
    this.db.exec('DELETE FROM tags');
    this.db.exec('DELETE FROM links');
    this.db.exec('DELETE FROM tasks');
    this.db.exec('DELETE FROM notes_fts');
    const entries = await this.backend.listRecursive();
    let count = 0;
    for (const entry of entries) {
      if (entry.type !== 'file') continue;
      if (!entry.name.endsWith('.md')) continue;
      try {
        await this.indexFile(entry.path);
        count++;
      } catch (err) {
        // Log but continue — one bad file shouldn't abort the whole walk.
        this.stmtLogEvent.run('error', entry.path, Date.now(), 0);
      }
    }
    // Second pass: re-resolve all links now that all notes are indexed.
    this.resolveAllLinks();
    return { reindexed: count, durationMs: Date.now() - t0 };
  }

  /**
   * Walk every link in the `links` table and re-resolve its target_path.
   * Called after a full reindex (link resolution requires both endpoints
   * to be indexed).
   */
  resolveAllLinks(): { resolved: number; broken: number } {
    const allLinks = this.db.prepare(
      'SELECT source_path, target, line FROM links',
    ).all() as { source_path: string; target: string; line: number }[];
    let resolved = 0;
    let broken = 0;
    const updateStmt = this.db.prepare(
      'UPDATE links SET target_path = ? WHERE source_path = ? AND target = ? AND line = ?',
    );
    const tx = this.db.transaction(() => {
      for (const link of allLinks) {
        const r = resolveWikilink(this, link.target, link.source_path);
        updateStmt.run(r.targetPath, link.source_path, link.target, link.line);
        if (r.targetPath) resolved++;
        else broken++;
      }
    });
    tx();
    return { resolved, broken };
  }

  /**
   * Index (or reindex) a single file. Called by the watcher on `add`/`change`.
   */
  async indexFile(relPath: string): Promise<{ durationMs: number }> {
    const t0 = Date.now();
    const buf = await this.backend.readIfExists(relPath);
    if (!buf) {
      this.removeFile(relPath);
      return { durationMs: Date.now() - t0 };
    }
    const content = buf.toString('utf-8');
    const stat = await this.backend.stat(relPath);
    if (!stat) {
      return { durationMs: Date.now() - t0 };
    }
    const parsed = parseNote(relPath, content, buf.length, stat.modified);
    this.upsertParsedNote(parsed);
    // After indexing this file, re-resolve any links from OTHER files that
    // target this file's basename — they may have been previously broken.
    this.resolveLinksToNote(relPath);
    this.stmtLogEvent.run('change', relPath, Date.now(), Date.now() - t0);
    return { durationMs: Date.now() - t0 };
  }

  /**
   * Re-resolve all links across the vault whose target could plausibly
   * resolve to `notePath` (basename match or path match). Called after
   * a single-file reindex to fix previously-broken links.
   */
  private resolveLinksToNote(notePath: string): void {
    const baseName = notePath.split('/').pop()?.replace(/\.md$/i, '') || '';
    if (!baseName) return;
    // Find links where target IS NULL-resolved AND target matches basename
    // OR target (with .md) equals notePath.
    const candidates = this.db.prepare(
      `SELECT source_path, target, line FROM links
       WHERE (target_path IS NULL)
         AND (LOWER(target) = LOWER(?) OR LOWER(REPLACE(target, '.md', '')) = LOWER(?))`,
    ).all(baseName, baseName) as { source_path: string; target: string; line: number }[];
    if (candidates.length === 0) return;
    const updateStmt = this.db.prepare(
      'UPDATE links SET target_path = ? WHERE source_path = ? AND target = ? AND line = ?',
    );
    const tx = this.db.transaction(() => {
      for (const link of candidates) {
        const r = resolveWikilink(this, link.target, link.source_path);
        if (r.targetPath) {
          updateStmt.run(r.targetPath, link.source_path, link.target, link.line);
        }
      }
    });
    tx();
  }

  /**
   * Remove a file from the index. Called by the watcher on `unlink`.
   */
  removeFile(relPath: string): void {
    const tx = this.db.transaction(() => {
      this.stmtDeleteFmKv.run(relPath);
      this.stmtDeleteTags.run(relPath);
      this.stmtDeleteLinks.run(relPath);
      this.stmtDeleteTasks.run(relPath);
      this.stmtDeleteFts.run(relPath);
      this.stmtDeleteNote.run(relPath);
    });
    tx();
    this.stmtLogEvent.run('unlink', relPath, Date.now(), 0);
  }

  /**
   * Upsert a parsed note into all tables, in one transaction.
   */
  private upsertParsedNote(note: ParsedNote): void {
    const dir = note.path.includes('/') ? note.path.split('/').slice(0, -1).join('/') : '';
    const fmJson = Object.keys(note.frontmatter).length > 0 ? JSON.stringify(note.frontmatter) : null;
    const row: NoteRow = {
      path: note.path,
      name: note.path.split('/').pop() || note.path,
      dir,
      size: note.size,
      modified: note.modified.getTime(),
      frontmatter: fmJson,
      title: note.title,
      tags_json: JSON.stringify(note.tags),
      links_json: JSON.stringify(note.links),
      tasks_json: JSON.stringify(note.tasks),
      body_text: note.bodyText,
      indexed_at: Date.now(),
    };
    const tx = this.db.transaction(() => {
      this.stmtUpsertNote.run(row);
      // Frontmatter key-value
      this.stmtDeleteFmKv.run(note.path);
      for (const [k, v] of Object.entries(note.frontmatter)) {
        // Skip nested objects/arrays-as-keys to keep index lean — store the
        // top-level value JSON. The query layer json_extract()s what it needs.
        try {
          this.stmtInsertFmKv.run(note.path, k, JSON.stringify(v));
        } catch {
          // ignore — likely a circular reference
        }
      }
      // Tags
      this.stmtDeleteTags.run(note.path);
      for (const tag of note.tags) {
        this.stmtInsertTag.run(tag, note.path);
      }
      // Links — resolve each to a target path
      this.stmtDeleteLinks.run(note.path);
      for (const link of note.links) {
        const resolved = resolveWikilink(this, link.target, note.path);
        this.stmtInsertLink.run(note.path, link.target, resolved.targetPath, link.line);
      }
      // Tasks
      this.stmtDeleteTasks.run(note.path);
      for (const task of note.tasks) {
        this.stmtInsertTask.run(note.path, task.line, task.text, task.status);
      }
      // FTS
      this.stmtDeleteFts.run(note.path);
      this.stmtInsertFts.run(note.path, note.bodyText);
    });
    tx();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Watcher
  // ─────────────────────────────────────────────────────────────────────

  async startWatcher(): Promise<void> {
    if (this.noWatcher) return;
    if (this.watcherUnsubs.length > 0) return;
    const events: VaultEvent[] = ['add', 'change', 'unlink'];
    for (const ev of events) {
      const unsub = this.backend.on(ev, (relPath) => {
        if (!relPath.endsWith('.md')) return;
        // v2: invalidate the DQL query cache on any note change.
        invalidateQueryCache();
        if (ev === 'unlink') {
          this.removeFile(relPath);
        } else {
          // Fire-and-forget; the index is updated in the background.
          this.indexFile(relPath).catch(() => {
            // logged inside indexFile
          });
        }
      });
      this.watcherUnsubs.push(unsub);
    }
  }

  async stopWatcher(): Promise<void> {
    for (const u of this.watcherUnsubs) u();
    this.watcherUnsubs = [];
  }

  // ─────────────────────────────────────────────────────────────────────
  // Query helpers (used by vault/search.ts, vault/wikilinks.ts, vault-query)
  // ─────────────────────────────────────────────────────────────────────

  /** True if a note with this exact path exists in the index. */
  noteExists(relPath: string): boolean {
    const r = this.db.prepare('SELECT 1 FROM notes WHERE path = ?').get(relPath);
    return Boolean(r);
  }

  /** Find all notes whose basename (without .md) matches `nameLower`. */
  findNotesByBasename(nameLower: string): string[] {
    // Strip `.md` for comparison.
    const rows = this.db
      .prepare(
        `SELECT path FROM notes WHERE LOWER(REPLACE(name, '.md', '')) = ?`,
      )
      .all(nameLower) as { path: string }[];
    return rows.map((r) => r.path);
  }

  /** Count notes in the index. */
  countNotes(): number {
    return (this.db.prepare('SELECT COUNT(*) as n FROM notes').get() as { n: number }).n;
  }

  /** All links (source_path, target, target_path, line). Used by health. */
  getAllLinks(): LinkRow[] {
    return this.db.prepare('SELECT * FROM links').all() as LinkRow[];
  }

  /** Backlinks: notes that link TO `notePath`. */
  getBacklinks(notePath: string): { sourcePath: string; line: number; target: string }[] {
    // Match by resolved target_path OR by raw target matching the note's basename.
    const baseName = notePath.split('/').pop()?.replace(/\.md$/i, '') || '';
    const rows = this.db
      .prepare(
        `SELECT DISTINCT source_path, line, target FROM links
         WHERE target_path = ?
            OR LOWER(target) = LOWER(?)
         ORDER BY source_path`,
      )
      .all(notePath, baseName) as { source_path: string; line: number; target: string }[];
    return rows.map((r) => ({
      sourcePath: r.source_path,
      line: r.line,
      target: r.target,
    }));
  }

  /** Outlinks: notes that `notePath` links FROM. */
  getOutlinks(notePath: string): { target: string; targetPath: string | null; line: number }[] {
    const rows = this.db
      .prepare(
        'SELECT target, target_path, line FROM links WHERE source_path = ? ORDER BY line',
      )
      .all(notePath) as { target: string; target_path: string | null; line: number }[];
    return rows.map((r) => ({
      target: r.target,
      targetPath: r.target_path,
      line: r.line,
    }));
  }

  /** Orphan notes: notes with zero incoming links. */
  getOrphanNotes(): string[] {
    const rows = this.db
      .prepare(
        `SELECT n.path FROM notes n
         LEFT JOIN links l ON l.target_path = n.path
         WHERE l.target_path IS NULL
           AND n.path NOT IN (
             SELECT DISTINCT l2.source_path FROM links l2
             JOIN notes n2 ON LOWER(l2.target) = LOWER(REPLACE(n2.name, '.md', ''))
             WHERE n2.path = n.path
           )
         ORDER BY n.path`,
      )
      .all() as { path: string }[];
    return rows.map((r) => r.path);
  }

  /** Broken links: `[[target]]` that didn't resolve to any note. */
  getBrokenLinks(): { sourcePath: string; target: string; line: number }[] {
    const rows = this.db
      .prepare(
        `SELECT source_path, target, line FROM links WHERE target_path IS NULL`,
      )
      .all() as { source_path: string; target: string; line: number }[];
    return rows.map((r) => ({
      sourcePath: r.source_path,
      target: r.target,
      line: r.line,
    }));
  }

  /** All tags with counts. */
  getTags(): { tags: { tag: string; count: number }[]; total: number } {
    const rows = this.db
      .prepare(
        'SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC, tag ASC',
      )
      .all() as { tag: string; count: number }[];
    return { tags: rows, total: rows.length };
  }

  /** FTS5 search over note bodies. */
  searchNotes(query: string, limit: number = 20): SearchResult[] {
    // FTS5 query syntax: wrap user input in quotes to avoid injection /
    // syntax errors. Multiple terms → AND via space-separated MATCH.
    const sanitized = query
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term.replace(/"/g, '""')}"*`)
      .join(' ');
    if (!sanitized) return [];
    try {
      const rows = this.db
        .prepare(
          `SELECT n.path as path,
                  snippet(notes_fts, 1, '«', '»', '…', 24) as snippet,
                  bm25(notes_fts) as score
           FROM notes_fts
           JOIN notes n ON n.path = notes_fts.path
           WHERE notes_fts MATCH ?
           ORDER BY score
           LIMIT ?`,
        )
        .all(sanitized, limit) as { path: string; snippet: string; score: number }[];
      // bm25 returns lower (more negative) = better. Negate so higher = better.
      return rows.map((r) => ({
        path: r.path,
        snippet: r.snippet,
        score: -r.score,
      }));
    } catch {
      // MATCH syntax error — fall back to LIKE.
      const rows = this.db
        .prepare(
          `SELECT path, substr(body_text, 1, 200) as snippet FROM notes
           WHERE body_text LIKE ? LIMIT ?`,
        )
        .all(`%${query}%`, limit) as unknown as { path: string; snippet: string }[];
      return rows.map((r) => ({ path: r.path, snippet: r.snippet, score: 0 }));
    }
  }

  /** Search by tag. */
  searchByTag(tag: string, limit: number = 50): SearchResult[] {
    const rows = this.db
      .prepare(
        `SELECT t.note_path as path, '' as snippet, 0 as score
         FROM tags t WHERE t.tag = ? LIMIT ?`,
      )
      .all(tag, limit) as unknown as { path: string; snippet: string; score: number }[];
    return rows.map((r) => ({ path: r.path, snippet: r.snippet, score: r.score }));
  }

  /** Search by a frontmatter key/value pair. */
  searchByFrontmatter(key: string, value: unknown, limit: number = 50): SearchResult[] {
    const valueJson = JSON.stringify(value);
    const rows = this.db
      .prepare(
        `SELECT note_path as path, '' as snippet, 0 as score
         FROM fm_kv WHERE key = ? AND value_json = ? LIMIT ?`,
      )
      .all(key, valueJson, limit) as unknown as { path: string; snippet: string; score: number }[];
    return rows.map((r) => ({ path: r.path, snippet: r.snippet, score: r.score }));
  }

  // ─────────────────────────────────────────────────────────────────────
  // v2: Maintenance
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Run `PRAGMA optimize` + `PRAGMA incremental_vacuum` to compact the
   * index and refresh query-planner statistics. Called by the Callimachus
   * agent on its daily STOCKTAKE heartbeat.
   *
   * @returns { optimized: boolean, vacuumed: boolean, durationMs: number }
   */
  optimize(): { optimized: boolean; vacuumed: boolean; durationMs: number } {
    const t0 = Date.now();
    let optimized = false;
    let vacuumed = false;
    try {
      this.db.pragma('optimize');
      optimized = true;
    } catch {
      // ignore — can fail on read-only DBs.
    }
    try {
      // incremental_vacuum removes pages freed by auto_vacuum=INCREMENTAL.
      this.db.pragma('incremental_vacuum(1000)');
      vacuumed = true;
    } catch {
      // ignore.
    }
    return { optimized, vacuumed, durationMs: Date.now() - t0 };
  }

  /**
   * Force a full `VACUUM` (rewrites the entire DB file). Use sparingly —
   * it blocks all other readers/writers. The Callimachus should call this
   * only after large bulk deletes (e.g., after PRUNE removes 100+ instincts).
   *
   * @returns { durationMs: number, pagesBefore: number, pagesAfter: number }
   */
  fullVacuum(): { durationMs: number; pagesBefore: number; pagesAfter: number } {
    const t0 = Date.now();
    const before = (this.db.prepare('PRAGMA page_count').get() as { page_count?: number })?.page_count ?? 0;
    this.db.exec('VACUUM');
    const after = (this.db.prepare('PRAGMA page_count').get() as { page_count?: number })?.page_count ?? 0;
    return { durationMs: Date.now() - t0, pagesBefore: before, pagesAfter: after };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Close
  // ─────────────────────────────────────────────────────────────────────

  close(): void {
    if (!this.open) return;
    this.open = false;
    for (const u of this.watcherUnsubs) u();
    this.watcherUnsubs = [];
    // v2: run PRAGMA optimize on close so the query planner has fresh stats
    // for the next session.
    try { this.db.pragma('optimize'); } catch { /* ignore */ }
    this.db.close();
  }
}
