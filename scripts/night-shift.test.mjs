#!/usr/bin/env node
/**
 * night-shift.test.mjs — v0.0.91: the autonomy contract.
 *
 * Pins the parts of the overnight supervisor that must never be guessed:
 * argument parsing, the hard-stop deadline, the systemd launch (outside the
 * Electron cgroup), the gate table, and the morning letter's verdict.
 *
 * Run: npx tsx scripts/night-shift.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  buildMorningReport,
  deadlineMs,
  parseArgs,
  readGates,
  readProgress,
  safeSlug,
  systemdCommand,
  unitName,
} from './night-shift.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('parseArgs: defaults are the 8h / 100-hop window', () => {
  const o = parseArgs(['--slug', 'aime']);
  assert.equal(o.slug, 'aime');
  assert.equal(o.hours, 8);
  assert.equal(o.maxHops, 100);
  assert.equal(o.headless, false);
  assert.ok(o.lane.endsWith('/OLYMPUS-VAULT/02_Projects/aime'));
});

ok('parseArgs: explicit flags win', () => {
  const o = parseArgs(['--slug', 'demo', '--lane', '/tmp/demo', '--hours', '2', '--max-hops', '12', '--headless', '--dry-run']);
  assert.equal(o.lane, '/tmp/demo');
  assert.equal(o.hours, 2);
  assert.equal(o.maxHops, 12);
  assert.equal(o.headless, true);
  assert.equal(o.dryRun, true);
});

ok('deadline is exactly hours x 3600s', () => {
  assert.equal(deadlineMs(1_000, 8) - 1_000, 8 * 3_600_000);
});

ok('the unit name is stable and safe', () => {
  assert.equal(safeSlug('AIME / v0.0.91'), 'aime-v0-0-91');
  assert.equal(unitName('aime'), 'olympus-night-aime');
});

ok('the launch is systemd --user, outside the Electron cgroup', () => {
  const cmd = systemdCommand({ slug: 'aime', lane: '/lane', hours: 8, maxHops: 100, maxRestarts: 8, pollMs: 15_000, headless: true, dryRun: false, supervise: false });
  assert.equal(cmd[0], 'systemd-run');
  assert.ok(cmd.includes('--user'));
  assert.ok(cmd.includes('--unit=olympus-night-aime'));
  assert.ok(cmd.includes('--collect'));
  assert.ok(cmd.includes('--setenv=OLYMPUS_NIGHT_SUPERVISOR=1'));
  assert.ok(cmd.includes('--supervise'));
  assert.ok(cmd.includes('--lane'));
});

ok('the morning letter says SHIPPABLE only when every gate is green', () => {
  const base = {
    slug: 'aime', lane: '/lane', startedAt: '2026-11-08T22:00:00Z', endedAt: '2026-11-09T06:00:00Z',
    reason: 'done', completed: 100, total: 100, restarts: 2, lastPark: null, tokensIn: 1000, tokensOut: 200, artifacts: ['src/app/page.tsx'],
  };
  const green = buildMorningReport({ ...base, gates: [{ name: 'design', ok: true, detail: '7.6', evidence: 'design-review.json' }] });
  assert.match(green, /SHIPPABLE/);
  assert.doesNotMatch(green, /gates open/);
  const red = buildMorningReport({ ...base, gates: [{ name: 'design', ok: false, detail: '6.2', evidence: 'design-review.json' }] });
  assert.match(red, /NOT SHIPPABLE — 1 gates open/);
  assert.match(red, /What needs you/);
});

ok('readGates: missing evidence is FAIL, never PASS', () => {
  const lane = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-night-'));
  try {
    const gates = readGates(lane);
    assert.equal(gates.every((g) => g.ok), false);
    assert.equal(gates.find((g) => g.name === 'design gate >= 7')?.ok, false);
  } finally { fs.rmSync(lane, { recursive: true, force: true }); }
});

ok('readGates: the full evidence set is 6/6', () => {
  const lane = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-night-'));
  try {
    fs.mkdirSync(path.join(lane, 'evidence/frontdoor'), { recursive: true });
    fs.mkdirSync(path.join(lane, 'evidence/clips'), { recursive: true });
    fs.mkdirSync(path.join(lane, 'evidence/release'), { recursive: true });
    fs.mkdirSync(path.join(lane, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(lane, 'evidence/frontdoor/design-review.json'), JSON.stringify({ overall: 7.6 }));
    fs.writeFileSync(path.join(lane, 'evidence/clips/audit.md'), 'VERDICT: PASS\n');
    fs.writeFileSync(path.join(lane, 'evidence/release/readiness.md'), '# ready\n');
    fs.writeFileSync(path.join(lane, 'evidence/release/morning-report.md'), '# report\n');
    fs.writeFileSync(path.join(lane, 'docs/clips.md'), '# clips\n');
    fs.writeFileSync(path.join(lane, 'docs/PRODUCT-CONTRACT.md'), '# contract\n');
    const gates = readGates(lane);
    assert.equal(gates.length, 6);
    assert.equal(gates.every((g) => g.ok), true);
  } finally { fs.rmSync(lane, { recursive: true, force: true }); }
});

ok('readProgress reads the plan, state and tokens', () => {
  const lane = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-night-'));
  try {
    fs.writeFileSync(path.join(lane, 'dispatch-plan.json'), JSON.stringify({ hops: [
      { id: 'h1', artifacts: ['a.ts'] }, { id: 'h2', artifacts: ['b.ts'] }, { id: 'h3' },
    ] }));
    fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({ completed: ['h1', 'h2'], parked: null }));
    fs.writeFileSync(path.join(lane, '.olympus-hop-telemetry.jsonl'), JSON.stringify({ hop: 'h1', tokensIn: 10, tokensOut: 2 }) + '\n');
    const p = readProgress(lane);
    assert.equal(p.completed, 2);
    assert.equal(p.total, 3);
    assert.equal(p.tokensIn, 10);
    assert.equal(p.tokensOut, 2);
    assert.deepEqual(p.artifacts.sort(), ['a.ts', 'b.ts']);
  } finally { fs.rmSync(lane, { recursive: true, force: true }); }
});

console.log(`\nnight-shift: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
