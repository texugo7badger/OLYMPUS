/**
 * Olympus Vault Backend — Pluggable Storage Interface
 * ====================================================
 *
 * Define the storage contract on day 1. Ship only `FsBackend` in v1.
 * Document the contract clearly so an `S3Backend` or `PostgresBackend`
 * can slot in later for SaaS without changing call sites.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { VaultEntry, WriteOpts } from './types';

/** Filesystem-style events emitted by the backend. */
export type VaultEvent = 'change' | 'add' | 'unlink' | 'addDir' | 'unlinkDir';

/** Unsubscribe function returned by `on()`. */
export type Unsubscribe = () => void;

/**
 * Pluggable vault storage. Implementations MUST be safe to call from a
 * single Node.js process; concurrent cross-process writes are coordinated
 * through `file-lock-guard.js` (see `FsBackend`).
 */
export interface VaultBackend {
  // ─────────────────────────────────────────────────────────────────────
  // Reads
  // ─────────────────────────────────────────────────────────────────────

  /** Read a file as a Buffer. Throws if the file does not exist. */
  read(relPath: string): Promise<Buffer>;

  /** Read a file as a Buffer, or return null if it does not exist. */
  readIfExists(relPath: string): Promise<Buffer | null>;

  /** Read a file as a UTF-8 string. Throws if the file does not exist. */
  readText(relPath: string): Promise<string>;

  /** Read a file as a UTF-8 string, or return null if it does not exist. */
  readTextIfExists(relPath: string): Promise<string | null>;

  /** Non-recursive listing of one directory. */
  list(dirRelPath: string): Promise<VaultEntry[]>;

  /** Recursive listing. Default: whole vault. */
  listRecursive(dirRelPath?: string): Promise<VaultEntry[]>;

  /** Stat a single file or directory. Returns null if missing. */
  stat(relPath: string): Promise<VaultEntry | null>;

  /** True if the file or directory exists. */
  exists(relPath: string): Promise<boolean>;

  // ─────────────────────────────────────────────────────────────────────
  // Writes (must respect file-lock-guard.js when `opts.lock !== false`)
  // ─────────────────────────────────────────────────────────────────────

  /** Write (overwrite) a file. Acquires a lock by default. */
  write(relPath: string, content: Buffer | string, opts?: WriteOpts): Promise<void>;

  /** Append content to a file (creates if missing). Acquires a lock by default. */
  append(relPath: string, content: Buffer | string, opts?: WriteOpts): Promise<void>;

  /** Move/rename a file or directory. */
  move(fromRelPath: string, toRelPath: string): Promise<void>;

  /** Delete a file. */
  delete(relPath: string): Promise<void>;

  /** Create a directory (recursive). */
  mkdir(relPath: string): Promise<void>;

  // ─────────────────────────────────────────────────────────────────────
  // Events
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Subscribe to a filesystem event. Returns an unsubscribe function.
   * The handler receives a POSIX-style relative path.
   */
  on(event: VaultEvent, handler: (relPath: string) => void): Unsubscribe;

  // ─────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────

  /** Initialize: create the vault root + standard 9 top-level dirs if missing. */
  init(): Promise<void>;

  /** Close watchers, flush buffers. Safe to call multiple times. */
  close(): Promise<void>;
}
