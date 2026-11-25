#!/usr/bin/env node
/**
 * go-lane-fallback.test.mjs — v0.1.0: the launch-truth suite.
 *
 * Pins the verified-lane contract measured on 2026-11-25:
 *   - CLI probes: deepseek/mimo/hy3/kimi/glm answer OK; qwen3.7/3.8 and
 *     minimax-m3 answer "OpenCode Go requires an API key";
 *   - a dead lane falls back to a live GO lane (never a free lane);
 *   - the pre-flight probe is advisory for harness-only lanes;
 *   - a finished generation applies the staged next generation;
 *   - marks go to Apollo; status brief + design provenance + dedupe exist.
 *
 * Run: npx tsx scripts/go-lane-fallback.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-lanes-'));
process.env.OLYMPUS_HOME = HOME;
process.on('exit', () => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* gone */ } });

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 300)}`);
  if (!cond) failures++;
}

const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

async function main() {
  const strategies = await import(ROOT + '/src/lib/model-strategies.ts');
  const fallbacks = [...strategies.GO_SAFE_FALLBACKS];
  expect('G1: the GO fallback roster carries the CLI-verified lanes', fallbacks.includes('opencode-go/mimo-v2.6-flash') && fallbacks.includes('opencode-go/deepseek-v4.1-flash'), fallbacks.join(','));
  expect('G2: MiniMax M3 is not offered as a fallback after the provider denial', !fallbacks.includes('opencode-go/minimax-m3'), fallbacks.join(','));

  // A lane-health file with the measured deaths; guardedModelForGod must not
  // return a dead lane for a chat turn.
  fs.writeFileSync(path.join(HOME, 'lane-health.json'), JSON.stringify({
    version: 1,
    lanes: {
      'opencode-go/qwen3.8-flash': { status: 'auth', at: Date.now(), error: 'OpenCode Go requires an API key', errorClass: 'provider.auth' },
      'opencode-go/minimax-m3': { status: 'auth', at: Date.now(), error: 'OpenCode Go requires an API key', errorClass: 'provider.auth' },
      'opencode-go/deepseek-v4.1-flash': { status: 'alive', at: Date.now() },
    },
    updatedAt: new Date().toISOString(),
  }, null, 2));
  const model = await import(ROOT + '/src/lib/agent-model.ts');
  const picked = model.guardedModelForGod('athena', 'opencode-go/qwen3.8-flash');
  expect('G3: a dead qwen lane resolves to a live GO lane', picked === 'opencode-go/deepseek-v4.1-flash', picked);
  const pickedQwen37 = model.guardedModelForGod('athena', 'opencode-go/qwen3.7-plus');
  expect('G4: the known qwen3.7-plus lane resolves to a live GO lane', pickedQwen37 === 'opencode-go/deepseek-v4.1-flash', pickedQwen37);
  const kept = model.guardedModelForGod('atlas', 'opencode-go/hy3');
  expect('G5: a healthy lane is left alone (the strategy wins)', kept === 'opencode-go/hy3', kept);
  const active = model.activeLaneIds();
  expect('G5b: retired qwen/minimax lanes are not "in use"', !active.has('opencode-go/qwen3.8-flash') && !active.has('opencode-go/minimax-m3'), [...active].join(','));
  expect('G5c: no dead lane is reported when the configured roster is healthy', model.blockedLanesInUse().length === 0, JSON.stringify(model.blockedLanesInUse()));

  const probe = src('src/lib/lane-probe.ts');
  expect('G6: the pre-flight probes the TURN model, not a stale workspace config', /model\?: string \| null/.test(probe) && /override\.includes\('\/'\)/.test(probe), 'lane-probe has no model override');
  expect('G7: a harness-only raw auth refusal is not authoritative', /raw auth refusal is not authoritative/.test(probe), 'the GO false-death class is back');
  const action = src('src/app/api/olympus/action/route.ts');
  expect('G8: the action passes the guarded model to the probe', /probeLane\(\{ agent: probeAgent, model: probeModel \}\)/.test(action), 'the probe still reads the stale config');
  expect('G9: only an authoritative auth fails fast; harness-only continues', /!r\.aliveForUs/.test(action) && /the turn continues on/.test(action), 'a false refusal can still abort a turn');

  const walkLane = src('scripts/walk-lane.ts');
  expect('G10: a DONE generation applies the staged next generation', /applyNextPlan\(laneRoot\)/.test(walkLane) && /generation boundary/.test(walkLane), 'the walker exits with dispatch-plan.next.json waiting');
  expect('G11: a parked generation never auto-advances', /!result\.parked && result\.total > 0/.test(walkLane), 'a park would be skipped');

  const preview = src('src/components/olympus/live-preview.tsx');
  expect('G12: marks batch to Apollo (no Athena chat path)', /sendQueueToApollo/.test(preview) && /marks\/send/.test(preview) && !/olympus:open-god-chat.*athena/.test(preview), 'the mark path still opens Athena');
  expect('G13: the preview window uses the browser iframe (no black webview)', /forceBrowser/.test(src('src/app/preview-window/page.tsx')), 'the popup still uses webview');

  expect('G14: the status brief API + card + prompt marker exist', fs.existsSync(path.join(ROOT, 'src/lib/status-brief.ts')) && fs.existsSync(path.join(ROOT, 'src/app/api/olympus/status-brief/route.ts')) && /statusBriefMarker/.test(action), 'no where-is-my-project surface');

  const tasks = src('src/lib/tasks-sheet.ts');
  expect('G15: the project design score has provenance, root wins over a page review', /const designReview = rootReview \?\? frontdoorReview/.test(tasks) && /designSource/.test(tasks), 'two scores with no source');
  const postRun = src('src/lib/hop-runtime/post-run.ts');
  expect('G16: the design repair keeps the project floor (no hardcoded 7)', /gateThreshold/.test(postRun) && /design-score:\$\{gateThreshold\}/.test(postRun), 'the repair can accept a below-floor score');

  const companion = src('src/lib/use-companion-notifications.ts');
  expect('G17: notification events are deduped by semantic key', /announcedRef/.test(companion) && /10 \* 60_000/.test(companion) && /key = `\$\{event\.type\}/.test(companion), 'duplicate notifications remain');
  const walker = src('src/lib/hop-runtime/walker.ts');
  expect('G18: a completed hop writes an empirical instinct and announces it once', /recordHopLearning\(/.test(walker) && /type: 'learning'/.test(walker), 'the brain still learns nothing from hops');

  const page = src('src/app/page.tsx');
  expect('G19: cold boot cannot stack panel loaders (overlays are null-loading)', /SettingsDialog = dynamic\([^\n]*loading: \(\) => null/.test(page) && /SSEStreamPanel = dynamic\([^\n]*loading: \(\) => null/.test(page) && /StatusBar = dynamic\([^\n]*<div className="h-8/.test(page), 'an overlay still renders a full PanelLoading');
  expect('G20: the terminal chunk is preloaded during the boot door', /import\('@\/components\/olympus\/interactive-terminal'\)/.test(page), 'the status brief can be blank on a cold load');

  console.log(failures === 0 ? '\ngo-lane-fallback: PASS' : `\ngo-lane-fallback: ${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
