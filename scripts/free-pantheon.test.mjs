#!/usr/bin/env node
/**
 * free-pantheon.test.mjs — #106 (MADRUGA-FREE-1): the distributed pantheon
 * doctrine, asserted as code. Run: npx tsx scripts/free-pantheon.test.mjs
 *
 * THE DOCTRINE (the user's directive, 2026-10-08):
 *   1. THE BAN — zero gods (and zero vault/small lanes) on any `nemotron-*`
 *      id, forever. The user's ban: low effective context + the observed
 *      contention pool ("Service temporarily overloaded" — 503-class
 *      per-model serving-pool contention, NOT the 40-RPM key limit).
 *   2. THE LANES — every god on exactly ONE anchor model, routed through its
 *      per-family provider entry (nvidia-glm / nvidia-deepseek / nvidia-kimi
 *      / nvidia-meta — "different endpoints per god", client-pool
 *      isolation on top of the serving-pool diversity).
 *   3. THE HEAVY THREE — apollo's entry lane, athena's frontend-kit lane,
 *      hephaestus's build lane NEVER share a pool (three distinct anchors).
 *   4. THE VOLUME LANE — callimachus + vaultLlm on the FAST lane
 *      (z-ai/glm-5.3-flash — heartbeat/summarizer work is volume, not depth).
 *   5. THE CAP — no more than 3 gods on any single anchor model.
 *   6. THE LIVE SET — every assigned model id exists in the live-ids
 *      snapshot (probe-verified 2026-10-07/08 — a claim about model
 *      availability carries probe evidence or it is not made, #105).
 *   7. THE MIRRORS — all four strategy-map surfaces agree (canonical
 *      model-strategies.ts + apply-strategy.js BUILTIN_STRATEGIES +
 *      olympus-hooks.ts STRATEGY_GODS + settings-dialog.tsx mirror), and
 *      the strategy-sync checker stays green.
 *   8. THE GENERATOR — FREE_MODEL_LIMITS carries ONLY the family-prefixed
 *      anchor lanes with honest limits (output 16384 — the #76 bar; context
 *      = the live model card's window, never inflated). The old single-
 *      provider `nvidia/*` lanes are GONE from the table.
 *   9. THE PROVIDER SPLIT — the per-family provider entries exist in the
 *      generator (npm @ai-sdk/openai-compatible + the NVIDIA base URL),
 *      each carrying ONLY its family's models.
 *  10. THE SMALL MODEL — the strategy's small_model (title/compaction
 *      volume work) rides the flash lane too. Zero nemotron anywhere.
 *  11. THE TERMINAL — the top-level model == apollo's lane (the entry god).
 *
 * RED proven against the pre-cure code (2026-10-08): the suite named
 * nemotron-3-ultra-550b on apollo/atlas + nano-omni on callimachus/vaultLlm —
 * the #106 defect, proven. GREEN after the cure.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus',
  'hermes', 'persephone', 'prometheus', 'callimachus'];
const FAMILIES = ['nvidia-glm', 'nvidia-deepseek', 'nvidia-kimi', 'nvidia-meta'];
// The honest windows (live model cards, verified 2026-10-08 — E8 record:
// reports/free-1/s0/E8-LIVE-MODEL-VERIFICATION.md; kimi-k3 1,048,576;
// muse-glimmer-30b 131,072 — NOT inflated).
const HONEST_CONTEXT = {
  'z-ai/glm-5.3': 1000000,
  'z-ai/glm-5.3-flash': 1000000,
  'moonshotai/kimi-k3': 1048576,
  'meta/muse-glimmer-30b': 131072,
  'deepseek-ai/deepseek-v4.1-flash': 1000000,
};
const FLOOR_OUTPUT = 8192;
const TARGET_OUTPUT = 16384;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `\n      ${detail}` : ''}`);
  if (!ok) failures++;
}

function read(p) {
  if (!existsSync(p)) throw new Error(`missing file: ${p}`);
  return readFileSync(p, 'utf-8');
}

// --- Extract a god->model map from a source block ---------------------------
// Values are 'provider/model' ids — the character class covers letters,
// digits, '.', ':', '/', '-', '_'. Family prefixes (nvidia-glm etc.) are
// matched BEFORE the plain `nvidia` (ordered alternation).
const PROVIDER_ALT = 'opencode-go|opencode|groq|openrouter|nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta|nvidia';
function extractGods(block) {
  const gods = {};
  const re = new RegExp(`([a-z]+):\\s*['"]((${PROVIDER_ALT})\\/[a-z0-9._:/-]+)['"]`, 'g');
  let m;
  while ((m = re.exec(block)) !== null) gods[m[1]] = m[2];
  return gods;
}

// model-strategies.ts: the 'free-nvidia-build' strategy block (nested `gods:`).
const msSrc = read(path.join(ROOT, 'src/lib/model-strategies.ts'));
const msBlockMatch = msSrc.match(/'free-nvidia-build':\s*\{[\s\S]*?\n  \},\n\};/);
if (!msBlockMatch) throw new Error('free-nvidia-build block not found in model-strategies.ts');
const msBlock = msBlockMatch[0];
const canonicalGods = extractGods(msBlock);
const vaultLlm = (msBlock.match(/vaultLlm:\s*['"]([^'"]+)['"]/) || [])[1] || '';
const terminalModel = (msBlock.match(/terminalModel:\s*['"]([^'"]+)['"]/) || [])[1] || '';

// apply-strategy.js: BUILTIN_STRATEGIES['free-nvidia-build'] (FLAT block).
const asSrc = read(path.join(ROOT, 'scripts/apply-strategy.js'));
const asBlockMatch = asSrc.match(/'free-nvidia-build':\s*\{([\s\S]*?)\n  \},\n\};/);
if (!asBlockMatch) throw new Error('free-nvidia-build block not found in apply-strategy.js');
const applyGods = extractGods(asBlockMatch[1]);

// olympus-hooks.ts: STRATEGY_GODS["free-nvidia-build"] (double-quoted keys).
const hooksSrc = read(path.join(ROOT, '.opencode/olympus/olympus-hooks.ts'));
const hooksBlockMatch = hooksSrc.match(/"free-nvidia-build":\s*\{([\s\S]*?)\n\s*\},/);
if (!hooksBlockMatch) throw new Error('free-nvidia-build block not found in olympus-hooks.ts');
const hooksGods = extractGods(hooksBlockMatch[1]);

// settings-dialog.tsx: the strategy god-map mirror.
const dlgSrc = read(path.join(ROOT, 'src/components/olympus/settings-dialog.tsx'));
const dlgBlockMatch = dlgSrc.match(/'free-nvidia-build':\s*\{([\s\S]*?)\n  \},/);
if (!dlgBlockMatch) throw new Error('free-nvidia-build mirror not found in settings-dialog.tsx');
const dlgGods = extractGods(dlgBlockMatch[1]);

// The live-ids snapshot (probe-verified 2026-10-07, committed at
// reports/gap-1/s3/ — the E8 re-verification of the same list lives in
// reports/free-1/s0/E8-LIVE-MODEL-VERIFICATION.md).
const liveIds = JSON.parse(read(path.join(ROOT, 'reports/gap-1/s3/nvidia-live-ids-2026-10-07.json')));

// The generator tables (import the apply module — same pattern as
// budget-guard.test.mjs).
const apply = await import('./apply-strategy.js');
const limits = apply.FREE_MODEL_LIMITS;
const familyProviders = apply.NVIDIA_FAMILY_PROVIDERS;
const smallModelNvidia = apply.SMALL_MODEL_FREE_NVIDIA;

// --- 1. THE BAN: zero nemotron anywhere in the assignment --------------------
const allLanes = {};
for (const g of GODS) allLanes[g] = canonicalGods[g] || '(missing)';
allLanes.vaultLlm = vaultLlm || '(missing)';
allLanes.small_model = smallModelNvidia || '(missing)';
const nemotronOffenders = Object.entries(allLanes)
  .filter(([k, id]) => /nemotron/i.test(id))
  .map(([k, id]) => `${k}=${id}`);
check('THE BAN: zero nemotron-* ids in the free-nvidia-build assignment (gods + vault + small)',
  nemotronOffenders.length === 0,
  `the user's ban is LIVE in the assignment — offenders: ${nemotronOffenders.join(', ')}`);

// --- 2. THE LANES: every god on a family-prefixed anchor --------------------
const laneOffenders = GODS
  .filter(g => !canonicalGods[g] || !FAMILIES.some(f => canonicalGods[g].startsWith(f + '/')))
  .map(g => `${g}=${canonicalGods[g] || '(missing)'}`);
check('THE LANES: all 10 gods on per-family provider lanes (nvidia-glm/-deepseek/-kimi/-meta)',
  laneOffenders.length === 0,
  `gods not on a family lane: ${laneOffenders.join(', ')}`);

// --- 3. THE HEAVY THREE: three distinct pools --------------------------------
const heavyThree = ['apollo', 'athena', 'hephaestus'].map(g => canonicalGods[g]);
const heavyDistinct = new Set(heavyThree).size === 3;
check('THE HEAVY THREE: apollo / athena / hephaestus on three DIFFERENT anchors',
  heavyDistinct,
  `the three heaviest paths share a pool: apollo=${heavyThree[0]}, athena=${heavyThree[1]}, hephaestus=${heavyThree[2]}`);

// --- 4. THE VOLUME LANE: callimachus + vault on the flash lane --------------
const flash = 'nvidia-glm/z-ai/glm-5.3-flash';
check('THE VOLUME LANE: callimachus on the flash lane (z-ai/glm-5.3-flash)',
  canonicalGods.callimachus === flash, `callimachus=${canonicalGods.callimachus}`);
check('THE VOLUME LANE: vaultLlm on the flash lane',
  vaultLlm === flash, `vaultLlm=${vaultLlm}`);
check('THE VOLUME LANE: the strategy small_model on the flash lane (volume, not depth)',
  smallModelNvidia === flash, `small_model(free-nvidia-build)=${smallModelNvidia}`);

// --- 5. THE CAP: <=3 gods per anchor -----------------------------------------
const perAnchor = {};
for (const g of GODS) perAnchor[canonicalGods[g]] = (perAnchor[canonicalGods[g]] || 0) + 1;
const overCap = Object.entries(perAnchor).filter(([id, n]) => n > 3);
check('THE CAP: no more than 3 gods on any single anchor',
  overCap.length === 0,
  `anchors over the cap: ${overCap.map(([id, n]) => `${id}=${n}`).join(', ')}`);

// --- 6. THE LIVE SET: every assigned id exists in the live-ids snapshot ------
const bare = id => id.replace(/^nvidia-[a-z]+\//, '').replace(/^nvidia\//, '');
const deadIds = [...GODS.map(g => canonicalGods[g]), vaultLlm, smallModelNvidia]
  .filter(id => id && !liveIds.includes(bare(id)));
check('THE LIVE SET: every assigned model id exists in the probe-verified live-ids snapshot',
  deadIds.length === 0,
  `ids not in the live list (a claim about availability carries probe evidence): ${deadIds.join(', ')} (bare: ${deadIds.map(bare).join(', ')})`);

// --- 7. THE MIRRORS: all four surfaces agree + the sync checker green -------
const mirrors = { 'apply-strategy.js': applyGods, 'olympus-hooks.ts': hooksGods, 'settings-dialog.tsx': dlgGods };
for (const [label, map] of Object.entries(mirrors)) {
  const drift = GODS.filter(g => map[g] !== canonicalGods[g]);
  check(`THE MIRRORS: ${label} free-nvidia-build map == canonical`,
    drift.length === 0,
    `drift: ${drift.map(g => `${g}: ${map[g]} != ${canonicalGods[g]}`).join(', ')}`);
}
let syncOk = false, syncOut = '';
try {
  syncOut = execFileSync('node', [path.join(ROOT, 'scripts/check-strategy-sync.js')],
    { encoding: 'utf-8', timeout: 60_000 });
  syncOk = syncOut.includes('all 9 strategies in sync');
} catch (e) { syncOut = String(e.stdout || e.message); }
check('THE MIRRORS: check-strategy-sync 9/9 green', syncOk, syncOut.slice(0, 400));

// ── HIGIENIA-1 H1b ────────────────────────────────────────────────────────────
// #93 (GO-CARD-PROSE): every GO/Zen PROSE surface names the model the apply
// maps pin (glm-5.3 family per apply-strategy.js:172-255 + MODEL-STRATEGIES.md,
// the source of truth); the live-provider ID lists stay semantically intact.
// #80 (N29): the budget-guard declares its surface (LIVE + the path).
const ROOTP = new URL('..', import.meta.url).pathname;
const read93 = (p) => readFileSync(path.join(ROOTP, p), 'utf-8');
const settingsSrc93 = read93('src/components/olympus/settings-dialog.tsx');
const providerSrc93 = read93('src/components/olympus/provider-settings.tsx');
const econSrc93 = read93('TOKEN-ECONOMY.md');
const principlesSrc93 = read93('.opencode/rules/common/operating-principles.md');
const cardRows = (src) => (src.match(/\{ id: '(?:go|zen)-[^']+'.*?\}/g) || []).join('\n');
check('#93: the GO/Zen card prose names the pinned model (no retired default in the card rows)',
  !/GLM-5\.2/.test(cardRows(settingsSrc93)) && !/GLM-5\.2/.test(cardRows(providerSrc93))
  && !/terminalModel: 'glm-5\.2'/.test(settingsSrc93) && !/terminalModel: 'opencode\/glm-5\.2'/.test(settingsSrc93)
  && !/terminalModel: 'glm-5\.2'/.test(providerSrc93) && !/terminalModel: 'opencode\/glm-5\.2'/.test(providerSrc93),
  'the strategy cards still tell the pre-rotation story (the GO-CARD-PROSE drift)');
check('#93: the GO/Zen provider-catalogue ID lists stay SEMANTICALLY INTACT (the reconciliation never edits the id lists)',
  /'opencode-go\/glm-5\.2'/.test(settingsSrc93) && /'opencode\/glm-5\.2'/.test(settingsSrc93),
  'the id lists were touched — out of scope');
check('#93: TOKEN-ECONOMY + the operating principles name the pinned model (the GO tables + the reserved-lane clause)',
  !/GLM-5\.2/.test(econSrc93) && !/GLM-5\.2 \(opencode-go\/glm-5\.2\)/.test(principlesSrc93) && /GLM-5\.3/.test(principlesSrc93),
  'the docs tables + the reserved-lane clause still name the retired default');
const syncSrc93 = read93('scripts/check-strategy-sync.js');
check('#93: the prose class is LINTED (check-strategy-sync carries the GO-CARD-PROSE guard — prose drift can never recur silently)',
  /GO-CARD-PROSE/.test(syncSrc93) && /settings-dialog/.test(syncSrc93),
  'nothing checks the card prose — the drift class has no tripwire');
{
  let guardOut93 = '';
  let guardStatus93 = -1;
  try { guardOut93 = execFileSync('npx', ['tsx', path.join(ROOTP, 'scripts', 'budget-guard.test.mjs')], { encoding: 'utf-8', cwd: ROOTP, timeout: 120_000 }); guardStatus93 = 0; }
  catch (e) { guardOut93 = String(e?.stdout || ''); guardStatus93 = e?.status ?? -1; }
  check('#80: the budget-guard DECLARES its surface (LIVE + the inspected path — the N29 unambiguous verdict)',
    guardStatus93 === 0 && /surface 1: .*(LIVE|TRACKED)/.test(guardOut93) && /opencode\.json/.test(guardOut93),
    `the guard's verdict is still path-dependent and undeclared (exit ${guardStatus93})`);
}

// ── #78 (HIGIENIA-2 H4): the model-catalogue drift detector — the D19
// rotation class tripwired at doctor time, case-insensitive across every
// assignment surface; the free lanes validate against the refreshed
// catalogue snapshot.
{
  const drift78 = await import(path.join(ROOTP, 'src', 'lib', 'model-drift.ts'));
  check('#78: detectModelDrift exported (the D19-class tripwire)',
    typeof drift78.detectModelDrift === 'function', 'absent — a dead id breaks applies silently again');
  if (typeof drift78.detectModelDrift === 'function') {
    const cfg78 = {
      agent: { apollo: { model: 'nvidia-glm/z-ai/glm-5.3' }, athena: { model: 'NVIDIA-Glm/Z-Ai/GLM-5.2' }, dionysus: { model: 'nvidia-glm/z-ai/glm-5.3-pro' } },
      small_model: 'nvidia-glm/z-ai/glm-5.3-flash',
      terminalModel: 'nvidia-glm/z-ai/glm-5.3',
    };
    const findings78 = drift78.detectModelDrift(cfg78, { data: [{ id: 'nvidia-glm/z-ai/glm-5.3' }, { id: 'nvidia-glm/z-ai/glm-5.3-flash' }] });
    check('#78: a CASE-SHIFTED retired id still trips (the D19 lesson — case-insensitive)',
      findings78.some((f) => f.kind === 'retired' && f.lane === 'agent.athena'), JSON.stringify(findings78).slice(0, 200));
    check('#78: a dead free-lane id (absent from the catalogue) is flagged',
      findings78.some((f) => f.kind === 'not-in-catalogue'), JSON.stringify(findings78).slice(0, 240));
    const clean78 = drift78.detectModelDrift({ agent: { apollo: { model: 'nvidia-glm/z-ai/glm-5.3' } } }, { data: [{ id: 'nvidia-glm/z-ai/glm-5.3' }] });
    check('#78: a live config is CLEAN (no false positives)',
      clean78.length === 0, JSON.stringify(clean78).slice(0, 200));
  }
  const doctorSrc78 = readFileSync(path.join(ROOTP, 'scripts', 'olympus-doctor.js'), 'utf-8');
  check('#78: the doctor consults the detector (the apply/doctor-time tripwire)',
    /detectModelDrift/.test(doctorSrc78) && /Model-catalogue drift/.test(doctorSrc78),
    'the doctor never validates the model ids — D19 recurs silently');
}

// --- 8. THE GENERATOR: family lanes only, honest limits ---------------------
const familyLaneIds = FAMILIES.flatMap(f =>
  Object.keys(HONEST_CONTEXT).filter(m => {
    const fam = f.replace('nvidia-', '');
    return m.startsWith(fam === 'glm' ? 'z-ai/' : fam === 'kimi' ? 'moonshotai/' : fam === 'meta' ? 'meta/' : 'deepseek-ai/');
  }).map(m => `${f}/${m}`));
for (const id of familyLaneIds) {
  const lim = limits[id];
  check(`THE GENERATOR: ${id} present with output ${TARGET_OUTPUT}`,
    !!lim && lim.output === TARGET_OUTPUT, `limits[${id}]=${JSON.stringify(lim)}`);
  check(`THE GENERATOR: ${id} honest context (${HONEST_CONTEXT[bare(id)]})`,
    !!lim && lim.context === HONEST_CONTEXT[bare(id)], `context=${lim ? lim.context : '(absent)'}`);
}
const oldNvidiaLanes = Object.keys(limits).filter(id => id.startsWith('nvidia/'));
check('THE GENERATOR: the old single-provider nvidia/* lanes are GONE from the table',
  oldNvidiaLanes.length === 0, `residual lanes: ${oldNvidiaLanes.join(', ')}`);
const underFloor = Object.entries(limits).filter(([id, l]) => l.output < FLOOR_OUTPUT);
check('THE GENERATOR: every table lane sized >= the #76 floor (8192)',
  underFloor.length === 0, `under-floor: ${underFloor.map(([id, l]) => `${id}=${l.output}`).join(', ')}`);

// --- 9. THE PROVIDER SPLIT: per-family entries, per-family subsets ----------
check('THE PROVIDER SPLIT: all four family entries defined in the generator',
  !!familyProviders && FAMILIES.every(f => familyProviders[f]),
  `NVIDIA_FAMILY_PROVIDERS keys: ${familyProviders ? Object.keys(familyProviders).join(', ') : '(absent)'}`);
if (familyProviders) {
  const EXPECTED_MODELS = {
    'nvidia-glm': ['z-ai/glm-5.3', 'z-ai/glm-5.3-flash'],
    'nvidia-deepseek': ['deepseek-ai/deepseek-v4.1-flash'],
    'nvidia-kimi': ['moonshotai/kimi-k3'],
    'nvidia-meta': ['meta/muse-glimmer-30b'],
  };
  for (const f of FAMILIES) {
    const fp = familyProviders[f] || {};
    check(`THE PROVIDER SPLIT: ${f} carries the NVIDIA base URL + openai-compatible npm`,
      fp.options?.baseURL === 'https://integrate.api.nvidia.com/v1' && fp.npm === '@ai-sdk/openai-compatible',
      `npm=${fp.npm} baseURL=${fp.options?.baseURL}`);
    const models = Object.keys(fp.models || {}).sort();
    const expected = [...EXPECTED_MODELS[f]].sort();
    check(`THE PROVIDER SPLIT: ${f} carries ONLY its family's models (${expected.join(', ')})`,
      JSON.stringify(models) === JSON.stringify(expected),
      `models=${models.join(', ')}`);
    for (const [mid, mc] of Object.entries(fp.models || {})) {
      check(`THE PROVIDER SPLIT: ${f}/${mid} honest limits (ctx ${HONEST_CONTEXT[mid]}, out ${TARGET_OUTPUT})`,
        mc?.limit?.context === HONEST_CONTEXT[mid] && mc?.limit?.output === TARGET_OUTPUT,
        `limit=${JSON.stringify(mc?.limit)}`);
    }
  }
}

// --- 10. THE TERMINAL: the top-level model == apollo's lane ----------------
check('THE TERMINAL: terminalModel == apollo\'s lane (the entry god)',
  terminalModel === canonicalGods.apollo, `terminalModel=${terminalModel}, apollo=${canonicalGods.apollo}`);

// --- 11. THE DESCRIPTION: the doctrine is expressed --------------------------
const doctrineWords = ['distributed', 'Nemotron', 'pool'];
const blockLower = msBlock.toLowerCase();
const missingWords = doctrineWords.filter(w => !blockLower.includes(w.toLowerCase()));
check('THE DESCRIPTION: the strategy description expresses the doctrine (distributed / no Nemotron / no single pool)',
  missingWords.length === 0, `description missing: ${missingWords.join(', ')}`);

// --- Verdict -----------------------------------------------------------------
console.log('');
if (failures > 0) {
  console.error(`free-pantheon: ${failures} doctrine violation(s) — the distributed pantheon is NOT in effect`);
  process.exit(1);
}
console.log('free-pantheon: the distributed doctrine holds on every surface (gods, vault, small, mirrors, generator, provider split)');
