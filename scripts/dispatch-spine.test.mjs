#!/usr/bin/env node
/**
 * dispatch-spine.test.mjs — MADRUGA-3 rev 2, Part 1: the dispatch-spine gate
 * (L2 registry + L3 directive curation + L4 schema validation + L5 e2e).
 * Run: npx tsx scripts/dispatch-spine.test.mjs   (exit 0 = pass)
 *
 * L2 — every dispatch is REGISTERED; an unregistrable dispatch fails LOUDLY
 *   (never ok:true). Registry entries (dispatch-state.json) carry: id, origin
 *   god, target, timestamp, directive hash, status.
 * L3 — the invoke directive is curated per god: the parent god comes from the
 *   demigod registry (ALWAYS — including the already-present path); the
 *   `"apollo"` generic default is dead. Short single-action form (the D16
 *   dilution fix, delta-1-compatible: subagent_type=<parent god>).
 * L4 — the emission record is schema-validated BEFORE the tool returns it.
 * L5 — the full chain fires end-to-end: god -> symphony-dispatch -> real
 *   signature in the Vault resonance registry (zero-loss payload + verified
 *   anchor) -> live.jsonl symphony-dispatch event -> dispatch-state.json
 *   open-dispatch entry -> demigod auto-injected into the lane opencode.json
 *   -> curated directive returned. Delta-1 behavior preserved.
 *
 * Isolation: OLYMPUS_ROOT/OLYMPUS_VAULT/OLYMPUS_HOME all redirected to temp
 * dirs; the lane has NO opencode.demigods.json so the L2 repo-registry
 * fallback is exercised; the repo's own opencode.json is hash-guarded (R4).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF = join(ROOT, 'scripts', 'dispatch-spine.test.mjs');
const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus',
  'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];
const WORK = join(tmpdir(), 'olympus-m3r2-p1-spine');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ─── Child mode: runs scenarios in-process with the parent-provided env ───
if (process.argv[2] === 'child') {
  // Host-boundary shim: dispatch.ts imports the opencode plugin SDK
  // (`@opencode-ai/plugin/tool`), which the opencode HOST provides at
  // runtime. Standalone (this fixture), the local SDK copy exposes only an
  // `import` export condition — the CJS-compiled tool cannot require it.
  // The fixture provides the same contract surface the host does: the
  // `tool()` identity wrapper + the arg-schema builders (inert outside the
  // host — the tool's logic under test never calls them at runtime).
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

  const mode = process.argv[3];
  const readJsonSafe = (p) => existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null;
  const readJson = readJsonSafe;
  const readLines = (p) => existsSync(p)
    ? readFileSync(p, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
    : [];

  const makeLaneCfg = () => {
    const agent = {};
    for (const g of GODS) {
      agent[g] = { mode: g === 'apollo' ? 'primary' : 'subagent', model: 'nvidia/z-ai/glm-5.3', prompt: `# ${g}` };
    }
    return { model: 'nvidia/z-ai/glm-5.3', agent, plugin: [] };
  };

  if (mode === 'unregistrable') {
    // OLYMPUS_HOME points at a read-only dir: every persist fails.
    const home = process.env.OLYMPUS_HOME;
    mkdirSync(home, { recursive: true });
    chmodSync(home, 0o555);
    const lane = process.env.OLYMPUS_ROOT;
    writeFileSync(join(lane, 'opencode.json'), JSON.stringify(makeLaneCfg(), null, 2));
    const dispatch = (await import('../.opencode/olympus/tools/dispatch.ts')).default;
    const out = JSON.parse((await dispatch.execute({
      godId: 'apollo', demigod: 'frontend-reviewer', task: 'unregistrable probe', artifacts: ['/tmp/opencode/p3-u.txt'], doneCondition: 'exists', budgetTokens: 2000,
    }, { sessionID: 'm3r2-neg' })).output);
    chmodSync(home, 0o755);
    process.stdout.write(JSON.stringify({ result: out }) + '\n');
    process.exit(0);
  }

  // main mode: e2e + already-present + curation + refusals + validator
  const lane = process.env.OLYMPUS_ROOT;
  const vault = process.env.OLYMPUS_VAULT;
  const home = process.env.OLYMPUS_HOME;
  writeFileSync(join(lane, 'opencode.json'), JSON.stringify(makeLaneCfg(), null, 2));

  const mod = await import('../.opencode/olympus/tools/dispatch.ts');
  const dispatch = mod.default;
  const CONTRACT = { artifacts: [join(process.env.OLYMPUS_ROOT, 'declared-artifact.txt')], doneCondition: 'the declared artifact exists', budgetTokens: 3000 };
  const run = async (args) => JSON.parse((await dispatch.execute({ ...CONTRACT, ...args }, { sessionID: 'm3r2-e2e' })).output);

  const out = {};
  const task = 'Design review planejado para a landing page da Loja Dado Vinte: contraste, hierarquia visual, consistência mobile. Liste achados objetivos (máx 5).';

  // 1. End-to-end chain (L5)
  const r1 = await run({ godId: 'apollo', demigod: 'frontend-reviewer', task });
  out.e2e = r1;
  out.e2e_lane = readJson(join(lane, 'opencode.json'));
  out.e2e_registry = readLines(join(vault, '05_Auto_Learning', 'vibrations', 'registry.jsonl'));
  out.e2e_feed = readLines(join(vault, '06_Activity_Feed', 'live.jsonl'));
  out.e2e_state = readJsonSafe(join(home, "dispatch-state.json"));

  // 2. already_present keeps the REAL parent god (L3)
  const r2 = await run({ godId: 'apollo', demigod: 'frontend-reviewer', task: 'second pass, now already present' });
  out.already = r2;

  // 3. curated directive per god (L3 + L4) — one dispatch per god to one of
  //    ITS OWN demigods, from the repo registry.
  const registry = readJson(join(ROOT, 'opencode.demigods.json')).demigods;
  out.curation = [];
  for (const god of GODS) {
    const own = Object.entries(registry).find(([, e]) => e.parent_god === god);
    if (!own) { out.curation.push({ god, error: 'no demigod in registry' }); continue; }
    const [name] = own;
    const r = await run({ godId: 'apollo', demigod: name, task: `${god} curation probe` });
    out.curation.push({ god, demigod: name, parent: registry[name].parent_god, result: r });
  }

  // 4. refusals (loud, never silent)
  out.refusals = {
    godTarget: await run({ godId: 'apollo', demigod: 'athena', task: 'x' }),
    unknown: await run({ godId: 'apollo', demigod: 'no-such-demigod', task: 'x' }),
    prefixed: await run({ godId: 'apollo', demigod: 'ecc-build-resolver', task: 'x' }),
    noInstinct: await run({ godId: 'apollo', demigod: 'frontend-reviewer', task: 'x', shortCircuit: true }),
  };

  // 5. schema validation (L4) — the exported validator, negative cases first.
  const base = {
    dispatchId: r1.dispatchId, god: 'apollo', demigod: 'frontend-reviewer',
    expectedArtifacts: r1.expectedArtifacts, doneCondition: r1.doneCondition, budgetTokens: 3000,
    parentGod: 'athena', signatureId: r1.signatureId, vaultAnchor: r1.vaultAnchor,
    intentHash: r1.intentHash, directiveHash: r1.directiveHash, ts: r1.ts,
    status: r1.status, message: r1.message,
  };
  const bad = (patch) => mod.validateDispatchDirective({ ...base, ...patch });
  out.validator = {
    valid: mod.validateDispatchDirective(base),
    badGod: bad({ god: 'zeus' }),
    badParent: bad({ parentGod: 'apollo-default' }),
    godAsDemigod: bad({ demigod: 'athena' }),
    wrongDirective: bad({ message: 'invoke subagent_type="apollo" now' }),
    missingAnchor: bad({ vaultAnchor: '' }),
    badHash: bad({ directiveHash: 'nothex' }),
    badStatus: bad({ status: 'maybe' }),
  };

  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

// ─── Driver ────────────────────────────────────────────────────────────────
const REAL_OPENCODE_SHA = createHash('sha256').update(readFileSync(join(ROOT, 'opencode.json'))).digest('hex');
let fails = 0;
let checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${String(detail).slice(0, 220)}`}`);
  if (!ok) fails++;
}

rmSync(WORK, { recursive: true, force: true });
const lane = join(WORK, 'lane');
const vault = join(WORK, 'vault');
const home = join(WORK, 'home');
mkdirSync(lane, { recursive: true });
mkdirSync(vault, { recursive: true });
mkdirSync(home, { recursive: true });

const child = (mode, env = {}) => {
  const r = spawnSync('npx', ['tsx', SELF, 'child', mode], {
    encoding: 'utf-8',
    cwd: ROOT,
    timeout: 120_000,
    env: {
      ...process.env,
      OLYMPUS_ROOT: lane, OLYMPUS_VAULT: vault, OLYMPUS_HOME: home,
      // D21 (closed in p2): OLYMPUS_VAULT is the ONE canonical vault
      // variable — getVaultRoot() resolves it everywhere (the resonance
      // registry included, via the refreshed shipped artifacts). No
      // OLYMPUS_VAULT_DIR needed; setting it would now warn.
      ...env,
    },
  });
  if (r.status !== 0) {
    return { __childError: `status=${r.status} ${r.stdout} ${r.stderr}`.slice(0, 600) };
  }
  const line = r.stdout.trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
};

// ─── S1: the unregistrable dispatch (L2 negative — exact error text) ───────
{
  const roHome = join(WORK, 'ro-home');
  const r = child('unregistrable', { OLYMPUS_HOME: roHome });
  const res = r.result || {};
  check('S1 an unregistrable dispatch fails LOUDLY (ok:false)', res.ok === false, JSON.stringify(res).slice(0, 300));
  check('S1 the error text names the registry failure explicitly',
    typeof res.error === 'string' && /not registered/i.test(res.error), res.error);
  console.log(`      exact error: ${JSON.stringify(res.error)}`);
}

// ─── S2: the end-to-end chain (L5) ─────────────────────────────────────────
{
  const r = child('main');
  if (r.__childError) {
    check('S2 child ran', false, r.__childError);
  } else {
    const e = r.e2e;
    check('S2 tool returns ok:true with a real signature id', e.ok === true && /^[0-9a-f-]{36}$/.test(e.signatureId || ''), JSON.stringify(e).slice(0, 250));
    check('S2 directive carries the registry-derived parent god (subagent_type="athena", no apollo default)',
      e.ok === true && e.message.includes('subagent_type="athena"') && e.parentGod === 'athena',
      `parentGod=${e.parentGod} msg=${JSON.stringify(e.message)}`);
    check('S2 demigod auto-injected into the LANE opencode.json (repo-registry fallback path)',
      r.e2e_lane.agent['frontend-reviewer']?.prompt === '{file:.opencode/prompts/agents/demigods/athena/frontend_reviewer.txt}',
      JSON.stringify(r.e2e_lane.agent['frontend-reviewer'] || null));
    // Vault resonance registry: zero-loss payload + verified anchor.
    const entry = (r.e2e_registry || []).find(x => x.id === e.vaultAnchor);
    check('S2 Vault resonance registry carries the full payload (zero-loss)',
      !!entry && entry.payload === 'Design review planejado para a landing page da Loja Dado Vinte: contraste, hierarquia visual, consistência mobile. Liste achados objetivos (máx 5).',
      entry ? `payload head: ${entry.payload.slice(0, 60)}` : 'no entry');
    check('S2 registry checksum matches sha256(payload)', !!entry && entry.checksum === sha256(entry.payload));
    check('S2 registry entry has intentHash + godId (the composer contract)',
      !!entry && /^[a-f0-9]{16,}$/i.test(entry.intentHash || '') && entry.godId === 'apollo');
    // Live feed event.
    const ev = (r.e2e_feed || []).find(x => x.action === 'symphony-dispatch');
    check('S2 live.jsonl symphony-dispatch event: signature_id + vault_anchor + intent_hash + status',
      !!ev && ev.signature_id === e.signatureId && ev.vault_anchor === e.vaultAnchor && /^[a-f0-9]{16,}$/i.test(ev.intent_hash || '') && ev.status === 'dispatched',
      JSON.stringify(ev || null).slice(0, 200));
    // Dispatch registry entry: id, origin god, target, timestamp, directive hash, status.
    const open = (r.e2e_state.openDispatches || []).find(d => d.dispatchId === e.dispatchId);
    check('S2 dispatch-state.json entry exists with the signature id',
      !!open, JSON.stringify(r.e2e_state).slice(0, 200));
    if (open) {
      check('S2 registry contract: {id, god, target, timestamp, directiveHash, status} all real',
        open.god === 'apollo' && open.demigod === 'frontend-reviewer'
        && !isNaN(Date.parse(open.startTs)) && /^[a-f0-9]{16}$/.test(open.directiveHash || '')
        && open.status === 'open',
        JSON.stringify(open).slice(0, 250));
      check('S2 directiveHash = sha256(task) (verifiable, not decorative)',
        open.directiveHash === sha256('Design review planejado para a landing page da Loja Dado Vinte: contraste, hierarquia visual, consistência mobile. Liste achados objetivos (máx 5).').slice(0, 16));
    }

    // already_present keeps the real parent
    check('S3 already-present dispatch STILL carries subagent_type="athena" (no apollo default)',
      r.already.ok === true && r.already.message.includes('subagent_type="athena"'),
      JSON.stringify(r.already.message || r.already));

    // Per-god curation table
    let curationOk = true;
    const curationRows = [];
    for (const row of r.curation) {
      const ok = row.result?.ok === true
        && row.result.parentGod === row.god
        && row.result.message.includes(`subagent_type="${row.god}"`);
      curationOk = curationOk && ok;
      curationRows.push(`${row.god} -> ${row.demigod}: ${ok ? `subagent_type="${row.god}" ✓` : `FAIL (${JSON.stringify(row.result?.message || row.result || row).slice(0, 80)})`}`);
    }
    check('S4 curated directive per god — 10/10 registry-derived, zero defaults', curationOk);
    console.log('      curated directive table (one per god):');
    for (const row of curationRows) console.log(`        ${row}`);

    // Refusals
    check('S5 god-as-target refused loudly', r.refusals.godTarget.ok === false && /is a god/.test(r.refusals.godTarget.error || ''));
    check('S5 unknown demigod refused loudly (registry miss)', r.refusals.unknown.ok === false && /not in the registry/.test(r.refusals.unknown.error || ''));
    check('S5 prefixed demigod refused loudly', r.refusals.prefixed.ok === false && /unprefixed/i.test(r.refusals.prefixed.error || ''));
    check('S5 short-circuit without instinctId refused loudly', r.refusals.noInstinct.ok === false && /instinctId/.test(r.refusals.noInstinct.error || ''));

    // Schema validation
    const v = r.validator;
    check('S6 validator accepts the real emission record', v.valid.ok === true, JSON.stringify(v.valid));
    check('S6 validator rejects: unknown god', v.badGod.ok === false && /god/.test((v.badGod.violations || []).join(';')));
    check('S6 validator rejects: unknown parent god', v.badParent.ok === false && /parent/.test((v.badParent.violations || []).join(';')));
    check('S6 validator rejects: a god named as demigod', v.godAsDemigod.ok === false);
    check('S6 validator rejects: directive naming the WRONG subagent_type', v.wrongDirective.ok === false && /subagent_type/.test((v.wrongDirective.violations || []).join(';')));
    check('S6 validator rejects: missing vault anchor', v.missingAnchor.ok === false && /anchor/i.test((v.missingAnchor.violations || []).join(';')));
    check('S6 validator rejects: non-hex directive hash', v.badHash.ok === false && /hash/i.test((v.badHash.violations || []).join(';')));
    check('S6 validator rejects: unknown status', v.badStatus.ok === false && /status/i.test((v.badStatus.violations || []).join(';')));
  }
}

check('R4: the real repo opencode.json untouched by the spine fixture',
  createHash('sha256').update(readFileSync(join(ROOT, 'opencode.json'))).digest('hex') === REAL_OPENCODE_SHA);

rmSync(WORK, { recursive: true, force: true });

if (fails > 0) {
  console.error(`\n${fails}/${checked} dispatch-spine assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${checked} dispatch-spine (L2+L3+L4+L5) assertions passed`);
