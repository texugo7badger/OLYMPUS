#!/usr/bin/env node
/**
 * quick-edit.test.mjs — v0.0.91: the 60-second lane's deterministic core.
 *
 * The model turn is not tested here (it needs a provider). What IS tested is
 * the contract around it: snapshot, diff, changed-line count, restore, undo,
 * and the <=3 files / <=200 lines guardrail constants.
 *
 * Run: npx tsx scripts/quick-edit.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  diffProject,
  QUICK_EDIT_MAX_FILES,
  QUICK_EDIT_MAX_LINES,
  restoreSnapshot,
  snapshotProject,
  undoQuickEdit,
} from '../src/lib/quick-edit.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

function lane() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-quick-'));
  fs.mkdirSync(path.join(dir, 'src/app'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/app/page.tsx'), 'export default function Page() { return <main>one</main>; }\n');
  return dir;
}

ok('the guardrails are the promised 3 files / 200 lines', () => {
  assert.equal(QUICK_EDIT_MAX_FILES, 3);
  assert.equal(QUICK_EDIT_MAX_LINES, 200);
});

ok('snapshot + diff detects a changed file and counts lines', () => {
  const dir = lane();
  try {
    const snap = snapshotProject(dir);
    fs.writeFileSync(path.join(dir, 'src/app/page.tsx'), 'export default function Page() { return <main>two</main>; }\n');
    const diff = diffProject(dir, snap);
    assert.deepEqual(diff.changed, ['src/app/page.tsx']);
    assert.ok(diff.changedLines >= 2, `changedLines=${diff.changedLines}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

ok('restoreSnapshot puts the original back', () => {
  const dir = lane();
  try {
    const original = fs.readFileSync(path.join(dir, 'src/app/page.tsx'), 'utf-8');
    const snap = snapshotProject(dir);
    fs.writeFileSync(path.join(dir, 'src/app/page.tsx'), 'broken\n');
    restoreSnapshot(snap);
    assert.equal(fs.readFileSync(path.join(dir, 'src/app/page.tsx'), 'utf-8'), original);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

ok('an added file is detected and undo removes it', () => {
  const dir = lane();
  try {
    const snap = snapshotProject(dir);
    fs.writeFileSync(path.join(dir, 'src/app/extra.tsx'), 'export const x = 1;\n');
    const diff = diffProject(dir, snap);
    assert.deepEqual(diff.added, ['src/app/extra.tsx']);
    const undo = undoQuickEdit(dir, snap.backupRoot);
    assert.equal(undo.ok, true);
    assert.equal(fs.existsSync(path.join(dir, 'src/app/extra.tsx')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

ok('a deleted file is detected and restore brings it back', () => {
  const dir = lane();
  try {
    const snap = snapshotProject(dir);
    fs.rmSync(path.join(dir, 'src/app/page.tsx'));
    const diff = diffProject(dir, snap);
    assert.deepEqual(diff.deleted, ['src/app/page.tsx']);
    restoreSnapshot(snap, diff);
    assert.equal(fs.existsSync(path.join(dir, 'src/app/page.tsx')), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log(`\nquick-edit: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
