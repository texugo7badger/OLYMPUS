#!/usr/bin/env node
/**
 * olympus vault prune — run the vault pruning policy.
 *

 *
 * Self-contained Node script (no TypeScript deps) that mirrors the pruning
 * logic in src/lib/vault-policy.ts. Used by the `olympus vault prune` CLI
 * subcommand so users can preview/prune the vault from the command line
 * without starting the Electron app.
 *
 * Usage:
 *   node scripts/vault-prune.js                # dry-run preview (default)
 *   node scripts/vault-prune.js --live         # actually prune (no undo!)
 *   node scripts/vault-prune.js --live --quiet # live, no per-action log
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const QUIET = args.includes('--quiet');

const POLICY_FILE = join(homedir(), '.olympus', 'vault-policy.json');
const DEFAULT_POLICY = {
  maxActivityFeedMB: 500,
  maxShortCircuitLogMB: 100,
  maxVibrationsMB: 200,
  instinctMaxAgeDays: 180,
  archiveOlderThanDays: 365,
  autoPruneOnIdle: true,
  dryRun: true,
  minFileAgeHours: 24,
};

function log(msg) { if (!QUIET) console.log(`[olympus:vault] ${msg}`); }
function warn(msg) { console.warn(`[olympus:vault] ! ${msg}`); }
function ok(msg) { console.log(`[olympus:vault] ✓ ${msg}`); }
function err(msg) { console.error(`[olympus:vault] X ${msg}`); }

function loadPolicy() {
  try {
    if (existsSync(POLICY_FILE)) {
      const raw = JSON.parse(readFileSync(POLICY_FILE, 'utf-8'));
      return { ...DEFAULT_POLICY, ...raw };
    }
  } catch {}
  return { ...DEFAULT_POLICY };
}

function vaultRoot() {
  return process.env.OLYMPUS_VAULT_DIR || join(homedir(), 'OLYMPUS-VAULT');
}

function fileSizeMB(p) {
  try { return statSync(p).size / (1024 * 1024); } catch { return 0; }
}

function fileMtime(p) {
  try { return statSync(p).mtime; } catch { return new Date(0); }
}

function isOlderThanDays(p, days) {
  const mtime = fileMtime(p).getTime();
  if (mtime === 0) return false;
  return (Date.now() - mtime) > days * 24 * 60 * 60 * 1000;
}

function isNewerThanHours(p, hours) {
  const mtime = fileMtime(p).getTime();
  if (mtime === 0) return false;
  return (Date.now() - mtime) < hours * 60 * 60 * 1000;
}

function dirSize(dir) {
  let bytes = 0, fileCount = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = dirSize(full);
        bytes += sub.bytes; fileCount += sub.fileCount;
      } else if (entry.isFile()) {
        try { bytes += statSync(full).size; fileCount++; } catch {}
      }
    }
  } catch {}
  return { bytes, fileCount };
}

const policy = { ...loadPolicy(), dryRun: !LIVE };
const root = vaultRoot();
const actions = [];
const errors = [];

if (!existsSync(root)) {
  err(`Vault not found at ${root}`);
  process.exit(1);
}

log(`Vault: ${root}`);
log(`Mode: ${LIVE ? 'LIVE (files will be modified)' : 'DRY-RUN (preview only)'}`);
log('');

// ─── 1. Vault size summary ─────────────────────────────────────────────────
log('Per-directory sizes:');
const perDir = [];
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    const sub = dirSize(join(root, entry.name));
    perDir.push({ name: entry.name, ...sub });
    log(`  ${entry.name.padEnd(24)} ${(sub.bytes / (1024 * 1024)).toFixed(1).padStart(8)} MB  (${sub.fileCount} files)`);
  }
}
const totalBytes = perDir.reduce((n, d) => n + d.bytes, 0);
log(`  ${''.padEnd(24)} ${(totalBytes / (1024 * 1024)).toFixed(1).padStart(8)} MB  TOTAL`);
log('');

// ─── 2. Roll oversized log files ───────────────────────────────────────────
const logFiles = [
  { path: join(root, '06_Activity_Feed', 'live.jsonl'), maxMB: policy.maxActivityFeedMB, reason: `activity feed > ${policy.maxActivityFeedMB} MB` },
  { path: join(root, '05_Auto_Learning', 'shortcircuit-log.jsonl'), maxMB: policy.maxShortCircuitLogMB, reason: `short-circuit log > ${policy.maxShortCircuitLogMB} MB` },
  { path: join(root, '05_Auto_Learning', 'vibrations', 'registry.jsonl'), maxMB: policy.maxVibrationsMB, reason: `vibrations registry > ${policy.maxVibrationsMB} MB` },
];
for (const { path: p, maxMB, reason } of logFiles) {
  if (existsSync(p) && fileSizeMB(p) > maxMB && !isNewerThanHours(p, policy.minFileAgeHours)) {
    const sizeBytes = statSync(p).size;
    const mtime = fileMtime(p).toISOString();
    const backupPath = `${p}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
    actions.push({ type: 'roll-log', path: p, reason, sizeBytes, mtime, backupPath });
    if (LIVE) {
      try { renameSync(p, backupPath); } catch (e) { errors.push({ path: p, error: e.message }); }
    }
  }
}

// ─── 3. Archive old instincts ──────────────────────────────────────────────
const instinctsRoot = join(root, '05_Auto_Learning', 'instincts');
const archiveRoot = join(root, '09_Archive', 'instincts');
if (existsSync(instinctsRoot)) {
  for (const god of readdirSync(instinctsRoot)) {
    const godDir = join(instinctsRoot, god);
    let godStat;
    try { godStat = statSync(godDir); } catch { continue; }
    if (!godStat.isDirectory()) continue;
    for (const subDir of ['seed', 'empirical']) {
      const sub = join(godDir, subDir);
      if (!existsSync(sub)) continue;
      for (const file of readdirSync(sub)) {
        if (!file.endsWith('.md')) continue;
        const filePath = join(sub, file);
        if (isOlderThanDays(filePath, policy.instinctMaxAgeDays) &&
            !isNewerThanHours(filePath, policy.minFileAgeHours)) {
          try {
            const sizeBytes = statSync(filePath).size;
            const mtime = fileMtime(filePath).toISOString();
            actions.push({ type: 'archive-instinct', path: filePath, reason: `instinct > ${policy.instinctMaxAgeDays} days`, sizeBytes, mtime });
            if (LIVE) {
              const archiveSubDir = join(archiveRoot, god, subDir);
              mkdirSync(archiveSubDir, { recursive: true });
              renameSync(filePath, join(archiveSubDir, file));
            }
          } catch (e) { errors.push({ path: filePath, error: e.message }); }
        }
      }
    }
  }
}

// ─── 4. Delete very old archives ───────────────────────────────────────────
if (existsSync(archiveRoot)) {
  for (const god of readdirSync(archiveRoot)) {
    const godDir = join(archiveRoot, god);
    let godStat;
    try { godStat = statSync(godDir); } catch { continue; }
    if (!godStat.isDirectory()) continue;
    for (const subDir of ['seed', 'empirical']) {
      const sub = join(godDir, subDir);
      if (!existsSync(sub)) continue;
      for (const file of readdirSync(sub)) {
        const filePath = join(sub, file);
        if (isOlderThanDays(filePath, policy.archiveOlderThanDays) &&
            !isNewerThanHours(filePath, policy.minFileAgeHours)) {
          try {
            const sizeBytes = statSync(filePath).size;
            const mtime = fileMtime(filePath).toISOString();
            actions.push({ type: 'delete-archive', path: filePath, reason: `archive > ${policy.archiveOlderThanDays} days`, sizeBytes, mtime });
            if (LIVE) { unlinkSync(filePath); }
          } catch (e) { errors.push({ path: filePath, error: e.message }); }
        }
      }
    }
  }
}

// ─── 5. Report ─────────────────────────────────────────────────────────────
if (!QUIET) {
  log('Actions:');
  if (actions.length === 0) {
    log('  (none — vault is within policy)');
  } else {
    for (const a of actions) {
      const mb = (a.sizeBytes / (1024 * 1024)).toFixed(2);
      log(`  [${a.type.padEnd(18)}] ${mb.padStart(8)} MB  ${a.path.replace(root, '~')}`);
      log(`                       ${a.reason}`);
    }
  }
  log('');
}

const totalBytesAffected = actions.reduce((n, a) => n + a.sizeBytes, 0);
const totalMB = totalBytesAffected / (1024 * 1024);

if (actions.length === 0) {
  ok(`No actions needed. Vault is within policy.`);
} else if (LIVE) {
  ok(`Pruned ${actions.length} item(s), freed ${totalMB.toFixed(1)} MB.`);
} else {
  ok(`Dry-run: ${actions.length} action(s) would be taken, ${totalMB.toFixed(1)} MB affected.`);
  log(`  Re-run with --live to actually prune.`);
}

if (errors.length > 0) {
  warn(`${errors.length} error(s):`);
  for (const e of errors.slice(0, 5)) warn(`  ${e.path}: ${e.error}`);
  process.exit(1);
}
process.exit(0);
