#!/usr/bin/env node
/**
 * hygiene.mjs — v0.0.99: the zero-error release gate.
 *
 * Runs the deterministic checks a release must pass:
 *   tsc · lint · docs:check · repo:privacy · suites:manifest · audit(high)
 *
 * `--battery` adds the full hermetic battery (`scripts/*.test.mjs`; 55 at
 * v0.0.99). The maintainer-local suites need the live app/vault and are
 * declared in scripts/local-suites.manifest.json, not silently skipped.
 *
 * Usage: npm run hygiene [-- --battery]
 * Exit 0 = every gate green.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const withBattery = process.argv.includes('--battery');
// v0.0.99 — the battery runs every `scripts/*.test.mjs` present on disk, so
// the report counts the real suites instead of a hardcoded number.
const suiteCount = (() => {
  try { return fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.test.mjs')).length; } catch { return 0; }
})();
const checks = [
  { name: 'typescript', cmd: 'npx', args: ['tsc', '--noEmit'] },
  { name: 'lint', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'docs', cmd: 'npm', args: ['run', 'docs:check'] },
  { name: 'strategy-sync', cmd: 'node', args: ['scripts/check-strategy-sync.js'] },
  { name: 'privacy', cmd: 'npm', args: ['run', 'repo:privacy'] },
  { name: 'suite-manifest', cmd: 'node', args: ['scripts/suites-manifest.mjs'] },
  { name: 'audit-high', cmd: 'npm', args: ['audit', '--audit-level=high'] },
  ...(withBattery ? [{ name: 'battery', cmd: 'npm', args: ['run', 'battery'] }] : []),
];

let failed = 0;
const results = [];
for (const c of checks) {
  const started = Date.now();
  const r = spawnSync(c.cmd, c.args, { cwd: ROOT, encoding: 'utf-8', timeout: c.name === 'battery' ? 3_600_000 : 600_000 });
  const ok = r.status === 0;
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  results.push({ name: c.name, ok, ms: Date.now() - started });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name} (${secs}s)`);
  if (!ok) {
    failed++;
    const tail = String(r.stdout || '').trim().split('\n').slice(-12).join('\n');
    const err = String(r.stderr || '').trim().split('\n').slice(-8).join('\n');
    if (tail) console.log(tail);
    if (err) console.log(err);
  }
}
try {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf-8').trim();
  fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'public', 'hygiene.json'), JSON.stringify({
    version,
    generatedAt: new Date().toISOString(),
    ok: failed === 0,
    gates: results,
    battery: withBattery ? { pass: failed === 0 ? suiteCount : null, fail: failed === 0 ? 0 : null, suites: suiteCount } : null,
  }, null, 2) + '\n');
} catch { /* the report is evidence, never a gate blocker */ }
console.log('');
if (failed > 0) {
  console.log(`hygiene: ${failed} gate(s) FAIL`);
  process.exit(1);
}
console.log(`hygiene: all ${checks.length} gate(s) PASS${withBattery ? ' (battery included)' : ' — add --battery for the hermetic suite sweep'}`);
