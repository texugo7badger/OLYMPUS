#!/usr/bin/env node
/**
 * free-lane-generator.test.mjs — MADRUGA-3 rev 2, Part 1: the L1 + L4 gate
 * for the strategy generator (scripts/apply-strategy.js).
 * Run: npx tsx scripts/free-lane-generator.test.mjs   (exit 0 = pass)
 *
 * L1 (no placeholder contracts): the free-tier generator must emit REAL
 *   configs — olympus tools granted to every god (D9), god prompts resolved
 *   from real files (never a dangling {file:} ref, never a silent keep-old
 *   fallback), or fail with an explicit error. No silent defaults anywhere.
 * L4 (contract/schema validation): every model id in the candidate config
 *   is validated against the live `opencode models <provider>` catalogue at
 *   APPLY time — the D19 class (dead ids breaking subagent spawns at
 *   resolution time) fails loudly with the catalogue's own suggestions.
 *   Unqueryable providers / missing catalogue tooling are explicit errors,
 *   never silent skips. --force is the loud escape hatch.
 *
 * Deterministic: the lane gets a STUB opencode binary whose catalogue is
 * fixed by this fixture; OLYMPUS_HOME is redirected to a temp dir so the
 * real ~/.olympus is never touched; XDG_DATA_HOME is redirected so the
 * #106 auth.json family mirror NEVER touches the real opencode auth store;
 * the REAL repo opencode.json is hash-guarded before/after (R4).
 *
 * #106 (MADRUGA-FREE-1) doctrine updates: the generator's nvidia map is
 * USER-PINNED (the anchor-pin) — the fixture's fake "stronger nemotron
 * live #1" must NOT override it (the old concentration logic was the
 * defect); a RETIRED anchor (a catalogue that drops a pinned id) fails
 * LOUDLY at apply time with the D19 shape — never a silent swap.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
  chmodSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const APPLY = join(ROOT, 'scripts', 'apply-strategy.js');
const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus',
  'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];
const OLYMPUS_TOOLS = [
  'olympus-dispatch', 'olympus-instinct-query', 'olympus-shortcircuit',
  'olympus-patterns', 'sub-agent-instinct-query', 'symphony-resonate',
  'symphony-harmonize', 'symphony-decode', 'olympus-design-review',
  'olympus-deploy-review', 'olympus-integration-review',
];

// The stub catalogue (what `opencode models <provider>` prints in the lane).
// #106: the family lanes (nvidia-glm/…) validate against the base `nvidia`
// catalogue (the preflight's family remap) — the stub carries the bare ids.
const STUB_CATALOGUE = {
  nvidia: [
    'nvidia/z-ai/glm-5.3', 'nvidia/z-ai/glm-5.3-flash',
    'nvidia/nvidia/nemotron-3-ultra-550b-a55b',
    'nvidia/nvidia/nemotron-3.5-lightning',
    'nvidia/moonshotai/kimi-k3', 'nvidia/deepseek-ai/deepseek-v4.1-flash',
    'nvidia/meta/muse-glimmer-30b',
    'nvidia/nvidia/nemotron-3-nano-30b-a3b',
  ],
  'opencode-go': [
    'opencode-go/glm-5.3', 'opencode-go/glm-5.3-flash', 'opencode-go/hy3',
    'opencode-go/qwen3.7-plus', 'opencode-go/kimi-k2.7-code',
    'opencode-go/minimax-m3', 'opencode-go/kimi-k3', 'opencode-go/deepseek-v4-flash',
  ],
  openrouter: [
    'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
  ],
  opencode: ['opencode/glm-5.3', 'opencode/gpt-6-sol'],
};

const STUB_OPENCODE = `#!/usr/bin/env node
// MADRUGA-3 p1 fixture stub — deterministic stand-in for the opencode
// catalogue probe. Prints the fixture's fixed catalogue for \`models\`.
// A lane may plant its OWN catalogue at node_modules/.bin/stub-catalogue.json
// (the retired-anchor fixture G3) — that file wins when present.
const fs = require('fs');
const path = require('path');
let cat = ${JSON.stringify(STUB_CATALOGUE)};
try {
  cat = JSON.parse(fs.readFileSync(path.join(__dirname, 'stub-catalogue.json'), 'utf-8'));
} catch {}
const provider = process.argv[3];
if (provider && cat[provider]) process.stdout.write(cat[provider].join('\\n') + '\\n');
else if (provider) { process.stderr.write('unknown provider: ' + provider + '\\n'); process.exit(1); }
else process.stdout.write('');
`;

const WORK = join(tmpdir(), 'olympus-m3r2-p1-gen');
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const nowIso = () => new Date().toISOString();

let fails = 0;
let checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${detail}`}`);
  if (!ok) fails++;
}

function applyStrategy(args, env) {
  const r = spawnSync(process.execPath, [APPLY, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 120_000,
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function makeLane({ withPrompts = true, withStubBinary = true, stubCatalogue = null } = {}) {
  const lane = join(WORK, `lane-${Math.random().toString(36).slice(2, 9)}`);
  mkdirSync(join(lane, '.opencode', 'prompts', 'agents', 'gods'), { recursive: true });
  if (withStubBinary) {
    mkdirSync(join(lane, 'node_modules', '.bin'), { recursive: true });
    const stub = join(lane, 'node_modules', '.bin', 'opencode');
    writeFileSync(stub, STUB_OPENCODE);
    chmodSync(stub, 0o755);
    if (stubCatalogue) {
      writeFileSync(join(lane, 'node_modules', '.bin', 'stub-catalogue.json'),
        JSON.stringify(stubCatalogue));
    }
  }
  const agent = {};
  for (const g of GODS) {
    const rel = `.opencode/prompts/agents/gods/${g}.txt`;
    if (withPrompts) {
      copyFileSync(join(ROOT, '.opencode', 'prompts', 'agents', 'gods', `${g}.txt`),
        join(lane, rel));
    }
    agent[g] = {
      description: g,
      mode: g === 'apollo' ? 'primary' : 'subagent',
      model: 'opencode-go/glm-5.3-flash',
      prompt: `{file:${rel}}`,
    };
  }
  writeFileSync(join(lane, 'opencode.json'), JSON.stringify({
    model: 'opencode-go/glm-5.3-flash',
    small_model: 'opencode-go/glm-5.3-flash',
    agent,
    plugin: [],
    instructions: [],
  }, null, 2));
  return lane;
}

function makeHome() {
  const home = join(WORK, `home-${Math.random().toString(36).slice(2, 9)}`);
  mkdirSync(home, { recursive: true });
  // A fresh refresh file. #106's ANCHOR-PIN doctrine: the pinned map in
  // BUILTIN_STRATEGIES stands; the refresh list only VERIFIES availability.
  // top[0] is a DELIBERATE "stronger nemotron live #1" — the negative
  // fixture: the old concentration logic parked apollo+atlas on exactly
  // this id (the #106 defect). The new doctrine must leave the pinned map
  // untouched, the fake #1 appearing NOWHERE in the generated config.
  // `all` carries the five anchors so the availability check verifies green
  // (the retired-anchor loud-failure fixture G3 plants its own stub
  // CATALOGUE at the lane — the refresh file here stays honest).
  writeFileSync(join(home, 'free-models.json'), JSON.stringify({
    fetched_at: nowIso(),
    nvidia: {
      top: [
        { id: 'nvidia/nvidia/nemotron-3.5-lightning', context: 1000000, score: 90 },
        { id: 'z-ai/glm-5.3-flash', context: 1000000, score: 85 },
      ],
      all: [
        { id: 'z-ai/glm-5.3', context: 1000000, score: 99 },
        { id: 'z-ai/glm-5.3-flash', context: 1000000, score: 98 },
        { id: 'moonshotai/kimi-k3', context: 1048576, score: 97 },
        { id: 'meta/muse-glimmer-30b', context: 131072, score: 96 },
        { id: 'deepseek-ai/deepseek-v4.1-flash', context: 1000000, score: 95 },
      ],
    },
    openrouter: { top: [{ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', context: 1000000, score: 90 }] },
  }));
  writeFileSync(join(home, 'llm-providers.json'), JSON.stringify({ strategy: 'free-nvidia-build' }));
  return home;
}

const readLaneCfg = (lane) => JSON.parse(readFileSync(join(lane, 'opencode.json'), 'utf-8'));

// ─── R4 guards: the real repo config + real home are never touched ────────
const REAL_OPENCODE_SHA = sha256(join(ROOT, 'opencode.json'));
const REAL_HOME = join(process.env.HOME, '.olympus');
const realHomeGuardFiles = ['active-strategy.json', 'free-models.json', 'llm-providers.json']
  .map((f) => ({ f, p: join(REAL_HOME, f) }));
const realHomeBefore = Object.fromEntries(realHomeGuardFiles.map(({ f, p }) =>
  [f, existsSync(p) ? sha256(p) : null]));

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// ─── G1: the happy path — full free-tier contract, L1 grants, L4 clean ────
{
  const lane = makeLane();
  const home = makeHome();
  const r = applyStrategy(['--strategy', 'free-nvidia-build'],
    { OLYMPUS_ROOT: lane, OLYMPUS_HOME: home, XDG_DATA_HOME: join(home, 'xdg') });
  check('G1 apply exits 0', r.status === 0, `status=${r.status} out=${r.out.slice(-500)}`);
  if (r.status === 0) {
    const cfg = readLaneCfg(lane);
    // L1: every god carries the full overlay toolset (D9 killed).
    let toolsOk = true, toolsDetail = '';
    for (const g of GODS) {
      for (const t of OLYMPUS_TOOLS) {
        if (cfg.agent[g]?.tools?.[t] !== true) { toolsOk = false; toolsDetail = `${g}.${t}`; break; }
      }
      if (!toolsOk) break;
    }
    check('G1 L1: all 10 gods carry all 11 olympus tools', toolsOk, toolsDetail);
    // L1: prompts are REAL — inlined from the canonical files, no {file:} refs.
    let promptsOk = true, promptsDetail = '';
    for (const g of GODS) {
      const p = cfg.agent[g]?.prompt || '';
      if (p.includes('{file:')) { promptsOk = false; promptsDetail = `${g} still a file ref`; break; }
      if (p.length === 0) { promptsOk = false; promptsDetail = `${g} empty prompt`; break; }
      const canon = readFileSync(join(ROOT, '.opencode', 'prompts', 'agents', 'gods', `${g}.txt`), 'utf-8');
      const cut = canon.indexOf('## Canonical Reference Patterns');
      const core = (cut > 0 ? canon.substring(0, cut) : canon).trim().substring(0, 1000);
      if (p !== core) { promptsOk = false; promptsDetail = `${g} prompt != canonical core (len ${p.length} vs ${core.length})`; break; }
    }
    check('G1 L1: all 10 god prompts are the real canonical cores (inlined, ≤1000 chars)', promptsOk, promptsDetail);
    // Free shape: demigods removed, plugin preset (free-nvidia-build strips
    // the two cache plugins — documented provider-shape behavior), single
    // instruction.
    check('G1 shape: only the 10 gods present (demigods removed)', Object.keys(cfg.agent).length === 10, `got ${Object.keys(cfg.agent).join(',')}`);
    check('G1 shape: free plugin preset (nvidia build: cache plugins stripped)',
      JSON.stringify(cfg.plugin) === JSON.stringify(['./.opencode/olympus', './.opencode/plugins/olympus-router']),
      JSON.stringify(cfg.plugin));
    // #106 THE ANCHOR-PIN: the pinned family-lane map lands VERBATIM — the
    // fake "stronger nemotron live #1" from the refresh appears NOWHERE
    // (the old concentration logic parked apollo+atlas on it — the defect).
    const PINNED = {
      apollo: 'nvidia-glm/z-ai/glm-5.3', atlas: 'nvidia-glm/z-ai/glm-5.3-flash',
      artemis: 'nvidia-kimi/moonshotai/kimi-k3', athena: 'nvidia-glm/z-ai/glm-5.3-flash',
      dionysus: 'nvidia-glm/z-ai/glm-5.3', hephaestus: 'nvidia-kimi/moonshotai/kimi-k3',
      hermes: 'nvidia-meta/meta/muse-glimmer-30b', persephone: 'nvidia-glm/z-ai/glm-5.3',
      prometheus: 'nvidia-kimi/moonshotai/kimi-k3', callimachus: 'nvidia-glm/z-ai/glm-5.3-flash',
    };
    const pinDrift = GODS.filter(g => cfg.agent[g]?.model !== PINNED[g]);
    check('G1 #106: the pinned anchor map lands verbatim (no silent drift)',
      pinDrift.length === 0, pinDrift.map(g => `${g}: ${cfg.agent[g]?.model} != ${PINNED[g]}`).join(', '));
    check('G1 #106: the fake stronger-nemotron live #1 appears NOWHERE in the config',
      JSON.stringify(cfg).includes('nemotron-3.5-lightning') === false,
      'the refresh overrode the pin — the concentration defect is back');
    // #106 THE PROVIDER SPLIT: the family entries exist in the generated
    // config, each carrying ONLY its family's models + the NVIDIA base URL.
    const famOk = ['nvidia-glm', 'nvidia-deepseek', 'nvidia-kimi', 'nvidia-meta'].every(f =>
      cfg.provider?.[f]?.npm === '@ai-sdk/openai-compatible' &&
      cfg.provider?.[f]?.options?.baseURL === 'https://integrate.api.nvidia.com/v1' &&
      Object.keys(cfg.provider[f].models).length > 0);
    check('G1 #106: all four family provider entries generated (npm + baseURL + models)', famOk,
      `families present: ${Object.keys(cfg.provider || {}).join(',')}`);
    const flashLimit = cfg.provider?.['nvidia-glm']?.models?.['z-ai/glm-5.3-flash']?.limit;
    check('G1 #106: the flash lane carries the honest limits (1M / 16384)',
      flashLimit?.context === 1000000 && flashLimit?.output === 16384, JSON.stringify(flashLimit));
    check('G1 #106: the old single-provider nvidia block is GONE from the generated config',
      cfg.provider?.nvidia === undefined, `provider.nvidia still present: ${JSON.stringify(cfg.provider?.nvidia)?.slice(0, 120)}`);
    // L4: every model id in the generated config is in the stub catalogue
    // for ITS probe provider (family lanes remap to the base `nvidia`
    // catalogue — the preflight's family handling).
    const genIds = new Set([cfg.model, cfg.small_model, ...Object.values(cfg.agent).map(a => a.model)]);
    const probeId = (id) => id.replace(/^(nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta)\//, 'nvidia/');
    const bad = [...genIds].filter(id => id && !(STUB_CATALOGUE[probeId(id).split('/')[0]] || []).includes(probeId(id)));
    check('G1 L4: every generated model id is in the live catalogue', bad.length === 0, `dead ids: ${bad.join(', ')}`);
  }
}

// ─── G3: a RETIRED ANCHOR fails LOUDLY at apply time (#105's law applied ────
// to models: a dead anchor surfaces loudly, never a silent swap). The lane's
// stub catalogue drops the pinned glm-5.3 — the anchor-pin refuses to
// substitute a "stronger" model; L4 fails the apply with the D19 shape. ────
{
  const retiredAnchor = {
    ...STUB_CATALOGUE,
    nvidia: STUB_CATALOGUE.nvidia.filter(id => id !== 'nvidia/z-ai/glm-5.3'),
  };
  const lane = makeLane({ stubCatalogue: retiredAnchor });
  const home = makeHome();
  const r = applyStrategy(['--strategy', 'free-nvidia-build'],
    { OLYMPUS_ROOT: lane, OLYMPUS_HOME: home, XDG_DATA_HOME: join(home, 'xdg') });
  check('G3 L4: a retired anchor fails the apply (exit 1)', r.status === 1, `status=${r.status} out=${r.out.slice(-300)}`);
  check('G3 L4: the error names the dead anchor + the live suggestion (D19 verbatim shape)',
    /L4 catalogue preflight/.test(r.out) && r.out.includes('nvidia/z-ai/glm-5.3') && r.out.includes('nvidia/z-ai/glm-5.3-flash'),
    r.out.slice(-400));
  check('G3 L1: dead-anchor apply wrote NO config (lane opencode.json untouched)',
    readLaneCfg(lane).agent.apollo.prompt.startsWith('{file:'));
}

// ─── G4: --force is the loud escape hatch ─────────────────────────────────
{
  const retiredAnchor = {
    ...STUB_CATALOGUE,
    nvidia: STUB_CATALOGUE.nvidia.filter(id => id !== 'nvidia/z-ai/glm-5.3'),
  };
  const lane = makeLane({ stubCatalogue: retiredAnchor });
  const home = makeHome();
  const r = applyStrategy(['--strategy', 'free-nvidia-build', '--force'],
    { OLYMPUS_ROOT: lane, OLYMPUS_HOME: home, XDG_DATA_HOME: join(home, 'xdg') });
  check('G4 L4: --force applies with a WARNING (exit 0)', r.status === 0, `status=${r.status}`);
  check('G4 L4: the warning names the dead anchor (loud, never silent)',
    r.status === 0 && /WARNING/.test(r.out) && r.out.includes('nvidia/z-ai/glm-5.3'), r.out.slice(-300));
}

// ─── G5: L1 loud-fail — unreadable god prompt file is an explicit error ───
{
  const lane = makeLane();
  rmSync(join(lane, '.opencode', 'prompts', 'agents', 'gods', 'apollo.txt'));
  const home = makeHome();
  const r = applyStrategy(['--strategy', 'free-nvidia-build'],
    { OLYMPUS_ROOT: lane, OLYMPUS_HOME: home, XDG_DATA_HOME: join(home, 'xdg') });
  check('G5 L1: unreadable prompt file fails the apply (exit 1)', r.status === 1, `status=${r.status} out=${r.out.slice(-300)}`);
  check('G5 L1: the error names the god + the file (never a silent keep-old)',
    r.status === 1 && /apollo/.test(r.out) && /prompt file/.test(r.out), r.out.slice(-300));
}

// ─── G6: L4 loud-fail — missing catalogue tooling is an explicit error ────
{
  const lane = makeLane({ withStubBinary: false });
  const home = makeHome();
  const r = applyStrategy(['--strategy', 'free-nvidia-build'],
    { OLYMPUS_ROOT: lane, OLYMPUS_HOME: home, XDG_DATA_HOME: join(home, 'xdg') });
  check('G6 L4: missing catalogue tooling fails the apply (exit 1)', r.status === 1, `status=${r.status} out=${r.out.slice(-300)}`);
  check('G6 L4: the error is explicit about the missing probe binary (never a silent skip)',
    r.status === 1 && /preflight/.test(r.out) && /opencode/.test(r.out), r.out.slice(-300));
}

// ─── G7: GO shape loud-fail — missing prompt file is an explicit error ────
{
  const lane = makeLane({ withPrompts: false });
  const home = makeHome();
  const r = applyStrategy(['--strategy', 'go-balanced'],
    { OLYMPUS_ROOT: lane, OLYMPUS_HOME: home, XDG_DATA_HOME: join(home, 'xdg') });
  check('G7 L1: GO apply with missing prompt files fails (exit 1)', r.status === 1, `status=${r.status} out=${r.out.slice(-300)}`);
  check('G7 L1: the error names the missing prompt file (never WARN+continue)',
    r.status === 1 && /prompt file/.test(r.out), r.out.slice(-300));
}

// ─── R4 guards verified ────────────────────────────────────────────────────
check('R4: the real repo opencode.json is byte-identical after the fixture',
  sha256(join(ROOT, 'opencode.json')) === REAL_OPENCODE_SHA);
for (const { f, p } of realHomeGuardFiles) {
  const after = existsSync(p) ? sha256(p) : null;
  check(`R4: real ~/.olympus/${f} untouched`, after === realHomeBefore[f]);
}

rmSync(WORK, { recursive: true, force: true });

if (fails > 0) {
  console.error(`\n${fails}/${checked} generator fixture assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${checked} free-lane generator (L1+L4) assertions passed`);
