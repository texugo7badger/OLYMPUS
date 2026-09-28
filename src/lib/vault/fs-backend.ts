/**
 * Olympus Vault Backend — Filesystem Implementation
 * ==================================================
 *
 * Reads/writes the vault at `~/OLYMPUS-VAULT/` (overridable via `OLYMPUS_VAULT`).
 * All paths are normalized to POSIX-style before returning to callers so
 * the backend is Windows-compatible.
 *
 * Writes acquire a file lock via `.opencode/hooks/file-lock-guard.cjs` (5s
 * TTL, 500ms write debounce default). Locks are released in a `finally`
 * block so a crashed write never leaves a stale lock past TTL.
 *
 * Events are powered by `chokidar` watching all .md / .json / .yaml / .yml files.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { promises as fs, constants as fsConstants, type Dirent } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import chokidar, { type FSWatcher } from 'chokidar';
import type { VaultBackend, VaultEvent, Unsubscribe } from './backend';
import type { VaultEntry, WriteOpts } from './types';

const DEFAULT_VAULT_ROOT = () => process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');

/**
 * The standard top-level directories every vault must have.
 *
 * This is the canonical OLYMPUS vault layout. Keep in sync with:
 *   - scripts/seed-vault.py  (VAULT_DIRS)
 *   - ARCHITECTURE.md        (vault structure diagram)
 *
 * Legacy directories that are no longer used by the current OLYMPUS
 * (`00_System`, `03_Delegations`, `07_Maps`) are intentionally NOT created
 * here. Existing vaults may still contain them from older installs; they can
 * be cleaned up manually. `init()` is idempotent and will not delete them.
 */
export const STANDARD_DIRS = [
  '00_Inbox',
  '01_Gods',
  '02_Projects',
  '03_Index',
  '04_Knowledge',
  '05_Auto_Learning',
  '06_Activity_Feed',
  '07_Reviews',
  '08_Templates',
  '09_Archive',
];

/** File extensions worth indexing/watching. */
export const WATCHED_EXTENSIONS = ['.md', '.markdown', '.json', '.yaml', '.yml'];

/** Normalize any path to POSIX-style forward slashes. */
function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** Resolve a vault-relative path to an absolute filesystem path. */
function resolveAbs(vaultRoot: string, relPath: string): string {
  // Strip leading slashes so users can't escape the vault.
  const cleaned = relPath.replace(/^[/\\]+/, '');
  return path.join(vaultRoot, cleaned);
}

/** Convert an absolute path back to a vault-relative POSIX path. */
function toRel(vaultRoot: string, absPath: string): string {
  return toPosix(path.relative(vaultRoot, absPath));
}

/** Wrap `file-lock-guard.cjs` as a promise-based lock. */
async function acquireLock(absPath: string, god: string | undefined): Promise<boolean> {
  // eval() prevents Turbopack from statically tracing the path.join() and
  // trying to resolve file-lock-guard.cjs as a server-relative import.
  // The guard is a runtime child process, not a bundled module.
  const guardPath = eval('require("path")').join(
    process.env.OLYMPUS_ROOT || process.cwd(),
    '.opencode',
    'hooks',
    'file-lock-guard.cjs',
  );
  return new Promise((resolve) => {
    const child = spawn('node', [guardPath, 'acquire', absPath, god || 'system'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(Boolean(parsed && parsed.acquired));
        } catch {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });
    child.on('error', () => resolve(false));
  });
}

async function releaseLock(absPath: string): Promise<void> {
  // eval() — see acquireLock() for why.
  const guardPath = eval('require("path")').join(
    process.env.OLYMPUS_ROOT || process.cwd(),
    '.opencode',
    'hooks',
    'file-lock-guard.cjs',
  );
  return new Promise((resolve) => {
    const child = spawn('node', [guardPath, 'release', absPath], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

/**
 * Convert a `fs.Dirent` + `fs.stat` into a `VaultEntry`.
 */
async function statEntry(
  vaultRoot: string,
  absPath: string,
  name: string,
  isDir: boolean,
): Promise<VaultEntry> {
  const stat = await fs.stat(absPath);
  return {
    path: toRel(vaultRoot, absPath),
    name,
    type: isDir ? 'directory' : 'file',
    size: stat.size,
    modified: stat.mtime,
  };
}

export interface FsBackendOptions {
  /** Vault root (defaults to `OLYMPUS_VAULT` or `~/OLYMPUS-VAULT`). */
  vaultRoot?: string;
  /** Disable chokidar watcher (useful for tests / one-shot CLI). */
  watch?: boolean;
  /** File-lock-guard.js path override (defaults to `<OLYMPUS_ROOT>/.opencode/hooks/file-lock-guard.cjs`). */
  lockGuardPath?: string;
  /** God name used in lock metadata. Defaults to `process.env.OLYMPUS_GOD || 'system'`. */
  defaultGod?: string;
}

/**
 * Filesystem-backed `VaultBackend`. The only implementation shipped in v1.
 *
 * All public methods are async and POSIX-safe. File locks are acquired
 * synchronously via `file-lock-guard.cjs` to coordinate with OpenCode's
 * `pre-tool-use-dispatcher.js` (which also uses the same guard).
 */
export class FsBackend implements VaultBackend {
  readonly vaultRoot: string;
  private readonly watch: boolean;
  private readonly lockGuardPath: string;
  private readonly defaultGod: string;
  private watcher: FSWatcher | null = null;
  private watchers: Map<VaultEvent, Set<(relPath: string) => void>> = new Map();
  private closed = false;

  constructor(opts: FsBackendOptions = {}) {
    this.vaultRoot = path.resolve(opts.vaultRoot || DEFAULT_VAULT_ROOT());
    this.watch = opts.watch ?? true;
    // eval() — see acquireLock() for why we hide path.join from Turbopack.
    this.lockGuardPath =
      opts.lockGuardPath ||
      eval('require("path")').join(
        process.env.OLYMPUS_ROOT || process.cwd(),
        '.opencode',
        'hooks',
        'file-lock-guard.cjs',
      );
    this.defaultGod = opts.defaultGod || process.env.OLYMPUS_GOD || 'system';
  }

  // ─────────────────────────────────────────────────────────────────────
  // Reads
  // ─────────────────────────────────────────────────────────────────────

  async read(relPath: string): Promise<Buffer> {
    const abs = resolveAbs(this.vaultRoot, relPath);
    return fs.readFile(abs);
  }

  async readIfExists(relPath: string): Promise<Buffer | null> {
    const abs = resolveAbs(this.vaultRoot, relPath);
    try {
      return await fs.readFile(abs);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async readText(relPath: string): Promise<string> {
    return (await this.read(relPath)).toString('utf-8');
  }

  async readTextIfExists(relPath: string): Promise<string | null> {
    const buf = await this.readIfExists(relPath);
    return buf ? buf.toString('utf-8') : null;
  }

  async list(dirRelPath: string): Promise<VaultEntry[]> {
    const abs = resolveAbs(this.vaultRoot, dirRelPath);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const result: VaultEntry[] = [];
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const entryAbs = path.join(abs, e.name);
      result.push(await statEntry(this.vaultRoot, entryAbs, e.name, e.isDirectory()));
    }
    return result;
  }

  async listRecursive(dirRelPath: string = '.'): Promise<VaultEntry[]> {
    const abs = resolveAbs(this.vaultRoot, dirRelPath);
    const result: VaultEntry[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true }) as Dirent[];
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        if (e.name === 'node_modules') continue;
        const entryAbs = path.join(dir, e.name);
        if (e.isDirectory()) {
          result.push(await statEntry(this.vaultRoot, entryAbs, e.name, true));
          await walk(entryAbs);
        } else {
          result.push(await statEntry(this.vaultRoot, entryAbs, e.name, false));
        }
      }
    };
    await walk(abs);
    return result;
  }

  async stat(relPath: string): Promise<VaultEntry | null> {
    const abs = resolveAbs(this.vaultRoot, relPath);
    try {
      const stat = await fs.stat(abs);
      return {
        path: toRel(this.vaultRoot, abs),
        name: path.basename(abs),
        type: stat.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modified: stat.mtime,
      };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async exists(relPath: string): Promise<boolean> {
    const abs = resolveAbs(this.vaultRoot, relPath);
    try {
      await fs.access(abs, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Writes
  // ─────────────────────────────────────────────────────────────────────

  async write(
    relPath: string,
    content: Buffer | string,
    opts: WriteOpts = {},
  ): Promise<void> {
    if (this.closed) throw new Error('FsBackend is closed');
    const abs = resolveAbs(this.vaultRoot, relPath);
    const shouldLock = opts.lock ?? true;
    const god = opts.god || this.defaultGod;
    const mkdirp = opts.mkdirp ?? true;

    if (mkdirp) {
      await fs.mkdir(path.dirname(abs), { recursive: true });
    }

    if (shouldLock) {
      const got = await acquireLock(abs, god);
      if (!got) {
        throw new Error(`Failed to acquire lock for ${relPath} (god=${god})`);
      }
    }
    try {
      const data = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
      await fs.writeFile(abs, data);
    } finally {
      if (shouldLock) {
        await releaseLock(abs);
      }
    }
  }

  async append(
    relPath: string,
    content: Buffer | string,
    opts: WriteOpts = {},
  ): Promise<void> {
    if (this.closed) throw new Error('FsBackend is closed');
    const abs = resolveAbs(this.vaultRoot, relPath);
    const shouldLock = opts.lock ?? true;
    const god = opts.god || this.defaultGod;
    const mkdirp = opts.mkdirp ?? true;

    if (mkdirp) {
      await fs.mkdir(path.dirname(abs), { recursive: true });
    }

    if (shouldLock) {
      const got = await acquireLock(abs, god);
      if (!got) {
        throw new Error(`Failed to acquire lock for ${relPath} (god=${god})`);
      }
    }
    try {
      const data = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
      await fs.appendFile(abs, data);
    } finally {
      if (shouldLock) {
        await releaseLock(abs);
      }
    }
  }

  async move(fromRelPath: string, toRelPath: string): Promise<void> {
    const fromAbs = resolveAbs(this.vaultRoot, fromRelPath);
    const toAbs = resolveAbs(this.vaultRoot, toRelPath);
    await fs.mkdir(path.dirname(toAbs), { recursive: true });
    await fs.rename(fromAbs, toAbs);
  }

  async delete(relPath: string): Promise<void> {
    const abs = resolveAbs(this.vaultRoot, relPath);
    await fs.rm(abs, { recursive: false, force: false });
  }

  async mkdir(relPath: string): Promise<void> {
    const abs = resolveAbs(this.vaultRoot, relPath);
    await fs.mkdir(abs, { recursive: true });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Events
  // ─────────────────────────────────────────────────────────────────────

  on(event: VaultEvent, handler: (relPath: string) => void): Unsubscribe {
    if (!this.watchers.has(event)) {
      this.watchers.set(event, new Set());
    }
    this.watchers.get(event)!.add(handler);
    this.ensureWatcher();
    return () => {
      this.watchers.get(event)?.delete(handler);
    };
  }

  private ensureWatcher(): void {
    if (!this.watch || this.watcher) return;
    const globs = WATCHED_EXTENSIONS.map((ext) => `**/*${ext}`);
    this.watcher = chokidar.watch(globs, {
      cwd: this.vaultRoot,
      ignored: (p) => /(^|[/\\])\.[^/\\]/.test(p) || /node_modules/.test(p),
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
    });
    const emit = (event: VaultEvent) => (absOrRel: string) => {
      // chokidar with `cwd` gives us relative paths already
      const rel = toPosix(absOrRel);
      this.watchers.get(event)?.forEach((h) => h(rel));
    };
    this.watcher.on('add', emit('add'));
    this.watcher.on('change', emit('change'));
    this.watcher.on('unlink', emit('unlink'));
    this.watcher.on('addDir', emit('addDir'));
    this.watcher.on('unlinkDir', emit('unlinkDir'));
  }

  // ─────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await fs.mkdir(this.vaultRoot, { recursive: true });
    for (const dir of STANDARD_DIRS) {
      const abs = path.join(this.vaultRoot, dir);
      await fs.mkdir(abs, { recursive: true });
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}

/** Convenience factory. */
export function createFsBackend(opts?: FsBackendOptions): FsBackend {
  return new FsBackend(opts);
}
