#!/usr/bin/env node
/**
 * bench-hops.test.mjs — v0.0.86: the hop benchmark reports causes and gates.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const expect = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 260)}`);
  if (!cond) failures++;
};
const run = (lane, extra = []) => spawnSync(process.execPath, ['scripts/bench-hops.mjs', '--lane', lane, ...extra], { cwd: ROOT, encoding: 'utf-8', timeout: 30_000 });
const row = (over) => JSON.stringify({ ts: new Date().toISOString(), god: 'athena', lane: 'opencode-go/qwen3.7-plus', tokensIn: 1000, tokensOut: 100, durationMs: 60_000, retriesAbsorbed: 0, status: 'completed', ...over });

const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-clean-'));
fs.writeFileSync(path.join(clean, '.olympus-hop-telemetry.jsonl'), [
  row({ hop: 'a' }), row({ hop: 'b', durationMs: 120_000 }),
].join('\n') + '\n');
const cleanRun = run(clean, ['--json', '--gate']);
const cleanJson = JSON.parse(cleanRun.stdout || '{}');
expect('H-1: a clean lane reports totals, percentiles and passes the gate', cleanRun.status === 0 && cleanJson.rows === 2 && cleanJson.completed === 2 && cleanJson.parked === 0 && cleanJson.durationMinutes?.p50 === 1, cleanRun.stdout.slice(-300));

const dirty = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-dirty-'));
fs.writeFileSync(path.join(dirty, '.olympus-hop-telemetry.jsonl'), [
  row({ hop: 'a' }),
  row({ hop: 'b', status: 'parked-dispatch-failed', error: 'ECONNREFUSED', errorClass: 'transport', tokensIn: null, tokensOut: null, durationMs: 900_000 }),
  row({ hop: 'c', status: 'parked-dispatch-failed', tokensIn: null, tokensOut: null, durationMs: 600_000 }),
].join('\n') + '\n');
const dirtyRun = run(dirty, ['--json', '--gate']);
const dirtyJson = JSON.parse(dirtyRun.stdout || '{}');
expect('H-2: parked rows are classified and counted by share', dirtyJson.parked === 2 && dirtyJson.parkClasses?.transport === 1 && dirtyJson.parkClasses?.unclassified === 1 && dirtyJson.parkedShare === 66.7, dirtyJson.parkClasses);
expect('H-3: the gate fails on a recent park with no cause', dirtyRun.status === 1 && dirtyJson.gate?.ok === false && (dirtyJson.gate?.failures || []).some((f) => /no cause/.test(f)), dirtyJson.gate);
expect('H-4: null tokens and duration p90 are measured (the AIME truth)', dirtyJson.nullTokenShare === 66.7 && dirtyJson.durationMinutes?.p90 === 15, dirtyJson);

fs.rmSync(clean, { recursive: true, force: true });
fs.rmSync(dirty, { recursive: true, force: true });
console.log(failures === 0 ? '\nbench-hops: all green.' : `\nbench-hops: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
