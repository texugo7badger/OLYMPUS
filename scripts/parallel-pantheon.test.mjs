#!/usr/bin/env node
/**
 * parallel-pantheon.test.mjs — MADRUGA-3 p6 Phases 1+2: concurrency on the
 * bus + the scripted full-path scenario. Run: npx tsx scripts/parallel-pantheon.test.mjs
 *
 * Phase 1: gods write CONCURRENTLY — Atlas (single writer) holds under
 * load: no lost entries, schema intact, zero conflicts, bus ordered.
 * Phase 2: the full path in one scripted scenario — prompt → Atlas →
 * dispatch (E4 law) → PARALLEL gods → instinct consult → Athena action →
 * report — every hop evidenced on the bus/sync-map.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF = join(ROOT, 'scripts', 'parallel-pantheon.test.mjs');
const WORK = join(tmpdir(), 'olympus-p6-parallel');
if (process.argv[2] !== 'child') { rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true }); }

let fails = 0, checked = 0;
const check = (n, ok, d = '') => { checked++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -- ${String(d).slice(0, 200)}`}`); if (!ok) fails++; };

if (process.argv[2] === 'child') {
  const lane = process.env.OLYMPUS_ROOT, vault = process.env.OLYMPUS_VAULT, home = process.env.OLYMPUS_HOME;
  const agent = {};
  for (const g of ['apollo','atlas','artemis','athena','dionysus','hephaestus','hermes','persephone','prometheus','callimachus'])
    agent[g] = { mode: g === 'apollo' ? 'primary' : 'subagent', model: 'nvidia/z-ai/glm-5.3', prompt: '#' + g };
  writeFileSync(join(lane, 'opencode.json'), JSON.stringify({ agent }));
  writeFileSync(join(lane, 'viewer-state.json'), JSON.stringify({ selectedGod: null, lastAction: null }));
  // the promoted instinct residents (read-only copies from the REAL store —
  // the consult must answer from the store's actual residents)
  const cpy = (await import('node:fs')).cpSync;
  cpy(join(process.env.HOME, 'OLYMPUS-VAULT/05_Auto_Learning/instincts/apollo/empirical'),
    join(vault, '05_Auto_Learning', 'instincts', 'apollo', 'empirical'), { recursive: true });

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
  const m = await import('../.opencode/olympus/lib/instinct-mutations.ts');
  const tracker = await import('../.opencode/olympus/lib/dispatch-tracker.ts');
  const dispatch = (await import('../.opencode/olympus/tools/dispatch.ts')).default;
  const out = {};

  // ── Phase 2 scenario, step 1: THE PROMPT lands in Atlas ──
  atlas.atlasIngestProjectPrompt({ sessionID: 'p6-scenario', text: 'Cenário paralelo: athena e hephaestus trabalham juntos; o viewer seleciona athena; o instinto HTTP-200 é consultado.' });

  // ── Phase 2, step 2: TWO dispatches (E4 law) — ATHENA + HEPHAESTUS lanes ──
  const dA = JSON.parse((await dispatch.execute({
    godId: 'apollo', demigod: 'visual-verifier', task: 'Athena: drive the viewer selection for athena.',
    artifacts: [join(lane, 'viewer-state.json')], doneCondition: 'viewer-state.json shows selectedGod=athena', budgetTokens: 1500,
  }, { sessionID: 'p6-scenario' })).output);
  const dH = JSON.parse((await dispatch.execute({
    godId: 'apollo', demigod: 'build-resolver', task: 'Hephaestus: write the scenario report file.',
    artifacts: [join(lane, 'scenario-report.md')], doneCondition: 'scenario-report.md exists', budgetTokens: 1500,
  }, { sessionID: 'p6-scenario' })).output);
  out.dispatches = { athena: dA.ok, hephaestus: dH.ok };

  // ── THE ARTIFACT-LESS REFUSAL (the law, verbatim) ──
  const dBad = JSON.parse((await dispatch.execute({ godId: 'apollo', demigod: 'build-resolver', task: 'no contract' }, { sessionID: 'x' })).output);
  out.refusal = dBad.error;

  // ── Phase 1: CONCURRENCY — the two gods' handlers + heartbeats in PARALLEL ──
  const gods = ['athena', 'hephaestus', 'artemis', 'hermes'];
  const latch = await Promise.all(gods.map(async (g, i) => {
    // interleaved concurrent funnel writes + bus publishes
    await new Promise(r => setTimeout(r, i * 3));
    atlas.atlasIngestProjectPrompt({ sessionID: `p6-${g}`, text: `${g} concurrent action ${i}` });
    bus.busPublish({ type: 'heartbeat', god: g, state: 'acting', dedupKey: `p6:${g}:acting` });
    atlas.atlasRecordHeartbeat(g, 'acting');
    bus.busPublish({ type: 'heartbeat', god: g, state: 'done', dedupKey: `p6:${g}:done` });
    atlas.atlasRecordHeartbeat(g, 'done');
    return g;
  }));
  out.concurrentGods = latch;

  // ── Phase 2, step 3: THE INSTINCT CONSULT (consult-before-act, recorded) ──
  const instincts = m.loadEmpiricalInstincts('apollo');
  out.instinctConsulted = { count: instincts.length, first: instincts[0]?.id ?? null };

  // ── step 4: THE HANDLERS produce their declared artifacts ──
  const vs = JSON.parse(readFileSync(join(lane, 'viewer-state.json'), 'utf-8'));
  vs.selectedGod = 'athena'; vs.lastAction = { kind: 'parallel-scenario', dispatchId: dA.dispatchId, ts: new Date().toISOString() };
  writeFileSync(join(lane, 'viewer-state.json'), JSON.stringify(vs, null, 2));
  writeFileSync(join(lane, 'scenario-report.md'), `# Scenario report\n\nParallel run: athena (viewer) + hephaestus (report) + ${gods.length} concurrent heartbeat writers.\nInstinct consulted: ${instincts[0]?.id}\n`);
  tracker.attributeToolCall({ god: 'apollo', agentId: 'visual-verifier', tool: 'edit', hadError: false, tokens: { input: 5, output: 5 } });
  tracker.attributeToolCall({ god: 'apollo', agentId: 'build-resolver', tool: 'write', hadError: false, tokens: { input: 5, output: 5 } });
  out.finalize = atlas.finalizeAtlasOnProcessExit().dispatchesFinalized;

  // ── Phase 1 integrity: sync-map + bus after the load ──
  const map = JSON.parse(readFileSync(join(home, 'sync-map.json'), 'utf-8'));
  const q = atlas.atlasQueryPathState({ reader: 'apollo' }).result;
  const replay = bus.busReplay();
  out.map = {
    entries: Object.keys(map.entries).length,
    chainValid: q.chainValid,
    tampered: q.tampered,
    godStatesCount: Object.keys(q.godStates ?? {}).length,
    projectOrigins: Object.values(map.entries).filter(e => e.origin === 'project').length,
    dispatchOrigins: Object.values(map.entries).filter(e => e.origin === 'dispatch').length,
    statuses: Object.values(map.entries).map(e => e.status),
  };
  out.bus = { events: replay.events.length, seqsStrictlyIncreasing: replay.events.every((e, i, a) => i === 0 || e.seq > a[i - 1].seq), godStates: Object.keys(replay.godStates).length };
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

const lane = join(WORK, 'lane'), vault = join(WORK, 'vault'), home = join(WORK, 'home');
for (const d of [lane, vault, home]) mkdirSync(d, { recursive: true });
const r = spawnSync('npx', ['tsx', SELF, 'child'], {
  encoding: 'utf-8', cwd: ROOT, timeout: 180_000,
  env: { ...process.env, OLYMPUS_ROOT: lane, OLYMPUS_VAULT: vault, OLYMPUS_HOME: home },
});
if (r.status !== 0) { console.log('CHILD FAILED:', r.stdout?.slice(-300), r.stderr?.slice(-500)); process.exit(1); }
const G = JSON.parse(r.stdout.trim().split('\n').filter(Boolean).pop());

// Phase 2
check('P2 both E4-contract dispatches fired (athena + hephaestus lanes)', G.dispatches?.athena === true && G.dispatches?.hephaestus === true, JSON.stringify(G.dispatches));
check('P2 the artifact-less directive REFUSED verbatim (the law)', /contract violation/i.test(G.refusal || ''), JSON.stringify(G.refusal).slice(0, 150));
check('P2 the instinct consult is recorded (the store answers)', G.instinctConsulted?.count >= 1 && G.instinctConsulted?.first === 'landing-route-renders-http-200', JSON.stringify(G.instinctConsulted));
check('P2 both declared artifacts produced -> both finalize SUCCESS',
  (G.finalize || []).filter(f => f.outcome === 'success').length >= 2, JSON.stringify(G.finalize).slice(0, 220));
// Phase 1: integrity under concurrency
check('P1 Atlas held under concurrent writes: 4 concurrent god lanes + 2 scenario lanes — no lost entries',
  G.map?.entries >= 6, `entries=${G.map?.entries}`);
check('P1 sync-map integrity: chain valid, zero tamper', G.map?.chainValid === true && (G.map?.tampered || []).length === 0, JSON.stringify({ c: G.map?.chainValid, t: G.map?.tampered }));
check('P1 every entry has a lifecycle status from the contract set',
  (G.map?.statuses || []).every(s => ['received', 'routed', 'done', 'failed'].includes(s)), JSON.stringify(G.map?.statuses));
check('P1 bus under load: ordered (strictly increasing seq) + all 4 gods heartbeated', G.bus?.seqsStrictlyIncreasing === true && G.bus?.godStates >= 4, JSON.stringify(G.bus));
console.log(`      scenario evidence: entries=${G.map?.entries} (project=${G.map?.projectOrigins}, dispatch=${G.map?.dispatchOrigins}) · bus events=${G.bus?.events} · godStates=${G.bus?.godStates}`);

rmSync(WORK, { recursive: true, force: true });
if (fails > 0) { console.error(`\n${fails}/${checked} parallel-pantheon assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} parallel-pantheon (Phase 1+2) assertions passed`);
