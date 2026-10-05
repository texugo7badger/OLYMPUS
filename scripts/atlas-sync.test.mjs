#!/usr/bin/env node
/**
 * atlas-sync.test.mjs — MADRUGA-3 rev 2, Part 2: the ATLAS gate
 * (ingest funnel + sync-map contract + single-writer guard + read path +
 * the E1/D18 exit-path finalize).
 * Run: npx tsx scripts/atlas-sync.test.mjs   (exit 0 = pass)
 *
 * P1 — every prompt entry point routes through Atlas (chat.message for
 *   project prompts; the dispatch tool's execute start for dispatch prompts —
 *   universal, matching the Part 1 tool-side spine doctrine).
 * P2 — the entry contract: id, origin (project|dispatch), source identity,
 *   timestamp, intent summary, status lifecycle (received → routed →
 *   done|failed). A dispatch that dies mid-flight lands 'failed'.
 * P3 — single writer: only Atlas writes the map. Outside-Atlas writes
 *   (Symphony, Callimachus, Athena, a hook/tool path) fail loudly, naming
 *   the offender + the funnel; raw out-of-band file writes break the hash
 *   chain and are flagged by the read path.
 * P4 — the read path: any god queries; two different readers get identical
 *   results; no private side-channels.
 * E1 — exit-path finalize: a process exit finalizes the dispatches THIS
 *   process opened (mid-flight deaths land 'failed'), loudly if the
 *   finalize itself fails.
 *
 * HERMETIC (R11 from first run): OLYMPUS_HOME + OLYMPUS_VAULT (canonical,
 * post-D21) + OLYMPUS_ROOT point at throwaway temp dirs BEFORE any
 * execution. The real state is hash-guarded.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF = join(ROOT, 'scripts', 'atlas-sync.test.mjs');
const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus',
  'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];
const WORK = join(tmpdir(), 'olympus-m3r2-p2-atlas');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ─── Child mode: scenarios run in-process with the parent-provided env ─────
if (process.argv[2] === 'child') {
  const mode = process.argv[3];

  // Host-boundary shim (same doctrine as the Part 1 spine fixture).
  const Module = (await import('node:module')).default;
  const origResolve = Module._resolveFilename;
  const origLoad = Module._load;
  Module._resolveFilename = function (request, ...rest) {
    if (request === '@opencode-ai/plugin/tool') return request;
    return origResolve.call(this, request, ...rest);
  };
  Module._load = function (request, ...rest) {
    if (request === '@opencode-ai/plugin/tool') {
      const schemaType = () => {
        const chain = { describe: () => ({}) };
        chain.optional = () => chain;
        return chain;
      };
      const toolFn = (def) => def;
      toolFn.schema = { string: schemaType, boolean: schemaType, number: schemaType, array: schemaType };
      return { tool: toolFn };
    }
    return origLoad.call(this, request, ...rest);
  };

  const readJson = (p) => existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null;
  const out = {};

  if (mode === 'red') {
    // TODAY's behavior, verbatim: drive a real dispatch through the real
    // tool (hermetic lane), then look for ANY sync-map record of it.
    const lane = process.env.OLYMPUS_ROOT;
    const vault = process.env.OLYMPUS_VAULT;
    const agent = {};
    for (const g of GODS) agent[g] = { mode: g === 'apollo' ? 'primary' : 'subagent', model: 'nvidia/z-ai/glm-5.3', prompt: `# ${g}` };
    writeFileSync(join(lane, 'opencode.json'), JSON.stringify({ model: 'nvidia/z-ai/glm-5.3', agent, plugin: [] }, null, 2));
    const dispatch = (await import('../.opencode/olympus/tools/dispatch.ts')).default;
    const r = JSON.parse((await dispatch.execute({
      godId: 'apollo', demigod: 'frontend-reviewer', task: 'atlas red probe — should this be recorded by Atlas?',
    }, { sessionID: 'atlas-red' })).output);
    out.dispatch = { ok: r.ok };
    // The E1 half of the red: register an open dispatch, then "exit" the
    // process — is there any finalize path?
    let exitFinalize = 'MISSING';
    try {
      const tracker = await import('../.opencode/olympus/lib/dispatch-tracker.ts');
      exitFinalize = typeof tracker.finalizeLocalDispatchesOnExit === 'function' ? 'EXISTS' : 'MISSING';
    } catch { /* module shape changed? */ }
    // The Atlas half: does ANY sync-map exist after a full dispatch?
    out.syncMapFile = existsSync(join(process.env.OLYMPUS_HOME, 'sync-map.json'));
    out.atlasModule = existsSync(join(ROOT, '.opencode', 'olympus', 'lib', 'atlas-sync.ts'));
    out.exitFinalizeApi = exitFinalize;
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(0);
  }

  if (mode === 'green') {
    const lane = process.env.OLYMPUS_ROOT;
    const vault = process.env.OLYMPUS_VAULT;
    const home = process.env.OLYMPUS_HOME;
    const agent = {};
    for (const g of GODS) agent[g] = { mode: g === 'apollo' ? 'primary' : 'subagent', model: 'nvidia/z-ai/glm-5.3', prompt: `# ${g}` };
    writeFileSync(join(lane, 'opencode.json'), JSON.stringify({ model: 'nvidia/z-ai/glm-5.3', agent, plugin: [] }, null, 2));

    const atlas = await import('../.opencode/olympus/lib/atlas-sync.ts');
    const dispatch = (await import('../.opencode/olympus/tools/dispatch.ts')).default;

    // ── P2: a real DISPATCH entry through the real funnel (the tool itself)
    const dr = JSON.parse((await dispatch.execute({
      godId: 'apollo', demigod: 'frontend-reviewer',
      task: 'Verificação de código da landing page da Loja Dado Vinte: erros de tipagem, imports inválidos. Máx 5 achados.',
      artifacts: ['/tmp/opencode/p3-a1.txt'], doneCondition: 'exists', budgetTokens: 3000,
    }, { sessionID: 'atlas-green-1' })).output);
    out.dispatchResult = { ok: dr.ok, dispatchId: dr.dispatchId };

    // ── P2: a real PROJECT entry through the same funnel the chat.message
    // hook uses (the hook body calls atlasIngestProjectPrompt — here we
    // drive the exact funnel function with the hook's input shape).
    const pr = atlas.atlasIngestProjectPrompt({
      sessionID: 'atlas-green-1',
      text: 'Crie uma landing page para a padaria Pão Quente com formulário de contato.',
    });
    out.projectEntryId = pr.id;

    // The map state after both origins.
    const map = readJson(join(home, 'sync-map.json'));
    out.mapEntries = map ? Object.values(map.entries) : [];
    out.chainHead = map ? map.chainHead : null;

    // ── P3: single-writer guard — outside-Atlas write attempts (verbatim).
    out.refusals = {};
    for (const [persona, payload] of [
      ['symphony', { id: 'evil-1', origin: 'dispatch', source: 'symphony-direct', ts: new Date().toISOString(), intent: 'symphony writes the map directly', status: 'received' }],
      ['callimachus', { id: 'evil-2', origin: 'project', source: 'callimachus-curation', ts: new Date().toISOString(), intent: 'callimachus writes the map directly', status: 'received' }],
      ['athena', { id: 'evil-3', origin: 'project', source: 'athena-ui', ts: new Date().toISOString(), intent: 'athena writes the map directly', status: 'received' }],
      ['tool:write', { id: 'evil-4', origin: 'project', source: 'some-hook-path', ts: new Date().toISOString(), intent: 'a hook/tool path writes the map directly', status: 'received' }],
    ]) {
      try {
        atlas.writeSyncMapEntry(persona, payload);
        out.refusals[persona] = { refused: false };
      } catch (e) {
        out.refusals[persona] = { refused: true, error: e.message };
      }
    }

    // ── P4: the read path — the SAME query from two different gods.
    out.queryAthena = atlas.atlasQueryPathState({ reader: 'athena' });
    out.queryPrometheus = atlas.atlasQueryPathState({ reader: 'prometheus' });

    // ── P3b: raw out-of-band file write breaks the chain; the read path
    // flags it (tamper evidence — no silent side-channels).
    const mapPath = join(home, 'sync-map.json');
    const raw = JSON.parse(readFileSync(mapPath, 'utf-8'));
    raw.entries['evil-raw'] = { id: 'evil-raw', origin: 'project', source: 'raw-fs-append', ts: new Date().toISOString(), intent: 'out-of-band write', status: 'received' };
    writeFileSync(mapPath, JSON.stringify(raw, null, 2));
    out.afterTamper = atlas.atlasQueryPathState({ reader: 'apollo' });

    // ── E1: exit-path finalize. A dispatch this process opened, then the
    // process "exits" — the entries finalize (mid-flight → 'failed').
    const r2 = JSON.parse((await dispatch.execute({
      godId: 'apollo', demigod: 'build-resolver', task: 'second dispatch, will die mid-flight at exit', artifacts: ['/tmp/opencode/p3-a2.txt'], doneCondition: 'exists', budgetTokens: 3000,
    }, { sessionID: 'atlas-green-2' })).output);
    out.secondDispatch = { ok: r2.ok, dispatchId: r2.dispatchId };
    const finalize = atlas.finalizeAtlasOnProcessExit();
    out.exitFinalize = finalize;
    const mapAfter = readJson(join(home, 'sync-map.json'));
    out.mapAfterExit = mapAfter ? Object.values(mapAfter.entries).map(e => ({ id: e.id, status: e.status, origin: e.origin, meta: e.meta || null })) : [];
    out.stateAfterExit = readJson(join(home, 'dispatch-state.json'));
    out.feedOutcomes = existsSync(join(vault, '06_Activity_Feed', 'live.jsonl'))
      ? readFileSync(join(vault, '06_Activity_Feed', 'live.jsonl'), 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.action === 'dispatch_outcome')
      : [];

    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(0);
  }

  if (mode === 'loud-fail') {
    // E1 negative: the finalize itself fails LOUDLY (unwritable feed).
    const home = process.env.OLYMPUS_HOME;
    const vault = process.env.OLYMPUS_VAULT;
    mkdirSync(join(vault, '06_Activity_Feed'), { recursive: true });
    const agent = {};
    for (const g of GODS) agent[g] = { mode: 'primary' === g ? 'primary' : 'subagent', model: 'nvidia/z-ai/glm-5.3', prompt: `# ${g}` };
    writeFileSync(join(process.env.OLYMPUS_ROOT, 'opencode.json'), JSON.stringify({ agent }, null, 2));
    const dispatch = (await import('../.opencode/olympus/tools/dispatch.ts')).default;
    const r = JSON.parse((await dispatch.execute({
      godId: 'apollo', demigod: 'frontend-reviewer', task: 'loud-fail probe', artifacts: ['/tmp/opencode/p3-a3.txt'], doneCondition: 'exists', budgetTokens: 2000,
    }, { sessionID: 'atlas-loud' })).output);
    // Make the FEED FILE unwritable so the finalize's outcome write fails.
    // (chmod on the DIRECTORY would not do it: appending to an EXISTING
    // file in a read-only dir still succeeds — dir perms gate create and
    // unlink, not writes to files the process already can open.)
    chmodSync(join(vault, '06_Activity_Feed', 'live.jsonl'), 0o444);
    let finalizeError = null;
    try {
      const atlas = await import('../.opencode/olympus/lib/atlas-sync.ts');
      atlas.finalizeAtlasOnProcessExit();
    } catch (e) {
      finalizeError = e.message;
    } finally {
      chmodSync(join(vault, '06_Activity_Feed', 'live.jsonl'), 0o644);
    }
    process.stdout.write(JSON.stringify({ dispatchOk: r.ok, finalizeError }) + '\n');
    process.exit(0);
  }
}

// ─── Driver ────────────────────────────────────────────────────────────────
const REAL_OPENCODE_SHA = createHash('sha256').update(readFileSync(join(ROOT, 'opencode.json'))).digest('hex');
const REAL_VAULT_REG = join(process.env.HOME, 'OLYMPUS-VAULT', '05_Auto_Learning', 'vibrations', 'registry.jsonl');
const REAL_VAULT_SHA = existsSync(REAL_VAULT_REG) ? createHash('sha256').update(readFileSync(REAL_VAULT_REG)).digest('hex') : null;
let fails = 0;
let checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${String(detail).slice(0, 260)}`}`);
  if (!ok) fails++;
}
const child = (mode, env = {}) => {
  const lane = join(WORK, `lane-${mode}-${Math.random().toString(36).slice(2, 8)}`);
  const vault = join(WORK, `vault-${mode}-${Math.random().toString(36).slice(2, 8)}`);
  const home = join(WORK, `home-${mode}-${Math.random().toString(36).slice(2, 8)}`);
  for (const d of [lane, vault, home]) mkdirSync(d, { recursive: true });
  const r = spawnSync('npx', ['tsx', SELF, 'child', mode], {
    encoding: 'utf-8', cwd: ROOT, timeout: 120_000,
    env: {
      ...process.env,
      OLYMPUS_ROOT: lane,
      OLYMPUS_VAULT: vault,   // canonical (post-D21); no OLYMPUS_VAULT_DIR needed
      OLYMPUS_HOME: home,
      ...env,
    },
  });
  if (r.status !== 0) return { __childError: `status=${r.status} ${r.stdout} ${r.stderr}`.slice(0, 600) };
  const line = r.stdout.trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
};

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// ─── RED (today's behavior, verbatim) ─────────────────────────────────────
// The red run is HISTORICAL EVIDENCE, captured before implementation:
//   "dispatch fired ok=true; sync-map exists=false; atlas module=false;
//    exit-finalize api=MISSING"
// Re-running the red scenario against the implemented code inverts its
// meaning, so it is skipped by default; pass --with-red to re-derive it
// (e.g. on a fresh checkout where the module is absent again).
const RED = process.argv.includes('--with-red') ? child('red') : null;
if (RED) {
  console.log('── RED (today, verbatim) ──');
  console.log(`      dispatch fired ok=${RED.dispatch?.ok}; sync-map exists=${RED.syncMapFile}; atlas module=${RED.atlasModule}; exit-finalize api=${RED.exitFinalizeApi}`);
  check('RED: a full dispatch leaves NO sync-map record (the bypass, proven)', RED.dispatch?.ok === true && RED.syncMapFile === false && RED.atlasModule === false);
  check('RED: no exit-finalize API exists (D18 dangling, proven)', RED.exitFinalizeApi === 'MISSING');
}

// ─── GREEN ─────────────────────────────────────────────────────────────────
const G = child('green');
if (G.__childError) {
  check('GREEN child ran', false, G.__childError);
} else {
  const entries = G.mapEntries || [];
  const dispatchEntry = entries.find(e => e.origin === 'dispatch');
  const projectEntry = entries.find(e => e.id === G.projectEntryId);

  // P1/P2: both origins land via Atlas with the full contract.
  check('P2 a real DISPATCH entry lands in the map (via the tool funnel)',
    !!dispatchEntry && dispatchEntry.status === 'routed', JSON.stringify(dispatchEntry).slice(0, 200));
  check('P2 a real PROJECT entry lands in the map (via the chat.message funnel)',
    !!projectEntry && projectEntry.origin === 'project', JSON.stringify(projectEntry).slice(0, 200));
  for (const [label, e] of [['dispatch', dispatchEntry], ['project', projectEntry]]) {
    check(`P2 ${label} entry contract: id, origin, source, ts, intent, status`,
      !!e && !!e.id && (e.origin === 'project' || e.origin === 'dispatch') && !!e.source
      && !isNaN(Date.parse(e.ts)) && typeof e.intent === 'string' && e.intent.length > 0
      && ['received', 'routed', 'done', 'failed'].includes(e.status),
      JSON.stringify(e).slice(0, 200));
  }
  console.log('      verbatim dispatch entry:');
  console.log(`        ${JSON.stringify(dispatchEntry)}`);
  console.log('      verbatim project entry:');
  console.log(`        ${JSON.stringify(projectEntry)}`);

  // P3: outside-Atlas writes fail loudly.
  for (const persona of ['symphony', 'callimachus', 'athena', 'tool:write']) {
    const r = G.refusals?.[persona] || {};
    check(`P3 ${persona} write REFUSED loudly (names the offender + the funnel)`,
      r.refused === true && /actor/i.test(r.error || '') && r.error.includes(persona) && /atlas/i.test(r.error || ''),
      JSON.stringify(r).slice(0, 220));
    if (r.refused) console.log(`        ${persona} -> ${JSON.stringify(r.error)}`);
  }

  // P4: identical results from two readers.
  check('P4 the same query from athena and prometheus returns identical results',
    JSON.stringify(G.queryAthena?.result) === JSON.stringify(G.queryPrometheus?.result),
    JSON.stringify(G.queryAthena).slice(0, 150));
  console.log('      query result (athena — verbatim):');
  console.log(`        ${JSON.stringify(G.queryAthena?.result).slice(0, 400)}`);
  console.log('      query result (prometheus — verbatim):');
  console.log(`        ${JSON.stringify(G.queryPrometheus?.result).slice(0, 400)}`);

  // P3b: out-of-band write detected (chain broken, flagged by the read path).
  check('P3 an out-of-band raw file write is FLAGGED by the read path (chain broken)',
    G.afterTamper?.result?.chainValid === false && (G.afterTamper?.result?.tampered || []).includes('evil-raw'),
    JSON.stringify(G.afterTamper).slice(0, 220));

  // E1: exit-path finalize.
  check('E1 exit finalizes the dispatches THIS process opened (routed→done/failed, open→failed)',
    (G.mapAfterExit || []).filter(e => e.origin === 'dispatch').every(e => ['done', 'failed'].includes(e.status))
    && (G.mapAfterExit || []).some(e => e.meta?.dispatchId === G.secondDispatch?.dispatchId && e.status === 'failed'),
    JSON.stringify(G.mapAfterExit).slice(0, 300));
  const d2state = (G.stateAfterExit?.openDispatches || []).find(d => d.dispatchId === G.secondDispatch?.dispatchId);
  check('E1 the tracker entry is finalized (no dangling open dispatch after exit)',
    d2state === undefined, JSON.stringify(d2state || 'still open').slice(0, 150));
  const outcomeForD2 = (G.feedOutcomes || []).find(e => e.dispatch_id === G.secondDispatch?.dispatchId);
  check('E1 dispatch_outcome event written at exit (mid-flight death → failed/contract-failure)',
    !!outcomeForD2 && ['failed', 'failure'].includes(outcomeForD2.outcome) && ['failed', 'failure'].includes(outcomeForD2.status),
    JSON.stringify(outcomeForD2 || 'none').slice(0, 200));
}

// ─── E1 negative: the finalize itself fails LOUDLY ─────────────────────────
const L = child('loud-fail');
check('E1-neg: a failing finalize write raises a LOUD error (not silence)',
  typeof L.finalizeError === 'string' && /finalize/i.test(L.finalizeError || ''),
  JSON.stringify(L).slice(0, 260));
console.log(`      exact error: ${JSON.stringify(L.finalizeError)}`);

// ─── R4 + R11 guards ────────────────────────────────────────────────────────
check('R4: the real repo opencode.json untouched', createHash('sha256').update(readFileSync(join(ROOT, 'opencode.json'))).digest('hex') === REAL_OPENCODE_SHA);
if (REAL_VAULT_SHA !== null) {
  check('R11: the real vault resonance registry untouched', createHash('sha256').update(readFileSync(REAL_VAULT_REG)).digest('hex') === REAL_VAULT_SHA);
}

rmSync(WORK, { recursive: true, force: true });
if (fails > 0) { console.error(`\n${fails}/${checked} atlas assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} atlas-sync (P1-P4 + E1) assertions passed`);
