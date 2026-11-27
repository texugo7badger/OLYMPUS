#!/usr/bin/env node
/**
 * migrate-instincts-v013.mjs — v0.1.3: make legacy instinct counts honest.
 *
 * The old hop writer recorded `samples` but not `successes`/`failures`, and
 * its confidence was a hand-raised 0.86. This migration infers
 * `successes = samples` (the writer only ran on verified completion), sets
 * `failures = 0`, and recomputes the ECC confidence.
 *
 * It NEVER deletes an instinct. `--apply` is required to write; the default
 * is a dry run. The AIME cleanup is a separate v0.1.4 decision.
 *
 * Usage:
 *   npx tsx scripts/migrate-instincts-v013.mjs
 *   npx tsx scripts/migrate-instincts-v013.mjs --apply
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const ROOT = path.join(VAULT, '05_Auto_Learning', 'instincts');
const APPLY = process.argv.includes('--apply');

function field(text, key) {
  const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(text);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}
function setField(text, key, value) {
  if (new RegExp(`^${key}:\\s*.*$`, 'm').test(text)) return text.replace(new RegExp(`^${key}:\\s*.*$`, 'm'), `${key}: ${value}`);
  return text.replace('\n---\n', `\n${key}: ${value}\n---\n`);
}
function confidence(successes, failures) {
  const n = successes + failures;
  if (n <= 0) return 0;
  return Math.max(0, Math.min(0.95, (successes / n) * Math.sqrt(n) / (1 + Math.sqrt(n))));
}

let scanned = 0, changed = 0, inferred = 0, skipped = 0;
for (const god of fs.existsSync(ROOT) ? fs.readdirSync(ROOT) : []) {
  const dir = path.join(ROOT, god, 'empirical');
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const abs = path.join(dir, file);
    let text = fs.readFileSync(abs, 'utf-8');
    scanned++;
    const samples = Number(field(text, 'samples') || 0);
    let successes = field(text, 'successes');
    let failures = field(text, 'failures');
    if (!successes && !failures && samples > 0) {
      successes = String(samples);
      failures = '0';
      inferred++;
    }
    const succ = Number(successes || 0);
    const fail = Number(failures || 0);
    if (succ + fail <= 0) { skipped++; continue; }
    const next = confidence(succ, fail).toFixed(3);
    const updated = [
      setField(setField(setField(text, 'successes', String(succ)), 'failures', String(fail)), 'confidence', next),
    ][0];
    const withMeta = setField(updated, 'migration', '"v0.1.3-ecc"');
    if (withMeta === text) continue;
    changed++;
    if (APPLY) fs.writeFileSync(abs, withMeta, 'utf-8');
  }
}
console.log(JSON.stringify({ apply: APPLY, vault: VAULT, scanned, inferred, changed, skipped }, null, 2));
