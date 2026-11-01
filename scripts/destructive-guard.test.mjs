#!/usr/bin/env node
/**
 * destructive-guard.test.mjs — v0.0.30 (#C6/#H9).
 *
 * The AIME `g2-profile` hop wiped a 226-work database at 23:01:10Z. This
 * suite pins the classifier and the backup preflight so a destructive hop
 * can never run without a copy of the lane's databases.
 *
 * Run: npx tsx scripts/destructive-guard.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import {
  backupBeforeDestructiveHop,
  backupProjectDatabases,
  classifyDestructiveCommand,
  findProjectDatabases,
} from '../src/lib/destructive-guard.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('rm -rf is destructive', () => assert.equal(classifyDestructiveCommand('rm -rf prisma').destructive, true));
ok('prisma migrate reset is destructive', () => assert.equal(classifyDestructiveCommand('npx prisma migrate reset --force').destructive, true));
ok('prisma db push is destructive', () => assert.equal(classifyDestructiveCommand('npx prisma db push --skip-generate').destructive, true));
ok('db:reset is destructive', () => assert.equal(classifyDestructiveCommand('npm run db:reset').destructive, true));
ok('DELETE without WHERE is destructive', () => assert.equal(classifyDestructiveCommand('DELETE FROM works;').destructive, true));
ok('DELETE with WHERE is not destructive', () => assert.equal(classifyDestructiveCommand('DELETE FROM works WHERE id = 1;').destructive, false));
ok('build is not destructive', () => assert.equal(classifyDestructiveCommand('npm run build').destructive, false));
ok('grep of a destructive string is still a match (conservative)', () => assert.equal(classifyDestructiveCommand('grep -n "rm -rf" README.md').destructive, true));

const lane = mkdtempSync(join(tmpdir(), 'olympus-destructive-'));
try {
  mkdirSync(join(lane, 'prisma'), { recursive: true });
  writeFileSync(join(lane, 'prisma', 'dev.db'), 'DATA-226-WORKS', 'utf-8');
  writeFileSync(join(lane, 'README.md'), '# lane', 'utf-8');

  ok('findProjectDatabases finds prisma/dev.db', () => {
    const dbs = findProjectDatabases(lane);
    assert.equal(dbs.length, 1);
    assert.ok(dbs[0].endsWith('prisma/dev.db'));
  });

  ok('backupProjectDatabases copies the database + manifest', () => {
    const r = backupProjectDatabases(lane);
    assert.equal(r.ok, true);
    assert.ok(r.dir);
    assert.ok(existsSync(join(r.dir, 'prisma', 'dev.db')));
    assert.equal(readFileSync(join(r.dir, 'prisma', 'dev.db'), 'utf-8'), 'DATA-226-WORKS');
    const manifest = JSON.parse(readFileSync(join(r.dir, 'manifest.json'), 'utf-8'));
    assert.deepEqual(manifest.files, ['prisma/dev.db']);
  });

  ok('a destructive hop with a DB backs up before dispatch', () => {
    const r = backupBeforeDestructiveHop(lane, { id: 'g2-profile', prompt: 'run npx prisma db push and then npm run db:seed' });
    assert.equal(r.needed, true);
    assert.ok(r.backup?.dir);
    assert.equal(r.error, undefined);
  });

  ok('a non-destructive hop does not back up', () => {
    const r = backupBeforeDestructiveHop(lane, { id: 'ui', prompt: 'change the button color' });
    assert.equal(r.needed, false);
    assert.equal(r.backup, null);
  });
} finally {
  rmSync(lane, { recursive: true, force: true });
}

console.log(`\ndestructive-guard: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
