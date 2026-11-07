#!/usr/bin/env node
/**
 * cost-speed.test.mjs — v0.0.87: the cost/usage truth and tok/s everywhere.
 *
 * Specimens: the GO bar read 0 rows because the hop-data DB uses the flat v1
 * shape (`providerID`/`modelID`), the cost screen had no time series and the
 * Parthenon/mobile showed no tok/s. This suite pins the source fixes and the
 * pure calculations.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const expect = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 260)}`);
  if (!cond) failures++;
};
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

const go = src('src/lib/go-usage.ts');
const olympus = src('src/lib/olympus.ts');
const dashboard = src('src/components/olympus/cost-dashboard.tsx');
const sheet = src('src/lib/tasks-sheet.ts');
const panel = src('src/components/olympus/god-panel.tsx');
const modal = src('src/components/olympus/task-sheet-modal.tsx');
const briefing = src('src/lib/project-briefing.ts');
const companion = src('src/lib/companion-text.ts');
const manifest = src('src/lib/theme-manifest.ts');

expect('C-1: the GO ledger reads the v1 hop-data shape (providerID/modelID)', /typeof d\?\.providerID === 'string'/.test(go) && /typeof d\?\.modelID === 'string'/.test(go), 'every AIME hop row is still skipped');
expect('C-2: the GO ledger merges the app step-finish ledger with dedupe', /_step-finish_/.test(go) && /seen\.has\(key\)/.test(go), 'interactive usage is missing');
expect('C-3: costSummary returns an hourly series and recent requests', /const hourly = Array\.from/.test(olympus) && /const recent = stepRows/.test(olympus) && /hourly, recent/.test(olympus), 'no chart/recent data');
expect('C-4: the cost screen renders the chart, tips and recent requests', /Hourly token usage/.test(dashboard) && /step · list · invoice/.test(dashboard) && /Recent requests/.test(dashboard), 'the screen is still a table only');
expect('C-5: the task sheet computes measured tok/s', /tokensPerSec: tel && status === 'completed'/.test(sheet) && /hopSpeed\(/.test(sheet), 'no speed on tasks');
expect('C-6: the Parthenon, task modal and briefing show tok/s', /tok\/s/.test(panel) && /tok\/s/.test(modal) && /tokensPerSec/.test(briefing) && /tok\/s/.test(companion), 'speed is not everywhere');
expect('C-7: the PWA theme color follows the theme background, never gold', /theme_color: palette\.bg/.test(manifest) && !/theme_color: palette\.gold/.test(manifest), 'the Android status strip stays gold');

const { hopSpeed, stat } = await import(ROOT + '/src/lib/token-speed.ts');
expect('C-8: hopSpeed is output tokens / wall seconds', hopSpeed('h', 'athena', 'completed', 1000, 100_000)?.outTokPerSec === 10, hopSpeed('h', 'athena', 'completed', 1000, 100_000));
expect('C-9: a zero-duration hop is null, never a fake 0', hopSpeed('h', 'athena', 'completed', 1000, 0) === null, hopSpeed('h', 'athena', 'completed', 1000, 0));
const s = stat([10, 20, 30]);
expect('C-10: p50 is measured', s?.p50 === 20 && s?.n === 3, s);

// v0.0.89 — the cost forecast (the usage-vs-pace graph).
const { buildGoForecast } = await import(ROOT + '/src/lib/go-usage.ts');
const pStart = Date.parse('2026-11-05T18:15:00Z');
const pReset = Date.parse('2026-12-05T18:15:00Z');
const pNow = Date.parse('2026-11-08T18:15:00Z');
const row = (days, cost) => ({ ts: pStart + days * 86400_000, model: 'deepseek-v4.1-flash', input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost });
const f = buildGoForecast(
  [row(1, 10), row(2, 12)],
  { model: 'deepseek-v4.1-flash', limit: 200, pctMonth: 11, spendMonth: 22, spend5h: 0, spend7d: 0, pct5h: 0, pct7d: 0, projectedDays: 0 },
  pStart, pReset, pNow,
);
expect('C-11: the forecast carries the measured 11% and a ~3.67%/day burn',
  Math.abs(f.currentPct - 11) < 1e-9 && Math.abs(f.dailyPct - 11 / 3) < 1e-9, f);
expect('C-12: the projection crosses 100% before the renewal and names the hit date',
  f.projectedPct > 100 && !!f.hitAt && Date.parse(f.hitAt) > pNow && Date.parse(f.hitAt) < pReset, f);
expect('C-13: the chart points are the actual cumulative spend (0 → 5 → 11)',
  f.points[0].pct === 0 && Math.abs(f.points[1].pct - 5) < 1e-9 && Math.abs(f.points[f.points.length - 1].pct - 11) < 1e-9, f.points);
const calm = buildGoForecast([], { model: 'deepseek-v4.1-flash', limit: 200, pctMonth: 0, spendMonth: 0, spend5h: 0, spend7d: 0, pct5h: 0, pct7d: 0, projectedDays: 0 }, pStart, pReset, pNow);
expect('C-14: no usage is an honest zero, never a fabricated hit', calm.projectedPct === 0 && calm.hitAt === null && calm.dailyPct === 0, calm);

console.log(failures === 0 ? '\ncost-speed: all green.' : `\ncost-speed: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
