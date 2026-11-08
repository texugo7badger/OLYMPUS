#!/usr/bin/env node
/**
 * design-approval.test.mjs — v0.0.91.
 *
 * The approval is only valid for the exact contract + review the user saw,
 * and only when the review is >= 7. A click cannot paper over a 4.9.
 *
 * Run: npx tsx scripts/design-approval.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { defaultContract } from '../src/lib/design-contract.ts';
import {
  clearApproval,
  contractHash,
  readApproval,
  reviewHash,
  validateApproval,
  writeApproval,
} from '../src/lib/design-approval.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const lane = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-approval-'));
fs.mkdirSync(path.join(lane, 'src/app'), { recursive: true });
fs.writeFileSync(path.join(lane, 'src/app/page.tsx'), 'export default function Page() { return null; }\n');
const contract = defaultContract(lane, 'demo', 'refactor');
const review = { overall: 7.6, measuredAt: '2026-11-08T20:00:00Z', scores: { typography: 8, color: 7 } };

function approval(overrides = {}) {
  return {
    version: 1, project: 'demo', page: 'project', variant: null, note: null,
    approvedBy: 'user', approvedAt: '2026-11-08T20:01:00Z',
    contractHash: contractHash(contract), reviewHash: reviewHash(review),
    screenshotHash: null, scoreAtApproval: review.overall, ...overrides,
  };
}

try {
  ok('no approval is a failure, not an implicit pass', () => {
    const v = validateApproval(null, contract, review);
    assert.equal(v.ok, false);
    assert.match(v.reasons[0], /no design-approval/);
  });

  ok('a matching approval over a 7.6 review passes', () => {
    const v = validateApproval(approval(), contract, review);
    assert.equal(v.ok, true, v.reasons.join('; '));
  });

  ok('the contract changing invalidates the approval', () => {
    const changed = { ...contract, pages: contract.pages.map((p) => ({ ...p, status: 'decided' })) };
    const v = validateApproval(approval(), changed, review);
    assert.equal(v.ok, false);
    assert.ok(v.reasons.some((r) => /contract changed/.test(r)), v.reasons.join('; '));
  });

  ok('the review changing invalidates the approval', () => {
    const changed = { ...review, overall: 7.1 };
    const v = validateApproval(approval(), contract, changed);
    assert.equal(v.ok, false);
    assert.ok(v.reasons.some((r) => /review changed/.test(r)), v.reasons.join('; '));
  });

  ok('a review below 7 fails even with a matching approval', () => {
    const low = { overall: 4.9, measuredAt: '2026-11-08T20:00:00Z', scores: {} };
    const a = approval({ reviewHash: reviewHash(low), scoreAtApproval: 4.9 });
    const v = validateApproval(a, contract, low);
    assert.equal(v.ok, false);
    assert.ok(v.reasons.some((r) => /4\.9 < 7/.test(r)), v.reasons.join('; '));
  });

  ok('write/read/clear round-trips', () => {
    writeApproval(lane, approval());
    assert.equal(readApproval(lane)?.scoreAtApproval, 7.6);
    clearApproval(lane);
    assert.equal(readApproval(lane), null);
  });
} finally {
  fs.rmSync(lane, { recursive: true, force: true });
}

console.log(`\ndesign-approval: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
