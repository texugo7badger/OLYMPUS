#!/usr/bin/env node
/**
 * replan-continue.test.mjs — v0.1.1: Continue on a loop-blocked hop asks
 * Apollo, it never spins on the same walk. Also pins the hibernate fix
 * (a live campaign keeps its OpenCode/MCP server) and the window-control
 * fallback.
 *
 * Run: npx tsx scripts/replan-continue.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-replan-home-'));
const LANE = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-replan-lane-'));
process.env.OLYMPUS_HOME = HOME;
process.env.OLYMPUS_VAULT = path.join(HOME, 'vault');
process.on('exit', () => {
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* gone */ }
  try { fs.rmSync(LANE, { recursive: true, force: true }); } catch { /* gone */ }
});

let failures = 0;
const expect = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ` — ${String(detail).slice(0, 300)}`}`);
  if (!cond) failures++;
};
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

async function main() {
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(LANE, 'dispatch-plan.json'), JSON.stringify({
    version: 1, generation: 3, createdAt: now,
    hops: [{ id: 'design-material-manifest', god: 'athena', artifacts: ['evidence/release/report.md'], verify: { review: 'deterministic', checks: ['file-exists:evidence/release/report.md'] } }],
  }, null, 2));
  fs.writeFileSync(path.join(LANE, '.olympus-hop-state.json'), JSON.stringify({
    version: 1, generation: 3, completed: [], inFlight: [],
    parked: { hopId: 'design-material-manifest', reason: 'dispatch-failed:tool-budget', error: 'hop-tool-budget-exceeded (40)' },
    updatedAt: now,
  }, null, 2));
  fs.writeFileSync(path.join(LANE, '.olympus-loop-guard.json'), JSON.stringify({
    version: 1, updatedAt: now,
    hops: { 'design-material-manifest': { generation: 3, failures: 2, lastClass: 'tool-budget', lastAt: now, blockedAt: now, notifiedAt: null } },
  }, null, 2));
  fs.writeFileSync(path.join(LANE, '.olympus-hop-telemetry.jsonl'), JSON.stringify({
    ts: now, hop: 'design-material-manifest', god: 'athena', status: 'parked-dispatch-failed', errorClass: 'tool-budget', error: 'hop-tool-budget-exceeded (40)',
  }) + '\n');
  fs.writeFileSync(path.join(LANE, 'design-review.json'), JSON.stringify({ overall: 8.4, floor: 8, target: 9 }));

  const { buildReplanRequest } = await import(ROOT + '/src/lib/replan-prompt.ts');
  const req = buildReplanRequest('aime', LANE);
  expect('R1: a loop-blocked hop produces a replan request', Boolean(req) && req.hopId === 'design-material-manifest', JSON.stringify(req));
  expect('R2: the prompt carries the deterministic Atlas evidence', /tool-budget/.test(req?.prompt || '') && /design-material-manifest/.test(req?.prompt || '') && /Artifacts declared/.test(req?.prompt || ''), req?.prompt);
  expect('R3: the prompt forbids the blind retry and asks for options', /Do NOT run the same hop/.test(req?.prompt || '') && /2–4 concrete options/.test(req?.prompt || ''), req?.prompt);

  const warden = src('src/lib/atlas-warden.ts');
  expect('R4: Continue enqueues Apollo before any walk starts', /buildReplanRequest\(slug, laneRoot\)/.test(warden) && /enqueuePrompt\(slug, replan\.prompt/.test(warden) && warden.indexOf('buildReplanRequest(slug, laneRoot)') < warden.indexOf('writeOptIn(slug, true)'), 'replan is after the walk');
  expect('R5: the replan decision is returned to the UI', /replan: true/.test(warden), 'no replan flag');
  const parthenon = src('src/components/olympus/parthenon-command.tsx');
  expect('R6: Continue focuses the terminal when replanning', /d\?\.replan/.test(parthenon) && /olympus:focus-terminal/.test(parthenon) && /parthenon\.askReplan/.test(parthenon), 'UI does not focus Apollo');

  const hibernate = src('src/app/api/olympus/chat/hibernate/route.ts');
  expect('H1: a live campaign keeps its OpenCode/MCP server through hibernate', /campaignLive/.test(hibernate) && /keepChat/.test(hibernate) && /if \(!keepChat\) cleanupServer\(\)/.test(hibernate), 'hibernate still kills the live campaign server');
  expect('H2: the window controls show when the preload window API exists', /window\.olympus\?\.window/.test(src('src/components/olympus/status-bar.tsx')), 'controls still gated on isElectron');

  console.log(failures === 0 ? '\nreplan-continue: PASS' : `\nreplan-continue: ${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
