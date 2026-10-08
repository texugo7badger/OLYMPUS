#!/usr/bin/env node
/**
 * refresh-anchor-pin.test.mjs — #106 Batch B (MADRUGA-FREE-1): the refresh
 * anchor-pin doctrine, asserted as code.
 * Run: npx tsx scripts/refresh-anchor-pin.test.mjs
 *
 * THE DOCTRINE (#106 — the user's directive, 2026-10-08):
 *   The ANCHOR SET is USER-PINNED (the four anchors + the alternate fast).
 *   The refresh serves the distribution, never overrides it:
 *     - it VERIFIES availability against the live list;
 *     - it UPDATES ids when NVIDIA renames (a curated RENAMES table — a
 *       human-supplied mapping, never a heuristic guess);
 *     - it RECORDS context windows (the honest overrides);
 *     - it NEVER auto-replaces an anchor with "the strongest live" (the same
 *       law as no-silent-downgrade, applied to models);
 *     - a DEAD anchor surfaces LOUDLY, never silently swapped;
 *     - the nemotron family is on the BAN LIST, forever (the user's ban).
 *
 * The scorer ranks WITHIN the anchor set (the fast-lane alternate choice),
 * never across it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`);
  if (!ok) failures++;
}

const refreshSrc = readFileSync(path.join(ROOT, 'scripts/refresh-free-models.js'), 'utf-8');

// The module guards main() behind a direct-run check (import-safe — same
// doctrine as apply-strategy.js); the pure resolver is exported for tests.
const refresh = await import('./refresh-free-models.js');
const resolveNvidiaAnchors = refresh.resolveNvidiaAnchors;
const NVIDIA_ANCHOR_PINS = refresh.NVIDIA_ANCHOR_PINS;
const NVIDIA_RENAMES = refresh.NVIDIA_RENAMES || {};

check('module: resolveNvidiaAnchors exported (pure, testable)', typeof resolveNvidiaAnchors === 'function',
  'refresh-free-models.js must export the pure anchor resolver');
check('module: NVIDIA_ANCHOR_PINS exported', !!NVIDIA_ANCHOR_PINS && typeof NVIDIA_ANCHOR_PINS === 'object',
  'the pinned anchor set must be data (user-pinned, expressed in code)');

if (resolveNvidiaAnchors && NVIDIA_ANCHOR_PINS) {
  // The pinned set: the four anchors + the alternate fast, on their family
  // lanes, with honest contexts.
  const EXPECTED_LANES = {
    'nvidia-glm/z-ai/glm-5.3': 1000000,
    'nvidia-glm/z-ai/glm-5.3-flash': 1000000,
    'nvidia-kimi/moonshotai/kimi-k3': 1048576,
    'nvidia-meta/meta/muse-glimmer-30b': 131072,
    'nvidia-deepseek/deepseek-ai/deepseek-v4.1-flash': 1000000,
  };
  const pinLanes = Object.keys(NVIDIA_ANCHOR_PINS).sort();
  check('pins: exactly the five user-pinned anchor lanes',
    JSON.stringify(pinLanes) === JSON.stringify(Object.keys(EXPECTED_LANES).sort()),
    `pinned: ${pinLanes.join(', ')}`);
  check('pins: zero nemotron in the anchor set (the ban, forever)',
    !pinLanes.some(l => /nemotron/i.test(l)), `offenders: ${pinLanes.filter(l => /nemotron/i.test(l))}`);

  const mkLive = (ids) => ids.map(id => ({ id, created: Math.floor(Date.now() / 1000) - 86400 * 30 }));

  // ── 1. A "stronger nemotron" live list must NOT change the assignment ─────
  // The exact #106 defect shape: the scorer's fake-strongest nemotron must
  // never enter the anchor set, never displace a pin, never get suggested.
  {
    const live = mkLive([
      'nvidia/nemotron-3-ultra-550b-a55b', // the "stronger" banned model
      'z-ai/glm-5.3', 'z-ai/glm-5.3-flash',
      'moonshotai/kimi-k3', 'meta/muse-glimmer-30b', 'deepseek-ai/deepseek-v4.1-flash',
    ]);
    const out = resolveNvidiaAnchors(live);
    const lanes = out.anchors.map(a => a.lane).sort();
    check('pin: a stronger-nemotron live list does NOT change the anchor set',
      JSON.stringify(lanes) === JSON.stringify(Object.keys(EXPECTED_LANES).sort()),
      `resolved: ${lanes.join(', ')}`);
    check('pin: every anchor verified against the live list',
      out.anchors.every(a => a.verified === true) && out.dead.length === 0,
      JSON.stringify(out).slice(0, 300));
    check('pin: zero nemotron anywhere in the resolved anchors',
      !JSON.stringify(out).match(/nemotron/i), 'a banned id leaked into the resolution');
  }

  // ── 2. A renamed anchor id MUST be updated (the curated RENAMES path) ────
  {
    // Simulate NVIDIA renaming glm-5.3 -> glm-5.4: the RENAMES table carries
    // the curated mapping; the live list serves only the new id.
    const renames = { 'z-ai/glm-5.3': 'z-ai/glm-5.4' };
    const live = mkLive([
      'z-ai/glm-5.4', 'z-ai/glm-5.3-flash',
      'moonshotai/kimi-k3', 'meta/muse-glimmer-30b', 'deepseek-ai/deepseek-v4.1-flash',
    ]);
    const out = resolveNvidiaAnchors(live, renames);
    const glm = out.anchors.find(a => a.family === 'nvidia-glm' && a.id === 'z-ai/glm-5.4');
    check('rename: the renamed anchor id is UPDATED (the curated mapping, never a guess)',
      !!glm && glm.verified === true && glm.lane === 'nvidia-glm/z-ai/glm-5.4',
      JSON.stringify(out.anchors));
    check('rename: no dead anchors after a clean rename',
      out.dead.length === 0, JSON.stringify(out.dead));
  }

  // ── 3. A dead anchor surfaces LOUDLY, never silently swapped ─────────────
  {
    const live = mkLive([
      'z-ai/glm-5.3', 'z-ai/glm-5.3-flash',
      'moonshotai/kimi-k3', 'meta/muse-glimmer-30b',
      // deepseek-v4.1-flash ABSENT (the real 2026-10-08 E8 finding shape)
      'nvidia/nemotron-3-ultra-550b-a55b', // a "stronger live" that must NOT be swapped in
    ]);
    const out = resolveNvidiaAnchors(live);
    check('dead: the dead anchor is flagged (never silently dropped)',
      out.dead.length === 1 && /deepseek-v4\.1-flash/.test(out.dead[0]?.id || out.dead[0]?.lane || ''),
      JSON.stringify(out.dead));
    check('dead: NO replacement was swapped in (the live set shrinks, the pin stands)',
      out.anchors.length === 4 && !out.anchors.some(a => /nemotron/i.test(a.lane)),
      `anchors: ${out.anchors.map(a => a.lane).join(', ')}`);
  }

  // ── 4. The scorer ranks WITHIN the anchor set ────────────────────────────
  {
    const live = mkLive([
      'z-ai/glm-5.3', 'z-ai/glm-5.3-flash',
      'moonshotai/kimi-k3', 'meta/muse-glimmer-30b', 'deepseek-ai/deepseek-v4.1-flash',
    ]);
    const out = resolveNvidiaAnchors(live);
    check('rank: every anchor carries a score (the within-set ranking, for the fast-lane alternate)',
      out.anchors.every(a => typeof a.score === 'number' && a.score > 0),
      JSON.stringify(out.anchors.map(a => ({ l: a.lane, s: a.score }))));
  }
}

// ── 5. The ban in the refresh output: nemotron never enters the nvidia ────
// ranked list (the old concentration path consumed exactly that list). ─────
check('ban: the refresh source carries the nemotron ban (the list filter)',
  /NEMOTRON_BAN/i.test(refreshSrc), 'no NEMOTRON_BAN marker in refresh-free-models.js');
check('ban: the ban is applied to the nvidia list (top + all)',
  /NEMOTRON_BAN[\s\S]{0,400}filter/i.test(refreshSrc) || /filter[\s\S]{0,200}NEMOTRON_BAN/i.test(refreshSrc),
  'the ban filter is not wired into the nvidia list build');

// ── 6. The loud dead-anchor path in main (content pins, never silent) ──────
check('loud: a dead anchor surfaces on stderr + a non-zero exit (the refresh refuses to whisper)',
  /process\.exit\(1\)/.test(refreshSrc) && /dead anchor|DEAD ANCHOR/i.test(refreshSrc),
  'the dead-anchor loud path (stderr + exit 1) not found');

// ── 7. The doctrine expressed in the header ────────────────────────────────
check('docs: the header expresses the anchor-pin doctrine',
  /anchor[\s\S]{0,200}pin|pinned/i.test(refreshSrc) && /never replaces|NEVER auto-replace|never overrides/i.test(refreshSrc),
  'the header does not express the doctrine');

console.log('');
if (failures > 0) {
  console.error(`refresh-anchor-pin: ${failures} doctrine violation(s) — the scorer does not serve the distribution`);
  process.exit(1);
}
console.log('refresh-anchor-pin: the scorer serves the distribution (verify / rename / record — never override)');
