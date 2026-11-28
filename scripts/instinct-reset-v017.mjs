#!/usr/bin/env node
/**
 * instinct-reset-v017.mjs — v0.1.7: the brain reset, evidence-first.
 *
 * The v0.1.6 panel exposed the truth: 1,041 "quick circuits" were archived
 * instincts under a false label, 187 of 190 empirical instincts were AIME
 * project memory, and 28 archived files still carried quick_circuit:true
 * from synthetic olympus-smoke fixtures. This script performs the reset the
 * user approved, WITHOUT deleting anything:
 *
 *   1. full backup of 05_Auto_Learning/instincts
 *   2. AIME empirical instincts -> 05_Auto_Learning/project-instincts/aime/<god>/
 *   3. other empirical + the whole _archive -> 09_Archive/instincts-<date>/
 *   4. stale seeds (glm-5.2, serena, opendesign) -> the same archive
 *   5. write a sha256 manifest + README (restore is explicit)
 *   6. run the idempotent seed-vault.py to add the v0.1.7 base seeds
 *
 * Usage:
 *   node scripts/instinct-reset-v017.mjs             # dry run (default)
 *   node scripts/instinct-reset-v017.mjs --apply     # move + seed
 *   node scripts/instinct-reset-v017.mjs --restore <manifest.json>
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force');
const restoreIdx = args.indexOf('--restore');
const restorePath = restoreIdx >= 0 ? path.resolve(args[restoreIdx + 1]) : null;
const vaultArg = args.indexOf('--vault');
const VAULT = vaultArg >= 0
  ? path.resolve(args[vaultArg + 1])
  : (process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT'));
const ROOT = path.join(VAULT, '05_Auto_Learning', 'instincts');
const PROJECT_ROOT = path.join(VAULT, '05_Auto_Learning', 'project-instincts');
const DAY = new Date().toISOString().slice(0, 10);
const ARCHIVE = path.join(VAULT, '09_Archive', `instincts-${DAY}`);
const MANIFEST = path.join(ARCHIVE, 'MANIFEST.json');
const BACKUP = path.join(os.homedir(), '.olympus', 'backups', `instincts-pre-017-${DAY}`);
const STALE_SEEDS = new Set([
  'glm-5.2-reserved',
  'use-serena-for-edits',
  'prefer-opendesign-for-design-systems',
]);

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
function readFront(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : '';
}
function isAime(file) {
  const text = fs.readFileSync(file, 'utf-8');
  const fm = readFront(text);
  return /(^|\n)projects:\s*\[[^\]]*["']?aime["']?/i.test(fm) || /\baime\b/i.test(fm);
}
function targetFor(file, reason) {
  const rel = path.relative(ROOT, file).split(path.sep);
  const god = rel[0];
  const tier = rel[1];
  if (reason === 'aime-project') return path.join(PROJECT_ROOT, 'aime', god, path.basename(file));
  if (reason === 'stale-seed') return path.join(ARCHIVE, 'stale-seeds', god, path.basename(file));
  if (tier === '_archive') return path.join(ARCHIVE, 'archive', god, ...rel.slice(2));
  return path.join(ARCHIVE, 'empirical', god, path.basename(file));
}
function uniqueTarget(target) {
  if (!fs.existsSync(target)) return target;
  const ext = path.extname(target);
  const base = target.slice(0, -ext.length);
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`could not find a free target for ${target}`);
}

function restore(manifestPath) {
  if (!fs.existsSync(manifestPath)) throw new Error(`manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  let restored = 0, skipped = 0, failed = 0;
  for (const item of manifest.items || []) {
    try {
      if (!fs.existsSync(item.to)) {
        if (fs.existsSync(item.from)) { skipped++; continue; }
        throw new Error(`archived file missing: ${item.to}`);
      }
      if (fs.existsSync(item.from) && sha256(item.from) !== item.sha256) {
        if (!force) throw new Error(`target exists with different content: ${item.from} (use --force)`);
        fs.rmSync(item.from, { force: true });
      }
      const hash = sha256(item.to);
      if (hash !== item.sha256) throw new Error(`sha256 mismatch: ${item.to}`);
      fs.mkdirSync(path.dirname(item.from), { recursive: true });
      fs.copyFileSync(item.to, item.from);
      if (sha256(item.from) !== item.sha256) throw new Error(`restore hash mismatch: ${item.from}`);
      fs.rmSync(item.to, { force: true });
      restored++;
    } catch (e) {
      console.error(`FAIL  ${item.from}: ${e.message}`);
      failed++;
    }
  }
  console.log(`restore: ${restored} restored, ${skipped} skipped, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

if (restorePath) restore(restorePath);

if (!fs.existsSync(ROOT)) {
  console.error(`instincts tree not found: ${ROOT}`);
  process.exit(2);
}

const candidates = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep);
  const tier = rel[1];
  const id = path.basename(file, '.md');
  if (tier === '_archive') {
    candidates.push({ file, reason: 'archived' });
  } else if (tier === 'empirical') {
    candidates.push({ file, reason: isAime(file) ? 'aime-project' : 'empirical' });
  } else if (tier === 'seed' && STALE_SEEDS.has(id)) {
    candidates.push({ file, reason: 'stale-seed' });
  }
}

const byReason = candidates.reduce((acc, c) => { acc[c.reason] = (acc[c.reason] || 0) + 1; return acc; }, {});
console.log('instinct-reset-v017 — ' + (apply ? 'APPLY' : 'DRY RUN'));
console.log(`vault: ${VAULT}`);
console.log(`backup: ${BACKUP}`);
console.log(`archive: ${ARCHIVE}`);
console.log('plan:', JSON.stringify(byReason));
console.log('seed base after reset: the v0.1.7 seeds from scripts/seed-v017.json');

if (!apply) {
  for (const c of candidates.slice(0, 12)) console.log(`DRY  ${c.reason.padEnd(14)} ${path.relative(ROOT, c.file)}`);
  if (candidates.length > 12) console.log(`DRY  … and ${candidates.length - 12} more`);
  console.log('\nNo files changed. Re-run with --apply to execute.');
  process.exit(0);
}

// 1. Full backup before any move.
fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
fs.cpSync(ROOT, BACKUP, { recursive: true });
console.log(`backup written: ${BACKUP}`);

// 2. Move every candidate, hash-verified.
const items = [];
for (const c of candidates) {
  const target = uniqueTarget(targetFor(c.file, c.reason));
  const hash = sha256(c.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(c.file, target);
  if (sha256(target) !== hash) throw new Error(`copy hash mismatch: ${c.file}`);
  fs.rmSync(c.file, { force: true });
  items.push({ from: c.file, to: target, sha256: hash, reason: c.reason });
}
fs.mkdirSync(ARCHIVE, { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify({
  version: '0.1.7',
  generatedAt: new Date().toISOString(),
  vault: VAULT,
  backup: BACKUP,
  counts: byReason,
  items,
}, null, 2) + '\n', 'utf-8');
fs.writeFileSync(path.join(ARCHIVE, 'README.md'), `# Instinct archive — v0.1.7 reset

This directory holds the instincts moved out of the active brain on ${DAY}.

- \`archive/\` — stale/archived instincts (memory, not shortcuts)
- \`empirical/\` — non-AIME empirical instincts
- \`stale-seeds/\` — seeds with retired tool references
- \`MANIFEST.json\` — every source path, target path and sha256

The AIME empirical instincts are **not** here: they moved to
\`05_Auto_Learning/project-instincts/aime/<god>/\` and are visible only when
the AIME project is active.

Restore one file or the whole set with:

\`\`\`bash
node scripts/instinct-reset-v017.mjs --restore ${MANIFEST}
\`\`\`

The pre-reset full tree is also backed up at \`${BACKUP}\`.
Nothing was deleted by this script.
`, 'utf-8');
console.log(`moved ${items.length} file(s); manifest: ${MANIFEST}`);

// 3. Add the v0.1.7 base seeds + knowledge note (idempotent, create-only).
try {
  const seeder = path.join(process.cwd(), 'scripts', 'seed-vault.py');
  if (fs.existsSync(seeder)) {
    const out = execFileSync('python3', [seeder], {
      encoding: 'utf-8',
      env: { ...process.env, OLYMPUS_VAULT: VAULT },
      timeout: 60_000,
    });
    const line = out.split('\n').find((l) => l.includes('Seed instincts:')) || '';
    console.log(line.trim() || 'seed-vault.py completed');
  }
} catch (e) {
  console.error(`WARN seeder failed: ${e.message}`);
}

console.log('done. Reindex retrieval so archived docs leave the search index.');
