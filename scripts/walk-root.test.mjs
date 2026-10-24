#!/usr/bin/env node
/**
 * walk-root.test.mjs — THE ROOT-SPLIT REGRESSION (the AIME 2026-10-24 00:00
 * specimen).
 *
 * The project note lived at ~/OLYMPUS-VAULT/02_Projects/aime; the warm
 * session's cwd (and therefore the planner's write) was the workspace lane
 * ~/.local/share/olympus/workspace/aime. The post-run read the NOTE HOME,
 * found no dispatch-plan.json, and returned silently — six "continue"s in a
 * row with zero hops, zero telemetry, and Apollo reporting a "broken seam".
 *
 * pickPlanRoot() makes the walk read the plan WHERE IT WAS WRITTEN, and the
 * route uses the same resolver for the planner marker (so the marker and the
 * walk can never disagree again).
 *
 * Run: npx tsx scripts/walk-root.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

const { pickPlanRoot, walkRootNote } = await import('../src/lib/hop-runtime/walk-root.ts');

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-walk-root-'));
const mk = (name, files = []) => {
  const dir = path.join(BASE, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(dir, f), '{}');
  return dir;
};

// ── S1: the AIME shape — the plan is in the LANE, the note home has none ────
{
  const note = mk('s1/vault/02_Projects/aime', ['project.md']);
  const lane = mk('s1/workspace/aime', ['dispatch-plan.json', 'plan.md']);
  const res = pickPlanRoot([lane, undefined, note]);
  expect('S1 the lane plan wins over the note home', res.root === lane, JSON.stringify(res));
  expect('S1 the reason names the on-disk plan', res.reason === 'plan-on-disk', res.reason);
  expect('S1 no "moved" note when the first candidate already held the plan', walkRootNote(res) === null, walkRootNote(res));
}

// ── S2: the plan lives in the note home — it wins there ────────────────────
{
  const note = mk('s2/vault/02_Projects/aime', ['dispatch-plan.json']);
  const lane = mk('s2/workspace/aime');
  const res = pickPlanRoot([lane, note]);
  expect('S2 a note-home plan wins when the lane has none', res.root === note, JSON.stringify(res));
  expect('S2 the move to the note home is surfaced honestly', /resolved to .*02_Projects.*had no plan/i.test(String(walkRootNote(res))), walkRootNote(res));
}

// ── S3: no plan yet — the planner's working lane (plan.md) wins ────────────
{
  const note = mk('s3/vault/02_Projects/aime', ['project.md']);
  const lane = mk('s3/workspace/aime', ['plan.md']);
  const res = pickPlanRoot([lane, note]);
  expect('S3 the lane plan.md is the write target', res.root === lane && res.reason === 'lane-plan-md', JSON.stringify(res));
}

// ── S4: neither plan nor plan.md — the first existing directory ────────────
{
  const note = mk('s4/vault/02_Projects/aime');
  const lane = mk('s4/workspace/aime');
  const res = pickPlanRoot([lane, note]);
  expect('S4 the dispatch cwd is the default', res.root === lane && res.reason === 'lane-cwd', JSON.stringify(res));
}

// ── S5: nothing exists (a fresh project) — the caller's first choice ───────
{
  const lane = path.join(BASE, 's5/does-not-exist');
  const note = path.join(BASE, 's5/also-missing');
  const res = pickPlanRoot([lane, note]);
  expect('S5 a fresh project keeps the dispatch cwd (the plan-wait polls there)', res.root === lane, JSON.stringify(res));
  expect('S5 the reason is explicit', res.reason === 'default', res.reason);
}

// ── S6: dedupe + the REAL AIME paths (the specimen that shipped) ───────────
{
  const res = pickPlanRoot([BASE, BASE, null, undefined]);
  expect('S6 duplicate candidates collapse', res.candidates.length === 1, JSON.stringify(res.candidates));

  const realLane = path.join(os.homedir(), '.local/share/olympus/workspace/aime');
  const realNote = path.join(os.homedir(), 'OLYMPUS-VAULT/02_Projects/aime');
  if (fs.existsSync(realLane) || fs.existsSync(realNote)) {
    const live = pickPlanRoot([realLane, realNote]);
    const expected = fs.existsSync(path.join(realLane, 'dispatch-plan.json')) ? realLane : realNote;
    expect('S6 the REAL AIME lane resolves to the plan it actually holds',
      live.root === expected, `${live.root} (expected ${expected})`);
  } else {
    console.log('SKIP  S6 real AIME lane — absent on this machine');
  }
}

fs.rmSync(BASE, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\nwalk-root: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nwalk-root: all green (the walk reads the plan where it was written).');
