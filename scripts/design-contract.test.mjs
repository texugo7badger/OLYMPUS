#!/usr/bin/env node
/**
 * design-contract.test.mjs — v0.0.91.
 *
 * The contract is the gate between "the user described it" and "Apollo plans
 * it". Pin the deterministic parts: the filesystem page map, the P0 rule, the
 * design stops and the hop shape the planner appends.
 *
 * Run: npx tsx scripts/design-contract.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  buildPageMap,
  contractGate,
  defaultContract,
  designStopHops,
  validateContract,
  writeContract,
} from '../src/lib/design-contract.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const lane = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-contract-'));
fs.mkdirSync(path.join(lane, 'src/app/home'), { recursive: true });
fs.mkdirSync(path.join(lane, 'src/app/(marketing)/about'), { recursive: true });
fs.writeFileSync(path.join(lane, 'src/app/page.tsx'), 'export default function Page() { return null; }\n');
fs.writeFileSync(path.join(lane, 'src/app/home/page.tsx'), 'export default function Page() { return null; }\n');
fs.writeFileSync(path.join(lane, 'src/app/(marketing)/about/page.tsx'), 'export default function Page() { return null; }\n');

try {
  ok('the page map reads the real routes and strips groups', () => {
    const routes = buildPageMap(lane).map((p) => p.route).sort();
    assert.deepEqual(routes, ['/', '/about', '/home']);
  });

  ok('the default contract makes / P0 and names one stop', () => {
    const c = defaultContract(lane, 'demo', 'refactor');
    assert.equal(c.pages.find((p) => p.route === '/')?.priority, 'P0');
    assert.equal(c.pages.find((p) => p.route === '/home')?.priority, 'P1');
    assert.equal(c.stops.length, 1);
    assert.equal(c.stops[0].requiresUserApproval, true);
  });

  ok('a pending P0 page blocks the plan', () => {
    const c = defaultContract(lane, 'demo', 'refactor');
    const v = validateContract(c);
    assert.equal(v.ok, false);
    assert.equal(v.pendingP0Pages.length, 1);
  });

  ok('deciding the P0 page clears the gate', () => {
    const c = defaultContract(lane, 'demo', 'refactor');
    c.pages = c.pages.map((p) => p.route === '/' ? { ...p, status: 'decided' } : p);
    const v = validateContract(c);
    assert.equal(v.ok, true, v.reasons.join('; '));
  });

  ok('a P0 unknown blocks the plan even when pages are decided', () => {
    const c = defaultContract(lane, 'demo', 'refactor');
    c.pages = c.pages.map((p) => p.route === '/' ? { ...p, status: 'decided' } : p);
    c.unknowns.push({ id: 'u1', severity: 'P0', question: 'Which palette?', owner: 'user' });
    const v = validateContract(c);
    assert.equal(v.ok, false);
    assert.equal(v.p0Unknowns.length, 1);
  });

  ok('designStopHops emits a design-gate with the design-score verify', () => {
    const c = defaultContract(lane, 'demo', 'refactor');
    const hops = designStopHops(c);
    assert.equal(hops.length, 1);
    assert.equal(hops[0].kind, 'design-gate');
    assert.equal(hops[0].god, 'athena');
    assert.ok(hops[0].verify.checks.includes('design-score:7'));
  });

  ok('contractGate: no contract does not block the lane', () => {
    const gate = contractGate(lane);
    assert.equal(gate.enforce, false);
    assert.equal(gate.ok, true);
  });

  ok('contractGate: a pending P0 contract blocks the plan', () => {
    const c = defaultContract(lane, 'demo', 'refactor');
    writeContract(lane, c);
    const gate = contractGate(lane);
    assert.equal(gate.enforce, true);
    assert.equal(gate.ok, false);
    assert.match(gate.reasons.join('; '), /P0/);
  });

  ok('contractGate: deciding the P0 page unblocks the plan', () => {
    const c = defaultContract(lane, 'demo', 'refactor');
    c.pages = c.pages.map((p) => p.route === '/' ? { ...p, status: 'decided' } : p);
    writeContract(lane, c);
    const gate = contractGate(lane);
    assert.equal(gate.ok, true, gate.reasons.join('; '));
  });
} finally {
  fs.rmSync(lane, { recursive: true, force: true });
}

console.log(`\ndesign-contract: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
