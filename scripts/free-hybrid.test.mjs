#!/usr/bin/env node
/**
 * free-hybrid.test.mjs — the ONE free strategy's resolver contract
 * (2026-10-23, the user's directive).
 *
 * Free Hybrid resolves a per-god roster against the free sources a machine
 * actually has registered. This suite pins:
 *   S1 the full-power resolution equals the static map (UI == apply).
 *   S2 NVIDIA-only → the DISTRIBUTED PANTHEON (#106): per-family lanes,
 *      ≤3 gods/anchor, Apollo never sharing with Athena/Hephaestus,
 *      Callimachus on the volume lane, zero Nemotron.
 *   S3 OpenRouter-only / Zen-only / GO-only → the expected per-god lanes.
 *   S4 load-spreading: no lane carries more than 3 gods (all sources).
 *   S5 user pins win (`free-hybrid-overrides.json` shape).
 *   S6 legacy ids normalize to free-hybrid (both the TS and JS mirrors).
 *   S7 no source → the full-power fallback (the apply refuses earlier).
 *   S8 every resolved lane is a real id in the live catalogue cache (when
 *      present) and carries a $0 pricing entry — honesty checks.
 *
 * Run: npx tsx scripts/free-hybrid.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const {
  GOD_IDS, FREE_HYBRID_ROSTER, FREE_HYBRID_SOURCES,
  resolveFreeHybrid, normalizeStrategyId, isLegacyFreeAlias,
  LLM_STRATEGIES,
} = await import('../src/lib/model-strategies.ts');
const applyMod = await import('./apply-strategy.js');

const staticMap = LLM_STRATEGIES['free-hybrid'].gods;
const has = (map, god, needle) => String(map[god] || '').includes(needle);
const nemotron = (map) => Object.values(map).filter((m) => /nemotron/i.test(String(m)));

// ── S1: full power == the static map ─────────────────────────────────────────
{
  const full = resolveFreeHybrid(FREE_HYBRID_SOURCES);
  const drift = GOD_IDS.filter((g) => full[g] !== staticMap[g]);
  expect('S1 full-power resolution == the static UI map', drift.length === 0,
    drift.map((g) => `${g}: ${full[g]} != ${staticMap[g]}`).join(', '));
}

// ── S2: NVIDIA-only → the distributed pantheon (#106) ───────────────────────
{
  const nv = resolveFreeHybrid(['nvidia']);
  expect('S2 NVIDIA-only: all gods on per-family lanes',
    GOD_IDS.every((g) => /^nvidia-(glm|minimaxai|meta|openai)\//.test(nv[g])),
    JSON.stringify(nv));
  expect('S2 NVIDIA-only: zero Nemotron (the ban, forever)', nemotron(nv).length === 0, nemotron(nv).join(','));
  const perAnchor = {};
  for (const g of GOD_IDS) perAnchor[nv[g]] = (perAnchor[nv[g]] || 0) + 1;
  expect('S2 NVIDIA-only: <=3 gods per anchor',
    Object.values(perAnchor).every((n) => n <= 3), JSON.stringify(perAnchor));
  expect('S2 NVIDIA-only: Apollo never shares Athena/Hephaestus lane',
    nv.apollo !== nv.athena && nv.apollo !== nv.hephaestus, `apollo=${nv.apollo}`);
  expect('S2 NVIDIA-only: Callimachus on the volume lane (MiniMax)',
    has(nv, 'callimachus', 'minimax-m3.1-flash'), nv.callimachus);
}

// ── S3: single-source resolutions ───────────────────────────────────────────
{
  const or = resolveFreeHybrid(['openrouter']);
  expect('S3 OpenRouter-only: Apollo on inkling (the proven free planner)',
    or.apollo === 'openrouter/thinkingmachines/inkling:free', or.apollo);
  expect('S3 OpenRouter-only: every lane is an OpenRouter id',
    GOD_IDS.every((g) => or[g].startsWith('openrouter/')), JSON.stringify(or));

  const zen = resolveFreeHybrid(['opencode']);
  expect('S3 Zen-only: Apollo on DeepSeek V4.1 Flash (the strongest free tool-caller)',
    zen.apollo === 'opencode/deepseek-v4.1-flash-free', zen.apollo);
  expect('S3 Zen-only: Atlas on Beam (the Zen pool)',
    zen.atlas === 'opencode/beam-free', zen.atlas);
  expect('S3 Zen-only: the three task-fit gods ride DeepSeek V4.1 Flash (calli/apollo/athena)',
    zen.callimachus === 'opencode/deepseek-v4.1-flash-free'
    && zen.apollo === 'opencode/deepseek-v4.1-flash-free'
    && zen.athena === 'opencode/deepseek-v4.1-flash-free',
    JSON.stringify(zen));
  expect('S3 Zen-only: every lane is a Zen id (never an unregistered source)',
    GOD_IDS.every((g) => zen[g].startsWith('opencode/')), JSON.stringify(zen));

  const go = resolveFreeHybrid(['opencode-go']);
  expect('S3 GO-only: Apollo on the GO Beam lane',
    go.apollo === 'opencode-go/beam-free', go.apollo);
  expect('S3 GO-only: Atlas on GO Beam (the only free GO lane)',
    go.atlas === 'opencode-go/beam-free', go.atlas);
  expect('S3 GO-only: every lane is a GO id',
    GOD_IDS.every((g) => go[g].startsWith('opencode-go/')), JSON.stringify(go));
}

// ── S4: load spread across ALL sources ──────────────────────────────────────
{
  const full = resolveFreeHybrid(FREE_HYBRID_SOURCES);
  const usage = {};
  for (const g of GOD_IDS) usage[full[g]] = (usage[full[g]] || 0) + 1;
  expect('S4 all sources: <=3 gods per lane', Object.values(usage).every((n) => n <= 3), JSON.stringify(usage));
  expect('S4 all sources: >=5 distinct lanes (spread, not one pool)',
    Object.keys(usage).length >= 5, JSON.stringify(usage));
  expect('S4 all sources: zero Nemotron', nemotron(full).length === 0, nemotron(full).join(','));
}

// ── S5: user pins win ───────────────────────────────────────────────────────
{
  const pinned = resolveFreeHybrid(FREE_HYBRID_SOURCES, {
    overrides: { athena: 'opencode/minimax-m3.1-flash-free', callimachus: 'opencode/deepseek-v4.1-flash-free' },
  });
  expect('S5 user pin wins (athena)', pinned.athena === 'opencode/minimax-m3.1-flash-free', pinned.athena);
  expect('S5 user pin wins (callimachus)', pinned.callimachus === 'opencode/deepseek-v4.1-flash-free', pinned.callimachus);
}

// ── S6: legacy ids normalize (TS + JS mirrors) ──────────────────────────────
{
  for (const legacy of ['free-openrouter', 'free-big-pickle', 'free-nvidia-build']) {
    expect(`S6 TS normalize ${legacy} -> free-hybrid`, normalizeStrategyId(legacy) === 'free-hybrid', normalizeStrategyId(legacy));
    expect(`S6 JS normalize ${legacy} -> free-hybrid`, applyMod.normalizeStrategyId(legacy) === 'free-hybrid', applyMod.normalizeStrategyId(legacy));
    expect(`S6 ${legacy} is flagged legacy`, isLegacyFreeAlias(legacy === 'free-openrouter' ? legacy : legacy), isLegacyFreeAlias(legacy));
  }
  expect('S6 free-hybrid is not a legacy alias', isLegacyFreeAlias('free-hybrid') === false);
}

// ── S7: no source → the full-power fallback (the apply refuses earlier) ─────
{
  const none = resolveFreeHybrid([]);
  expect('S7 no source: the full-power fallback is returned (never a crash)',
    GOD_IDS.every((g) => typeof none[g] === 'string' && none[g].includes('/')), JSON.stringify(none));
}

// ── S8: honesty — $0 pricing for every static lane, real ids when cached ────
{
  const pricingSrc = fs.readFileSync(path.join(ROOT, 'src/lib/model-pricing.ts'), 'utf-8');
  const missing = [...new Set(Object.values(staticMap))].filter((id) => !pricingSrc.includes(`'${id}'`));
  expect('S8 every static lane carries a pricing entry', missing.length === 0, missing.join(', '));
  const zeroPriced = [...new Set(Object.values(staticMap))].every((id) => {
    const m = pricingSrc.match(new RegExp(`'${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}': \\{ input: ([0-9.]+), output: ([0-9.]+)`));
    return m && Number(m[1]) === 0 && Number(m[2]) === 0;
  });
  expect('S8 every static lane is honestly $0', zeroPriced, 'a free lane has a non-zero price');

  const cachePath = path.join(os.homedir(), '.cache/opencode/models.json');
  if (fs.existsSync(cachePath)) {
    const cat = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const dead = [];
    for (const id of new Set(Object.values(staticMap))) {
      const slash = id.indexOf('/');
      const prov = id.slice(0, slash);
      const mid = id.slice(slash + 1);
      if (!cat[prov]?.models?.[mid]) dead.push(id);
    }
    expect('S8 every static lane exists in the live catalogue cache', dead.length === 0, dead.join(', '));
  } else {
    console.log('SKIP  S8 live-catalogue check — no ~/.cache/opencode/models.json');
  }
}

// ── S9: the JS roster mirrors the TS roster (the functional contract:
//       source + id order per god; the `why` prose may differ) ─────────────
{
  const laneKey = (lane) => `${lane.source}|${lane.id}`;
  const drift = GOD_IDS.filter((g) => {
    const ts = (FREE_HYBRID_ROSTER[g] || []).map(laneKey).join(' > ');
    const js = (applyMod.FREE_HYBRID_ROSTER[g] || []).map(laneKey).join(' > ');
    return ts !== js;
  });
  expect('S9 the apply roster mirrors the canonical TS roster (source+id order)', drift.length === 0,
    drift.map((g) => `${g}: ${(FREE_HYBRID_ROSTER[g] || []).map(laneKey)} != ${(applyMod.FREE_HYBRID_ROSTER[g] || []).map(laneKey)}`).join('; '));
}

if (failures > 0) {
  console.error(`\nfree-hybrid: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nfree-hybrid: all green (resolver, roster, mirrors, pins, pricing).');
