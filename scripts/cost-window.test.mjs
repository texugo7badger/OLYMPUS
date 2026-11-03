#!/usr/bin/env node
/**
 * cost-window.test.mjs — v0.0.53.
 *
 * Cost is three numbers, never one: step, list and invoice (unknown). The
 * window is selectable, quota is unverified unless the provider reports it,
 * and the campaign report joins the ledger to the hops.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const route = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/costs/route.ts', 'utf-8');
const dash = fs.readFileSync(OLYMPUS + '/src/components/olympus/cost-dashboard.tsx', 'utf-8');
const report = fs.readFileSync(OLYMPUS + '/scripts/campaign-report.mjs', 'utf-8');
const pkg = JSON.parse(fs.readFileSync(OLYMPUS + '/package.json', 'utf-8'));

expect('C-1: the cost route accepts a real window', /windowId/.test(route) && /'5h'/.test(route) && /'30d'/.test(route) && /window: \{ id/.test(route), 'the route is 5h-only');
expect('C-2: the cache key includes the window', /costs:\$\{windowId\}/.test(route), 'switching windows can serve a stale cache');
expect('C-3: the dashboard exposes 5h/24h/7d/30d/session', /'5h','24h','7d','30d','session'/.test(dash), 'no selector');
expect('C-4: step, list and invoice stay separated', /step\/list\/invoice/.test(dash) && /invoice unknown/.test(dash), 'the numbers are summed');
expect('C-5: quota is unverified unless the provider reports it', /quota unverified/.test(dash) && /cap5h == null/.test(dash), 'a fake cap can appear');
expect('C-6: tokens/s is shown', /tok\/s/.test(dash), 'agility has no rate');
expect('C-7: the campaign report joins plan/state/telemetry/activity/cost',
  /dispatch-plan\.json/.test(report) && /hop-telemetry/.test(report) && /live\.jsonl/.test(report) && /cost\.jsonl/.test(report),
  'the report is a partial view');
expect('C-8: the report prints per-hop, by-god, slowest and totals',
  /Per hop/.test(report) && /By god/.test(report) && /Slowest hops/.test(report) && /Median hop/.test(report),
  'the report cannot answer the night questions');
expect('C-9: npm exposes campaign:report', pkg.scripts['campaign:report'] === 'node scripts/campaign-report.mjs', 'not runnable');

console.log(failures === 0 ? '\ncost-window: all green.' : `\ncost-window: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
