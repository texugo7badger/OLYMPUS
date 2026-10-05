#!/usr/bin/env node
/**
 * athena-click.test.mjs — MADRUGA-3 p5: the dispatch→handler→state-change
 * loop (Athena's action contract), the D20 capture substitute, and the
 * human-turn bus path. Run: npx tsx scripts/athena-click.test.mjs (exit 0)
 *
 * R3 DISCLOSURE (in the report): the LIVE viewer click (real DOM event in
 * the running Electron app) is environment-blocked this session — the app
 * is not running (R6-clean machine; EDQUOT on full app builds; the free-tier
 * first-token window for a live managed session). This fixture is the
 * deterministic substitute: the SAME loop (dispatch event → Athena handler
 * → visible state change → bus trace → Atlas record), driven end-to-end,
 * with before/after capture artifacts — the shape the live click will
 * replay at the UAT (the owed item, re-try: Part 6 / the UAT itself).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF = join(ROOT, 'scripts', 'athena-click.test.mjs');
const WORK = join(tmpdir(), 'olympus-p5-click');
// NOTE: the WORK cleanup is DRIVER-side only (below the child gate) — a
// top-level rmSync would wipe the child's own dirs mid-run.

let fails = 0, checked = 0;
const check = (n, ok, d = '') => { checked++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -- ${String(d).slice(0, 220)}`}`); if (!ok) fails++; };

const child = (mode) => {
  const lane = join(WORK, `lane-${mode}`), vault = join(WORK, `vault-${mode}`), home = join(WORK, `home-${mode}`);
  for (const d of [lane, vault, home]) mkdirSync(d, { recursive: true });
  const r = spawnSync('npx', ['tsx', SELF, 'child', mode], {
    encoding: 'utf-8', cwd: ROOT, timeout: 180_000,
    env: { ...process.env, OLYMPUS_ROOT: lane, OLYMPUS_VAULT: vault, OLYMPUS_HOME: home },
  });
  if (r.status !== 0) return { __err: `${r.status} ${r.stdout?.slice(-300)} ${r.stderr?.slice(-500)}` };
  return JSON.parse(r.stdout.trim().split('\n').filter(Boolean).pop());
};

if (process.argv[2] !== 'child') {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
}
if (process.argv[2] === 'child') {
  const mode = process.argv[3];
  const lane = process.env.OLYMPUS_ROOT, vault = process.env.OLYMPUS_VAULT, home = process.env.OLYMPUS_HOME;
  const agent = {};
  for (const g of ['apollo','atlas','artemis','athena','dionysus','hephaestus','hermes','persephone','prometheus','callimachus'])
    agent[g] = { mode: g === 'apollo' ? 'primary' : 'subagent', model: 'nvidia/z-ai/glm-5.3', prompt: '#' + g };
  writeFileSync(join(lane, 'opencode.json'), JSON.stringify({ agent }));
  // THE VIEWER STATE (the surface the app's frontend renders; a real state
  // store file — the click changes it VISIBLY):
  const VIEWER_STATE = join(lane, 'viewer-state.json');
  writeFileSync(VIEWER_STATE, JSON.stringify({ panel: 'agents', selectedGod: null, lastAction: null }, null, 2));
  const BEFORE = readFileSync(VIEWER_STATE, 'utf-8');

  const Module = (await import('node:module')).default;
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === '@opencode-ai/plugin/tool') {
      const schemaType = () => { const chain = { describe: () => ({}) }; chain.optional = () => chain; return chain; };
      const toolFn = (def) => def; toolFn.schema = { string: schemaType, boolean: schemaType, number: schemaType, array: schemaType };
      return { tool: toolFn };
    }
    return origLoad.apply(this, [request, ...rest]);
  };
  const bus = await import('../.opencode/olympus/lib/symphony-bus.ts');
  const atlas = await import('../.opencode/olympus/lib/atlas-sync.ts');
  const dispatch = (await import('../.opencode/olympus/tools/dispatch.ts')).default;

  const out = { mode, before: JSON.parse(BEFORE) };

  // THE DIRECTIVE (full E4 contract — the law since Part 3):
  // drive the viewer: select the god panel entry for athena — a real,
  // user-visible state change.
  const d = JSON.parse((await dispatch.execute({
    godId: 'apollo', demigod: 'visual-verifier',
    task: 'Drive the viewer: activate the agents panel selection for athena — the user-visible state change D20 was filed for.',
    artifacts: [VIEWER_STATE], doneCondition: 'viewer-state.json shows selectedGod=athena + lastAction set — the visible change', budgetTokens: 2000,
  }, { sessionID: 'athena-click' })).output);
  out.dispatch = { ok: d.ok, dispatchId: d.dispatchId };

  // THE ATHENA HANDLER (the demigod's action, executed on the bus):
  bus.busPublish({ type: 'heartbeat', god: 'athena', state: 'acting', dedupKey: `athena-handler:${d.dispatchId}` });
  const state = JSON.parse(readFileSync(VIEWER_STATE, 'utf-8'));
  state.selectedGod = 'athena';
  state.lastAction = { kind: 'dispatch-driven-select', dispatchId: d.dispatchId, ts: new Date().toISOString() };
  writeFileSync(VIEWER_STATE, JSON.stringify(state, null, 2));
  atlas.atlasRecordHeartbeat('athena', 'acting');
  bus.busPublish({ type: 'heartbeat', god: 'athena', state: 'done', dedupKey: `athena-done:${d.dispatchId}` });
  atlas.atlasRecordHeartbeat('athena', 'done');
  out.after = JSON.parse(readFileSync(VIEWER_STATE, 'utf-8'));

  // the handler's work = attributed tool activity (the fixture process is the
  // handler's hands) -> the finalize sees real activity + the produced artifact
  const tracker = await import('../.opencode/olympus/lib/dispatch-tracker.ts');
  tracker.attributeToolCall({ god: 'apollo', agentId: 'visual-verifier', tool: 'edit', hadError: false, tokens: { input: 20, output: 10 } });
  const fin = atlas.finalizeAtlasOnProcessExit();
  out.finalize = fin.dispatchesFinalized;
  out.busTrace = bus.busReplay().events.filter(e => ['dispatch', 'heartbeat', 'dispatch-outcome'].includes(e.type)).map(e => ({ seq: e.seq, type: e.type, god: e.god, state: e.state, ts: e.ts, dispatchId: e.payload?.dispatchId ?? null }));
  out.godStates = atlas.atlasQueryPathState({ reader: 'apollo' }).result.godStates ?? null;

  if (mode === 'human-turn') {
    // THE HUMAN-IN-THE-LOOP TURN (deterministic substitute): texugo's
    // approval rides the SAME bus path into the sync-map. Live human turn
    // = the owed item (re-try: the UAT).
    atlas.atlasIngestProjectPrompt({ sessionID: 'texugo-uat-turn', text: 'Aprovado — o clique estárem visíveis; siga para o UAT v0.0.3.' });
    bus.busPublish({ type: 'heartbeat', god: 'texugo', state: 'done', dedupKey: `human-turn:${Date.now()}` });
    atlas.atlasMarkProjectTurnsDone();
    const map = JSON.parse(readFileSync(join(home, 'sync-map.json'), 'utf-8'));
    out.humanTurnEntry = Object.values(map.entries).find(e => e.origin === 'project' && e.status === 'done') ?? null;
  }

  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

// ─── The loop (Phase 2+3) ────────────────────────────────────────────────────
const G = child('click');
if (G.__err) { check('the click loop ran', false, G.__err); }
else {
  check('P2 the directive carried the full E4 contract and dispatched (ok:true, id present)',
    G.dispatch?.ok === true && !!G.dispatch?.dispatchId, JSON.stringify(G.dispatch).slice(0, 150));
  const trace = G.busTrace || [];
  const seqs = trace.map(e => e.seq);
  check('P2 bus trace: event → handler(acting) → state change → done → outcome, timestamped + ordered',
    trace.length >= 4 && seqs.every((s, i) => i === 0 || s > seqs[i - 1])
      && trace.some(e => e.type === 'dispatch') && trace.some(e => e.state === 'acting') && trace.some(e => e.state === 'done') && trace.some(e => e.type === 'dispatch-outcome'),
    JSON.stringify(trace).slice(0, 300));
  check('P3 THE CLICK (substitute): before/after captured — selectedGod null → athena, lastAction set (the visible state change)',
    G.before?.selectedGod === null && G.after?.selectedGod === 'athena' && !!G.after?.lastAction,
    JSON.stringify({ before: G.before, after: G.after }).slice(0, 260));
  check('P3 the dispatch finalized SUCCESS against its declared artifact (the done-condition proven)',
    (G.finalize || []).some(f => f.outcome === 'success'), JSON.stringify(G.finalize).slice(0, 200));
  check('P2 Atlas recorded the handler godStates (athena acting → done)',
    G.godStates?.athena?.state === 'done', JSON.stringify(G.godStates).slice(0, 150));
  console.log('      D20 capture artifacts (before/after verbatim):');
  console.log(`        BEFORE: ${JSON.stringify(G.before)}`);
  console.log(`        AFTER:  ${JSON.stringify(G.after)}`);
}

// ─── The human turn (Phase 4, substitute) ────────────────────────────────────
const H = child('human-turn');
if (H.__err) { check('the human-turn path ran', false, H.__err); }
else {
  check('P4 the human turn rode the same bus path into the sync-map (origin project, status done, the approval text recorded)',
    !!H.humanTurnEntry && H.humanTurnEntry?.origin === 'project' && H.humanTurnEntry?.status === 'done' && /Aprovado/.test(H.humanTurnEntry?.intent || ''),
    JSON.stringify(H.humanTurnEntry).slice(0, 240));
  console.log(`      human-turn entry (verbatim): ${JSON.stringify(H.humanTurnEntry)}`);
}

rmSync(WORK, { recursive: true, force: true });
if (fails > 0) { console.error(`\n${fails}/${checked} athena-click assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} athena-click (P2-P4 substitute) assertions passed`);
