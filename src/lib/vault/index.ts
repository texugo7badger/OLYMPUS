/**
 * Olympus Vault Backend — Unified VaultAPI Facade (v2.0.0)
 * =================================================
 *
 * Single entry point for the MCP server, API routes, and CLIs. Wires
 * together:
 *
 * - `FsBackend` for storage
 * - `VaultIndex` for SQLite indexing + search
 * - `vault-query` for DQL
 * - `vault-template` for macros
 * - `vault-lint` for schema validation
 * - `vault-tasks` for task board (Tier 2 — v2)
 * - `vault-periodic` for daily/weekly summaries (Tier 2 — v2)
 * - `vault-sync` for git auto-commit/push (Tier 2 — v2)
 * - `vault-deeplink` for `olympus://` URI parsing (Tier 2 — v2)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import path from 'node:path';
import os from 'node:os';
import { FsBackend, type FsBackendOptions } from './fs-backend';
import { parseNote } from './parse';
import { mergeFrontmatter, parseFrontmatter, sortFrontmatterKeys } from './frontmatter';
import { getBacklinks, getBrokenLinks, getOutlinks, getOrphans, resolveWikilink } from './wikilinks';
import { searchByFrontmatter, searchByTag, searchNotes } from './search';
import { VaultIndex, type VaultIndexOptions } from '../vault-index/indexer';
import { runDql } from '../vault-query/executor';
import { applyMacro, listMacros } from '../vault-template/engine';
import { lintNote, lintVault } from '../vault-lint/runner';
import * as vaultTasks from '../vault-tasks';
import * as vaultPeriodic from '../vault-periodic';
import * as vaultSync from '../vault-sync';
import * as vaultDeeplink from '../vault-deeplink';
import * as vaultSemantic from '../vault-semantic';
import type {
  LintAllReport,
  LintReport,
  MacroContext,
  ParsedNote,
  QueryResult,
  SearchResult,
  TemplateApplyResult,
  VaultEntry,
  WriteOpts,
} from './types';

export interface VaultApiOptions {
  fs?: FsBackendOptions;
  index?: VaultIndexOptions;
  /** Skip indexer (useful for tests). Default: false. */
  noIndex?: boolean;
}

/**
 * The unified facade. Construct once per process; reuse for all calls.
 *
 * v2.0.0 additions:
 *   - `api.tasks` — task board query + write operations
 *   - `api.periodic` — daily/weekly summary generation
 *   - `api.sync` — git auto-commit/push
 *   - `api.deeplink` — `olympus://` URI parser/formatter
 */
export class VaultAPI {
  readonly backend: FsBackend;
  index: VaultIndex | null;
  private noIndex: boolean;
  /** v2: task board namespace. */
  readonly tasks: typeof vaultTasks;
  /** v2: periodic summaries namespace. */
  readonly periodic: typeof vaultPeriodic;
  /** v2: git sync namespace. */
  readonly sync: typeof vaultSync;
  /** v2: deep-link URI namespace. */
  readonly deeplink: typeof vaultDeeplink;
  /** v2: semantic search namespace (Tier 3 bonus). */
  readonly semantic: typeof vaultSemantic;

  constructor(opts: VaultApiOptions = {}) {
    this.backend = new FsBackend(opts.fs);
    this.noIndex = opts.noIndex ?? false;
    this.index = this.noIndex ? null : new VaultIndex(this.backend, opts.index);
    // v2: bind Tier 2 modules. `tasks` and `periodic` need an index + API
    // binding (they use module-level singletons to preserve the v1 stub
    // signatures). `sync` and `deeplink` are stateless.
    this.tasks = vaultTasks;
    this.periodic = vaultPeriodic;
    this.sync = vaultSync;
    this.deeplink = vaultDeeplink;
    this.semantic = vaultSemantic;
    vaultTasks.bindVaultIndex(this.index);
    vaultTasks.bindVaultApi(this);
    vaultPeriodic.bindVaultApi(this);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await this.backend.init();
    if (this.index) {
      try {
        await this.index.init();
        await this.index.startWatcher();
      } catch (e: any) {
        // Graceful degradation: if the SQLite index fails to initialize
        // (e.g. better-sqlite3 native module not built, DB locked, disk
        // full), fall back to no-index mode. The vault API still works
        // for file read/write/list — only semantic search is disabled.
        console.warn(`[vault] Index init failed, falling back to no-index mode: ${e.message}`);
        this.index = null;
        this.noIndex = true;
        vaultTasks.bindVaultIndex(null);
      }
    }
  }

  async close(): Promise<void> {
    if (this.index) await this.index.stopWatcher();
    await this.backend.close();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Reads
  // ─────────────────────────────────────────────────────────────────────

  async read(relPath: string): Promise<{ content: string; path: string; size: number }> {
    const buf = await this.backend.read(relPath);
    const content = buf.toString('utf-8');
    return { content, path: relPath, size: content.length };
  }

  async readIfExists(relPath: string): Promise<{ content: string; path: string; size: number } | null> {
    const buf = await this.backend.readIfExists(relPath);
    if (!buf) return null;
    const content = buf.toString('utf-8');
    return { content, path: relPath, size: content.length };
  }

  async list(directory: string): Promise<{ directory: string; items: VaultEntry[]; count: number }> {
    const items = await this.backend.list(directory);
    return { directory, items, count: items.length };
  }

  async stat(relPath: string): Promise<VaultEntry | null> {
    return this.backend.stat(relPath);
  }

  async parse(relPath: string): Promise<ParsedNote> {
    const buf = await this.backend.read(relPath);
    const content = buf.toString('utf-8');
    const entry = await this.backend.stat(relPath);
    return parseNote(relPath, content, buf.length, entry?.modified ?? new Date());
  }

  async getFrontmatter(relPath: string): Promise<Record<string, unknown>> {
    const text = await this.backend.readText(relPath);
    return parseFrontmatter(text).frontmatter;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Writes (linter runs after each write by default)
  // ─────────────────────────────────────────────────────────────────────

  async write(
    relPath: string,
    content: string,
    opts: WriteOpts = {},
  ): Promise<{ success: true; path: string; size: number }> {
    await this.backend.write(relPath, content, opts);
    return { success: true, path: relPath, size: content.length };
  }

  async append(
    relPath: string,
    content: string,
    opts: WriteOpts = {},
  ): Promise<{ success: true; path: string; appended: number }> {
    await this.backend.append(relPath, content, opts);
    return { success: true, path: relPath, appended: content.length };
  }

  async updateFrontmatter(
    relPath: string,
    updates: Record<string, unknown>,
    opts: WriteOpts = {},
  ): Promise<{ success: true; path: string }> {
    const text = await this.backend.readText(relPath);
    const next = mergeFrontmatter(text, updates);
    await this.backend.write(relPath, next, opts);
    return { success: true, path: relPath };
  }

  /**
   * Move/rename a file or directory. Used by Callimachus to archive
   * instincts (PRUNE phase) and promote instincts across stacks (EVOLVE phase).
   */
  async move(
    fromRelPath: string,
    toRelPath: string,
  ): Promise<{ success: true; from: string; to: string }> {
    await this.backend.move(fromRelPath, toRelPath);
    return { success: true, from: fromRelPath, to: toRelPath };
  }

  /**
   * Delete a file. Used by Callimachus to remove merged instinct
   * duplicates after compaction (COMPACT phase).
   * Acquires a lock first to coordinate with concurrent writers.
   */
  async delete(relPath: string): Promise<{ success: true; path: string }> {
    await this.backend.delete(relPath);
    return { success: true, path: relPath };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Search
  // ─────────────────────────────────────────────────────────────────────

  search(query: string, limit: number = 20): { results: SearchResult[]; count: number; query: string } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    const results = searchNotes(this.index, query, limit);
    return { results, count: results.length, query };
  }

  searchByTag(tag: string, limit: number = 50): { results: SearchResult[]; count: number; tag: string } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    const results = searchByTag(this.index, tag, limit);
    return { results, count: results.length, tag };
  }

  searchByFrontmatter(
    key: string,
    value: unknown,
    limit: number = 50,
  ): { results: SearchResult[]; count: number; key: string; value: unknown } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    const results = searchByFrontmatter(this.index, key, value, limit);
    return { results, count: results.length, key, value };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Links
  // ─────────────────────────────────────────────────────────────────────

  getBacklinks(notePath: string): { note: string; backlinks: { sourcePath: string; line: number; target: string }[]; count: number } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    const backlinks = getBacklinks(this.index, notePath);
    return { note: notePath, backlinks, count: backlinks.length };
  }

  getOutlinks(notePath: string): { note: string; outlinks: { target: string; targetPath: string | null; line: number }[]; count: number } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    const outlinks = getOutlinks(this.index, notePath);
    return { note: notePath, outlinks, count: outlinks.length };
  }

  getOrphans(): { orphans: string[]; count: number } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    const orphans = getOrphans(this.index);
    return { orphans, count: orphans.length };
  }

  getBrokenLinks(): { broken: { sourcePath: string; target: string; line: number }[]; count: number } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    const broken = getBrokenLinks(this.index);
    return { broken, count: broken.length };
  }

  getTags(): { tags: { tag: string; count: number }[]; total: number } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    return this.index.getTags();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Health
  // ─────────────────────────────────────────────────────────────────────

  health(): {
    total_notes: number;
    total_links: number;
    broken_links: number;
    orphan_notes: number;
    broken: { sourcePath: string; target: string; line: number }[];
    orphans: string[];
    health: 'healthy' | 'has_broken_links';
  } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    const total_notes = this.index.countNotes();
    const allLinks = this.index.getAllLinks();
    const broken = this.index.getBrokenLinks();
    const orphans = this.index.getOrphanNotes();
    return {
      total_notes,
      total_links: allLinks.length,
      broken_links: broken.length,
      orphan_notes: orphans.length,
      broken: broken.slice(0, 10),
      orphans: orphans.slice(0, 10),
      health: broken.length === 0 ? 'healthy' : 'has_broken_links',
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Query (DQL)
  // ─────────────────────────────────────────────────────────────────────

  query(dql: string, params: Record<string, unknown> = {}): QueryResult {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    return runDql(this.index, dql, params);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Template
  // ─────────────────────────────────────────────────────────────────────

  listMacros() {
    return listMacros();
  }

  async applyMacro(
    macroName: string,
    vars: Record<string, string>,
    opts: WriteOpts = {},
  ): Promise<TemplateApplyResult> {
    const ctx: MacroContext = {
      vars,
      god: vars.god || process.env.OLYMPUS_GOD,
      sessionId: vars.sessionId || process.env.OLYMPUS_SESSION_ID,
      planVersion: vars.planVersion || process.env.OLYMPUS_PLAN_VERSION,
      now: new Date().toISOString(),
      vaultRoot: this.backend.vaultRoot,
    };
    const result = await applyMacro(this.backend, macroName, ctx);
    // The macro writes the file itself via the backend.
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Lint
  // ─────────────────────────────────────────────────────────────────────

  async lint(relPath: string, autoFix: boolean = false): Promise<LintReport> {
    return lintNote(this.backend, relPath, autoFix);
  }

  async lintAll(dir?: string, autoFix: boolean = false): Promise<LintAllReport> {
    return lintVault(this.backend, dir, autoFix);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Index admin
  // ─────────────────────────────────────────────────────────────────────

  async reindex(): Promise<{ reindexed: number; durationMs: number }> {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    return this.index.reindexAll();
  }

  /** v2: Run PRAGMA optimize + incremental_vacuum. Callimachus calls on STOCKTAKE. */
  optimizeIndex(): { optimized: boolean; vacuumed: boolean; durationMs: number } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    return this.index.optimize();
  }

  /** v2: Force a full VACUUM. Use sparingly (blocks all readers/writers). */
  fullVacuumIndex(): { durationMs: number; pagesBefore: number; pagesAfter: number } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    return this.index.fullVacuum();
  }

  /** v2: Semantic search — find notes by meaning (TF-IDF + sqlite-vec KNN). */
  semanticSearch(query: string, limit: number = 10): { path: string; score: number }[] {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    return vaultSemantic.semanticSearch(this.index.db, query, limit);
  }

  /** v2: Rebuild the semantic index. Call after a full reindex or bulk import. */
  rebuildSemanticIndex(): { notes: number; dimension: number; durationMs: number } {
    if (!this.index) throw new Error('Index disabled (noIndex=true)');
    return vaultSemantic.rebuildSemanticIndex(this.index.db);
  }

  async sortFrontmatter(relPath: string): Promise<{ changed: boolean; path: string }> {
    const text = await this.backend.readText(relPath);
    const sorted = sortFrontmatterKeys(text);
    if (sorted === text) return { changed: false, path: relPath };
    await this.backend.write(relPath, sorted);
    return { changed: true, path: relPath };
  }
}

/**
 * Convenience factory. Construct, init, and return.
 * Caller is responsible for `close()`.
 */
export async function createVaultAPI(opts: VaultApiOptions = {}): Promise<VaultAPI> {
  const api = new VaultAPI(opts);
  await api.init();
  return api;
}

/** Resolve the default vault root from env / homedir. */
export function getDefaultVaultRoot(): string {
  return process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
}
