#!/usr/bin/env node
/**
 * file-lock-guard.js — simple file-based mutex for Olympus vault writes.
 *
 * Used by:
 *   - src/lib/vault/fs-backend.ts (per-file locks on vault writes)
 *   - src/lib/vault-sync/git.ts (vault-wide git lock during commit/push)
 *
 * Usage:
 *   node file-lock-guard.js acquire <absPath> [god]   → { acquired: true|false, token }
 *   node file-lock-guard.js release <absPath> [token] → { released: true|false }
 *
 * Lock files live at <absPath>.olympus-lock with JSON content:
 *   { pid, god, ts, token }
 *
 * Locks auto-expire after 30s (a held lock older than 30s is considered
 * stale and can be stolen). This protects against crashed processes
 * leaving dangling locks.
 *
 * Exit codes:
 *   0 — success (lock acquired/released, JSON on stdout)
 *   1 — failure (could not acquire/release, JSON error on stdout)
 *   2 — invalid usage
 *
 * License: MIT
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const STALE_MS = 30_000; // 30 seconds

function main() {
  const [cmd, absPath, godOrToken] = process.argv.slice(2);

  if (!cmd || !absPath) {
    process.stderr.write('Usage: file-lock-guard.js <acquire|release> <absPath> [god|token]\n');
    process.exit(2);
  }

  if (cmd === 'acquire') {
    const god = godOrToken || 'system';
    const result = acquire(absPath, god);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.acquired ? 0 : 1);
  }

  if (cmd === 'release') {
    const token = godOrToken;
    const result = release(absPath, token);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.released ? 0 : 1);
  }

  process.stderr.write('Unknown command: ' + cmd + '\n');
  process.exit(2);
}

function lockPath(absPath) {
  // Lock file sits next to the target file (or dir) with .olympus-lock suffix.
  return absPath + '.olympus-lock';
}

function readLock(lp) {
  try {
    const raw = fs.readFileSync(lp, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLock(lp, data) {
  try {
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    fs.writeFileSync(lp, JSON.stringify(data), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

function removeLock(lp) {
  try {
    fs.unlinkSync(lp);
    return true;
  } catch {
    return false;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isStale(lock) {
  if (!lock || typeof lock.ts !== 'number') return true;
  if (Date.now() - lock.ts > STALE_MS) return true;
  // If the holding process is dead, the lock is stale.
  if (typeof lock.pid === 'number' && !isProcessAlive(lock.pid)) return true;
  return false;
}

function acquire(absPath, god) {
  const lp = lockPath(absPath);
  const existing = readLock(lp);

  if (existing && !isStale(existing)) {
    return { acquired: false, reason: 'held', holder: existing };
  }

  // Steal or fresh acquire.
  // Use process.ppid (the PARENT pid, e.g. the Next.js server) so the lock
  // stays valid as long as the caller is alive. The child process
  // (file-lock-guard.cjs itself) exits immediately after writing the lock,
  // so process.pid would always look "dead" to the next caller.
  const token = crypto.randomBytes(8).toString('hex');
  const lock = {
    pid: process.ppid,
    god,
    ts: Date.now(),
    token,
    host: os.hostname(),
  };

  if (!writeLock(lp, lock)) {
    return { acquired: false, reason: 'write-failed' };
  }

  return { acquired: true, token };
}

function release(absPath, token) {
  const lp = lockPath(absPath);
  const existing = readLock(lp);

  if (!existing) {
    return { released: true, reason: 'no-lock' };
  }

  // Token must match, OR the lock must be stale (then anyone can release).
  if (existing.token !== token && !isStale(existing)) {
    return { released: false, reason: 'token-mismatch', holder: existing };
  }

  removeLock(lp);
  return { released: true };
}

main();
