/**
 * quick-edit.ts — v0.0.91: the 60-second lane.
 *
 * A small change must not become a campaign. This module takes a mark (or a
 * one-line instruction), snapshots the project's source, runs ONE bounded
 * Athena turn that writes the patch directly, then verifies it with
 * typecheck + lint and keeps a backup for undo.
 *
 * Guardrails:
 *   - at most 3 files and 200 changed lines; beyond that, escalate to a hop;
 *   - no package.json / lockfile / schema / env / opencode.json changes;
 *   - any verification failure restores the snapshot (the user sees why);
 *   - the backup lives in /tmp/opencode/quick-edit-<slug>-<ts>/ and the
 *     manifest makes undo deterministic.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runGodTurn } from './god-run';

export const QUICK_EDIT_MAX_FILES = 3;
export const QUICK_EDIT_MAX_LINES = 200;

const SOURCE_ROOTS = ['src', 'app', 'pages', 'components', 'lib', 'styles', 'tests', 'test', 'prisma'];
const ROOT_FILES = [
  'package.json', 'tsconfig.json', 'tsconfig.base.json',
  'next.config.ts', 'next.config.js', 'next.config.mjs',
  'tailwind.config.ts', 'tailwind.config.js',
  'postcss.config.mjs', 'opencode.json',
];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'dist-electron', 'coverage', 'evidence', 'media', '.olympus']);

export interface QuickEditSnapshot {
  backupRoot: string;
  /** relative path → sha256 */
  files: Record<string, string>;
  /** absolute lane root */
  laneRoot: string;
  createdAt: string;
}

export interface QuickEditDiff {
  changed: string[];
  added: string[];
  deleted: string[];
  changedLines: number;
}

export interface QuickEditVerify {
  typecheck: { ok: boolean; code: number | null; tail: string } | null;
  lint: { ok: boolean; code: number | null; tail: string } | null;
}

export interface QuickEditResult {
  ok: boolean;
  changedFiles: string[];
  addedFiles: string[];
  changedLines: number;
  backupRoot: string | null;
  restored: boolean;
  durationMs: number;
  verify: QuickEditVerify;
  message: string;
  error?: string;
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walk(root: string, base = root, out: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(root, entry.name), base, out);
    } else if (entry.isFile()) {
      out.push(path.relative(base, path.join(root, entry.name)));
    }
  }
  return out;
}

function sourceFiles(laneRoot: string): string[] {
  const out: string[] = [];
  for (const rel of SOURCE_ROOTS) {
    const abs = path.join(laneRoot, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      for (const f of walk(abs, laneRoot)) out.push(f);
    }
  }
  for (const rel of ROOT_FILES) {
    if (fs.existsSync(path.join(laneRoot, rel))) out.push(rel);
  }
  return Array.from(new Set(out)).sort();
}

/** Copy the source to a temp snapshot and hash every file. */
export function snapshotProject(laneRoot: string): QuickEditSnapshot {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = path.basename(laneRoot).replace(/[^a-zA-Z0-9._-]/g, '_');
  const baseDir = process.env.OLYMPUS_QUICK_EDIT_DIR || path.join('/tmp', 'opencode', 'quick-edit');
  const backupRoot = path.join(baseDir, `${slug}-${stamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  const files: Record<string, string> = {};
  for (const rel of sourceFiles(laneRoot)) {
    const from = path.join(laneRoot, rel);
    const to = path.join(backupRoot, rel);
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      files[rel] = sha256(from);
    } catch { /* a file that vanished mid-snapshot is not a patch target */ }
  }
  const snapshot: QuickEditSnapshot = {
    backupRoot,
    files,
    laneRoot,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(backupRoot, 'manifest.json'), JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
  return snapshot;
}

function countDiffLines(from: string, to: string): number {
  try {
    const r = spawnSync('diff', ['-u', from, to], { encoding: 'utf-8', timeout: 5_000 });
    const text = `${r.stdout || ''}\n${r.stderr || ''}`;
    return text.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)).length;
  } catch {
    try { return fs.readFileSync(to, 'utf-8').split('\n').length; } catch { return 0; }
  }
}

/** Compare the lane to the snapshot. */
export function diffProject(laneRoot: string, snapshot: QuickEditSnapshot): QuickEditDiff {
  const current = new Set(sourceFiles(laneRoot));
  const before = new Set(Object.keys(snapshot.files));
  const changed: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  let changedLines = 0;
  for (const rel of current) {
    const abs = path.join(laneRoot, rel);
    if (!before.has(rel)) { added.push(rel); changedLines += countDiffLines('/dev/null', abs); continue; }
    try {
      if (sha256(abs) !== snapshot.files[rel]) {
        changed.push(rel);
        changedLines += countDiffLines(path.join(snapshot.backupRoot, rel), abs);
      }
    } catch { /* unreadable: treat as changed */ changed.push(rel); }
  }
  for (const rel of before) if (!current.has(rel)) { deleted.push(rel); changedLines += 1; }
  return { changed, added, deleted, changedLines };
}

export function restoreSnapshot(snapshot: QuickEditSnapshot, diff?: QuickEditDiff): string[] {
  const d = diff ?? diffProject(snapshot.laneRoot, snapshot);
  const restored: string[] = [];
  for (const rel of [...d.changed, ...d.deleted]) {
    const from = path.join(snapshot.backupRoot, rel);
    const to = path.join(snapshot.laneRoot, rel);
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      restored.push(rel);
    } catch { /* the original was not in the snapshot */ }
  }
  for (const rel of d.added) {
    try { fs.rmSync(path.join(snapshot.laneRoot, rel), { force: true }); restored.push(rel); } catch { /* best effort */ }
  }
  // Persist what was restored so the manifest stays an honest audit trail.
  try {
    fs.writeFileSync(path.join(snapshot.backupRoot, 'restored.json'), JSON.stringify({ at: new Date().toISOString(), restored }, null, 2) + '\n', 'utf-8');
  } catch { /* best effort */ }
  return restored;
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): { ok: boolean; code: number | null; tail: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
  const code = typeof r.status === 'number' ? r.status : null;
  const tail = `${r.stdout || ''}\n${r.stderr || ''}`.trim().slice(-2_500);
  return { ok: code === 0, code, tail };
}

/** Typecheck + lint the touched files. No full build, no screenshots (the preview is live). */
export function verifyProject(laneRoot: string, changedFiles: string[]): QuickEditVerify {
  const hasTs = fs.existsSync(path.join(laneRoot, 'tsconfig.json'));
  const typecheck = hasTs ? run('npx', ['tsc', '--noEmit'], laneRoot, 120_000) : null;
  const lintable = changedFiles.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));
  const hasEslint = fs.existsSync(path.join(laneRoot, 'eslint.config.mjs'))
    || fs.existsSync(path.join(laneRoot, 'eslint.config.js'))
    || fs.existsSync(path.join(laneRoot, '.eslintrc'))
    || fs.existsSync(path.join(laneRoot, '.eslintrc.json'));
  const lint = hasEslint && lintable.length
    ? run('npx', ['eslint', ...lintable.slice(0, 20), '--no-warn-ignored'], laneRoot, 120_000)
    : null;
  return { typecheck, lint };
}

function quickEditPrompt(input: {
  instruction: string;
  mark?: { x: number; y: number };
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  route?: string;
  previewUrl?: string;
  projectSlug?: string | null;
}): string {
  return `QUICK EDIT — direct patch. Do not plan, do not dispatch, do not create a hop.

Project: ${input.projectSlug || path.basename(input.previewUrl || 'unknown')}
Preview: ${input.previewUrl || '(use the live dev server)'}
Route: ${input.route || '/'}
Mark: ${input.mark ? `(${input.mark.x}, ${input.mark.y}) in ${input.viewport?.width || '?'}x${input.viewport?.height || '?'}` : 'none'}
User instruction: ${input.instruction}

RULES (binding):
1. Inspect the project and apply the SMALLEST change that satisfies the instruction.
2. At most ${QUICK_EDIT_MAX_FILES} files and ${QUICK_EDIT_MAX_LINES} changed lines. If the change needs more, STOP and reply "ESCALATE: <why>" without writing files.
3. Do NOT touch package.json, lockfiles, prisma/migrations, .env*, opencode.json, or any generated file.
4. Write the files directly with your edit/write tools. Do not run builds, tests or screenshots; the server verifies.
5. Preserve the existing design tokens and conventions. Do not invent a new palette.
6. End with a single line: QUICK_EDIT_DONE <one-sentence summary>.

The user is watching the live preview. Speed matters more than prose.`;
}

/**
 * Run one bounded quick edit. The caller (the API) gets a deterministic result:
 * either the patch is small and verifies, or the snapshot is restored.
 */
export async function runQuickEdit(opts: {
  slug: string;
  laneRoot: string;
  instruction: string;
  mark?: { x: number; y: number };
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  route?: string;
  previewUrl?: string;
  timeoutMs?: number;
}): Promise<QuickEditResult> {
  const startedAt = Date.now();
  const laneRoot = opts.laneRoot;
  if (!fs.existsSync(laneRoot)) {
    return { ok: false, changedFiles: [], addedFiles: [], changedLines: 0, backupRoot: null, restored: false, durationMs: 0, verify: { typecheck: null, lint: null }, message: 'lane not found', error: `lane not found: ${opts.slug}` };
  }
  const snapshot = snapshotProject(laneRoot);
  const turn = await runGodTurn('athena', quickEditPrompt({ ...opts, projectSlug: opts.slug }), laneRoot, opts.timeoutMs ?? 180_000);
  const diff = diffProject(laneRoot, snapshot);
  const totalFiles = diff.changed.length + diff.added.length + diff.deleted.length;

  const fail = (message: string, error: string, verify: QuickEditVerify = { typecheck: null, lint: null }, restored = false): QuickEditResult => ({
    ok: false, changedFiles: diff.changed, addedFiles: diff.added, changedLines: diff.changedLines,
    backupRoot: snapshot.backupRoot, restored, durationMs: Date.now() - startedAt,
    verify, message, error,
  });

  if (!turn.ok) {
    const restored = restoreSnapshot(snapshot, diff).length > 0;
    return fail(`Athena could not apply the edit: ${turn.error || 'unknown error'}`, turn.error || 'model turn failed', { typecheck: null, lint: null }, restored);
  }
  if (totalFiles === 0) {
    return fail('No file changed. Rephrase the request or use a hop for a structural change.', 'no file changed');
  }
  if (totalFiles > QUICK_EDIT_MAX_FILES || diff.changedLines > QUICK_EDIT_MAX_LINES) {
    const restored = restoreSnapshot(snapshot, diff).length > 0;
    return fail(
      `This patch is too large for Quick Edit (${totalFiles} files, ${diff.changedLines} lines). The change was reverted; send it as a hop instead.`,
      `patch too large: ${totalFiles} files / ${diff.changedLines} lines`,
      { typecheck: null, lint: null }, restored,
    );
  }

  const verify = verifyProject(laneRoot, [...diff.changed, ...diff.added]);
  const verifyOk = (!verify.typecheck || verify.typecheck.ok) && (!verify.lint || verify.lint.ok);
  if (!verifyOk) {
    const restored = restoreSnapshot(snapshot, diff).length > 0;
    return fail(
      'The edit did not pass typecheck/lint and was reverted. See the log for the exact failure.',
      'verify failed', verify, restored,
    );
  }

  return {
    ok: true,
    changedFiles: diff.changed,
    addedFiles: diff.added,
    changedLines: diff.changedLines,
    backupRoot: snapshot.backupRoot,
    restored: false,
    durationMs: Date.now() - startedAt,
    verify,
    message: `Applied ${totalFiles} file(s), ${diff.changedLines} line(s) in ${Math.round((Date.now() - startedAt) / 1000)}s. The preview hot-reloads.`,
  };
}

/** Deterministic undo: restore the snapshot recorded by the last quick edit. */
export function undoQuickEdit(laneRoot: string, backupRoot: string): { ok: boolean; restored: string[]; error?: string } {
  try {
    const manifestPath = path.join(backupRoot, 'manifest.json');
    const snapshot = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as QuickEditSnapshot;
    if (path.resolve(snapshot.laneRoot) !== path.resolve(laneRoot)) {
      return { ok: false, restored: [], error: 'backup belongs to a different lane' };
    }
    const restored = restoreSnapshot(snapshot);
    return { ok: true, restored };
  } catch (e: any) {
    return { ok: false, restored: [], error: e?.message || String(e) };
  }
}
