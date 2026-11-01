#!/usr/bin/env node
/**
 * retention.test.mjs — R31-05 (v0.0.31).
 *
 * Pins the retention planner: newest-N keeps, whole backup sets, the live DB
 * never a candidate, and the safety guard refusing paths outside the roots.
 * A real temp-dir pass proves `applyPlan` only removes what the plan listed.
 *
 * Run: node scripts/retention.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_POLICY,
  applyPlan,
  assertSafePath,
  combinePlans,
  formatBytes,
  planBuildArchive,
  planConfigBackups,
  planDbBackups,
} from './retention-plan.mjs';

let passed = 0;
function ok(name, fn) {
  try {
    fn();
    console.log('PASS ', name);
    passed += 1;
  } catch (e) {
    console.log('FAIL ', name, '—', e?.message || e);
    process.exitCode = 1;
  }
}

const entry = (name, mtimeMs, bytes = 10) => ({
  name,
  path: `/tmp/root/${name}`,
  mtimeMs,
  bytes,
});

// ── bytes ────────────────────────────────────────────────────────────────
ok('formatBytes is honest at every scale', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(999), '999 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(8.9 * 1024 ** 3), '8.9 GB');
});

// ── build archive ────────────────────────────────────────────────────────
ok('build archive keeps the newest three and lists the rest', () => {
  const plan = planBuildArchive([
    entry('dist-electron-0.0.6', 6, 8.9 * 1024 ** 3),
    entry('dist-electron-0.0.5', 5, 100),
    entry('dist-electron-0.0.4', 4, 100),
    entry('dist-electron-0.0.3', 3, 100),
    entry('not-a-build', 9, 999),
  ]);
  assert.equal(plan.keep.length, 3);
  assert.equal(plan.remove.length, 1);
  assert.equal(plan.remove[0].name ?? path.basename(plan.remove[0].path), 'dist-electron-0.0.3');
  assert.equal(plan.reclaimBytes, 100);
});

ok('build archive with fewer than three entries removes nothing', () => {
  const plan = planBuildArchive([entry('dist-electron-0.0.2', 2, 50)]);
  assert.equal(plan.remove.length, 0);
  assert.equal(plan.reclaimBytes, 0);
});

ok('a build far behind the running version is pruned even when it is the only one', () => {
  const plan = planBuildArchive(
    [entry('dist-electron-0.0.6', 1, 8.9 * 1024 ** 3)],
    DEFAULT_POLICY,
    { currentVersion: '0.0.30' },
  );
  assert.equal(plan.keep.length, 0);
  assert.equal(plan.remove.length, 1);
  assert.equal(plan.reclaimBytes, 8.9 * 1024 ** 3);
});

ok('recent builds inside the version window survive', () => {
  const plan = planBuildArchive(
    [
      entry('dist-electron-0.0.30', 30, 100),
      entry('dist-electron-0.0.29', 29, 100),
      entry('dist-electron-0.0.27', 27, 100),
      entry('dist-electron-0.0.26', 26, 100),
    ],
    DEFAULT_POLICY,
    { currentVersion: '0.0.30' },
  );
  assert.deepEqual(
    plan.keep.map((p) => path.basename(p)),
    ['dist-electron-0.0.30', 'dist-electron-0.0.29', 'dist-electron-0.0.27'],
  );
  assert.equal(plan.remove.length, 1);
});

ok('an unparseable build name is kept (never guess)', () => {
  const plan = planBuildArchive(
    [entry('dist-electron-nightly', 1, 1)],
    DEFAULT_POLICY,
    { currentVersion: '0.0.30' },
  );
  assert.equal(plan.remove.length, 0);
});

// ── DB backups ───────────────────────────────────────────────────────────
ok('DB backups keep three sets and remove older sets with their siblings', () => {
  const plan = planDbBackups([
    entry('opencode.db.bak', 1, 1_718_706_176),
    entry('opencode.db.bak-shm', 1, 32_768),
    entry('opencode.db.bak-wal', 1, 0),
    entry('opencode.db.bak-1793467652194', 2, 299_008),
    entry('opencode.db.bak-1793553984239', 3, 38_260_736),
    entry('opencode.db.bak-1793553984239-shm', 3, 32_768),
    entry('opencode.db.bak-1793553984239-wal', 3, 0),
    entry('opencode.db.bak-1793555120315', 4, 12_197_888),
  ]);
  assert.deepEqual(plan.keep, [
    'opencode.db.bak-1793555120315',
    'opencode.db.bak-1793553984239',
    'opencode.db.bak-1793467652194',
  ]);
  assert.equal(plan.remove.length, 3); // legacy set: .bak + -shm + -wal
  assert.ok(plan.remove.every((r) => path.basename(r.path).startsWith('opencode.db.bak')));
  assert.equal(plan.reclaimBytes, 1_718_706_176 + 32_768);
});

ok('the live database and .broken archives are never candidates', () => {
  const plan = planDbBackups([
    entry('opencode.db', 9, 37_810_176),
    entry('opencode.db-wal', 9, 15_487_112),
    entry('opencode.db-shm', 9, 32_768),
    entry('opencode.db.broken-1793573131850', 9, 900),
  ]);
  assert.equal(plan.keep.length, 0);
  assert.equal(plan.remove.length, 0);
  assert.equal(plan.reclaimBytes, 0);
});

ok('a single DB backup set is never pruned', () => {
  const plan = planDbBackups([entry('opencode.db.bak', 1, 42)]);
  assert.equal(plan.remove.length, 0);
});

// ── config snapshots ─────────────────────────────────────────────────────
ok('config snapshots keep ten and prune the rest', () => {
  const entries = Array.from({ length: 14 }, (_, i) =>
    entry(`opencode.json.2026110${String(i).padStart(2, '0')}T000000Z.bak`, i, 50_000),
  );
  const plan = planConfigBackups(entries);
  assert.equal(plan.keep.length, DEFAULT_POLICY.configBackupKeep);
  assert.equal(plan.remove.length, 4);
  assert.ok(plan.remove.every((r) => r.bytes === 50_000));
});

// ── safety ───────────────────────────────────────────────────────────────
ok('a path outside the allowed roots is refused', () => {
  assert.throws(
    () => assertSafePath('/home/user/OLYMPUS-VAULT/02_Projects/aime', ['/home/texugo/.olympus']),
    /outside allowed roots/,
  );
});

ok('the root itself is refused (never rm -rf the root)', () => {
  assert.throws(() => assertSafePath('/home/texugo/.olympus', ['/home/texugo/.olympus']), /outside allowed roots/);
});

ok('traversal resolves before the guard', () => {
  assert.throws(
    () => assertSafePath('/home/texugo/.olympus/../Documents', ['/home/texugo/.olympus']),
    /outside allowed roots/,
  );
});

ok('a relative path is refused', () => {
  assert.throws(() => assertSafePath('.olympus/build-archive/x', ['/home/texugo/.olympus']), /relative path/);
});

// ── apply on a real temp tree ────────────────────────────────────────────
ok('applyPlan deletes exactly the plan and keeps the survivors', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-retention-'));
  const archive = path.join(root, 'build-archive');
  fs.mkdirSync(archive, { recursive: true });
  const names = ['dist-electron-0.0.6', 'dist-electron-0.0.5', 'dist-electron-0.0.4', 'dist-electron-0.0.3'];
  for (const [i, name] of names.entries()) {
    const dir = path.join(archive, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'payload.bin'), Buffer.alloc(1024));
    const t = new Date(2026, 9, 1 + i);
    fs.utimesSync(dir, t, t);
  }
  const entries = fs.readdirSync(archive).map((name) => {
    const full = path.join(archive, name);
    const stat = fs.statSync(full);
    return { name, path: full, mtimeMs: stat.mtimeMs, bytes: 1024 };
  });
  const plan = planBuildArchive(entries);
  assert.equal(plan.remove.length, 1);
  const result = applyPlan(plan, {
    roots: [archive],
    removePath: (target) => fs.rmSync(target, { recursive: true, force: true }),
  });
  assert.equal(result.removed.length, 1);
  assert.equal(result.removedBytes, 1024);
  // The newest by mtime survive (0.0.3 is the newest in this fixture).
  assert.deepEqual(fs.readdirSync(archive).sort(), [
    'dist-electron-0.0.3',
    'dist-electron-0.0.4',
    'dist-electron-0.0.5',
  ]);
  fs.rmSync(root, { recursive: true, force: true });
});

ok('combinePlans sums the families', () => {
  const a = planBuildArchive([entry('dist-electron-a', 1, 100)]);
  const b = planDbBackups([]);
  const report = combinePlans([a, b]);
  assert.equal(report.reclaimBytes, 0);
  assert.equal(report.reclaimHuman, '0 B');
  assert.equal(report.families.length, 2);
});

console.log(`\nretention: ${passed} passed`);
