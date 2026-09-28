/**
 * Olympus Vault Index — SQLite Schema
 * =====================================
 *
 * Schema definition for `~/.olympus/vault-index.db`. Managed by
 * `better-sqlite3` (synchronous, native). All timestamps are epoch
 * milliseconds. All paths are POSIX-style relative to vault root.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 1;

/** All CREATE statements, in dependency order. */
export const SCHEMA_SQL: string[] = [
  // Notes — one row per .md file.
  `CREATE TABLE IF NOT EXISTS notes (
    path           TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    dir            TEXT NOT NULL,
    size           INTEGER NOT NULL,
    modified       INTEGER NOT NULL,
    frontmatter    TEXT,
    title          TEXT,
    tags_json      TEXT NOT NULL DEFAULT '[]',
    links_json     TEXT NOT NULL DEFAULT '[]',
    tasks_json     TEXT NOT NULL DEFAULT '[]',
    body_text      TEXT,
    indexed_at     INTEGER NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_notes_dir ON notes(dir)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_name ON notes(name)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_modified ON notes(modified)`,

  // Frontmatter key-value index.
  `CREATE TABLE IF NOT EXISTS fm_kv (
    note_path   TEXT NOT NULL,
    key         TEXT NOT NULL,
    value_json  TEXT NOT NULL,
    PRIMARY KEY (note_path, key),
    FOREIGN KEY (note_path) REFERENCES notes(path) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fm_kv_key ON fm_kv(key)`,
  `CREATE INDEX IF NOT EXISTS idx_fm_kv_value ON fm_kv(key, value_json)`,

  // Tags (denormalized for fast tag queries).
  `CREATE TABLE IF NOT EXISTS tags (
    tag        TEXT NOT NULL,
    note_path  TEXT NOT NULL,
    PRIMARY KEY (tag, note_path),
    FOREIGN KEY (note_path) REFERENCES notes(path) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag)`,

  // Wikilinks (for backlink queries).
  `CREATE TABLE IF NOT EXISTS links (
    source_path   TEXT NOT NULL,
    target        TEXT NOT NULL,
    target_path   TEXT,
    line          INTEGER NOT NULL,
    PRIMARY KEY (source_path, target, line),
    FOREIGN KEY (source_path) REFERENCES notes(path) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_links_target ON links(target)`,
  `CREATE INDEX IF NOT EXISTS idx_links_target_path ON links(target_path)`,
  `CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_path)`,

  // Tasks (checkboxes).
  `CREATE TABLE IF NOT EXISTS tasks (
    note_path   TEXT NOT NULL,
    line        INTEGER NOT NULL,
    text        TEXT NOT NULL,
    status      TEXT NOT NULL,
    PRIMARY KEY (note_path, line),
    FOREIGN KEY (note_path) REFERENCES notes(path) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,

  // Full-text search over note bodies (FTS5).
  `CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    path,
    body_text,
    tokenize = 'porter unicode61'
  )`,

  // Indexing log (for debugging + crash recovery).
  `CREATE TABLE IF NOT EXISTS index_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event       TEXT NOT NULL,
    path        TEXT NOT NULL,
    ts          INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL
  )`,

  // Schema version (one row).
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

/** Apply all CREATE statements + set schema version. Idempotent. */
export function applySchema(db: Database.Database): void {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  for (const sql of SCHEMA_SQL) {
    db.exec(sql);
  }
  const insertVersion = db.prepare(
    'INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)',
  );
  insertVersion.run('schema_version', String(SCHEMA_VERSION));
}

/** Drop and recreate all tables (used by `vault_reindex`). Destructive. */
export function dropSchema(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS notes_fts;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS links;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS fm_kv;
    DROP TABLE IF EXISTS notes;
    DROP TABLE IF EXISTS index_log;
    DROP TABLE IF EXISTS schema_meta;
  `);
  applySchema(db);
}
