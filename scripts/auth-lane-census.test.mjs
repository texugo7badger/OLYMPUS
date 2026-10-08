#!/usr/bin/env node
/**
 * auth-lane-census.test.mjs — #108 the preflight key-sight (FLUENCY-1).
 * Run: npx tsx scripts/auth-lane-census.test.mjs   (exit 0 = pass)
 *
 * The live failure: the #98 exhaustion card told the user "No alternative
 * free strategy has a key present either" while his auth.json carried
 * opencode-go (the GO valve), openrouter, groq, and 4 nvidia family ids.
 * The EYE was broken, not the vault empty.
 *
 * Fixtures inject their own auth trees (temp dirs, fake keys) — never the
 * real ~/.local/share/opencode/auth.json. The census + preflight + card all
 * take optional authDirs for exactly this.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 200)}`);
  if (!cond) failures++;
}

// ─── Fixture auth trees ────────────────────────────────────────────────────────
function makeAuthTree(ids) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-auth-'));
  if (ids && ids.length) {
    const auth = {};
    for (const id of ids) auth[id] = { type: 'api', key: 'fake-key-' + id };
    fs.mkdirSync(path.join(dir, '.local', 'share', 'opencode'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.local', 'share', 'opencode', 'auth.json'), JSON.stringify(auth, null, 2));
  }
  return [path.join(dir, '.local', 'share', 'opencode'), path.join(dir, '.config', 'opencode')];
}

async function main() {
  const { authLaneCensus, freeTierPreflight } = await import(OLYMPUS + '/src/lib/opencode-spawn.ts');
  const { retryExhaustionGuidance } = await import(OLYMPUS + '/src/lib/opencode-session.ts');

  const ready = typeof authLaneCensus === 'function';
  if (!ready) {
    expect('C: authLaneCensus exported (#108 — the sight)', typeof authLaneCensus === 'function',
      'missing — freeTierPreflight still reads ONLY the openrouter/groq/nvidia fields (opencode-spawn.ts:163-165)');
    expect('C: the exhaustion card names every configured lane', false,
      'blocked: the census is absent — the card is blind to every lane beyond the 3 hardcoded fields');
    expect('C: the GO valve line', false, 'blocked: opencode-go auth is invisible to the card');
    expect('C: the honest none on the empty vault', false, 'blocked: no census to be honest with');
  } else {
    // ── The census: EVERY provider id enumerated ──
    const dirsReal = makeAuthTree(['opencode-go', 'groq', 'openrouter', 'nvidia', 'nvidia-glm', 'nvidia-deepseek', 'nvidia-kimi', 'nvidia-meta']);
    const censusReal = authLaneCensus(dirsReal);
    expect('C: the real-shape 8-lane vault fully enumerated (the user\'s own tree shape, fake keys)',
      censusReal.providerIds.length === 8 && censusReal.providerIds.includes('opencode-go') && censusReal.providerIds.includes('nvidia-meta'),
      JSON.stringify(censusReal));
    expect('C: the GO valve detected (opencode-go)', censusReal.hasGoValve === true, JSON.stringify(censusReal));
    expect('C: the nvidia family detected (bare id + 4 family ids)', censusReal.hasNvidia === true, JSON.stringify(censusReal));

    const dirsB = makeAuthTree(['opencode-go', 'openrouter']);
    const censusB = authLaneCensus(dirsB);
    expect('C: tree B (go+openrouter): both ids named, sorted', JSON.stringify(censusB.providerIds) === JSON.stringify(['opencode-go', 'openrouter']), JSON.stringify(censusB));
    expect('C: tree B: hasNvidia honest-absent', censusB.hasNvidia === false, JSON.stringify(censusB));

    const dirsEmpty = makeAuthTree([]);
    const censusEmpty = authLaneCensus(dirsEmpty);
    expect('C: empty vault -> the honest zero (no fabricated lanes)', censusEmpty.providerIds.length === 0 && censusEmpty.hasGoValve === false, JSON.stringify(censusEmpty));

    // ── The preflight ERROR block: full sight, never blocks ──
    const pre = freeTierPreflight('free-nvidia-build', dirsB);
    expect('P: the preflight stays purely diagnostic (ERROR block shape)', /FREE-STRATEGY PREFLIGHT ERROR/.test(pre), pre.slice(0, 200));
    expect('P: the block lists the auth lanes (the vault is NOT empty)', pre.includes('Lanes with keys present: opencode-go, openrouter'), pre);
    expect('P: the free alternative named (OpenRouter key present)', pre.includes('free-openrouter / free-big-pickle (OpenRouter key present)'), pre);
    expect('P: the GO valve line explicit (the premium fallback, named)', pre.includes('GO key present: node scripts/apply-strategy.js --strategy go-balanced (premium valve)'), pre);
    expect('P: no silent downgrade stands', /No strategy was auto-switched/.test(pre), pre);

    const preEmpty = freeTierPreflight('free-nvidia-build', dirsEmpty);
    expect('P: empty vault -> the honest none (no lanes, no alternatives, no GO line)',
      /Lanes with keys present: none/.test(preEmpty) && !preEmpty.includes('GO key present') && !preEmpty.includes('Alternatives whose key IS present'),
      preEmpty);

    const dirsGroq = makeAuthTree(['groq']);
    const preGroq = freeTierPreflight('free-nvidia-build', dirsGroq);
    expect('P: the GO valve appears IFF GO auth present (groq-only: absent)', !preGroq.includes('GO key present'), preGroq);

    const dirsFamily = makeAuthTree(['nvidia-glm', 'nvidia-kimi']);
    const preFamily = freeTierPreflight('free-nvidia-build', dirsFamily);
    expect('P: family-mirrored nvidia ids satisfy the nvidia check (the shipped R4 shape)',
      /INFO/.test(preFamily) && !/PREFLIGHT ERROR/.test(preFamily), preFamily);

    // ── The #98 exhaustion card: every REAL switch, free AND paid ──
    const card = retryExhaustionGuidance('upstream 503', 503, undefined, dirsB);
    expect('X: the card carries the census (both lanes named)', card.includes('Lanes with keys present: opencode-go, openrouter'), card);
    expect('X: the card names the openrouter switch (a pool-contention death is a REAL reason to switch)', card.includes('Alternatives whose key IS present: free-openrouter / free-big-pickle (OpenRouter key present)'), card);
    expect('X: the GO valve on the card (the explicit premium switch)', card.includes('GO key present: node scripts/apply-strategy.js --strategy go-balanced (premium valve)'), card);
    expect('X: the card still names the explicit switch command', card.includes('apply-strategy'), card);
    expect('X: the card still refuses the silent downgrade', /NO strategy was auto-switched/i.test(card), card);

    const cardEmpty = retryExhaustionGuidance('upstream 503', 503, undefined, dirsEmpty);
    expect('X: empty vault -> the honest none on the card (no GO line)',
      cardEmpty.includes('No lane has a key present') && !cardEmpty.includes('GO key present'), cardEmpty);
  }
}

main().then(() => {
  if (failures > 0) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log('\nAll #108 key-sight assertions passed');
  process.exit(0);
}).catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
