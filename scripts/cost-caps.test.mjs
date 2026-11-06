#!/usr/bin/env node
/**
 * cost-caps.test.mjs — v0.0.72.
 *
 * The spend brake: caps are opt-in, evaluated on the LIST VALUE (a
 * subscription reports $0 but still burns quota), tightest window first, and
 * a disabled cap never blocks a walk.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCostCaps, evaluateCostCaps, windowUsage, describeCaps } from '../src/lib/cost-caps.ts';

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-caps-'));
fs.mkdirSync(path.join(HOME, 'metrics'), { recursive: true });
const now = Date.parse('2026-11-04T12:00:00.000Z');
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const row = (hoursAgo, usd, tokens = 1000, model = 'opencode-go/deepseek-v4.1-flash') => ({
  ts: new Date(now - hoursAgo * HOUR).toISOString(),
  model,
  spend_estimated_usd: usd,
  input_tokens: tokens,
  output_tokens: 0,
});
const writeLedger = (rows) => fs.writeFileSync(path.join(HOME, 'metrics', 'cost.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

// C-1: no file, no env = disabled
delete process.env.OLYMPUS_CAP_5H_USD;
const off = readCostCaps(HOME);
expect('C-1: no caps file means the brake is off', off.enabled === false && evaluateCostCaps([row(1, 99)], off, now).ok === true, JSON.stringify(off));

// C-2: the 5h window blocks first
fs.writeFileSync(path.join(HOME, 'cost-caps.json'), JSON.stringify({ global: { fiveHourUsd: 1, weeklyUsd: 100 } }));
writeLedger([row(1, 0.7), row(2, 0.6), row(10, 5)]);
const caps2 = readCostCaps(HOME);
const v2 = evaluateCostCaps([row(1, 0.7), row(2, 0.6), row(10, 5)], caps2, now);
expect('C-2: 5h cap fires before the weekly cap', v2.ok === false && v2.window === '5h', JSON.stringify(v2));
expect('C-3: the reason names the window and the numbers', v2.ok === false && /cost-cap-exceeded:5h/.test(v2.reason) && /\$1\.30 of \$1\.00/.test(v2.reason), v2.reason);

// C-4: old spend is outside 5h but inside the week
const v4 = evaluateCostCaps([row(10, 5), row(6, 0.1)], readCostCaps(HOME), now);
expect('C-4: 10h-old spend does not trip the 5h cap', v4.ok === true, JSON.stringify(v4));

// C-5: weekly cap when the week is hot but the 5h is cold
fs.writeFileSync(path.join(HOME, 'cost-caps.json'), JSON.stringify({ global: { fiveHourUsd: 10, weeklyUsd: 3 } }));
const v5 = evaluateCostCaps([row(10, 2), row(6, 2)], readCostCaps(HOME), now);
expect('C-5: the weekly window fires with a cold 5h', v5.ok === false && v5.window === 'weekly', JSON.stringify(v5));

// C-6: token caps work without a dollar cap
fs.writeFileSync(path.join(HOME, 'cost-caps.json'), JSON.stringify({ global: { monthlyTokens: 1500 } }));
const v6 = evaluateCostCaps([row(1, 0, 1000), row(2, 0, 800)], readCostCaps(HOME), now);
expect('C-6: a token cap fires on tokens alone', v6.ok === false && v6.window === 'monthly' && v6.capUsd === null, JSON.stringify(v6));

// C-7: env override wins over the file
fs.writeFileSync(path.join(HOME, 'cost-caps.json'), JSON.stringify({ global: { fiveHourUsd: 100 } }));
process.env.OLYMPUS_CAP_5H_USD = '0.5';
const caps7 = readCostCaps(HOME);
const v7 = evaluateCostCaps([row(1, 1)], caps7, now);
expect('C-7: OLYMPUS_CAP_5H_USD overrides the file', caps7.global.fiveHourUsd === 0.5 && v7.ok === false, JSON.stringify({ caps: caps7.global, v7 }));
delete process.env.OLYMPUS_CAP_5H_USD;

// C-8: windowUsage sums list value, not the invoice
const usage = windowUsage([row(1, 0.5), row(2, 0.25), row(30, 9)], 5 * HOUR, now);
expect('C-8: windowUsage is list value and bounded by the window', usage.spendUsd === 0.75 && usage.rows === 2, JSON.stringify(usage));

// C-9: describeCaps prints the three windows (no silent zero)
const described = describeCaps(readCostCaps(HOME), [row(1, 0.5)], now);
expect('C-9: describeCaps exposes 5h/weekly/monthly usage', described.usage.fiveHour.rows === 1 && described.usage.monthly.rows === 1, JSON.stringify(described.usage));

// C-10: a broken file is "no caps", never a crash
fs.writeFileSync(path.join(HOME, 'cost-caps.json'), '{not json');
expect('C-10: a broken caps file degrades to unlimited', readCostCaps(HOME).enabled === false, 'threw or enabled');

// v0.0.84 (#277) — per-model buckets. The GO plan meters each model
// workspace-wide, so a global cap cannot see the one bucket that is hot.
fs.writeFileSync(path.join(HOME, 'cost-caps.json'), JSON.stringify({
  global: { fiveHourUsd: 100 },
  models: { 'qwen3.7-plus': { fiveHourUsd: 1 }, 'deepseek-v4.1-flash': { monthlyTokens: 5000 } },
}));
const caps11 = readCostCaps(HOME);
expect('C-11: models are parsed and the brake is enabled by them alone', caps11.enabled === true && Object.keys(caps11.models).length === 2, JSON.stringify(caps11.models));
const v11 = evaluateCostCaps([
  row(1, 0.7, 1000, 'opencode-go/qwen3.7-plus'),
  row(2, 0.6, 1000, 'opencode-go/qwen3.7-plus'),
  row(1, 0.2, 1000, 'opencode-go/deepseek-v4.1-flash'),
], caps11, now);
expect('C-12: a per-model 5h cap fires with the model named', v11.ok === false && v11.window === '5h' && v11.model === 'qwen3.7-plus' && /\[qwen3\.7-plus\]/.test(v11.reason), JSON.stringify(v11));
const v13 = evaluateCostCaps([
  row(1, 0.7, 1000, 'opencode-go/deepseek-v4.1-flash'),
  row(2, 0.7, 1000, 'opencode-go/deepseek-v4.1-flash'),
], caps11, now);
expect('C-13: another model does not pay the hot model\'s cap', v13.ok === true, JSON.stringify(v13));
const v14 = evaluateCostCaps([
  row(1, 0.1, 3000, 'opencode-go/deepseek-v4.1-flash'),
  row(2, 0.1, 3000, 'opencode-go/deepseek-v4.1-flash'),
], caps11, now);
expect('C-14: a per-model token cap fires on tokens alone', v14.ok === false && v14.window === 'monthly' && v14.model === 'deepseek-v4.1-flash' && v14.capUsd === null, JSON.stringify(v14));

fs.rmSync(HOME, { recursive: true, force: true });
console.log(`\ncost-caps: ${failures === 0 ? 'PASS' : failures + ' FAIL'}`);
process.exit(failures === 0 ? 0 : 1);
