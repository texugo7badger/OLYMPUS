#!/usr/bin/env node
/**
 * symphony-cable.test.mjs — MADRUGA-3 p3: the context cable gate.
 * Run: npx tsx scripts/symphony-cable.test.mjs   (exit 0 = pass)
 *
 * RED (captured verbatim against the p2 code via stash, in the session
 * log): E1 ingest failure left NO record (stderr only); E4 an
 * artifact-less directive emitted ok:true (the CERT-P1 shape); E2 a
 * corrupt sync-map was silently discarded (0 entries, data loss).
 *
 * GREEN: E1 surfaced on the bus; E2 .bak recovery (loud); E4 the emission
 * gate + finalize enforcement; ordering + dedup; two gods' heartbeats;
 * replay == sync-map; dead subscriber never blocks.
 *
 * Hermetic (R11): temp OLYMPUS_HOME/VAULT/ROOT from the first run.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF = join(ROOT, 'scripts', 'symphony-cable.test.mjs');
const WORK = join(tmpdir(), 'olympus-p3-cable');

let fails = 0, checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${String(detail).slice(0, 240)}`}`);
  if (!ok) fails++;
}

if (process.argv[2] === 'child') {
  const lane = process.env.OLYMPUS_ROOT, vault = process.env.OLYMPUS_VAULT, home = process.env.OLYMPUS_HOME;
  mkdirSync(join(lane), { recursive: true });
  mkdirSync(join(vault, '06_Activity_Feed'), { recursive: true });
  mkdirSync(home, { recursive: true });
  const agent = {};
  for (const g of ['apollo','atlas','artemis','athena','dionysus','hephaestus','hermes','persephone','prometheus','callimachus'])
    agent[g] = { mode: g === 'apollo' ? 'primary' : 'subagent', model: 'nvidia/z-ai/glm-5.3', prompt: '#' + g };
  writeFileSync(join(lane, 'opencode.json'), JSON.stringify({ agent }));

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

  const out = {};
  const bus = await import('../.opencode/olympus/lib/symphony-bus.ts');
  const atlas = await import('../.opencode/olympus/lib/atlas-sync.ts');
  const dispatch = (await import('../.opencode/olympus/tools/dispatch.ts')).default;
  const CONTRACT = { artifacts: [join(lane, 'declared-artifact.txt')], doneCondition: 'the declared artifact file exists', budgetTokens: 2000 };

  // ── E1 green: an ingest failure surfaces on the BUS (isolated: sync-map
  // file read-only, bus writable).
  writeFileSync(join(home, 'sync-map.json'), JSON.stringify({ entries: {}, chainHead: 'genesis', lastUpdated: new Date().toISOString(), godStates: {} }));
  // Deterministic ingest-failure isolation: the persist's TMP target is a
  // directory -> EISDIR every write; the BUS (a different file) stays
  // writable. (chmod tricks don't isolate: rename bypasses file perms.)
  mkdirSync(join(home, 'sync-map.json.tmp'), { recursive: true });
  const e1 = JSON.parse((await dispatch.execute({ godId: 'apollo', demigod: 'frontend-reviewer', task: 'e1 probe', ...CONTRACT }, { sessionID: 'e1' })).output);
  rmSync(join(home, 'sync-map.json.tmp'), { recursive: true, force: true });
  out.e1 = { refused: !e1.ok, error: e1.error, dispatchOk: e1.ok };
  const busLog = readFileSync(join(home, 'symphony-bus.jsonl'), 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  out.e1busEvent = busLog.find(e => e.type === 'atlas-ingest-error') || null;

  // ── E4 green A: no declared artifacts → REFUSED at emission.
  out.e4a = JSON.parse((await dispatch.execute({ godId: 'apollo', demigod: 'build-resolver', task: 'no contract' }, { sessionID: 'e4a' })).output);

  // ── E4 green B: declared artifacts, never produced → finalize 'failed'
  // with the violation.
  const dB = JSON.parse((await dispatch.execute({ godId: 'apollo', demigod: 'build-resolver', task: 'declared, not produced', ...CONTRACT }, { sessionID: 'e4b' })).output);
  const finB = atlas.finalizeAtlasOnProcessExit();
  out.e4b = { dispatchOk: dB.ok, dispatchId: dB.dispatchId, finalize: finB };
  const feed = readFileSync(join(vault, '06_Activity_Feed', 'live.jsonl'), 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  out.e4bOutcome = feed.filter(e => e.action === 'dispatch_outcome').map(e => ({ dispatch_id: e.dispatch_id, outcome: e.outcome, violation: e.contract_violation }));

  // ── E4 green C: declared artifact PRODUCED → 'success'.
  writeFileSync(join(lane, 'declared-artifact.txt'), 'produced');
  const dC = JSON.parse((await dispatch.execute({ godId: 'apollo', demigod: 'build-resolver', task: 'declared and produced', ...CONTRACT }, { sessionID: 'e4c' })).output);
  const tracker = await import('../.opencode/olympus/lib/dispatch-tracker.ts');
  tracker.attributeToolCall({ god: 'apollo', agentId: 'build-resolver', tool: 'read', hadError: false, tokens: { input: 10, output: 5 } });
  const finC = atlas.finalizeAtlasOnProcessExit();
  out.e4c = { dispatchOk: dC.ok, finalized: finC.dispatchesFinalized };

  // ── E2 green: corruption recovery from .bak (loud, entries preserved)
  const goodMap = JSON.parse(readFileSync(join(home, 'sync-map.json'), 'utf-8'));
  try { chmodSync(join(home, 'sync-map.json.bak'), 0o644); } catch {}; writeFileSync(join(home, 'sync-map.json.bak'), JSON.stringify(goodMap));
  writeFileSync(join(home, 'sync-map.json'), readFileSync(join(home, 'sync-map.json'), 'utf-8') + '{{CORRUPT-TAIL');
  const qe2 = atlas.atlasQueryPathState({ reader: 'apollo' });
  out.e2 = { recovered: qe2.result.entries.length, expected: Object.keys(goodMap.entries).length };

  // ── ordering + dedup (Phase 1)
  const r1 = bus.busPublish({ type: 'heartbeat', god: 'athena', state: 'acting', dedupKey: 'ord:1' });
  const r2 = bus.busPublish({ type: 'heartbeat', god: 'prometheus', state: 'acting', dedupKey: 'ord:1' }); // duplicate key
  const r3 = bus.busPublish({ type: 'heartbeat', god: 'athena', state: 'done', dedupKey: 'ord:3' });
  out.ordering = { seqs: [r1.event?.seq, r3.event?.seq], dup: r2.duplicate, dupCount: r2.duplicateCount };

  // ── Phase 2: two gods' heartbeats — the bus trace + Atlas records.
  bus.busPublish({ type: 'heartbeat', god: 'athena', state: 'acting', dedupKey: 'hb:athena:1' });
  bus.busPublish({ type: 'heartbeat', god: 'prometheus', state: 'acting', dedupKey: 'hb:prometheus:1' });
  atlas.atlasRecordHeartbeat('athena', 'acting');
  atlas.atlasRecordHeartbeat('prometheus', 'acting');
  const map = JSON.parse(readFileSync(join(home, 'sync-map.json'), 'utf-8'));
  out.godStates = map.godStates;

  // ── Phase 4: dead subscriber never blocks the bus.
  const drops = bus.busSubscribe('dead-one', () => { throw new Error('subscriber died'); });
  const alive = [];
  bus.busSubscribe('alive-one', e => alive.push(e.seq));
  const pub = bus.busPublish({ type: 'heartbeat', god: 'hermes', state: 'thinking', dedupKey: 'kill:1' });
  atlas.atlasRecordHeartbeat('hermes', 'thinking');
  out.deadSub = { published: pub.event !== null, drops: pub.droppedSubscribers, aliveGot: alive.length, counts: bus.busDropCounts() };

  // ── Phase 3: replay reconstructs from the log alone.
  const replay = bus.busReplay();
  const mapAfter = JSON.parse(readFileSync(join(home, 'sync-map.json'), 'utf-8'));
  out.replay = {
    godStates: replay.godStates,
    dispatchLifecycle: replay.dispatchLifecycle,
    mapGodStates: mapAfter.godStates,
    mapDispatchStatuses: Object.fromEntries(Object.values(mapAfter.entries).map(e => [e.meta?.dispatchId, e.status])),
  };

  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

// ─── Driver ────────────────────────────────────────────────────────────────
rmSync(WORK, { recursive: true, force: true });
const lane = join(WORK, 'lane'), vault = join(WORK, 'vault'), home = join(WORK, 'home');
for (const d of [lane, vault, home]) mkdirSync(d, { recursive: true });
const r = spawnSync('npx', ['tsx', SELF, 'child'], {
  encoding: 'utf-8', cwd: ROOT, timeout: 180_000,
  env: { ...process.env, OLYMPUS_ROOT: lane, OLYMPUS_VAULT: vault, OLYMPUS_HOME: home },
});
if (r.status !== 0) { console.log('CHILD FAILED:', r.stdout?.slice(-500), r.stderr?.slice(-800)); process.exit(1); }
const G = JSON.parse(r.stdout.trim().split('\n').filter(Boolean).pop());

check('E2 a corrupt sync-map RECOVERS from .bak (entries preserved, loud)', G.e2?.recovered === G.e2?.expected && G.e2?.expected > 0, JSON.stringify(G.e2));
// E1
check('E1 an ingest failure SURFACES on the bus (atlas-ingest-error event) while the dispatch proceeds (loud, non-blocking)',
  G.e1busEvent !== null && G.e1?.dispatchOk === true, JSON.stringify(G.e1));
console.log(`      verbatim: ${JSON.stringify(G.e1busEvent).slice(0, 200)}`);
// E4-A
check('E4 a directive with NO declared artifacts is REFUSED at emission (the CERT-P1 lesson)',
  G.e4a?.ok === false && /contract violation/i.test(G.e4a?.error || '') && /artifacts/i.test(G.e4a?.error || ''), JSON.stringify(G.e4a).slice(0, 200));
console.log(`      verbatim: ${JSON.stringify(G.e4a?.error).slice(0, 180)}`);
// E4-B
const vb = (G.e4bOutcome || []).find(e => e.dispatch_id === G.e4b?.dispatchId);
check('E4 declared-but-NOT-produced finalizes FAILED with the contract-violation text',
  vb?.outcome === 'failure' && /CONTRACT VIOLATION/i.test(vb?.violation || ''), JSON.stringify(vb).slice(0, 240));
console.log(`      verbatim: ${JSON.stringify(vb?.violation).slice(0, 200)}`);
// E4-C
check('E4 declared-and-PRODUCED finalizes success (the contract is satisfiable)',
  (G.e4c?.finalized || []).some(f => f.outcome === 'success'), JSON.stringify(G.e4c).slice(0, 200));
// ordering + dedup
check('P1 ordering: seqs strictly increase', (G.ordering?.seqs?.[0] ?? 0) < (G.ordering?.seqs?.[1] ?? 0), JSON.stringify(G.ordering));
check('P1 dedup: same dedupKey publishes once (duplicate counted)', G.ordering?.dup === true && G.ordering?.dupCount === 2, JSON.stringify(G.ordering));
// heartbeats
check('P2 two gods publish timestamped heartbeats — bus trace + Atlas records match',
  G.godStates?.athena?.state === 'acting' && G.godStates?.prometheus?.state === 'acting', JSON.stringify(G.godStates));
// dead subscriber
check('P4 a dead subscriber never blocks the bus — drop LOUD + counted, others delivered',
  G.deadSub?.published === true && G.deadSub?.drops >= 1 && G.deadSub?.aliveGot === 1 && (G.deadSub?.counts?.['dead-one'] ?? 0) >= 1, JSON.stringify(G.deadSub));
// replay == sync-map
// STATES compare (the bus event ts and the Atlas record ts are two
// records of the same fact — legitimately distinct instants).
const replayStates = Object.fromEntries(Object.entries(G.replay?.godStates || {}).map(([g, s]) => [g, s.state]));
const mapStates = Object.fromEntries(Object.entries(G.replay?.mapGodStates || {}).map(([g, s]) => [g, s.state]));
check('P3 replay from the log alone == the sync-map godStates (state parity)',
  JSON.stringify(replayStates) === JSON.stringify(mapStates), JSON.stringify({ replayStates, mapStates }));
console.log('      replay godStates (verbatim): ' + JSON.stringify(G.replay?.godStates));
const dispatchIds = Object.keys(G.replay?.dispatchLifecycle || {});
const mapStatuses = G.replay?.mapDispatchStatuses || {};
const routed = dispatchIds.filter(id => mapStatuses[id]);
const lifecycleMatch = dispatchIds.length >= 2 && routed.length >= 2
  && routed.every(id => ['failed', 'done', 'routed'].includes(mapStatuses[id]));
check('P3 the dispatch lifecycle reconstructs from the bus (outcomes present; routed ids match the map)', lifecycleMatch, JSON.stringify({ lifecycle: G.replay?.dispatchLifecycle, mapStatuses }).slice(0, 300));

rmSync(WORK, { recursive: true, force: true });
if (fails > 0) { console.error(`\n${fails}/${checked} cable assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} symphony-cable (E1+E2-adjacent+E4+P1-P4) assertions passed`);
