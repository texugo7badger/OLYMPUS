#!/usr/bin/env node
/**
 * refresh-free-models.js
 *
 * Fetches the LIVE free-model lists from OpenRouter and NVIDIA Build
 * (build.nvidia.com), scores the free endpoints by capability (context
 * length + model-tier heuristics + recency), and writes the result to
 * ~/.olympus/free-models.json.
 *
 * apply-strategy.js consumes this file when it is fresh (TTL ≤ 24 hours) so
 * the "Free OpenRouter", "Free Big Pickle" and
 * "Free Nvidia Build" strategies always use the most powerful free models
 * available right now — "updated in real time" instead of a hardcoded list
 * that goes stale. (Groq's free tier is NOT included — its 12K TPM window
 * cannot serve the OLYMPUS system prompt, so the free-groq strategy was
 * removed and groq/* models are never offered.)
 *
 * The NVIDIA model list (https://integrate.api.nvidia.com/v1/models) is
 * public — it is fetched unconditionally, no API key needed. The OpenRouter
 * list is fetched when the corresponding key is present.
 *
 * Output shape (~/.olympus/free-models.json):
 *   {
 *     "fetched_at": "2026-07-31T...Z",
 *     "sources": { "openrouter": true, "nvidia": true },
 *     "openrouter": {
 *       "top": [
 *         { "id": "nvidia/nemotron-3-ultra-550b-a55b:free", "context": 1000000,
 *           "output": 2048, "score": 123.4, "created": "2026-06-04", "name": "..." }
 *       ],
 *       "all": [ ... same shape, full free list ... ]
 *     },
 *     "nvidia": { "top": [...], "all": [...] }
 *   }
 *
 * Usage:
 *   node scripts/refresh-free-models.js          # fetch + write
 *   node scripts/refresh-free-models.js --status # show the cached file
 *   node scripts/refresh-free-models.js --force  # ignore TTL, always fetch
 *
 * Keys are read from OpenCode's own auth.json (~/.local/share/opencode or
 * ~/.config/opencode) — the same source apply-strategy.js validates. Never
 * writes keys anywhere.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');
const FREE_MODELS_FILE = path.join(OLYMPUS_HOME, 'free-models.json');
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — the "fresh" window (daily real-time refresh)

const OPENCODE_AUTH_DIRS = [
  path.join(os.homedir(), '.local', 'share', 'opencode'),
  path.join(os.homedir(), '.config', 'opencode'),
];

// Default output caps per provider. opencode 1.18 always sends
// max_tokens=32000; apply-strategy.js writes these per-model limits so a
// single request cannot blow the provider's rate window.
const OUTPUT_CAP_OPENROUTER = 16384; // FIX-2/FIX-3 doctrine: floor 8192, target 16384 (kit ~9,633 tok; the 2048 mouth was #76's root cause)
const OUTPUT_CAP_NVIDIA = 16384;

// Excluded model ids (audio/classifier/embedding/safety/vision endpoints
// that are "free" on the lists but cannot serve OLYMPUS god prompts).
const EXCLUDE_IDS = /(whisper|prompt-guard|content-safety|safeguard|orpheus|allam|tts|embed|rerank|nvclip|riva|parse|reward|guard|safety|vision|vlm|paligemma|deplot|diffusion|kosmos|vila|neva|fuyu|calibration|detector|recurrent|bge|esm|flux|nano-vl|v2-vl)/i;

// NVIDIA's /models endpoint does not report context_length, so we keep a
// curated context map for the known chat models (the flagships get their
// real windows; unknown models default to 131072).
// GAP-1-S3 (2026-10-07): re-verified against the LIVE list
// (https://integrate.api.nvidia.com/v1/models, 80 models) — every id the
// endpoint no longer serves was REMOVED (the glm-5.2 dead key — AN11 — and
// the llama-3.3/deepseek/minimax/mistral-medium/stepfun-era residue), and
// the CURRENT z-ai coding family (glm-5.3 + glm-5.3-flash, both live) was
// ADDED. Unknown ids keep the designed 131072 default.
const NVIDIA_CONTEXT_OVERRIDES = {
  'z-ai/glm-5.3': 1000000,
  'z-ai/glm-5.3-flash': 1000000,
  'nvidia/nemotron-3-ultra-550b-a55b': 1000000,
  'nvidia/nemotron-3-super-120b-a12b': 262144,
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': 256000,
  'nvidia/llama-3.1-nemotron-ultra-253b-v1': 131072,
  'nvidia/llama-3.1-nemotron-70b-instruct': 131072,
  'nvidia/llama-3.1-nemotron-51b-instruct': 131072,
  'nvidia/nemotron-nano-3-30b-a3b': 131072,
  'moonshotai/kimi-k2.6': 131072,
  'openai/gpt-oss-20b': 131072,
  'mistralai/mistral-large': 131072,
  'mistralai/mistral-large-2-instruct': 131072,
  'mistralai/mixtral-8x22b-v0.1': 65536,
  'mistralai/codestral-22b-instruct-v0.1': 32768,
  'google/gemma-4-31b-it': 131072,
  'google/gemma-3-12b-it': 131072,
  'google/gemma-3-4b-it': 131072,
  'google/gemma-2b': 8192,
  'meta/llama2-70b': 4096,
  'meta/codellama-70b': 16384,
  'bigcode/starcoder2-15b': 16384,
  'writer/palmyra-creative-122b': 131072,
  'writer/palmyra-fin-70b-32k': 32768,
  'writer/palmyra-med-70b-32k': 32768,
  'ai21labs/jamba-1.5-large-instruct': 256000,
  '01-ai/yi-large': 131072,
  'databricks/dbrx-instruct': 32768,
  'zyphra/zamba2-7b-instruct': 131072,
  'ibm/granite-34b-code-instruct': 131072,
  'ibm/granite-3.0-8b-instruct': 131072,
  'ibm/granite-3.0-3b-a800m-instruct': 131072,
  'microsoft/phi-3.5-moe-instruct': 131072,
  'poolside/laguna-xs-2.1': 131072,
};

/**
 * Score a free model by how powerful it is for OLYMPUS workloads.
 * Proxies, in order of weight:
 *   1. Context length (bigger window = can hold the full OLYMPUS context;
 *      the 1M-context flagship scores far above the rest).
 *   2. Parameter count from the id (<num>b) — 120b > 70b > 27b > 8b.
 *   3. Tier from the id (ultra/super boost; nano/mini/xs/small penalized).
 *   4. Recency — models released recently are usually stronger per tier.
 */
function scoreModel(m) {
  const ctx = m.context_length || 0;
  let s = Math.min(ctx, 1000000) / 10000; // up to 100 pts
  // Score the RAW id (no provider prefix) so name heuristics match.
  const id = m.rawId || m.id;
  // Params bonus: <num>b in the id → up to 35 pts (120b → 30, 70b → 17.5).
  const paramsMatch = id.match(/(?:^|[\/-])([0-9]+)b/);
  if (paramsMatch) s += Math.min(35, parseInt(paramsMatch[1], 10) / 4);
  // Tier bonuses / penalties.
  if (id.includes('ultra')) s += 40;
  else if (id.includes('super')) s += 25;
  if (id.includes('flash') || id.includes('fast') || id.includes('instant')) s += 5;
  if (/(nano|mini|xs|small|omni|north)/.test(id)) s -= 30;
  // Recency: released recently → up to 15 pts; a year+ old → 0.
  const elapsedYears = (Date.now() / 1000 - (m.created || 0)) / (365 * 24 * 3600);
  s += Math.max(0, 15 * (1 - Math.min(1, elapsedYears)));
  return Math.round(s * 10) / 10;
}

function extractKey(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj.key === 'string') return obj.key;
  if (typeof obj.apiKey === 'string') return obj.apiKey;
  if (typeof obj.token === 'string') return obj.token;
  return '';
}

function readKeys() {
  let openrouter = '';
  let nvidia = '';
  for (const dir of OPENCODE_AUTH_DIRS) {
    const authFile = path.join(dir, 'auth.json');
    if (!fs.existsSync(authFile)) continue;
    try {
      const auth = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
      if (auth.openrouter) openrouter = extractKey(auth.openrouter);
      if (auth.nvidia) nvidia = extractKey(auth.nvidia);
      if (openrouter || nvidia) break;
    } catch {}
  }
  return { openrouter, nvidia };
}

function normalizeModel(m, provider) {
  const cap = provider === 'nvidia' ? OUTPUT_CAP_NVIDIA : OUTPUT_CAP_OPENROUTER;
  // OpenCode resolves models by PROVIDER prefix (openrouter/…,
  // nvidia/…). The provider APIs return bare ids, so we prefix here —
  // apply-strategy.js consumes these ids directly into opencode.json.
  const rawId = m.id;
  const id = provider === 'nvidia' ? `nvidia/${rawId}` : `openrouter/${rawId}`;
  const context = m.context_length || m.context_window || NVIDIA_CONTEXT_OVERRIDES[rawId] || 131072;
  return {
    id,
    rawId,
    context,
    output: cap,
    score: scoreModel({ ...m, rawId, context_length: context }),
    created: m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : null,
    name: m.name || m.id,
  };
}

async function fetchOpenRouter(key) {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`OpenRouter /models HTTP ${res.status}`);
  const data = await res.json();
  const free = (data.data || [])
    .filter(m => typeof m.id === 'string' && m.id.includes(':free'))
    .filter(m => !EXCLUDE_IDS.test(m.id))
    .map(m => normalizeModel(m, 'openrouter'))
    .sort((a, b) => b.score - a.score);
  return free;
}

/**
 * NVIDIA Build free endpoints (build.nvidia.com). The model list is PUBLIC —
 * no API key is required to fetch it. Chat-capable models are scored by the
 * same capability heuristic as OpenRouter (context map + params +
 * recency). A free NVIDIA API key (nvapi-...) is still required at request
 * time — configure it inside OpenCode as the `nvidia` provider.
 */
async function fetchNvidia() {
  const res = await fetch('https://integrate.api.nvidia.com/v1/models');
  if (!res.ok) throw new Error(`NVIDIA /models HTTP ${res.status}`);
  const data = await res.json();
  const free = (data.data || [])
    .filter(m => typeof m.id === 'string')
    .filter(m => !EXCLUDE_IDS.test(m.id))
    .map(m => normalizeModel(m, 'nvidia'))
    .sort((a, b) => b.score - a.score);
  return free;
}

function readCached() {
  try {
    if (!fs.existsSync(FREE_MODELS_FILE)) return null;
    return JSON.parse(fs.readFileSync(FREE_MODELS_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function isFresh(cached) {
  if (!cached || !cached.fetched_at) return false;
  const age = Date.now() - new Date(cached.fetched_at).getTime();
  return age >= 0 && age <= TTL_MS;
}

async function main() {
  const args = process.argv.slice(2);
  const showStatus = args.includes('--status');
  const force = args.includes('--force');

  if (showStatus) {
    const cached = readCached();
    if (!cached) {
      console.log('No ~/.olympus/free-models.json yet — run `node scripts/refresh-free-models.js` to fetch.');
      process.exit(0);
    }
    const fresh = isFresh(cached);
    console.log(`free-models.json: fetched ${cached.fetched_at} (${fresh ? 'FRESH' : 'STALE (>24h)'})`);
    for (const prov of ['openrouter', 'nvidia']) {
      const list = cached[prov]?.top || [];
      console.log(`\n${prov} top models:`);
      if (list.length === 0) console.log('  (none)');
      for (const m of list.slice(0, 6)) {
        console.log(`  ${m.id}  ctx=${m.context}  out=${m.output}  score=${m.score}`);
      }
    }
    process.exit(0);
  }

  const keys = readKeys();
  // The OpenRouter list needs its key; the NVIDIA list is public and is
  // always fetched. Fail only when there is NOTHING to fetch (no keys at
  // all would still fetch NVIDIA).
  if (!keys.openrouter) {
    console.log('No OpenRouter key found in OpenCode auth.json — only the public NVIDIA model list will be refreshed.');
    console.log('  Configure OpenRouter inside OpenCode to include it:');
    console.log('  olympus opencode  →  Settings  →  add OpenRouter as a provider');
  }

  // Respect the TTL unless --force.
  const cached = readCached();
  if (!force && isFresh(cached)) {
    console.log(`free-models.json is fresh (fetched ${cached.fetched_at}) — skipping. Use --force to refetch.`);
    process.exit(0);
  }

  const result = { fetched_at: new Date().toISOString(), sources: { openrouter: false, nvidia: false } };
  const errors = [];

  if (keys.openrouter) {
    try {
      const list = await fetchOpenRouter(keys.openrouter);
      result.openrouter = { top: list.slice(0, 10), all: list };
      result.sources.openrouter = true;
      console.log(`OpenRouter: ${list.length} free chat models fetched`);
      for (const m of list.slice(0, 5)) {
        console.log(`  #${list.indexOf(m) + 1} ${m.id}  (ctx ${m.context}, score ${m.score})`);
      }
    } catch (e) {
      errors.push(`OpenRouter: ${e.message}`);
    }
  }

  try {
    const list = await fetchNvidia();
    result.nvidia = { top: list.slice(0, 10), all: list };
    result.sources.nvidia = true;
    console.log(`NVIDIA Build: ${list.length} chat models fetched (public list)`);
    for (const m of list.slice(0, 5)) {
      console.log(`  #${list.indexOf(m) + 1} ${m.id}  (ctx ${m.context}, score ${m.score})`);
    }
  } catch (e) {
    errors.push(`NVIDIA: ${e.message}`);
  }

  if (!result.sources.openrouter && !result.sources.nvidia) {
    console.error(`All providers failed:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }

  if (!fs.existsSync(OLYMPUS_HOME)) fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
  fs.writeFileSync(FREE_MODELS_FILE, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\nWrote ${FREE_MODELS_FILE}`);
  if (errors.length > 0) {
    console.warn(`Warnings (kept previous data for the failed provider? no — omitted):\n  ${errors.join('\n  ')}`);
  }
}

main().catch(e => {
  console.error(`refresh-free-models: ${e.message}`);
  process.exit(1);
});
