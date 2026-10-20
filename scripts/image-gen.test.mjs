#!/usr/bin/env node
/**
 * image-gen.test.mjs — W-B IMAGE-GEN (v0.0.6-premio): free + BYOK image
 * creation, the ladder that finally runs.
 * Run: npx tsx scripts/image-gen.test.mjs   (exit 0 = pass)
 *
 * The audit (v0.0.6): the app's ONLY generation lane was the anonymous
 * Pollinations endpoint (fixed 768x768, no model, no seed); the entire BYOK
 * price ladder (GENERATION_LADDER in visual-strategy.ts) was unconsumed
 * data — no key entry anywhere, no editing lane at all. And pygmalion +
 * argos (the image-gen + VLM demigods) sat ON DISK but UNREGISTERED —
 * visible in rosters, refused by olympus-dispatch (the 120/118 drift).
 *
 * The cure: src/lib/image-providers.ts — the provider engine (keys from the
 * CANONICAL api-configs store: POLLINATIONS_KEY/FAL_KEY/GOOGLE_AI_KEY; the
 * availability matrix; the pure request builders + response parser) — and
 * the generate/edit routes consuming it. Free lane first, BYOK behind keys,
 * every response honest about lane + cost. Plus the fal MCP registered by
 * the full 8-step checklist (remote, BYOK, endpoint probe: 401 without key —
 * the honest-optional shape) and the two demigods REGISTERED + re-skeletoned.
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
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 260)}`);
  if (!cond) failures++;
}

async function main() {
  const libPath = path.join(OLYMPUS, 'src/lib/image-providers.ts');
  const hasLib = fs.existsSync(libPath);
  const lib = hasLib ? await import(OLYMPUS + '/src/lib/image-providers.ts') : null;

  if (!hasLib || typeof lib.availableImageModels !== 'function') {
    expect('B1: src/lib/image-providers.ts — the provider engine exists', false,
      'the generate route still calls the anonymous Pollinations endpoint inline; the ladder is dead data');
  } else {
    // ── B1: the availability matrix (fixture keys, both stores) ─────────
    const homeFree = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-imgfx-'));
    const freeModels = lib.availableImageModels(lib.readImageProviderKeys(homeFree));
    expect('B1: no keys -> the FREE lane is the only available model (honest)',
      freeModels.filter(m => m.available).length >= 1
      && freeModels.every(m => !m.available || m.needsKey === null),
      JSON.stringify(freeModels.map(m => [m.id, m.available])));

    const homeFal = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-imgfx-'));
    fs.mkdirSync(path.join(homeFal, '.olympus'), { recursive: true });
    fs.writeFileSync(path.join(homeFal, '.olympus', 'api-configs.json'), JSON.stringify({ FAL_KEY: 'fx-fal-key' }));
    const falModels = lib.availableImageModels(lib.readImageProviderKeys(homeFal));
    expect('B1: FAL_KEY unlocks the fal rungs (sdxl-turbo draft / flux-schnell draft / nano-banana final + edit)',
      falModels.filter(m => m.available && m.provider === 'fal').length >= 3
      && falModels.some(m => m.id === 'byok/flux-schnell' && m.available)
      && falModels.some(m => m.available && m.supportsEdit),
      JSON.stringify(falModels.filter(m => m.provider === 'fal').map(m => [m.id, m.available])));

    const homeGoogleLegacy = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-imgfx-'));
    fs.mkdirSync(path.join(homeGoogleLegacy, '.olympus'), { recursive: true });
    fs.writeFileSync(path.join(homeGoogleLegacy, '.olympus', 'atelier.json'), JSON.stringify({ google_key: 'fx-google-legacy' }));
    const googleModels = lib.availableImageModels(lib.readImageProviderKeys(homeGoogleLegacy));
    expect('B1: the legacy atelier.json google_key still unlocks the Google rung (backward compat)',
      googleModels.some(m => m.provider === 'google' && m.available),
      JSON.stringify(googleModels.filter(m => m.provider === 'google').map(m => [m.id, m.available])));
    const homeGoogleCanon = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-imgfx-'));
    fs.mkdirSync(path.join(homeGoogleCanon, '.olympus'), { recursive: true });
    fs.writeFileSync(path.join(homeGoogleCanon, '.olympus', 'api-configs.json'), JSON.stringify({ GOOGLE_AI_KEY: 'fx-google-canon' }));
    const googleModels2 = lib.availableImageModels(lib.readImageProviderKeys(homeGoogleCanon));
    expect('B1: the canonical GOOGLE_AI_KEY unlocks the same rung (one truth, canonical wins)',
      googleModels2.some(m => m.provider === 'google' && m.available),
      'the canonical store must satisfy the google rung');

    // ── B1: the pure request builders (the shapes the providers expect) ──
    const pollinationsReq = lib.buildGenerationRequest('pollinations/flux', { prompt: 'a red cube', width: 512, height: 512, seed: 42, keys: {} });
    expect('B1: the free lane request keeps the Pollinations shape (nologo + seed)',
      pollinationsReq.method === 'GET' && pollinationsReq.url.includes('image.pollinations.ai/prompt/') && pollinationsReq.url.includes('seed=42') && pollinationsReq.url.includes('nologo=true'),
      `url=${pollinationsReq.url?.slice(0, 120)}`);
    const falReq = lib.buildGenerationRequest('byok/flux-schnell', { prompt: 'a red cube', width: 1024, height: 768, keys: { fal: 'fx-fal-key' } });
    expect('B1: the fal request — fal.run + Key auth + the JSON body',
      falReq.url === 'https://fal.run/fal-ai/flux/schnell'
      && falReq.headers.Authorization === 'Key fx-fal-key'
      && JSON.parse(falReq.body).prompt === 'a red cube' && JSON.parse(falReq.body).image_size.width === 1024,
      `url=${falReq.url} body=${falReq.body}`);
    const googleReq = lib.buildGenerationRequest('byok/nano-banana', { prompt: 'a red cube', width: 1024, height: 1024, keys: { google: 'fx-g' } });
    expect('B1: the Google request — generateContent + the API key header',
      googleReq.url.includes('generativelanguage.googleapis.com') && googleReq.url.includes(':generateContent')
      && googleReq.headers['x-goog-api-key'] === 'fx-g'
      && JSON.parse(googleReq.body).contents[0].parts[0].text === 'a red cube',
      `url=${googleReq.url}`);

    // ── B4: the edit request shapes ────────────────────────────────────────
    const falEdit = lib.buildEditRequest('byok/nano-banana-edit', { prompt: 'make it blue', imageDataUri: 'data:image/png;base64,QUJD', keys: { fal: 'fx-fal-key' } });
    expect('B4: the fal edit request — nano-banana/edit with the image data URI',
      falEdit.url === 'https://fal.run/fal-ai/nano-banana/edit'
      && falEdit.headers.Authorization === 'Key fx-fal-key'
      && JSON.parse(falEdit.body).image_url === 'data:image/png;base64,QUJD' && JSON.parse(falEdit.body).prompt === 'make it blue',
      `url=${falEdit.url}`);
    const googleEdit = lib.buildEditRequest('byok/nano-banana', { prompt: 'make it blue', imageDataUri: 'data:image/png;base64,QUJD', keys: { google: 'fx-g' } });
    expect('B4: the Google edit request — the image rides as an inline part',
      googleEdit.url.includes(':generateContent')
      && JSON.parse(googleEdit.body).contents[0].parts.some(p => p.inline_data?.mime_type === 'image/png'),
      'the edit body must carry the source image');

    // ── B1/B4: the response parser (the three wire shapes) ─────────────────
    const falJsonBytes = Buffer.from(JSON.stringify({ images: [{ url: 'https://fx.example/img.png' }] }));
    expect('B1: the parser handles the fal JSON shape (images[0].url -> a fetch target)',
      lib.parseProviderResponse('application/json', falJsonBytes).kind === 'image-url' && lib.parseProviderResponse('application/json', falJsonBytes).url === 'https://fx.example/img.png',
      JSON.stringify(lib.parseProviderResponse('application/json', falJsonBytes)));
    expect('B1: the parser handles direct image bytes',
      lib.parseProviderResponse('image/png', Buffer.from('rawbytes')).kind === 'image-bytes'
      && lib.parseProviderResponse('image/png', Buffer.from('rawbytes')).mime === 'image/png',
      'direct bytes must pass through');
    const googleJson = Buffer.from(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('GEMINIBYTES').toString('base64') } }] } }] }));
    expect('B1: the parser handles the Google inlineData shape (base64 -> bytes)',
      lib.parseProviderResponse('application/json', googleJson).kind === 'image-bytes'
      && lib.parseProviderResponse('application/json', googleJson).buf.toString() === 'GEMINIBYTES',
      'the google inline image must decode');

    for (const h of [homeFree, homeFal, homeGoogleLegacy, homeGoogleCanon]) fs.rmSync(h, { recursive: true, force: true });
  }

  // ── B1/B3/B4: the routes ───────────────────────────────────────────────────
  const genRoute = read('src/app/api/olympus/atelier/generate/route.ts');
  expect('B1: the generate route consumes the engine (model param + honest key refusal)',
    genRoute.includes('image-providers') && /model/.test(genRoute) && genRoute.includes('available'),
    'the route still hardcodes the anonymous endpoint');
  expect('B3: GET /api/olympus/atelier/models ships (the selector data source)',
    fs.existsSync(path.join(OLYMPUS, 'src/app/api/olympus/atelier/models/route.ts')),
    'the gen box has no model catalog to render');
  const editRoutePath = path.join(OLYMPUS, 'src/app/api/olympus/atelier/edit/route.ts');
  expect('B4: POST /api/olympus/atelier/edit ships (the img2img lane)',
    fs.existsSync(editRoutePath) && read('src/app/api/olympus/atelier/edit/route.ts').includes('buildEditRequest'),
    'no editing lane exists — ArtCraft web is the only "edit" affordance');

  // ── B2: the keys land in the house stores ─────────────────────────────────
  const apiRoute = read('src/app/api/olympus/api-configs/route.ts');
  expect('B2: the allowlist accepts FAL_KEY + GOOGLE_AI_KEY (the Atelier BYOK set)',
    apiRoute.includes('FAL_KEY') && apiRoute.includes('GOOGLE_AI_KEY'),
    'the API Keys dialog cannot persist the image BYOK keys');
  const dialogSrc = read('src/components/olympus/api-config-dialog.tsx');
  expect('B2: the dialog renders all three Atelier key fields',
    dialogSrc.includes('FAL_KEY') && dialogSrc.includes('GOOGLE_AI_KEY') && dialogSrc.includes('POLLINATIONS_KEY'),
    'the Atelier section shows only the embeddings key');

  // ── B3/B4: the panel ──────────────────────────────────────────────────────
  const panelSrc = read('src/components/olympus/atelier-panel.tsx');
  expect('B3: the gen box gains the model selector + seed + the honest price badge',
    /atelier\/models/.test(panelSrc) && /seed/.test(panelSrc) && /priceHint|price/.test(panelSrc),
    'the gen box is still fixed 768x768 anonymous flux');
  expect('B4: the asset sheet gains the EDIT lane (the vault img2img loop)',
    panelSrc.includes('/api/olympus/atelier/edit'),
    'the vault asset cannot be edited in-app');

  // ── B5: the fal MCP by the 8-step checklist ──────────────────────────────
  const ocJson = JSON.parse(read('opencode.json'));
  expect('B5: opencode.json registers the fal MCP (remote, DISABLED by default, the honest note)',
    ocJson.mcp?.fal?.url === 'https://mcp.fal.ai/mcp' && ocJson.mcp?.fal?.enabled === false,
    'no fal entry in the OpenCode-native registry');
  const reqMap = read('src/lib/mcp-api-requirements.ts');
  expect('B5: the shared key-requirements map carries fal (FAL_KEY)',
    reqMap.includes("'fal'") || reqMap.includes('"fal"'),
    'the fal entry renders unlocked — a BYOK remote would lie without the key');
  const gateMap = read('.opencode/olympus/lib/mcp-gate.ts');
  expect('B5: the runtime gate map carries fal (the mirror)',
    /fal:\s*\{ envVars: \["FAL_KEY"\]/.test(gateMap),
    'the runtime gate lets fal through without a key');
  const registryLib = read('src/lib/mcp-registry.ts');
  expect('B5: the merged registry consults the key requirements for opencode-native entries (fal shows LOCKED)',
    /findMcpRequirement/.test(registryLib) && registryLib.includes('opencode'),
    'opencode-native entries are always requiresApiKey:false — fal renders toggleable without a key');
  const tiersSrc = read('.opencode/src/olympus-router/src/mcp-tiers.ts');
  expect('B5: the god tier table registers fal (hephaestus cold — equip per dispatch)',
    /hephaestus[\s\S]*?cold[\s\S]*?fal/.test(tiersSrc),
    'no god can equip the fal MCP');
  const catalogSrc = read('src/app/api/olympus/god/dispatch-graph/route.ts');
  expect('B5: GOD_DISPATCH_CATALOG lists fal on Hephaestus (the UI chips)',
    /hephaestus:\s*\{[\s\S]*?mcps: \[[^\]]*'fal'/.test(catalogSrc),
    'the god-detail MCP chips never show fal');
  const hephaestusArsenal = read('.opencode/vault-brain/mastered-skills/hephaestus.md');
  expect('B5: the hephaestus vault-brain arsenal documents the fal lane',
    /fal/.test(hephaestusArsenal),
    'the god\'s own reference does not know the MCP');

  // ── B6: pygmalion + argos REGISTERED + re-skeletoned ─────────────────────
  const registry = JSON.parse(read('opencode.demigods.json'));
  const hasPyr = registry.demigods?.['image-generator']?.parent_god === 'hephaestus';
  const hasArg = registry.demigods?.['vision-describer']?.parent_god === 'hephaestus';
  expect('B6: image-generator + vision-describer in the registry (the dispatch refusal dies, the descriptive pattern kept)',
    hasPyr && hasArg, `image-generator=${hasPyr} vision-describer=${hasArg}`);
  // The count pin is CONSISTENCY (registry total === the disk, the drift is
  // dead), never a frozen number — waves add demigods.
  const diskByGod = {};
  for (const g of fs.readdirSync(path.join(OLYMPUS, '.opencode/prompts/agents/demigods'))) {
    try { diskByGod[g] = fs.readdirSync(path.join(OLYMPUS, '.opencode/prompts/agents/demigods', g)).filter((f) => f.endsWith('.txt')).length; } catch { diskByGod[g] = 0; }
  }
  const diskTotal = Object.values(diskByGod).reduce((a, b) => a + b, 0);
  expect('B6: the registry counts are TRUE (registry === disk, no drift)',
    registry._meta?.total === diskTotal && registry._meta?.gods?.hephaestus === diskByGod.hephaestus,
    `registry total=${registry._meta?.total} disk total=${diskTotal} hephaestus registry=${registry._meta?.gods?.hephaestus} disk=${diskByGod.hephaestus}`);
  const pyrSrc = read('.opencode/prompts/agents/demigods/hephaestus/image_generator.txt');
  const argSrc = read('.opencode/prompts/agents/demigods/hephaestus/vision_describer.txt');
  const houseSkeleton = (s) => s.includes('## Cognitive Style') && s.includes('## Available Skills') && s.includes('## Quality Gates') && s.includes('## Collaboration Signatures') && s.includes('## Forbidden') && s.includes('## Output Contract');
  expect('B6: image-generator re-skeletoned per the house format (the descriptive rename)',
    houseSkeleton(pyrSrc), 'still ## Your Domain / ## Method — the negative specimen class');
  expect('B6: vision-describer re-skeletoned per the house format (the descriptive rename)',
    houseSkeleton(argSrc), 'still ## Your Domain / ## Method');
  const agentsMd = read('AGENTS.md');
  expect('B6: AGENTS.md census matches the registry (the living number, no drift)',
    agentsMd.includes(`${registry._meta?.total} demigods`) && agentsMd.includes('image-generator, vision-describer, 3d-asset-engineer, 2d-asset-designer | ' + diskByGod.hephaestus + ' |'),
    'the census is stale vs the registry — registry/disk drift is a half-add');

  if (failures > 0) { console.error(`\nimage-gen: ${failures} FAIL`); process.exit(1); }
  console.log('\nimage-gen: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
