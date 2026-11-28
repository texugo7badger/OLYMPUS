#!/usr/bin/env node
/**
 * knowledge-verify-v017.mjs — add the freshness fields the research rule reads.
 *
 * v0.1.7 makes "stale knowledge → search first" enforceable. Existing notes
 * were seeded without `last_verified` / `source`; this adds them idempotently.
 * It does not change the note body.
 *
 * Usage:
 *   node scripts/knowledge-verify-v017.mjs            # dry run
 *   node scripts/knowledge-verify-v017.mjs --apply    # write the fields
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const ROOT = path.join(VAULT, '04_Knowledge', 'references');
const STAMP = new Date().toISOString().slice(0, 10);

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

let changed = 0, already = 0;
for (const file of walk(ROOT)) {
  const raw = fs.readFileSync(file, 'utf-8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) continue;
  const fm = m[1];
  const additions = [];
  if (!/^last_verified:/m.test(fm)) additions.push(`last_verified: ${STAMP}`);
  if (!/^source:/m.test(fm)) additions.push('source: seed');
  if (!additions.length) { already++; continue; }
  const next = raw.replace(/^---\r?\n([\s\S]*?)\r?\n---/, `---\n${fm}\n${additions.join('\n')}\n---`);
  if (apply) fs.writeFileSync(file, next);
  changed++;
  console.log(`${apply ? 'SET ' : 'DRY '} ${path.relative(VAULT, file)}${additions.length ? ` (+${additions.join(', ')})` : ''}`);
}
console.log(`knowledge-verify: ${changed} ${apply ? 'updated' : 'would update'}, ${already} already current`);
