#!/usr/bin/env node
/**
 * logs-truth.test.mjs — v0.0.98-14: the Logs workspace's two new truths.
 *
 * The error log was 96% Chromium preload/CSP noise; the recovery evidence was
 * only visible as one line on a hop. This suite proves:
 *
 *   1. `buildLogsPayload` returns the recovery ledger (lane, hop, class,
 *      action, budget, message) sorted newest-first;
 *   2. the Errors slice filters the known benign console noise and keeps the
 *      real error;
 *   3. the Logs UI merges Blocked + Recovery + Errors into one Issues tab and
 *      keeps Boot/Hygiene out of the runtime flight recorder.
 *
 * Run: npx tsx scripts/logs-truth.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-logs-home-'));
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-logs-vault-'));
process.env.OLYMPUS_HOME = HOME;
process.env.OLYMPUS_VAULT = VAULT;
process.on('exit', () => {
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* gone */ }
  try { fs.rmSync(VAULT, { recursive: true, force: true }); } catch { /* gone */ }
});

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
}

async function main() {
  const lane = path.join(VAULT, '02_Projects', 'logs-fixture');
  fs.mkdirSync(lane, { recursive: true });
  const now = Date.now();
  const iso = (delta) => new Date(now + delta).toISOString();
  fs.writeFileSync(path.join(lane, 'dispatch-plan.json'), JSON.stringify({
    version: 1, laneRoot: lane, generation: 7,
    hops: [{ id: 'hop-a', god: 'athena', prompt: 'a', artifacts: [], verify: { review: 'deterministic', checks: [] } }],
  }));
  fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({
    version: 1, completed: [], parked: null, quarantined: [], inFlight: [], generation: 7, parks: {}, campaignId: 'cmp_logs', updatedAt: iso(0),
  }));
  fs.writeFileSync(path.join(lane, '.olympus-recovery.jsonl'), [
    JSON.stringify({ ts: iso(-60_000), campaignId: 'cmp_logs', hopId: 'hop-a', god: 'athena', failureClass: 'tool-budget', kind: 'retry-budget', action: 'retry', message: 'narrow retry', override: { toolBudget: 28 }, nextLane: 'opencode-go/deepseek-v4.1-flash' }),
    JSON.stringify({ ts: iso(-30_000), campaignId: 'cmp_logs', hopId: 'hop-b', god: 'dionysus', failureClass: 'verify-failed', kind: 'retry-verify', action: 'retry', message: 'fix the check' }),
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(lane, '.olympus-hop-telemetry.jsonl'), JSON.stringify({
    ts: iso(-90_000), hop: 'hop-a', god: 'athena', lane: 'opencode-go/qwen3.7-plus', status: 'parked-dispatch-failed',
    errorClass: 'tool-budget', failureClass: 'tool-budget', error: 'budget', tokensIn: 1, tokensOut: 1, durationMs: 1000,
  }) + '\n');
  fs.mkdirSync(path.join(HOME, 'metrics'), { recursive: true });
  fs.writeFileSync(path.join(HOME, 'metrics', 'cost.jsonl'), '');
  fs.writeFileSync(path.join(HOME, 'errors.log'), [
    JSON.stringify({ ts: iso(-10_000), source: 'renderer-console', message: 'The resource http://127.0.0.1/a.webp was preloaded using link preload but not used within a few seconds from the window\'s load event.' }),
    JSON.stringify({ ts: iso(-9_000), source: 'renderer-console', message: 'Electron Security Warning (Insecure Content-Security-Policy) This renderer process has either no Content Security Policy set or a policy with "unsafe-eval" enabled.' }),
    JSON.stringify({ ts: iso(-8_000), source: 'renderer-console', message: "Access to fetch at 'https://api.github.com/_private/browser/stats?service=ui' from origin 'https://github.com' has been blocked by CORS policy" }),
    JSON.stringify({ ts: iso(-7_000), source: 'renderer-console', message: 'apply next plan Error: a walk is live on this lane — a generation applies only at a hop boundary', appVersion: '0.0.98-13' }),
  ].join('\n') + '\n');

  const { buildLogsPayload, isBenignErrorLogEntry } = await import(OLYMPUS + '/src/lib/logs-index.ts');
  const payload = buildLogsPayload(now);
  expect('the recovery ledger is in the payload', payload.recoveries.length === 2, JSON.stringify(payload.recoveries));
  expect('recoveries are newest-first', payload.recoveries[0]?.hopId === 'hop-b', JSON.stringify(payload.recoveries.map((r) => r.hopId)));
  expect('recovery carries lane/budget/message', payload.recoveries.some((r) => r.slug === 'logs-fixture' && r.toolBudget === 28 && /narrow/.test(r.message)), JSON.stringify(payload.recoveries[0]));
  expect('the error slice keeps only the real error', payload.errors.length === 1 && /apply next plan/.test(payload.errors[0].message), JSON.stringify(payload.errors));
  expect('the benign filter recognizes preload/CSP/CORS', isBenignErrorLogEntry('preloaded using link preload but not used') && isBenignErrorLogEntry('Electron Security Warning (Insecure Content-Security-Policy)') && isBenignErrorLogEntry("Access to fetch at 'https://api.github.com/_private/browser/stats'"), 'noise leaked');
  expect('the real error is not benign', !isBenignErrorLogEntry('apply next plan Error: a walk is live on this lane'), 'real error filtered');

  const ui = fs.readFileSync(path.join(OLYMPUS, 'src/components/olympus/logs-dashboard.tsx'), 'utf-8');
  const index = fs.readFileSync(path.join(OLYMPUS, 'src/lib/logs-index.ts'), 'utf-8');
  expect('the Issues tab exists', /id: 'issues'/.test(ui) && /logs\.tab\.issues/.test(ui));
  expect('Boot and Hygiene are not Logs tabs', !/id: 'boot'/.test(ui) && !/id: 'hygiene'/.test(ui));
  expect('the payload exposes recoveries + errors', /recoveries: LogRecovery\[\]/.test(index) && /errors: LogError\[\]/.test(index));

  console.log('');
  if (failures > 0) {
    console.log(`logs-truth: ${failures} FAIL`);
    process.exit(1);
  }
  console.log('logs-truth: all checks PASS');
}
await main();
