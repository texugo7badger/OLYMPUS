#!/usr/bin/env node
/**
 * tasks-telemetry.test.mjs — W-D2+D3 MISSION-CONTROL-TRUE: the running hop
 * becomes VISIBLE (inFlight ground truth) + the whole-project time
 * projection ships.
 * Run: npx tsx scripts/tasks-telemetry.test.mjs   (exit 0 = pass)
 *
 * The live defects (the 2026-10-19 dashboard audit):
 *   (a) The running-hop render path is DEAD: telemetry rows are written only
 *       at hop SETTLE, so the tasks route's `status==='running'` progress
 *       branch never executes; the post-map loop marks a hop running but
 *       never sets progress/startedAt — the Parthenon timer + progress bar
 *       never render, and a fresh campaign's FIRST hop reads "pending"/"0
 *       active" (lastTelTs=0 fails the 30-min window).
 *   (b) NO project-level "time to finish" exists anywhere — zero matches for
 *       projection/remaining/finish across src/.
 *
 * The cure: the walker persists `inFlight` (hopId+startedAt) in the
 * hop-state on every launch/settle (the disk carries the campaign); the
 * tasks-sheet extraction (src/lib/tasks-sheet.ts — the route becomes a thin
 * shell) marks the inFlight hop RUNNING with startedAt + an honest
 * telemetry-derived progress, and computes the critical-path projection:
 * per-god serial expected time (the pool serializes same-lane hops), the
 * max across gods = the projected remaining wall time.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

async function main() {
  // ── Source pins: the seams exist ──────────────────────────────────────────
  const stateSrc = read('src/lib/hop-runtime/hop-state.ts');
  expect('D2: hop-state carries inFlight (the running hops, persisted)',
    /inFlight/.test(stateSrc) && /hopId: string;\s+startedAt: string/.test(stateSrc),
    'the state file has no running-hop record — the tasks route can only guess');
  const walkerSrc = read('src/lib/hop-runtime/walker.ts');
  expect('D2: the walker persists inFlight on launch/settle (the disk carries the campaign)',
    /inFlight: \[\.\.\.inFlight\.values\(\)\]/.test(walkerSrc),
    'the walker never writes which hops are running — timers can never render');
  const sheetSrc = fs.existsSync(path.join(OLYMPUS, 'src/lib/tasks-sheet.ts'))
    ? read('src/lib/tasks-sheet.ts') : '';
  expect('D2: the tasks logic is extracted + testable (src/lib/tasks-sheet.ts)',
    sheetSrc.includes('export function buildTasksSheet') || sheetSrc.includes('export async function buildTasksSheet'),
    'the join logic lives inline in the route — no fixture lane can test it');
  const routeSrc = read('src/app/api/olympus/tasks/route.ts');
  expect('D2: the route is a thin shell (imports the sheet builder)',
    routeSrc.includes('tasks-sheet') && routeSrc.includes('buildTasksSheet'),
    'the route still owns the join logic');
  const panelSrc = read('src/components/olympus/god-panel.tsx');
  expect('D2: the Parthenon chip reads startedAt (the running tick comes alive)',
    panelSrc.includes('t.startedAt'),
    'the elapsed chip reads t.ts — running hops have none (telemetry settles at hop end)');
  const tlSrc = read('src/components/olympus/activity-timeline.tsx');
  expect('D3: the Timeline renders the projection card (time-to-finish, the user ask)',
    /projectedRemainingMs|projected/.test(tlSrc),
    'no surface renders a whole-project time projection');
  const postRunSrc = read('src/lib/hop-runtime/post-run.ts');
  expect('D3: the parked walk summary names the projected remaining time',
    /projectedRemainingMs/.test(postRunSrc),
    'the RESUME contract carries no time expectation');

  // ── Functional: the fixture lane round-trip ───────────────────────────────
  if (!sheetSrc) {
    expect('D2: the inFlight ground truth marks the hop RUNNING with startedAt + progress', false, 'blocked: no tasks-sheet module');
    expect('D2: the fresh-first-hop lie dies (inFlight decides, not the 30-min window)', false, 'blocked');
    expect('D3: the projection is the honest critical path (per-god serial, max across gods)', false, 'blocked');
    expect('D3: the campaign stats carry completed/running/pending + tokens', false, 'blocked');
    return finish();
  }

  const lane = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-tasks-'));
  const NOW = Date.now();
  // The plan: 5 hops — h1/h2 done (hephaestus), h3 RUNNING (hephaestus,
  // started 60s ago), h4/h5 pending (athena).
  fs.writeFileSync(path.join(lane, 'dispatch-plan.json'), JSON.stringify({
    version: 1, laneRoot: lane,
    hops: [
      { id: 'h1', god: 'hephaestus', prompt: 'scaffold the app shell', artifacts: ['app/page.tsx'], after: [] },
      { id: 'h2', god: 'hephaestus', prompt: 'the data layer', artifacts: ['lib/db.ts'], after: ['h1'] },
      { id: 'h3', god: 'hephaestus', prompt: 'the auth module', artifacts: ['lib/auth.ts'], after: ['h2'] },
      { id: 'h4', god: 'athena', prompt: 'the ui kit', artifacts: ['components/ui.tsx'], after: ['h1'] },
      { id: 'h5', god: 'athena', prompt: 'the dashboard', artifacts: ['components/dash.tsx'], after: ['h4'] },
    ],
  }));
  fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({
    version: 1,
    completed: ['h1', 'h2'],
    parked: null,
    inFlight: [{ hopId: 'h3', startedAt: new Date(NOW - 60_000).toISOString() }],
    updatedAt: new Date(NOW - 60_000).toISOString(),
  }));
  fs.writeFileSync(path.join(lane, '.olympus-hop-telemetry.jsonl'), [
    JSON.stringify({ ts: new Date(NOW - 400_000).toISOString(), hop: 'h1', god: 'hephaestus', durationMs: 120_000, tokensIn: 1000, tokensOut: 200, status: 'completed' }),
    JSON.stringify({ ts: new Date(NOW - 200_000).toISOString(), hop: 'h2', god: 'hephaestus', durationMs: 180_000, tokensIn: 1000, tokensOut: 300, status: 'completed' }),
  ].join('\n') + '\n');

  const { buildTasksSheet } = await import(OLYMPUS + '/src/lib/tasks-sheet.ts');
  const sheet = buildTasksSheet({ lane, now: NOW });
  const byId = new Map(sheet.tasks.map((t) => [t.id, t]));
  const h3 = byId.get('h3');

  expect('D2: the inFlight ground truth marks the hop RUNNING with startedAt + progress',
    h3?.status === 'running'
    && typeof h3?.startedAt === 'string'
    && typeof h3?.progress === 'number' && h3.progress >= 3 && h3.progress <= 95,
    `h3 = ${JSON.stringify(h3 && { status: h3.status, startedAt: h3.startedAt, progress: h3.progress })}`);
  expect('D2: the fresh-first-hop lie dies (inFlight decides, not the 30-min window)',
    h3?.status === 'running' && sheet.stats?.running === 1,
    `stats=${JSON.stringify(sheet.stats)} — a fresh campaign's first hop must read running from inFlight alone`);
  expect('D2: completed hops keep the 100% + the settled telemetry',
    byId.get('h1')?.status === 'completed' && byId.get('h1')?.progress === 100 && byId.get('h2')?.durationMs === 180_000,
    `h1=${JSON.stringify(byId.get('h1'))}`);
  expect('D2: pending hops stay pending (never a fake running)',
    byId.get('h4')?.status === 'pending' && byId.get('h5')?.status === 'pending',
    'un-started hops must not borrow the running badge');

  // The projection: the implementation's median is the UPPER middle (the
  // house's established median() — [120s, 180s] → 180s), so hephaestus's
  // expected = 180s: h3 remaining = 180s - 60s elapsed = 120s; athena has
  // no samples → global median 180s × (h4+h5) = 360s. The CRITICAL PATH =
  // max(120s, 360s) = 360s — per-god serial, max across gods, never a flat
  // /3 that pretends same-pool hops run in parallel.
  const proj = sheet.stats?.projectedRemainingMs;
  expect('D3: the projection is the honest critical path (per-god serial, max across gods)',
    typeof proj === 'number' && proj >= 350_000 && proj <= 370_000,
    `projectedRemainingMs=${proj} — expected ~360000 (athena: 2 x 180s upper-median; hephaestus: 120s remaining)`);
  expect('D3: the campaign stats carry completed/running/pending + tokens',
    sheet.stats?.total === 5 && sheet.stats?.completed === 2 && sheet.stats?.running === 1
    && sheet.stats?.pending === 2 && sheet.stats?.tokensIn === 2000 && sheet.stats?.tokensOut === 500,
    `stats=${JSON.stringify(sheet.stats)}`);

  fs.rmSync(lane, { recursive: true, force: true });
  return finish();
}

function finish() {
  if (failures > 0) { console.error(`\ntasks-telemetry: ${failures} FAIL`); process.exit(1); }
  console.log('\ntasks-telemetry: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
