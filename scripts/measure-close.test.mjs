#!/usr/bin/env node
/**
 * measure-close.test.mjs — THE v0.0.26 INSTRUMENTS.
 *
 *   M1  tokens_saved is GROUNDED from measured demigod baselines (not 0)
 *   M2  benchmark rows attribute (god, demigod) — no more 'multi' wall
 *       for a run whose agent is known; child step-finish tokens counted
 *   M3  the agreement metric runs headlessly and persists a window
 *   C1  the three measurement control flags exist
 *
 * Run: npx tsx scripts/measure-close.test.mjs (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backfillShortCircuitSavings, readShortCircuitBackfill } from '../src/lib/shortcircuit-savings.ts';
import { identityFor, rememberSessionAgent } from '../src/lib/benchmark-attribution.ts';
import { runAgreementMetric } from '../src/lib/agreement-metric.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// ── M1: tokens_saved backfill ─────────────────────────────────────────────
{
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-m1-'));
  fs.mkdirSync(path.join(vault, '05_Auto_Learning'), { recursive: true });
  fs.mkdirSync(path.join(vault, '07_Reviews', 'benchmarks'), { recursive: true });
  const iso = new Date().toISOString();
  fs.writeFileSync(path.join(vault, '05_Auto_Learning', 'shortcircuit-log.jsonl'), [
    JSON.stringify({ ts: '2026-10-30T10:00:00.000Z', god: 'hephaestus', confidence: 0.95, short_circuited: true, instinct_id: 'crud-api', instinct_tags: ['api'], task_signature: 'build the bookmarks CRUD API', tokens_saved: 0 }),
    JSON.stringify({ ts: '2026-10-30T10:01:00.000Z', god: 'athena', confidence: 0.2, short_circuited: false, instinct_id: null, instinct_tags: null, task_signature: 'unrelated', tokens_saved: 0 }),
    JSON.stringify({ ts: '2026-10-30T10:02:00.000Z', god: 'athena', confidence: 0.95, short_circuited: true, instinct_id: 'x', instinct_tags: [], task_signature: 'solo', tokens_saved: 0 }),
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(vault, '07_Reviews', 'benchmarks', 'dispatches.jsonl'), [
    { ts: iso, god: 'hephaestus', demigod: 'build-resolver', tokens_input: 40000, outcome: 'success' },
    { ts: iso, god: 'hephaestus', demigod: 'code-verifier', tokens_input: 50000, outcome: 'success' },
    { ts: iso, god: 'hephaestus', demigod: 'build-resolver', tokens_input: 60000, outcome: 'success' },
    { ts: iso, god: 'athena', demigod: 'ui-designer', tokens_input: 30000, outcome: 'success' },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');

  const result = backfillShortCircuitSavings({ vaultRoot: vault });
  expect('M1 one short-circuit row is grounded', result.backfilled === 1, JSON.stringify(result).slice(0, 240));
  const row = result.rows[0];
  expect('M1 tokens_saved is the measured median (50k)', row?.tokens_saved === 50000, JSON.stringify(row));
  expect('M1 the basis names the method + samples', /^median-demigod-input:hephaestus:n=3/.test(row?.basis ?? ''), row?.basis);
  const map = readShortCircuitBackfill(vault);
  expect('M1 the backfill is persisted keyed by log ts', map.get('2026-10-30T10:00:00.000Z')?.tokens_saved === 50000);
  expect('M1 a god below the sample floor stays skipped', result.skipped === 1, String(result.skipped));

  const again = backfillShortCircuitSavings({ vaultRoot: vault });
  expect('M1 the backfill is idempotent (no duplicate rows)', again.backfilled === 1 && readShortCircuitBackfill(vault).size === 1);
  fs.rmSync(vault, { recursive: true, force: true });
}

// ── M2: attribution ──────────────────────────────────────────────────────
{
  const sessions = new Map();
  rememberSessionAgent(sessions, 'ses_god', { agent: 'hephaestus', god: 'hephaestus' });
  rememberSessionAgent(sessions, 'ses_child', { agent: 'build-resolver', god: 'hephaestus' });
  const god = identityFor(sessions, 'ses_god');
  expect('M2 a god session is (god, null)', god.agentName === 'hephaestus' && god.god === 'hephaestus' && god.scope === 'god', JSON.stringify(god));
  const child = identityFor(sessions, 'ses_child');
  expect('M2 a child session is (parentGod, demigod)', child.agentName === 'build-resolver' && child.god === 'hephaestus' && child.scope === 'demigod', JSON.stringify(child));
  const unknown = identityFor(sessions, 'ses_x');
  expect('M2 an unknown session stays multi (never guessed)', unknown.scope === 'multi' && unknown.god === 'multi', JSON.stringify(unknown));

  const src = read('src/lib/opencode-session.ts');
  expect('M2 the writer resolves the session identity', /identityFor\(sessionAgents/.test(src));
  expect('M2 the warm run stamps its god', /rememberSessionAgent\(sessionAgents, opts\.sessionId/.test(src));
  expect('M2 child sessions are stamped', /rememberSessionAgent\(sessionAgents, info\.id/.test(src));
  expect('M2 child step-finish tokens are counted', /part\.type === 'step-finish'[\s\S]{0,120}noteStepFinish\(part\.sessionID/.test(src));
  expect('M2 flush writes the bucket god (not multi)', /god: b\.god/.test(src) && /demigod: b\.scope === 'demigod'/.test(src));
  expect('M2 no note-function still hard-codes MULTI_KEY', !/getBucket\(sessionID, MULTI_KEY\)/.test(src));
}

// ── M3: agreement metric ─────────────────────────────────────────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-m3-'));
  const feed = path.join(dir, 'live.jsonl');
  const t0 = Date.now();
  const rows = [
    { ts: new Date(t0).toISOString(), god: 'apollo', action: 'classification', meta: { routeTo: 'hephaestus', classificationId: 'cls_test_1' }, classification_id: 'cls_test_1' },
    { ts: new Date(t0 + 1000).toISOString(), god: 'apollo', action: 'dispatch', demigod: 'build-resolver', classification_id: 'cls_test_1', meta: {} },
  ];
  fs.writeFileSync(feed, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const out = await runAgreementMetric({ feedPath: feed, windowMin: 60 });
  expect('M3 the metric runs headlessly', !!out?.summary, JSON.stringify(out).slice(0, 200));
  expect('M3 the exact-id join pairs the dispatch', out.summary.joined_pairs >= 1, JSON.stringify(out.summary));
  expect('M3 a matched pair is reported', out.summary.matches >= 1 && out.summary.agreement_rate === 1, JSON.stringify(out.summary));
  fs.rmSync(dir, { recursive: true, force: true });

  const heartbeat = read('src/app/api/olympus/callimachus/heartbeat/route.ts');
  expect('M3 the heartbeat runs the metric', /recordAgreementWindow/.test(heartbeat));
  expect('M3 the heartbeat grounds tokens_saved', /backfillShortCircuitSavings/.test(heartbeat));
  expect('M3 the agreement route exists', fs.existsSync(path.join(ROOT, 'src/app/api/olympus/agreement/route.ts')));
  expect('M3 the backfill route exists', fs.existsSync(path.join(ROOT, 'src/app/api/olympus/shortcircuit/backfill/route.ts')));
}

// ── C1: the control-lane flags ───────────────────────────────────────────
{
  expect('C1 OLYMPUS_INSTINCT_GATE=off exists', /OLYMPUS_INSTINCT_GATE === "off"/.test(read('.opencode/src/olympus-router/v1.ts')));
  expect('C1 OLYMPUS_CAVEMAN=off exists', /OLYMPUS_CAVEMAN === "off"/.test(read('.opencode/olympus/tools/dispatch.ts')));
  expect('C1 OLYMPUS_SKILL_TIERS=off exists', /OLYMPUS_SKILL_TIERS === 'off'/.test(read('src/lib/skill-stacks.ts')));
}

console.log(`\nmeasure-close: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
