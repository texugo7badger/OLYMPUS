#!/usr/bin/env node
/**
 * skill-index-refresh.test.mjs — W-A RAG-CERT A1: the skill-index refresher cure.
 * Run: node scripts/skill-index-refresh.test.mjs   (exit 0 = pass)
 *
 * The live defect (the 2026-10-19 RAG audit): the skill index was NEVER built
 * on this machine — ~/OLYMPUS-VAULT/03_Index/skill-vec.db absent, the router's
 * top-5 skill hints silently dead — because (a) nothing builds the index at
 * install/app-start, and (b) the spawned watcher (incremental-skill-index.js)
 * probes a legacy `skills` table that the builder never writes
 * (build-skill-index.js writes skill_vectors + skill_metadata), so it exits
 * on EVERY launch ("schema migration pending v0.0.2") and exits 1 when the
 * DB is absent.
 *
 * The cure (one schema, one builder): the watcher becomes a debounced
 * FULL-REBUILD watcher — the vec0 table's fixed dimensionality makes true
 * incremental upsert a lie anyway (a new term = a full rebuild); the builder
 * is the single schema authority; the watcher self-heals an absent index
 * (builds it instead of exit 1) and re-spawns the builder (debounced) on
 * skill-file changes.
 *
 * Fixtures build into a TEMP VAULT_ROOT (never the real ~/OLYMPUS-VAULT).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WATCHER = path.join(OLYMPUS, 'scripts', 'incremental-skill-index.js');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

function tempVault() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-skillidx-'));
}

function runOnce(vaultRoot) {
  return spawnSync(process.execPath, [WATCHER, '--once'], {
    cwd: OLYMPUS,
    encoding: 'utf-8',
    env: { ...process.env, OLYMPUS_ROOT: OLYMPUS, OLYMPUS_VAULT: vaultRoot, OLYMPUS_VAULT_DIR: vaultRoot },
  });
}

function runWatchOnce(vaultRoot) {
  // The Electron main spawns the watcher with NO --once flag; the self-heal
  // build must happen in watcher mode too (before the watch loop starts).
  // We give it a moment and then SIGTERM it (the documented shutdown path).
  const child = spawnSync(process.execPath, [WATCHER], {
    cwd: OLYMPUS,
    encoding: 'utf-8',
    env: { ...process.env, OLYMPUS_ROOT: OLYMPUS, OLYMPUS_VAULT: vaultRoot, OLYMPUS_VAULT_DIR: vaultRoot },
    timeout: 30_000,
  });
  return child;
}

function main() {
  // ── A1-a: the self-heal — absent index BUILDS, never exit 1 ──────────────
  const vaultA = tempVault();
  const r1 = runOnce(vaultA);
  const dbA = path.join(vaultA, '03_Index', 'skill-vec.db');
  const vocabA = path.join(vaultA, '03_Index', 'skill-vocab.json');
  expect('A1: `--once` self-heals an absent index (exit 0, never the old exit 1)',
    r1.status === 0, `exit=${r1.status} stderr=${(r1.stderr || '').slice(-300)}`);
  expect('A1: the self-heal builds skill-vec.db',
    fs.existsSync(dbA), 'absent — the watcher still refuses instead of building');
  expect('A1: the self-heal writes skill-vocab.json (the runtime query side)',
    fs.existsSync(vocabA), 'absent — SkillIndex cannot vectorize queries');

  if (fs.existsSync(dbA)) {
    const db = new Database(dbA, { readonly: true });
    sqliteVec.load(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    const count = db.prepare('SELECT COUNT(*) as count FROM skill_metadata').get().count;
    expect('A1: the new schema is the one truth (skill_vectors + skill_metadata, no legacy `skills` probing)',
      tables.includes('skill_vectors') && tables.includes('skill_metadata'),
      `tables=${tables.join(',')}`);
    expect('A1: the index carries the real skills corpus (count > 300 documents)',
      count > 300, `count=${count}`);
    db.close();
  }

  // ── A1-b: idempotent re-run (the debounced-rebuild contract) ─────────────
  const r2 = runOnce(vaultA);
  expect('A1: a re-run rebuild stays green (idempotent, DB already present)',
    r2.status === 0, `exit=${r2.status} stderr=${(r2.stderr || '').slice(-300)}`);
  if (fs.existsSync(path.join(vaultA, '03_Index', 'skill-vec.db'))) {
    const dbA2 = new Database(path.join(vaultA, '03_Index', 'skill-vec.db'), { readonly: true });
    const count2 = dbA2.prepare('SELECT COUNT(*) as count FROM skill_metadata').get().count;
    dbA2.close();
    expect('A1: the rebuilt index keeps the corpus consistent (same count class)',
      count2 > 300, `count=${count2}`);
  } else {
    expect('A1: the rebuilt index keeps the corpus consistent (same count class)', false, 'no DB after re-run');
  }

  // ── A1-c: watcher mode self-heals too (the Electron spawn path) ───────────
  const vaultC = tempVault();
  const r3 = runWatchOnce(vaultC);
  const dbC = path.join(vaultC, '03_Index', 'skill-vec.db');
  expect('A1: watcher mode (no --once) also builds an absent index before watching',
    fs.existsSync(dbC), `the spawned watcher still dies without building — stderr=${(r3.stderr || '').slice(-200)}`);

  // ── A1-d: the app-start wiring pin (Electron main still spawns the watcher)
  const main = fs.readFileSync(path.join(OLYMPUS, 'electron', 'main.ts'), 'utf-8');
  expect('A1: the Electron main still spawns the watcher at app start (the app-start wiring)',
    main.includes('incremental-skill-index.js'), 'the spawn seam was dropped — the index would rot');

  // ── Cleanup ───────────────────────────────────────────────────────────────
  for (const v of [vaultA, vaultC]) fs.rmSync(v, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`\nskill-index-refresh: ${failures} FAIL`);
    process.exit(1);
  }
  console.log('\nskill-index-refresh: all green.');
}

main();
