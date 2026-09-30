/**
 * Vault TTL / Pruning Policy — prevents unbounded growth of activity feed,
 * short-circuit log, and instinct archives. Runs on Callimachus heartbeat
 * and via `olympus vault prune`.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { getVaultRoot } from './vault-root';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaultPolicy {
  /** Max size of 06_Activity_Feed/live.jsonl in MB before rolling over. */
  maxActivityFeedMB: number;
  /** Max size of 05_Auto_Learning/shortcircuit-log.jsonl in MB before rolling. */
  maxShortCircuitLogMB: number;
  /** Max size of 05_Auto_Learning/vibrations/registry.jsonl in MB. */
  maxVibrationsMB: number;
  /** Max size of 07_Reviews/benchmarks/dispatches.jsonl in MB. */
  maxBenchmarkLogMB: number;
  /** Instincts older than this many days are archived to 09_Archive/. */
  instinctMaxAgeDays: number;
  /** Archived instincts older than this many days are deleted entirely. */
  archiveOlderThanDays: number;
  /** Run pruning on session.idle (Callimachus heartbeat). */
  autoPruneOnIdle: boolean;
  /** If true, log what would be pruned but don't delete anything. Default: true. */
  dryRun: boolean;
  /** Don't touch files newer than this many hours (prevents pruning in-flight work). */
  minFileAgeHours: number;
}

export const DEFAULT_VAULT_POLICY: VaultPolicy = {
  maxActivityFeedMB: 500,
  maxShortCircuitLogMB: 100,
  maxVibrationsMB: 200,
  maxBenchmarkLogMB: 50,
  instinctMaxAgeDays: 180,
  archiveOlderThanDays: 365,
  autoPruneOnIdle: true,
  dryRun: true, // dry-run by default; user opts into live pruning via Settings.
  minFileAgeHours: 24,
};

const POLICY_FILE = join(homedir(), '.olympus', 'vault-policy.json');

// ─── Config persistence ──────────────────────────────────────────────────────

export function loadVaultPolicy(): VaultPolicy {
  try {
    if (existsSync(POLICY_FILE)) {
      const raw = JSON.parse(readFileSync(POLICY_FILE, 'utf-8'));
      return { ...DEFAULT_VAULT_POLICY, ...raw };
    }
  } catch {}
  return { ...DEFAULT_VAULT_POLICY };
}

export function saveVaultPolicy(policy: VaultPolicy): void {
  try {
    mkdirSync(dirname(POLICY_FILE), { recursive: true });
    writeFileSync(POLICY_FILE, JSON.stringify(policy, null, 2), { mode: 0o600 });
  } catch (err: any) {
    console.error('[olympus:vault-policy] saveVaultPolicy failed:', err.message);
  }
}

// ─── Pruning ─────────────────────────────────────────────────────────────────

export interface PruneAction {
  type: 'roll-log' | 'archive-instinct' | 'delete-archive';
  path: string;
  reason: string;
  sizeBytes: number;
  /** ISO timestamp of the file's mtime (for age-based decisions). */
  mtime: string;
}

export interface PruneResult {
  policy: VaultPolicy;
  actions: PruneAction[];
  /** Bytes that would be freed (dry-run) or were freed (live). */
  totalBytesAffected: number;
  /** True if any actions were taken (or would be taken in dry-run). */
  hasActions: boolean;
  /** True if this was a dry-run (no files were actually modified). */
  wasDryRun: boolean;
  /** ISO timestamp of the prune run. */
  ranAt: string;
  /** Per-file errors (non-fatal — pruning continues on the next file). */
  errors: Array<{ path: string; error: string }>;
}

function vaultRoot(): string {
  return getVaultRoot();
}

function fileSizeMB(p: string): number {
  try {
    return statSync(p).size / (1024 * 1024);
  } catch {
    return 0;
  }
}

function fileMtime(p: string): Date {
  try {
    return statSync(p).mtime;
  } catch {
    return new Date(0);
  }
}

function isOlderThanDays(p: string, days: number): boolean {
  const mtime = fileMtime(p).getTime();
  if (mtime === 0) return false; // file doesn't exist or stat failed
  const ageMs = Date.now() - mtime;
  return ageMs > days * 24 * 60 * 60 * 1000;
}

function isNewerThanHours(p: string, hours: number): boolean {
  const mtime = fileMtime(p).getTime();
  if (mtime === 0) return false;
  const ageMs = Date.now() - mtime;
  return ageMs < hours * 60 * 60 * 1000;
}

/**
 * Roll a log file over: rename the current file to `<name>.<timestamp>.bak`
 * and let the application create a fresh one. The .bak file is left in place
 * (the user can delete it manually if they want to reclaim space immediately).
 *
 * In dry-run mode, this just records the action without renaming.
 */
function rollLogFile(filePath: string, reason: string, policy: VaultPolicy, actions: PruneAction[]): void {
  if (!existsSync(filePath)) return;
  if (isNewerThanHours(filePath, policy.minFileAgeHours)) return; // skip in-flight files
  const sizeBytes = statSync(filePath).size;
  const mtime = fileMtime(filePath).toISOString();
  const backupPath = `${filePath}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
  actions.push({
    type: 'roll-log',
    path: filePath,
    reason: `${reason} → rename to ${basename(backupPath)}`,
    sizeBytes,
    mtime,
  });
  if (!policy.dryRun) {
    try {
      renameSync(filePath, backupPath);
    } catch (err: any) {
      // Non-fatal — continue with other files.
    }
  }
}

/**
 * Run the pruning policy. Returns a PruneResult describing what was done
 * (or would be done in dry-run mode).
 *
 * Safe to call from the Callimachus heartbeat (session.idle) — it never
 * throws. All errors are captured in the `errors` array.
 */
export function runVaultPrune(policyOverride?: Partial<VaultPolicy>): PruneResult {
  const policy: VaultPolicy = { ...loadVaultPolicy(), ...policyOverride };
  const actions: PruneAction[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  const root = vaultRoot();

  // ─── 1. Roll oversized log files ─────────────────────────────────────────
  const logFiles: Array<{ path: string; maxMB: number; reason: string }> = [
    {
      path: join(root, '06_Activity_Feed', 'live.jsonl'),
      maxMB: policy.maxActivityFeedMB,
      reason: `activity feed exceeded ${policy.maxActivityFeedMB} MB cap`,
    },
    {
      path: join(root, '05_Auto_Learning', 'shortcircuit-log.jsonl'),
      maxMB: policy.maxShortCircuitLogMB,
      reason: `short-circuit log exceeded ${policy.maxShortCircuitLogMB} MB cap`,
    },
    {
      path: join(root, '05_Auto_Learning', 'vibrations', 'registry.jsonl'),
      maxMB: policy.maxVibrationsMB,
      reason: `vibrations registry exceeded ${policy.maxVibrationsMB} MB cap`,
    },
    {
      path: join(root, '07_Reviews', 'benchmarks', 'dispatches.jsonl'),
      maxMB: policy.maxBenchmarkLogMB,
      reason: `benchmark log exceeded ${policy.maxBenchmarkLogMB} MB cap`,
    },
  ];
  for (const { path: p, maxMB, reason } of logFiles) {
    try {
      if (existsSync(p) && fileSizeMB(p) > maxMB) {
        rollLogFile(p, reason, policy, actions);
      }
    } catch (err: any) {
      errors.push({ path: p, error: err.message });
    }
  }

  // ─── 2. Archive old instincts ────────────────────────────────────────────
  // Walk 05_Auto_Learning/instincts/<god>/{seed,empirical}/<instinct>.md and
  // move files older than instinctMaxAgeDays to 09_Archive/instincts/<god>/.
  const instinctsRoot = join(root, '05_Auto_Learning', 'instincts');
  const archiveRoot = join(root, '09_Archive', 'instincts');
  try {
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
            try {
              if (isOlderThanDays(filePath, policy.instinctMaxAgeDays) &&
                  !isNewerThanHours(filePath, policy.minFileAgeHours)) {
                const sizeBytes = statSync(filePath).size;
                const mtime = fileMtime(filePath).toISOString();
                actions.push({
                  type: 'archive-instinct',
                  path: filePath,
                  reason: `instinct older than ${policy.instinctMaxAgeDays} days → archive`,
                  sizeBytes,
                  mtime,
                });
                if (!policy.dryRun) {
                  const archiveSubDir = join(archiveRoot, god, subDir);
                  mkdirSync(archiveSubDir, { recursive: true });
                  renameSync(filePath, join(archiveSubDir, file));
                }
              }
            } catch (err: any) {
              errors.push({ path: filePath, error: err.message });
            }
          }
        }
      }
    }
  } catch (err: any) {
    errors.push({ path: instinctsRoot, error: err.message });
  }

  // ─── 3. Delete very old archives ─────────────────────────────────────────
  // Walk 09_Archive/instincts/ and delete files older than archiveOlderThanDays.
  try {
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
            try {
              if (isOlderThanDays(filePath, policy.archiveOlderThanDays) &&
                  !isNewerThanHours(filePath, policy.minFileAgeHours)) {
                const sizeBytes = statSync(filePath).size;
                const mtime = fileMtime(filePath).toISOString();
                actions.push({
                  type: 'delete-archive',
                  path: filePath,
                  reason: `archive older than ${policy.archiveOlderThanDays} days → delete`,
                  sizeBytes,
                  mtime,
                });
                if (!policy.dryRun) {
                  unlinkSync(filePath);
                }
              }
            } catch (err: any) {
              errors.push({ path: filePath, error: err.message });
            }
          }
        }
      }
    }
  } catch (err: any) {
    errors.push({ path: archiveRoot, error: err.message });
  }

  const totalBytesAffected = actions.reduce((n, a) => n + a.sizeBytes, 0);

  return {
    policy,
    actions,
    totalBytesAffected,
    hasActions: actions.length > 0,
    wasDryRun: policy.dryRun,
    ranAt: new Date().toISOString(),
    errors,
  };
}

// ─── Vault size inspection ───────────────────────────────────────────────────

export interface VaultSizeReport {
  totalBytes: number;
  totalMB: number;
  perDir: Array<{ path: string; bytes: number; mb: number; fileCount: number }>;
  oversizedFiles: Array<{ path: string; bytes: number; mb: number }>;
  policy: VaultPolicy;
  vaultRoot: string;
  generatedAt: string;
}

function dirSize(dir: string): { bytes: number; fileCount: number } {
  let bytes = 0;
  let fileCount = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = dirSize(full);
        bytes += sub.bytes;
        fileCount += sub.fileCount;
      } else if (entry.isFile()) {
        try {
          bytes += statSync(full).size;
          fileCount++;
        } catch {}
      }
    }
  } catch {}
  return { bytes, fileCount };
}

/**
 * Scan the vault + report per-directory sizes + files exceeding policy caps.
 * Used by `olympus doctor` + the Settings → Vault panel.
 */
export function getVaultSizeReport(): VaultSizeReport {
  const policy = loadVaultPolicy();
  const root = vaultRoot();
  const perDir: Array<{ path: string; bytes: number; mb: number; fileCount: number }> = [];
  const oversizedFiles: Array<{ path: string; bytes: number; mb: number }> = [];

  try {
    if (existsSync(root)) {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const sub = dirSize(join(root, entry.name));
          perDir.push({
            path: entry.name,
            bytes: sub.bytes,
            mb: Math.round((sub.bytes / (1024 * 1024)) * 100) / 100,
            fileCount: sub.fileCount,
          });
        }
      }
    }
  } catch {}

  // Check known log files against caps.
  const checks: Array<{ path: string; capMB: number }> = [
    { path: join(root, '06_Activity_Feed', 'live.jsonl'), capMB: policy.maxActivityFeedMB },
    { path: join(root, '05_Auto_Learning', 'shortcircuit-log.jsonl'), capMB: policy.maxShortCircuitLogMB },
    { path: join(root, '05_Auto_Learning', 'vibrations', 'registry.jsonl'), capMB: policy.maxVibrationsMB },
    { path: join(root, '07_Reviews', 'benchmarks', 'dispatches.jsonl'), capMB: policy.maxBenchmarkLogMB },
  ];
  for (const { path: p, capMB } of checks) {
    try {
      if (existsSync(p)) {
        const bytes = statSync(p).size;
        const mb = bytes / (1024 * 1024);
        if (mb > capMB * 0.8) { // flag at 80% of cap
          oversizedFiles.push({ path: p, bytes, mb: Math.round(mb * 100) / 100 });
        }
      }
    } catch {}
  }

  const totalBytes = perDir.reduce((n, d) => n + d.bytes, 0);

  return {
    totalBytes,
    totalMB: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
    perDir: perDir.sort((a, b) => b.bytes - a.bytes),
    oversizedFiles,
    policy,
    vaultRoot: root,
    generatedAt: new Date().toISOString(),
  };
}
