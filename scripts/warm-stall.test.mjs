#!/usr/bin/env node
/**
 * warm-stall.test.mjs — W-N FIELD-POLISH (v0.0.8): the 2026-10-21 13:21
 * specimen — an architectural planning turn posted to a dead free endpoint
 * (the #129 free-anchor stall class) burned the FULL 15-minute runtime
 * ceiling in total silence. This suite pins the cure: the route-level
 * WARM-STALL bound (never 15 silent minutes again), the LANE-PROBE
 * pre-flight (a dead lane named in seconds), and the free-strategies
 * websearch lane (the brave-search MCP + the key surfaces).
 *
 * Run: npx tsx scripts/warm-stall.test.mjs   (exit 0 = pass)
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

async function main() {
  // ── N1: the WARM-STALL bound (the 15-minute silent death) ──────────────
  const routeSrc = read('src/app/api/olympus/action/route.ts');
  expect('N1: the warm lane carries the stall watchdog (OLYMPUS_WARM_STALL_MS, default 180s)',
    routeSrc.includes('OLYMPUS_WARM_STALL_MS') && routeSrc.includes('180_000'),
    'the 13:21 specimen would die silently again');
  expect('N1: the stall message names the class + the remedy (the #129 free-anchor honesty)',
    /#129 free-anchor stall class/.test(routeSrc) && routeSrc.includes('switch the free strategy'),
    'the user gets a ceiling message with no cause again');
  expect('N1: the internal narration lines are EXCLUDED from the activity clock',
    routeSrc.includes('INTERNAL_LOG_PREFIXES') && routeSrc.includes("'▶'"),
    "OLYMPUS's own 'dispatching…' log would defeat the bound (the startup-timer bug class)");
  expect('N1: the stall timer is cleaned up on finish (no leak across turns)',
    /if \(warmStallTimer\) clearInterval\(warmStallTimer\)/.test(routeSrc),
    'the timer leaks past the stream close');
  expect('N1: max runtime stays env-tunable (the UAT-5 law untouched)',
    routeSrc.includes('OLYMPUS_MAX_RUNTIME_MS'),
    'the ceiling lost its tuning');

  // ── N2: the LANE-PROBE pre-flight ─────────────────────────────────────
  const probeSrc = read('src/lib/lane-probe.ts');
  expect('N2: the probe lib ships (one token asked of the active lane)',
    fs.existsSync(path.join(OLYMPUS, 'src/lib/lane-probe.ts')) && probeSrc.includes('max_tokens: 1'),
    'no pre-flight lane check');
  expect('N2: the route fires the probe (fire-and-forget, loud on a dead lane)',
    routeSrc.includes('probeLane()') && routeSrc.includes('⚠ Pre-flight:'),
    'the probe exists but nobody asks it');
  // The fixture lane: the workspace config shape resolves provider + model.
  const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-probe-test-'));
  const wsPath = path.join(FIX, 'opencode.json');
  fs.writeFileSync(wsPath, JSON.stringify({
    agent: { apollo: { model: 'nvidia-glm/z-ai/glm-5.3' } },
    provider: { 'nvidia-glm': { options: { baseURL: 'https://integrate.api.nvidia.com/v1' } } },
  }));
  fs.writeFileSync(path.join(FIX, 'auth.json'), JSON.stringify({
    'nvidia-glm': { type: 'api', key: 'nvapi-fixture' },
    openrouter: { type: 'api', key: 'sk-or-fixture' },
  }));
  const probe = await import(OLYMPUS + '/src/lib/lane-probe.ts');
  const active = probe.activeModelFor('apollo', { workspacePath: wsPath });
  expect('N2: the active model resolves from the workspace config (provider/model split)',
    active?.providerId === 'nvidia-glm' && active?.modelId === 'z-ai/glm-5.3',
    `resolved=${JSON.stringify(active)}`);
  expect('N2: the lane base URL resolves (options.baseURL)',
    probe.laneBaseUrl('nvidia-glm', { workspacePath: wsPath }) === 'https://integrate.api.nvidia.com/v1',
    'the nvidia lane URL did not resolve');
  expect('N2: the builtin openrouter URL maps (the native provider carries no options)',
    probe.laneBaseUrl('openrouter', { workspacePath: wsPath }) === 'https://openrouter.ai/api/v1',
    'the openrouter builtin is missing');
  expect('N2: an unknown provider has NO base URL (the probe never guesses)',
    probe.laneBaseUrl('nobody', { workspacePath: wsPath }) === null,
    'the probe would probe a fabricated URL');
  fs.rmSync(FIX, { recursive: true, force: true });

  // ── N3: the free-strategies websearch lane (brave-search) ───────────────
  const mcpJson = read('.mcp.json');
  expect('N3: the brave-search MCP is registered (the free websearch lane)',
    mcpJson.includes('"brave-search"') && mcpJson.includes('mcp-brave-search') && mcpJson.includes('BRAVE_API_KEY'),
    'the free strategies stay search-blind');
  const reqsSrc = read('src/lib/mcp-api-requirements.ts');
  expect('N3: BRAVE_API_KEY joins the requirements map (the Originkit free-key pattern)',
    reqsSrc.includes("'brave-search'") && reqsSrc.includes('2,000 queries/month'),
    'the panel renders no key card for brave');
  const allowlistSrc = read('src/app/api/olympus/api-configs/route.ts');
  expect('N3: the api-configs allowlist accepts BRAVE_API_KEY (the J3 precedent)',
    allowlistSrc.includes('BRAVE_API_KEY'),
    'the key POST is refused');
  expect('N3: the header SVG counts 28 MCPs (the honest census)',
    read('public/header.svg').includes('28 MCPs'),
    'the count lies after the registration');

  // ── N4: the ORPHAN-CURE (the 16:04 specimen — the warm lane's death) ───
  const sessionSrc = read('src/lib/opencode-session.ts');
  expect('N4: probeServer fingerprints the v2 orphan BEFORE the /config early-return',
    /W-O ORPHAN-CURE/.test(sessionSrc) && /infoStatus === 401 \|\| infoStatus === 403/.test(sessionSrc),
    'a password-protected v2 serve gets adopted as v1-unauthed (the 405 chain)');
  expect('N4: the 401 orphan verdict rides the EXISTING kill branch (findPortOwnerPid + killStaleServe)',
    /probe\.status === 401/.test(sessionSrc) && /orphaned password-protected serve/.test(sessionSrc),
    'the orphan would survive the scan');
  expect('N4: the create-session debug still names the transport truth (the 16:04 specimen line)',
    sessionSrc.includes('create session failed (HTTP ${res.status}'),
    'the debug line lost its shape');

  // ── N5: the one-shot nudge re-attempt (the exit-130 lie) ───────────────
  const routeSrc2 = read('src/app/api/olympus/action/route.ts');
  expect('N5: the nudge re-attempt fires REGARDLESS of receivedOutput (the mid-stream class)',
    /if \(code !== 0 && attempt === 0 && nudged\) \{/.test(routeSrc2) && /mid-stream stall class/.test(routeSrc2),
    '"re-attempting once" stays a lie for mid-stream stalls (exit 130)');
  expect('N5: the re-attempt stays bounded at once (attempt===0 + fresh closure)',
    routeSrc2.includes('fallbackOneShot(sessionId, 1);'),
    'the re-attempt could loop');

  // ── N6: the logo overlay (the 16:04 specimen: letters ON TOP of logos) ─
  const panelSrc2 = read('src/components/olympus/craft-apps-panel.tsx');
  expect('N6: the Studio card carries the mark ALONE (no AC monogram overlay)',
    panelSrc2.includes('/craft-apps/logos/artcraft-icon.svg') && !panelSrc2.includes('>AC<'),
    'the AC letters still sit on top of the ArtCraft mark');
  expect('N6: the app tiles letter-fallback renders ONLY on image error (never over the logo)',
    /onError=\{\(\) => setFailed\(true\)\}/.test(panelSrc2) && !panelSrc2.includes('pointer-events-none">{letterMark'),
    'the letter overlay still renders over every logo');

  // ── N7: the dispatch lane serves the SYNCED mirror (the fossil cure) ──
  const spawnSrc = read('src/lib/opencode-spawn.ts');
  expect('N7: resolveDispatchCwd serves from resolveWorkspaceLane (the REFRESH-ON-DRIFT law on EVERY dispatch)',
    /resolveWorkspaceLane\(\)\.dir/.test(spawnSrc) && /W-O ORPHAN-CURE/.test(spawnSrc),
    'a one-shot dispatch can serve a fossil workspace config (the 17:33 specimen)');

  if (failures > 0) { console.error(`\nwarm-stall: ${failures} FAIL`); process.exit(1); }
  console.log('\nwarm-stall: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
