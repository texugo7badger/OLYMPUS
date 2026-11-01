/**
 * destructive-guard.ts — v0.0.30 (#C6/#H9).
 *
 * THE SPECIMEN (AIME, 2026-10-31 23:01:10Z): the live database went from
 * 226 works / 191 relations / 3 users to 0 / 0 / 1 stray while the
 * `g2-profile` hop ran. The warm hop lane auto-approved every permission
 * (`response: 'once'`) and the walker had no backup preflight. The product
 * could not tell the difference between a schema push and a data reset.
 *
 * This module is the deterministic layer:
 *   - classify a command/prompt as destructive (named reason);
 *   - back up every project database before a destructive hop;
 *   - refuse the backup-less destructive hop with a typed error.
 *
 * It is intentionally conservative: a false positive costs a cheap copy; a
 * false negative costs the user's data.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';

export interface DestructiveVerdict {
  destructive: boolean;
  reason?: string;
  pattern?: string;
}

/** The patterns that can destroy persistent state in a project lane. */
const PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b/i, reason: 'recursive force delete' },
  { re: /\bgit\s+reset\s+--hard\b/i, reason: 'discards uncommitted work' },
  { re: /\bgit\s+clean\s+-[a-zA-Z]*[fdx]/i, reason: 'deletes untracked/ignored files' },
  { re: /\bgit\s+push\s+--force\b/i, reason: 'rewrites remote history' },
  { re: /\bprisma\s+(migrate\s+reset|db\s+push)\b/i, reason: 'Prisma reset/schema push can recreate the database' },
  { re: /\bdb:(reset|seed:force)\b/i, reason: 'project database reset/force seed' },
  { re: /\bdropdb\b|\bdrop\s+database\b|\bdrop\s+table\b/i, reason: 'drops a database/table' },
  { re: /\btruncate\s+table\b/i, reason: 'truncates a table' },
  { re: /\bdelete\s+from\s+(?!.*\bwhere\b)/i, reason: 'DELETE without WHERE' },
  { re: /\bupdate\s+\w+\s+set\s+(?!.*\bwhere\b)/i, reason: 'UPDATE without WHERE' },
  { re: /\bmkfs(\.|\s)/i, reason: 'formats a filesystem' },
  { re: /\bdd\s+if=/i, reason: 'raw device write' },
  { re: /:\(\)\s*\{\s*:\|:&\s*\};:/, reason: 'fork bomb' },
];

/** Classify a shell command or a hop prompt. */
export function classifyDestructiveCommand(command: string): DestructiveVerdict {
  const text = typeof command === 'string' ? command : '';
  if (!text.trim()) return { destructive: false };
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) return { destructive: true, reason: p.reason, pattern: m[0] };
  }
  return { destructive: false };
}

const DB_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.olympus-backups', 'dist', 'build']);

/** Find project database files under a lane (bounded depth). */
export function findProjectDatabases(laneRoot: string, maxDepth = 4): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(path.join(dir, e.name), depth + 1);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (DB_EXTENSIONS.has(ext) || e.name.endsWith('-journal')) out.push(path.join(dir, e.name));
      }
    }
  };
  walk(laneRoot, 0);
  return out;
}

export interface DatabaseBackupResult {
  ok: boolean;
  dir: string | null;
  files: string[];
  error?: string;
}

/**
 * Copy every project database into `.olympus-backups/<iso>/`, preserving the
 * relative path. Returns `ok:true` with an empty list when the lane has no
 * database (nothing to protect).
 */
export function backupProjectDatabases(laneRoot: string, now = new Date()): DatabaseBackupResult {
  try {
    const files = findProjectDatabases(laneRoot);
    if (files.length === 0) return { ok: true, dir: null, files: [] };
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const dir = path.join(laneRoot, '.olympus-backups', stamp);
    fs.mkdirSync(dir, { recursive: true });
    const copied: string[] = [];
    for (const file of files) {
      const rel = path.relative(laneRoot, file);
      const dst = path.join(dir, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(file, dst);
      copied.push(rel);
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
      ts: now.toISOString(),
      laneRoot,
      files: copied,
    }, null, 2), 'utf-8');
    return { ok: true, dir, files: copied };
  } catch (e: any) {
    return { ok: false, dir: null, files: [], error: e?.message || String(e) };
  }
}

/**
 * The walker preflight: if the hop's prompt/checks look destructive and the
 * lane has a database, take a backup. A backup failure refuses the hop.
 */
export function backupBeforeDestructiveHop(
  laneRoot: string,
  hop: { id?: string; prompt?: string; verify?: unknown },
): { needed: boolean; verdict: DestructiveVerdict; backup: DatabaseBackupResult | null; error?: string } {
  const text = [hop.prompt ?? '', JSON.stringify(hop.verify ?? {})].join('\n');
  const verdict = classifyDestructiveCommand(text);
  if (!verdict.destructive) return { needed: false, verdict, backup: null };
  const dbs = findProjectDatabases(laneRoot);
  if (dbs.length === 0) return { needed: true, verdict, backup: { ok: true, dir: null, files: [] } };
  const backup = backupProjectDatabases(laneRoot);
  if (!backup.ok) {
    return {
      needed: true,
      verdict,
      backup,
      error: `destructive hop '${hop.id ?? '?'}' refused: database backup failed (${backup.error ?? 'unknown'})`,
    };
  }
  return { needed: true, verdict, backup };
}
