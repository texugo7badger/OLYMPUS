#!/usr/bin/env node
/**
 * seed-knowledge-base.mjs — install the god-domain knowledge references.
 *
 * The vault's 04_Knowledge/references/ was missing the domains the gods
 * needed at the base of OLYMPUS (planning, orchestration, design, QA, data,
 * vault, release). This script copies the versioned templates in
 * scripts/knowledge/ into the vault.
 *
 * Safety:
 *   - create-if-missing by default (never clobbers a user's note);
 *   - --force overwrites (with a backup in ~/.olympus/backups/knowledge/);
 *   - --dry-run prints what would happen;
 *   - every file must have frontmatter + at least one source.
 *
 * Usage:
 *   node scripts/seed-knowledge-base.mjs --dry-run
 *   node scripts/seed-knowledge-base.mjs
 *   node scripts/seed-knowledge-base.mjs --force
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = path.join(ROOT, 'scripts', 'knowledge');
const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const REFERENCES = path.join(VAULT, '04_Knowledge', 'references');
const BACKUP = path.join(os.homedir(), '.olympus', 'backups', 'knowledge');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function validate(file) {
  const raw = fs.readFileSync(file, 'utf-8');
  if (!/^---\r?\n[\s\S]*?\r?\n---/.test(raw)) return 'missing frontmatter';
  if (!/^sources:/m.test(raw)) return 'missing sources';
  if (!/^god:/m.test(raw)) return 'missing god';
  return null;
}

const files = walk(TEMPLATES);
if (files.length === 0) {
  console.error('seed-knowledge: no templates found in scripts/knowledge');
  process.exit(1);
}

let created = 0, skipped = 0, overwritten = 0, invalid = 0;
const plan = [];

for (const src of files) {
  const rel = path.relative(TEMPLATES, src);
  const dst = path.join(REFERENCES, rel);
  const bad = validate(src);
  if (bad) {
    invalid++;
    console.log(`INVALID  ${rel} — ${bad}`);
    continue;
  }
  if (!fs.existsSync(dst)) {
    plan.push({ rel, src, dst, action: 'create' });
    created++;
  } else if (force) {
    plan.push({ rel, src, dst, action: 'overwrite' });
    overwritten++;
  } else {
    skipped++;
    console.log(`skip     ${rel} (exists)`);
  }
}

for (const p of plan) {
  console.log(`${p.action.padEnd(9)} ${p.rel}`);
  if (dryRun) continue;
  fs.mkdirSync(path.dirname(p.dst), { recursive: true });
  if (p.action === 'overwrite') {
    fs.mkdirSync(BACKUP, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${p.rel.replace(/[\\/]/g, '__')}.${stamp}.bak`;
    fs.copyFileSync(p.dst, path.join(BACKUP, backupName));
    console.log(`backup    ${backupName}`);
  }
  fs.copyFileSync(p.src, p.dst);
}

const total = fs.existsSync(REFERENCES)
  ? walk(REFERENCES).length
  : 0;

console.log(`\nseed-knowledge: ${created} create · ${overwritten} overwrite · ${skipped} skip · ${invalid} invalid${dryRun ? ' (dry run)' : ''}`);
console.log(`vault references: ${total} file(s) in ${REFERENCES}`);
if (invalid > 0) process.exit(1);
