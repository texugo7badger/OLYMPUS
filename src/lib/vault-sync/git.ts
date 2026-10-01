/**
 * Olympus Vault Sync — isomorphic-git Wrapper
 * ==============================================
 *
 * Wraps `isomorphic-git` (MIT) to provide commit / push / status / init
 * operations over the vault at `~/OLYMPUS-VAULT/`.
 *
 * Design notes:
 *   - All operations are vault-scoped — the git repo lives at the vault root.
 *   - `commit()` acquires a global vault lock via `file-lock-guard.cjs`
 *     before staging, so we never commit a half-written file.
 *   - Auth for `push()`:
 *       HTTPS → reads `OLYMPUS_VAULT_GIT_TOKEN` env (set as Bearer / Basic auth)
 *       SSH   → not supported by isomorphic-git (use HTTPS + token)
 *   - The scheduler runs `commit()` (no auto-push — push is explicit) every
 *     `OLYMPUS_VAULT_GIT_INTERVAL_MS` ms (default 300000 = 5 min).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { promises as fs, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getVaultRoot } from '../vault-root';
import type {
  CommitResult,
  InitResult,
  PushResult,
  StatusResult,
} from './types';

/** Resolve the canonical vault root. */
function vaultRoot(): string {
  return getVaultRoot();
}

/** Default commit identity (overridable via env). */
function gitAuthor() {
  return {
    name: process.env.OLYMPUS_VAULT_GIT_NAME || 'Olympus Vault Sync',
    email: process.env.OLYMPUS_VAULT_GIT_EMAIL || 'vault@olympus.local',
  };
}

/** Default branch (overridable via env). */
function gitBranch(): string {
  return process.env.OLYMPUS_VAULT_GIT_BRANCH || 'main';
}

/** Default remote URL (overridable via env, may be unset). */
function gitRemoteUrl(): string | null {
  return process.env.OLYMPUS_VAULT_GIT_REMOTE || null;
}

/** Auth callback for `isomorphic-git` push. */
function authCallback() {
  const token = process.env.OLYMPUS_VAULT_GIT_TOKEN;
  const username = process.env.OLYMPUS_VAULT_GIT_USERNAME || 'oauth2';
  if (!token) {
    // Return a dummy auth — push will fail with a clear error.
    return {
      onAuth: () => ({ username: 'none', password: '' }),
      onAuthFailure: () => ({ username: 'none', password: '' }),
      onAuthSuccess: () => undefined,
    };
  }
  return {
    onAuth: () => ({ username, password: token }),
    onAuthFailure: () => ({ username, password: token }),
    onAuthSuccess: () => undefined,
  };
}

/** Acquire a global vault-sync lock via file-lock-guard.cjs. */
async function acquireSyncLock(): Promise<boolean> {
  // eval() — see src/lib/vault/fs-backend.ts acquireLock() for why.
  const guardPath = eval('require("path")').join(
    process.env.OLYMPUS_ROOT || process.cwd(),
    '.opencode',
    'hooks',
    'file-lock-guard.cjs',
  );
  const sentinel = path.join(vaultRoot(), '.git', 'vault-sync.lock');
  return new Promise((resolve) => {
    const child = spawn('node', [guardPath, 'acquire', sentinel, 'vault-sync'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout?.on('data', (c) => { stdout += c.toString(); });
    child.on('close', (code) => {
      if (code !== 0) return resolve(false);
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(Boolean(parsed && parsed.acquired));
      } catch {
        resolve(false);
      }
    });
    child.on('error', () => resolve(false));
  });
}

async function releaseSyncLock(): Promise<void> {
  // eval() — see src/lib/vault/fs-backend.ts acquireLock() for why.
  const guardPath = eval('require("path")').join(
    process.env.OLYMPUS_ROOT || process.cwd(),
    '.opencode',
    'hooks',
    'file-lock-guard.cjs',
  );
  const sentinel = path.join(vaultRoot(), '.git', 'vault-sync.lock');
  return new Promise((resolve) => {
    const child = spawn('node', [guardPath, 'release', sentinel], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

/** Check if the vault has a `.git/` directory. */
export function isGitRepo(): boolean {
  const gitDir = path.join(vaultRoot(), '.git');
  return existsSync(gitDir) && statSync(gitDir).isDirectory();
}

/**
 * Initialize git in the vault root (if not already initialized).
 * Sets `user.name`, `user.email`, and optionally `origin` remote.
 *
 * @param remoteUrl Optional remote URL. If omitted, uses `OLYMPUS_VAULT_GIT_REMOTE` env.
 */
export async function init(remoteUrl?: string): Promise<InitResult> {
  const dir = vaultRoot();
  const remote = remoteUrl || gitRemoteUrl();

  // Ensure vault root exists.
  await fs.mkdir(dir, { recursive: true });

  if (isGitRepo()) {
    // Already initialized — just ensure config + remote are set.
    const author = gitAuthor();
    await git.setConfig({ fs, dir, path: 'user.name', value: author.name });
    await git.setConfig({ fs, dir, path: 'user.email', value: author.email });
    if (remote) {
      try {
        await git.deleteRemote({ fs, dir, remote: 'origin' });
      } catch {
        // remote didn't exist — fine.
      }
      await git.addRemote({ fs, dir, remote: 'origin', url: remote });
    }
    return { initialized: false, remote };
  }

  // Initialize.
  await git.init({ fs, dir, defaultBranch: gitBranch() });
  const author = gitAuthor();
  await git.setConfig({ fs, dir, path: 'user.name', value: author.name });
  await git.setConfig({ fs, dir, path: 'user.email', value: author.email });
  if (remote) {
    await git.addRemote({ fs, dir, remote: 'origin', url: remote });
  }

  // Create a `.gitignore` for common ignore patterns (node_modules, etc.).
  const gitignorePath = path.join(dir, '.gitignore');
  if (!existsSync(gitignorePath)) {
    await fs.writeFile(
      gitignorePath,
      [
        '# Auto-generated by Olympus Vault Sync',
        'node_modules/',
        '.DS_Store',
        '*.log',
        '.env',
        '',
      ].join('\n'),
    );
  }

  return { initialized: true, remote };
}

/**
 * Stage all changes (`.md`, `.json`, `.yaml`, `.yml` files) and commit.
 *
 * Skips the commit if the working tree is clean.
 *
 * @param message Commit message. Defaults to `vault: <ISO timestamp> auto-backup`.
 */
export async function commit(message?: string): Promise<CommitResult> {
  const t0 = Date.now();
  const dir = vaultRoot();
  const branch = gitBranch();

  if (!isGitRepo()) {
    throw new Error('vault-sync.commit: vault is not a git repo. Call init() first.');
  }

  // Check status first — skip if clean.
  const preStatus = await status();
  if (preStatus.clean) {
    return { sha: '', files: 0, durationMs: Date.now() - t0 };
  }

  // Acquire the global sync lock so we don't commit a half-written file.
  const got = await acquireSyncLock();
  if (!got) {
    throw new Error('vault-sync.commit: failed to acquire global sync lock (another writer is active).');
  }

  try {
    // Stage all tracked + untracked files of interest.
    // isomorphic-git's `add()` only stages one file at a time, so we
    // walk the status matrix and stage each changed/untracked file.
    const matrix = await git.statusMatrix({
      fs,
      dir,
      filter: (f) =>
        f.endsWith('.md') ||
        f.endsWith('.json') ||
        f.endsWith('.yaml') ||
        f.endsWith('.yml') ||
        f === '.gitignore',
    });
    // matrix rows: [filepath, HEAD status (0/1), WORKDIR status (0/1/2), STAGE status (0/1/2)]
    //   HEAD=1 means file is in HEAD; WORKDIR=2 means modified; STAGE=2 means staged.
    // We stage everything that's not already in sync.
    let filesStaged = 0;
    for (const [filepath, headStatus, workdirStatus, stageStatus] of matrix) {
      // If HEAD and WORKDIR match, nothing to do.
      if (headStatus === 1 && workdirStatus === 1) continue;
      // If workdirStatus === 0, file was deleted — stage the deletion.
      // If workdirStatus === 2, file was modified — stage it.
      // If headStatus === 0 && workdirStatus === 2, file is untracked — stage it.
      await git.add({ fs, dir, filepath });
      filesStaged++;
    }

    if (filesStaged === 0) {
      return { sha: '', files: 0, durationMs: Date.now() - t0 };
    }

    const author = gitAuthor();
    const commitSha = await git.commit({
      fs,
      dir,
      message: message || `vault: ${new Date().toISOString()} auto-backup`,
      author: { name: author.name, email: author.email },
    });

    return {
      sha: commitSha,
      files: filesStaged,
      durationMs: Date.now() - t0,
    };
  } finally {
    await releaseSyncLock();
  }
}

/**
 * Push commits to the configured remote.
 *
 * Requires `OLYMPUS_VAULT_GIT_TOKEN` env for HTTPS auth. If no remote is
 * configured, returns `{ ok: false, error }`.
 */
export async function push(): Promise<PushResult> {
  const dir = vaultRoot();
  const branch = gitBranch();

  if (!isGitRepo()) {
    return { ok: false, remote: '', error: 'vault is not a git repo. Call init() first.' };
  }

  // Read the remote URL from git config.
  let remoteUrl: string;
  try {
    remoteUrl = (await git.getConfig({ fs, dir, path: 'remote.origin.url' })) || '';
  } catch {
    remoteUrl = '';
  }
  if (!remoteUrl) {
    return {
      ok: false,
      remote: '',
      error: 'No remote configured. Set OLYMPUS_VAULT_GIT_REMOTE or call setRemote(url).',
    };
  }

  const token = process.env.OLYMPUS_VAULT_GIT_TOKEN;
  if (!token) {
    return {
      ok: false,
      remote: remoteUrl,
      error: 'No auth token. Set OLYMPUS_VAULT_GIT_TOKEN (HTTPS personal access token).',
    };
  }

  try {
    const auth = authCallback();
    const result = await git.push({
      fs,
      http,
      dir,
      remote: 'origin',
      ref: branch,
      force: false,
      ...auth,
    });
    // isomorphic-git returns { ok, refs } on success.
    const ok = !result || result.ok !== false;
    return { ok, remote: remoteUrl };
  } catch (err) {
    return { ok: false, remote: remoteUrl, error: (err as Error).message };
  }
}

/**
 * Get the current git status of the vault.
 *
 * Returns `{ staged, modified, untracked, clean }`. A file is "staged" if
 * it differs between HEAD and the index, "modified" if it differs between
 * the index and the working dir, and "untracked" if it's not in HEAD and
 * not in the index.
 */
export async function status(): Promise<StatusResult> {
  const dir = vaultRoot();

  if (!isGitRepo()) {
    return { staged: [], modified: [], untracked: [], clean: true };
  }

  const matrix = await git.statusMatrix({
    fs,
    dir,
    filter: (f) =>
      f.endsWith('.md') ||
      f.endsWith('.json') ||
      f.endsWith('.yaml') ||
      f.endsWith('.yml') ||
      f === '.gitignore',
  });

  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];

  for (const [filepath, headStatus, workdirStatus, stageStatus] of matrix) {
    // HEAD: 1 = exists in HEAD, 0 = not in HEAD
    // WORKDIR: 0 = deleted, 1 = same as HEAD, 2 = modified, undefined = untracked
    // STAGE: 0 = not staged, 1 = same as HEAD (or untracked), 2 = staged with changes

    if (headStatus === 0 && workdirStatus === 2 && stageStatus === 2) {
      // Newly added + staged.
      staged.push(filepath);
    } else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 2) {
      // Modified + staged.
      staged.push(filepath);
    } else if (headStatus === 1 && workdirStatus === 0) {
      // Deleted from working dir.
      if (stageStatus === 2) staged.push(filepath);
      else modified.push(filepath);
    } else if (headStatus === 1 && workdirStatus === 2 && stageStatus !== 2) {
      // Modified but not staged.
      modified.push(filepath);
    } else if (headStatus === 0 && workdirStatus === 2 && stageStatus !== 2) {
      // Untracked.
      untracked.push(filepath);
    }
    // Otherwise (head=1, workdir=1, stage=1) — no change.
  }

  return {
    staged,
    modified,
    untracked,
    clean: staged.length === 0 && modified.length === 0 && untracked.length === 0,
  };
}

/**
 * Set the remote URL for the vault repo.
 *
 * @param url The new remote URL (HTTPS or SSH).
 */
export async function setRemote(url: string): Promise<void> {
  const dir = vaultRoot();
  if (!isGitRepo()) {
    throw new Error('vault-sync.setRemote: vault is not a git repo. Call init() first.');
  }
  try {
    await git.deleteRemote({ fs, dir, remote: 'origin' });
  } catch {
    // remote didn't exist — fine.
  }
  await git.addRemote({ fs, dir, remote: 'origin', url });
}
