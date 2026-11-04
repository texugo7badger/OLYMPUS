#!/usr/bin/env node
/**
 * suspend-drill.mjs — v0.0.78: the suspend contract, proven with a marker.
 *
 * A real OS suspend cannot be automated safely on a machine in use. What CAN
 * be proven is the contract the walker relies on: when `suspend.json` says the
 * machine slept, the first-byte/silence timers must EXTEND (not park a healthy
 * hop). This drill runs a detached script hop with deliberately tiny timers
 * (1.5s), writes the suspend marker mid-hop, then resumes it — and asserts the
 * hop still completes and nothing parks.
 *
 *   node scripts/suspend-drill.mjs
 *
 * It is a SIMULATION of the marker, not an OS suspend; the real screen-off
 * drill is run by the maintainer (see VOICE/STABILITY docs). Exit 0 = the
 * contract holds.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-suspend-'));
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-vault-'));
const LANE = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-lane-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.env.OLYMPUS_HOME = HOME;
process.env.OLYMPUS_VAULT = VAULT;
// The timers this drill is about: without the suspend awareness, a 1.5s
// first-byte window would park the 8s script hop.
process.env.OLYMPUS_HOP_FIRST_BYTE_MS = '1500';
process.env.OLYMPUS_HOP_SILENCE_MS = '1500';

const plan = {
  version: 1,
  laneRoot: LANE,
  hops: [
    {
      id: 'suspend-hop', god: 'apollo', kind: 'script',
      command: 'sleep 8; echo survived > survived.txt',
      artifacts: ['survived.txt'],
      verify: { review: 'deterministic', checks: ['file-exists:survived.txt'] },
    },
  ],
};
fs.writeFileSync(path.join(LANE, 'dispatch-plan.json'), JSON.stringify(plan, null, 2));

const { startDetachedWalk, readSupervisor } = await import('../src/lib/hop-runtime/supervisor.ts');
const started = startDetachedWalk({ slug: 'suspend-drill', laneRoot: LANE, autoResume: false });
if (!started.ok) {
  console.error(`suspend-drill: could not start the walk — ${started.reason}`);
  process.exit(2);
}
console.log(`walk started (pid ${started.pid}) — writing the suspend marker mid-hop`);

await sleep(2_000);
const marker = path.join(HOME, 'suspend.json');
fs.mkdirSync(HOME, { recursive: true });
fs.writeFileSync(marker, JSON.stringify({ suspendedAt: new Date().toISOString(), resumedAt: null, active: true }, null, 2));
console.log('suspend marker written (the machine "slept")');

await sleep(3_000);
fs.writeFileSync(marker, JSON.stringify({ suspendedAt: new Date(Date.now() - 3_000).toISOString(), resumedAt: new Date().toISOString(), active: false }, null, 2));
console.log('resume marker written');

let rows = [];
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  try { rows = fs.readFileSync(path.join(LANE, '.olympus-hop-telemetry.jsonl'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { /* not yet */ }
  if (rows.some((r) => r.status === 'completed')) break;
}

const completed = rows.some((r) => r.hop === 'suspend-hop' && r.status === 'completed');
const parked = rows.some((r) => r.hop === 'suspend-hop' && String(r.status).startsWith('parked'));
const artifact = fs.existsSync(path.join(LANE, 'survived.txt'));
const state = readSupervisor('suspend-drill').state;

console.log(`hop completed: ${completed} · parked: ${parked} · artifact: ${artifact} · supervisor: ${state?.status}`);
const ok = completed && !parked && artifact;
console.log(ok ? 'suspend-drill: PASS — the timers extended across the suspend window' : 'suspend-drill: FAIL — the marker did not protect the hop');
for (const dir of [HOME, VAULT, LANE]) fs.rmSync(dir, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
