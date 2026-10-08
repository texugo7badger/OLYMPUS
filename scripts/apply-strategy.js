#!/usr/bin/env node
/**
 * Olympus Strategy Applier v2 — Config-Aware Edition
 *
 * The runtime model-router AND config-shape manager. Reads the active
 * strategy from ~/.olympus/llm-providers.json (or --strategy flag),
 * looks up the per-god model map, and rewrites opencode.json to match
 * the strategy's requirements:
 *
 *   GO-plan strategies (go-balanced, go-budget, go-max-quality, custom-*):
 *     - All 128 agents present (10 gods + 118 demigods merged from
 *       opencode.demigods.json)
 *     - God prompts use {file:...} references (full prompt fidelity)
 *     - Plugin array includes all local plugins (no npm packages)
 *     - Empty instructions array
 *     - All gods + demigods get their strategy-appropriate model
 *
 *   Zen strategies (zen-max-quality, zen-balanced, zen-budget [Zen]):
 *     - Same full shape as GO (128 agents, file-ref prompts, 8 plugins) —
 *       Zen is pay-as-you-go with no request caps — but models use the
 *       opencode/<id> prefix (OpenCode Zen) instead of opencode-go/<id>.
 *
 *   Free-tier strategies (free-openrouter, free-big-pickle
 *   [Free Big Pickle], free-nvidia-build [Free Nvidia Build]):
 *     - Only 10 gods present (demigods removed)
 *     - God prompts inlined and truncated (OpenRouter/NVIDIA: 1000 chars,
 *       keeping each request inside the provider's free rate window)
 *     - Plugin array trimmed to the minimum (overlay + router + cache, no
 *       skill registry, no dynamic context — they require skill files)
 *     - Single short instruction string
 *     - All gods on free-tier models (openrouter/ or nvidia/) — when
 *       ~/.olympus/free-models.json is fresh (≤ 7 days), the CURRENT top
 *       free models from the live provider lists (OpenRouter +
 *       NVIDIA Build) are used instead of the curated defaults
 *
 * BACKUP / RESTORE:
 *   Before any modification, the current opencode.json is backed up to
 *   ~/.olympus/backups/opencode.json.<timestamp>.bak. The most recent 10
 *   backups are kept; older ones are pruned.
 *
 *   `--restore` restores the most recent backup.
 *   `--restore <path>` restores from a specific backup file.
 *
 * STATE FILE:
 *   After applying a strategy, writes ~/.olympus/active-strategy.json:
 *     {
 *       "strategy": "go-balanced",
 *       "applied_at": "2026-07-31T...",
 *       "agent_count": 128,
 *       "god_prompts": "file_refs",  // or "inlined"
 *       "demigods_loaded": true,
 *       "plugins_enabled": 8,
 *       "backup_path": "~/.olympus/backups/opencode.json.20260731T...bak"
 *     }
 *
 *   opencode-spawn.ts reads this file before spawning opencode to verify
 *   the config matches the expected strategy. If the config has drifted
 *   (e.g. user manually edited opencode.json), spawn logs a warning.
 *
 * USAGE:
 *   node scripts/apply-strategy.js [--strategy <id>] [--impeccable]
 *                                  [--restore [path]]
 *                                  [--status] [--list-backups]
 *                                  [--dry-run] [--keep-overrides]
 *
 * If --strategy is omitted, reads from ~/.olympus/llm-providers.json.
 * Defaults to go-balanced if no config found.
 *
 * The script is idempotent: running twice with the same strategy is a no-op
 * (changes=0, exit 0).
 *
 * Exit codes:
 *   0 — success (strategy applied, restored, or no-op)
 *   1 — error (config not found, invalid strategy, write failure)
 *   2 — restore requested but no backup found
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Paths ----------------------------------------------------------------
const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();
const OPENCODE_JSON = path.join(OLYMPUS_ROOT, 'opencode.json');
const DEMIGODS_JSON = path.join(OLYMPUS_ROOT, 'opencode.demigods.json');
// MADRUGA-3 p1: OLYMPUS_HOME is env-overridable so bench lanes and fixtures
// isolate their state (backups, active-strategy, free-models, custom
// strategies) instead of sharing — and mutating — the operator's real
// ~/.olympus. Default unchanged.
const OLYMPUS_HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const PROVIDERS_FILE = path.join(OLYMPUS_HOME, 'llm-providers.json');
const CUSTOM_STRATEGIES_FILE = path.join(OLYMPUS_HOME, 'custom-strategies.json');
const BACKUP_DIR = path.join(OLYMPUS_HOME, 'backups');
const STATE_FILE = path.join(OLYMPUS_HOME, 'active-strategy.json');
const MAX_BACKUPS = 10;

// OpenCode 1.18+ auth file — stores provider keys (both GO and free).
// opencode's auth.json location — the same resolution opencode itself uses
// ($XDG_DATA_HOME/opencode, falling back to ~/.local/share/opencode) plus
// the legacy ~/.config/opencode path. Test fixtures redirect auth access
// via XDG_DATA_HOME (the same override opencode honors).
const OPENCODE_AUTH_DIRS = [
  path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'opencode'),
  path.join(os.homedir(), '.config', 'opencode'),
];

// --- Free model refresh (live provider lists) ----------------------------
// scripts/refresh-free-models.js fetches the CURRENT free model lists from
// OpenRouter + NVIDIA Build and writes ~/.olympus/free-models.json.
// When that file is fresh (≤ 24 hours), the Free OpenRouter /
// Free Big Pickle / Free Nvidia Build strategies route gods to the most
// powerful free models available RIGHT NOW instead of a hardcoded list that
// goes stale. The curated defaults below remain the offline fallback.
const FREE_MODELS_FILE = path.join(OLYMPUS_HOME, 'free-models.json');

// Issue #56 (BATCH 12d): set by --force in main() BEFORE any model-map build;
// consulted by getModelMap's free-openrouter gate and main's validation catch.
let FORCE_FREE_APPLY = false;
const FREE_MODELS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadFreeModelsRefresh() {
  try {
    if (!fs.existsSync(FREE_MODELS_FILE)) return null;
    const cached = JSON.parse(fs.readFileSync(FREE_MODELS_FILE, 'utf-8'));
    if (!cached || !cached.fetched_at) return null;
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < 0 || age > FREE_MODELS_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

// OpenCode resolves models by provider prefix (openrouter/…, nvidia/…). The
// refresh file stores prefixed ids, but guard anyway in case it was written
// by an older version of the refresh script.
function normalizeLiveId(id) {
  if (!id) return '';
  return id.startsWith('openrouter/') || id.startsWith('nvidia/') ? id : `openrouter/${id}`;
}

// Resolved once at module load (must stay before BUILTIN_STRATEGIES — TDZ).
const FREE_MODELS_REFRESH = loadFreeModelsRefresh();

// "Free: Big Pickle" — every god on ONE model. Defaults to the strongest
// free model currently live (refresh file) or the verified curated default
// (nvidia/nemotron-3-ultra-550b-a55b:free — 550B params, 1M context, verified
// HTTP 200 on 2026-07-31). Override with OLYMPUS_BIG_PICKLE_MODEL.
// NOTE: module-load value (used by BUILTIN_STRATEGIES + the sync checker);
// getBigPickleModel() re-resolves at apply time so --refresh-models picks up
// a newly released flagship in the same run.
const FREE_BIG_PICKLE_MODEL =
  process.env.OLYMPUS_BIG_PICKLE_MODEL ||
  normalizeLiveId(FREE_MODELS_REFRESH?.openrouter?.top?.[0]?.id) ||
  'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free';

function getBigPickleModel() {
  if (process.env.OLYMPUS_BIG_PICKLE_MODEL) return process.env.OLYMPUS_BIG_PICKLE_MODEL;
  const live = normalizeLiveId(loadFreeModelsRefresh()?.openrouter?.top?.[0]?.id);
  return live || 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free';
}

const BUILTIN_STRATEGIES = {
  'go-max-quality': {
    apollo:       'opencode-go/glm-5.3',
    atlas:        'opencode-go/hy3',
    artemis:      'opencode-go/glm-5.3',
    athena:       'opencode-go/glm-5.3-flash',
    dionysus:     'opencode-go/glm-5.3-flash',
    hephaestus:   'opencode-go/kimi-k2.7-code',
    hermes:       'opencode-go/kimi-k2.7-code',
    persephone:   'opencode-go/glm-5.3-flash',
    prometheus:   'opencode-go/minimax-m3',
    callimachus:  'opencode-go/glm-5.3-flash',
  },
  'go-balanced': {
    apollo:       'opencode-go/glm-5.3-flash',
    atlas:        'opencode-go/hy3',
    artemis:      'opencode-go/glm-5.3-flash',
    athena:       'opencode-go/qwen3.7-plus',
    dionysus:     'opencode-go/glm-5.3-flash',
    hephaestus:   'opencode-go/kimi-k2.7-code',
    hermes:       'opencode-go/kimi-k2.7-code',
    persephone:   'opencode-go/qwen3.7-plus',
    prometheus:   'opencode-go/minimax-m3',
    callimachus:  'opencode-go/glm-5.3-flash',
  },
  'go-budget': {
    apollo:       'opencode-go/glm-5.3-flash',
    atlas:        'opencode-go/hy3',
    artemis:      'opencode-go/glm-5.3-flash',
    athena:       'opencode-go/glm-5.3-flash',
    dionysus:     'opencode-go/glm-5.3-flash',
    hephaestus:   'opencode-go/glm-5.3-flash',
    hermes:       'opencode-go/glm-5.3-flash',
    persephone:   'opencode-go/glm-5.3-flash',
    prometheus:   'opencode-go/glm-5.3-flash',
    callimachus:  'opencode-go/glm-5.3-flash',
  },
  // ZEN Max Quality — frontier proprietary APIs on OpenCode Zen (opencode/<id>).
  // Apollo stays on GLM-5.3 (sacred); Atlas uses GPT 6 Sol for orchestration
  // (Hy3 is GO-only); Hephaestus + Artemis + Hermes get Claude Sonnet 5
  // (best-in-class coding); Athena GPT 5.6 Terra; Dionysus GPT 5.6 Luna;
  // Persephone Gemini 3.1 Pro; Prometheus Grok Build 0.1; Callimachus
  // Claude Haiku 4.5; vault GLM-5.3. NOTE: OpenAI/Anthropic requests are
  // retained 30 days (zero-retention open models are on GO).
  // Mirrors zen-max-quality in src/lib/model-strategies.ts (check-strategy-sync).
  'zen-max-quality': {
    apollo:       'opencode/glm-5.3',
    atlas:        'opencode/gpt-6-sol',
    artemis:      'opencode/claude-sonnet-5',
    athena:       'opencode/gpt-5.6-terra',
    dionysus:     'opencode/gpt-5.6-luna',
    hephaestus:   'opencode/claude-sonnet-5',
    hermes:       'opencode/claude-sonnet-5',
    persephone:   'opencode/gemini-3.1-pro',
    prometheus:   'opencode/grok-build-0.1',
    callimachus:  'opencode/claude-haiku-4-5',
  },
  // ZEN — full 128-agent OLYMPUS on OpenCode Zen (pay-as-you-go, no request
  // caps) built around proprietary APIs — the whole point of Zen vs the GO
  // plan's open-weight line. Model ids use the opencode/<id> prefix (the Zen
  // provider), distinct from the GO plan's opencode-go/<id>. Apollo stays on
  // GLM-5.3 (sacred; $1.40/$4.40 per 1M). Atlas uses GPT 6 Sol (Hy3 is
  // GO-only). Hephaestus + Artemis get Claude Sonnet 5; Athena GPT 5.6 Terra;
  // Dionysus GPT 5.6 Luna; Hermes GPT 5.4 Mini; Persephone Gemini 3.1 Pro;
  // Prometheus Grok Build 0.1; Callimachus Claude Haiku 4.5; vault
  // GLM-5.3-Flash.
  // Mirrors zen-balanced in src/lib/model-strategies.ts (check-strategy-sync).
  'zen-balanced': {
    apollo:       'opencode/glm-5.3',
    atlas:        'opencode/gpt-6-sol',
    artemis:      'opencode/claude-sonnet-5',
    athena:       'opencode/gpt-5.6-terra',
    dionysus:     'opencode/gpt-5.6-luna',
    hephaestus:   'opencode/claude-sonnet-5',
    hermes:       'opencode/gpt-5.4-mini',
    persephone:   'opencode/gemini-3.1-pro',
    prometheus:   'opencode/grok-build-0.1',
    callimachus:  'opencode/claude-haiku-4-5',
  },
  // ZEN Budget — lowest cost on OpenCode Zen, still proprietary. Apollo stays
  // on GLM-5.3 (sacred); Atlas uses GPT 6 Luna for orchestration; everything
  // else drops to GLM-5.3-Flash ($0.15/$0.50 per 1M — the cheapest workhorse
  // class on Zen); Callimachus Claude Haiku 4.5.
  // Mirrors zen-budget in src/lib/model-strategies.ts (check-strategy-sync).
  'zen-budget': {
    apollo:       'opencode/glm-5.3',
    atlas:        'opencode/gpt-6-luna',
    artemis:      'opencode/glm-5.3-flash',
    athena:       'opencode/glm-5.3-flash',
    dionysus:     'opencode/glm-5.3-flash',
    hephaestus:   'opencode/glm-5.3-flash',
    hermes:       'opencode/glm-5.3-flash',
    persephone:   'opencode/glm-5.3-flash',
    prometheus:   'opencode/glm-5.3-flash',
    callimachus:  'opencode/claude-haiku-4-5',
  },
  // Free Big Pickle — every god on a single model. Defaults to the
  // strongest free model currently live (refresh file) or the verified
  // curated default; override with OLYMPUS_BIG_PICKLE_MODEL. Callimachus
  // gets the SAME best model as every other god (the user explicitly asked
  // for the best possible configuration for all 10 gods).
  'free-big-pickle': {
    apollo:       FREE_BIG_PICKLE_MODEL,
    atlas:        FREE_BIG_PICKLE_MODEL,
    artemis:      FREE_BIG_PICKLE_MODEL,
    athena:       FREE_BIG_PICKLE_MODEL,
    dionysus:     FREE_BIG_PICKLE_MODEL,
    hephaestus:   FREE_BIG_PICKLE_MODEL,
    hermes:       FREE_BIG_PICKLE_MODEL,
    persephone:   FREE_BIG_PICKLE_MODEL,
    prometheus:   FREE_BIG_PICKLE_MODEL,
    callimachus:  FREE_BIG_PICKLE_MODEL,
  },
  // Free OpenRouter — the OpenRouter-only split: primary trio on the
  // strongest OpenRouter free model live right now, specialists
  // on the second-strongest, Callimachus on a fast background model (Nemotron
  // nano). When the refresh file is fresh, getModelMap() routes gods to the
  // CURRENT top models from the live OpenRouter list.
  // Mirrors free-openrouter in src/lib/model-strategies.ts (check-strategy-sync).
  'free-openrouter': {
    apollo:       'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    atlas:        'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    artemis:      'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    athena:       'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    dionysus:     'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    hephaestus:   'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    hermes:       'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    persephone:   'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    prometheus:   'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    callimachus:  'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
  },
  // Free Nvidia Build — THE DISTRIBUTED PANTHEON (#106, MADRUGA-FREE-1).
  // The user's directive: the maximum of the NVIDIA free catalog with
  // DIFFERENT model lanes per god, sharing context through Symphony. NO
  // Nemotron (the user's ban: low effective context + the observed
  // contention pool behind "Service temporarily overloaded"). The old
  // shape — apollo+atlas on nemotron-3-ultra, 7 gods on one glm-5.3 pool —
  // was the single point of failure.
  //
  // The distribution law (asserted by scripts/free-pantheon.test.mjs):
  // every god on exactly ONE family-prefixed anchor; the three heavy paths
  // (apollo entry / athena frontend-kit / hephaestus build) on three
  // DISTINCT pools; callimachus + vaultLlm on the flash lane (volume, not
  // depth); <=3 gods per anchor; every assigned id probe-verified live
  // (2026-10-08 — glm-5.3 200/834ms, glm-5.3-flash 200, kimi-k3 200/1181ms,
  // muse-glimmer-30b 200/1963ms; deepseek-v4.1-flash DEAD ×3 timeouts —
  // EXCLUDED, its family entry stays for the pinned set with zero gods).
  //
  // Model ids are family-prefixed (nvidia-glm/<vendor>/<model> etc.) — one
  // client pool per family (NVIDIA_FAMILY_PROVIDERS below writes the
  // provider entries; the auth mirror copies the user's nvapi-... key to
  // each family id in auth.json). Mirrors free-nvidia-build in
  // src/lib/model-strategies.ts (check-strategy-sync).
  'free-nvidia-build': {
    apollo:       'nvidia-glm/z-ai/glm-5.3',
    atlas:        'nvidia-glm/z-ai/glm-5.3-flash',
    artemis:      'nvidia-kimi/moonshotai/kimi-k3',
    athena:       'nvidia-glm/z-ai/glm-5.3-flash',
    dionysus:     'nvidia-glm/z-ai/glm-5.3',
    hephaestus:   'nvidia-kimi/moonshotai/kimi-k3',
    hermes:       'nvidia-meta/meta/muse-glimmer-30b',
    persephone:   'nvidia-glm/z-ai/glm-5.3',
    prometheus:   'nvidia-kimi/moonshotai/kimi-k3',
    callimachus:  'nvidia-glm/z-ai/glm-5.3-flash',
  },
};

const SMALL_MODEL_GO = 'opencode-go/glm-5.3-flash';
// Zen (pay-as-you-go) uses the same Flash class for background tasks —
// opencode/deepseek-v4-flash costs $0.14/$0.28 per 1M tokens on Zen.
const SMALL_MODEL_ZEN = 'opencode/deepseek-v4-flash';
// small_model runs title generation + compaction. A cheap OpenRouter free
// model keeps those background calls off the flagship's shared pool.
const SMALL_MODEL_FREE = 'openrouter/nvidia/nemotron-3-nano-30b-a3b:free';
// #106: free-nvidia-build's small_model rides the strategy's own FAST lane
// (GLM 5.3 Flash via the nvidia-glm family entry) — volume work (titles,
// compaction) on the volume lane, zero Nemotron (the user's ban covers the
// whole family), zero cross-provider key requirements.
export const SMALL_MODEL_FREE_NVIDIA = 'nvidia-glm/z-ai/glm-5.3-flash';

// Verified live free models with per-model output budgets. DOCTRINE
// (MADRUGA-FIX-3, superseding the old 2048 rate-window caps): the 2048
// mouth was the #76 root cause — a complete landing kit measures ~9,633
// output tokens (FIX-1 F4 evidence) and turns died mid-kit at ~2,039 with
// reason:'length' BY CONFIGURATION. The FIX-2 sizing doctrine now governs:
// floor 8192, target 16384 (2x kit + margin), enforced by
// scripts/budget-guard.test.mjs (the guard, never the apply's self-report).
// Free-tier protection now lives in REQUEST DISCIPLINE (the driver's
// single-turn contract + the exit gate) — NOT the output mouth.
// Models discovered by the live refresh are merged in at runtime by
// getFreeModelLimits(); curated entries win when both exist.
const FREE_MODEL_LIMITS = {
  'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free': { context: 1000000, output: 16384 },
  'openrouter/nvidia/nemotron-3-super-120b-a12b:free': { context: 262144, output: 16384 },
  'openrouter/inclusionai/ling-3.0-flash:free': { context: 262144, output: 16384 },
  'openrouter/google/gemma-4-31b-it:free': { context: 262144, output: 16384 },
  'openrouter/google/gemma-4-26b-a4b-it:free': { context: 262144, output: 16384 },
  'openrouter/poolside/laguna-s-2.1:free': { context: 262144, output: 16384 },
  'openrouter/openai/gpt-oss-20b:free': { context: 131072, output: 16384 },
  'openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': { context: 256000, output: 16384 },
  'openrouter/poolside/laguna-xs-2.1:free': { context: 262144, output: 16384 },
  'openrouter/cohere/north-mini-code:free': { context: 256000, output: 16384 },
  'openrouter/nvidia/nemotron-3-nano-30b-a3b:free': { context: 256000, output: 16384 },
  // NVIDIA Build free endpoints — the DISTRIBUTED PANTHEON's anchor lanes
  // (#106): family-prefixed ids (one client pool per family). The
  // /models API does not report context_length — these are the LIVE MODEL
  // CARD windows, verified 2026-10-08 (E8 record:
  // reports/free-1/s0/E8-LIVE-MODEL-VERIFICATION.md): kimi-k3 1,048,576
  // (build.nvidia.com/moonshotai/kimi-k3), muse-glimmer-30b 131,072
  // (build.nvidia.com/meta/muse-glimmer-30b) — never inflated. The old
  // single-provider nvidia/* lanes (the nemotron pool era) are GONE.
  'nvidia-glm/z-ai/glm-5.3': { context: 1000000, output: 16384 },
  'nvidia-glm/z-ai/glm-5.3-flash': { context: 1000000, output: 16384 },
  'nvidia-kimi/moonshotai/kimi-k3': { context: 1048576, output: 16384 },
  'nvidia-meta/meta/muse-glimmer-30b': { context: 131072, output: 16384 },
  'nvidia-deepseek/deepseek-ai/deepseek-v4.1-flash': { context: 1000000, output: 16384 },
};

/**
 * #106 — the provider split: per-family provider entries for the NVIDIA
 * Build free tier. Same base URL, same key (the auth mirror below copies the
 * user's `nvidia` auth.json key to each family id — the standard /connect
 * flow's storage). Each family carries ONLY its family's models: per-god
 * client pools + independent retry/backoff state + a config that EXPRESSES
 * the doctrine. Empirically verified end-to-end 2026-10-08 (a scratch
 * config dispatched nvidia-glm/z-ai/glm-5.3 "OK" through exactly this
 * shape — npm @ai-sdk/openai-compatible + options.baseURL + auth.json key).
 *
 * The deepseek family entry stays in the pinned anchor set but carries ZERO
 * gods tonight — the pool was dead at the E8 probe (3× timeouts, disclosed).
 */
export const NVIDIA_FAMILY_PROVIDERS = {
  'nvidia-glm': {
    name: 'NVIDIA Build — GLM family lane',
    npm: '@ai-sdk/openai-compatible',
    options: { baseURL: 'https://integrate.api.nvidia.com/v1' },
    models: {
      'z-ai/glm-5.3': {
        name: 'GLM 5.3 (753B reasoner — the entry lane)',
        limit: { context: 1000000, output: 16384 },
        reasoning: true,
        tool_call: true,
      },
      'z-ai/glm-5.3-flash': {
        name: 'GLM 5.3 Flash (fast multimodal — the volume lane)',
        limit: { context: 1000000, output: 16384 },
        reasoning: true,
        tool_call: true,
      },
    },
  },
  'nvidia-deepseek': {
    name: 'NVIDIA Build — DeepSeek family lane (pinned anchor; pool dead at the 2026-10-08 probe — zero gods until it recovers)',
    npm: '@ai-sdk/openai-compatible',
    options: { baseURL: 'https://integrate.api.nvidia.com/v1' },
    models: {
      'deepseek-ai/deepseek-v4.1-flash': {
        name: 'DeepSeek V4.1 Flash (552B MoE, 8B active)',
        limit: { context: 1000000, output: 16384 },
        reasoning: true,
        tool_call: true,
      },
    },
  },
  'nvidia-kimi': {
    name: 'NVIDIA Build — Kimi family lane (long-horizon coding)',
    npm: '@ai-sdk/openai-compatible',
    options: { baseURL: 'https://integrate.api.nvidia.com/v1' },
    models: {
      'moonshotai/kimi-k3': {
        name: 'Kimi K3 (2.8T MoE, 104B active, agentic)',
        limit: { context: 1048576, output: 16384 },
        reasoning: true,
        tool_call: true,
      },
    },
  },
  'nvidia-meta': {
    name: 'NVIDIA Build — Meta family lane (the alternate fast)',
    npm: '@ai-sdk/openai-compatible',
    options: { baseURL: 'https://integrate.api.nvidia.com/v1' },
    models: {
      'meta/muse-glimmer-30b': {
        name: 'Muse Glimmer 30B (multimodal reasoning, tool-calling)',
        limit: { context: 131072, output: 16384 },
        reasoning: true,
        tool_call: true,
      },
    },
  },
};

/**
 * The per-model output/context caps to enforce — curated FREE_MODEL_LIMITS
 * plus any models discovered by the live refresh. Refreshed models carry
 * their own context/output from the provider's list; curated entries win
 * when both exist (they are the verified values).
 *
 * #106: the nvidia refresh list merges ONLY under family prefixes for the
 * four pinned families (z-ai → nvidia-glm, moonshotai → nvidia-kimi,
 * meta → nvidia-meta, deepseek-ai → nvidia-deepseek) and never widens the
 * pinnable set beyond a pinned family's lanes — the anchor set is
 * USER-PINNED; the refresh serves the distribution, never overrides it.
 * The old plain `nvidia/<vendor>/<model>` merge is gone with the old pool.
 */
const NVIDIA_FAMILY_BY_VENDOR = {
  'z-ai': 'nvidia-glm',
  'moonshotai': 'nvidia-kimi',
  'meta': 'nvidia-meta',
  'deepseek-ai': 'nvidia-deepseek',
};
function getFreeModelLimits() {
  const limits = { ...FREE_MODEL_LIMITS };
  const refresh = loadFreeModelsRefresh();
  if (refresh) {
    for (const prov of ['openrouter', 'nvidia']) {
      const list = refresh[prov]?.all || refresh[prov]?.top || [];
      for (const m of list) {
        if (!m || !m.id) continue;
        let fullId = m.id;
        if (prov === 'nvidia') {
          const vendor = m.id.split('/')[0];
          const family = NVIDIA_FAMILY_BY_VENDOR[vendor];
          if (!family) continue; // not a pinned family — the anchor set is user-pinned
          fullId = `${family}/${m.id}`;
        }
        if (!limits[fullId]) {
          limits[fullId] = { context: m.context || 131072, output: m.output || 1024 };
        }
      }
    }
  }
  return limits;
}

// Models a user may legitimately pin per-god from the Settings dialog.
// Curated list + any live-refreshed free models (so a fresh model the user
// pinned is not dropped as "unknown").
const KNOWN_FREE_MODELS = new Set([
  ...Object.keys(FREE_MODEL_LIMITS),
  ...Object.entries(getFreeModelLimits())
    .filter(([id]) => id.startsWith('openrouter/')
      || /^(nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta|nvidia)\//.test(id))
    .map(([id]) => id),
]);
const KNOWN_GO_MODELS = new Set([
  'opencode-go/hy3', 'opencode-go/glm-5.3', 'opencode-go/glm-5.3-flash',
  'opencode-go/glm-5.2', 'opencode-go/kimi-k3', 'opencode-go/kimi-k2.7-code',
  'opencode-go/kimi-k2.6', 'opencode-go/deepseek-v4.1-flash',
  'opencode-go/deepseek-v4-pro', 'opencode-go/deepseek-v4-flash',
  'opencode-go/qwen3.8-max', 'opencode-go/qwen3.8-flash',
  'opencode-go/qwen3.7-plus', 'opencode-go/mimo-v2.6-flash',
  'opencode-go/mimo-v2.6-pro', 'opencode-go/mimo-v2.5',
  'opencode-go/grok-4.7', 'opencode-go/grok-4.6', 'opencode-go/grok-4.5',
  'opencode-go/minimax-m3', 'opencode-go/minimax-m2.7',
  'opencode-go/gpt-6-luna', 'opencode-go/gpt-5.6-luna',
  'opencode-go/longcat-2.0',
]);
// Models a user may legitimately pin per-god while on the Zen strategy
// (opencode/<id> — OpenCode Zen). Mirrors ZEN_MODEL_CLASSES in
// src/lib/model-strategies.ts (the full live catalog, deprecated models
// excluded — verified 2026-09-28).
const KNOWN_ZEN_MODELS = new Set([
  // OpenAI (proprietary — 30-day retention).
  'opencode/gpt-6-astra', 'opencode/gpt-6-sol', 'opencode/gpt-6-luna',
  'opencode/gpt-5.6-sol', 'opencode/gpt-5.6-terra', 'opencode/gpt-5.6-luna',
  'opencode/gpt-5.5', 'opencode/gpt-5.5-pro', 'opencode/gpt-5.4',
  'opencode/gpt-5.4-pro', 'opencode/gpt-5.4-mini', 'opencode/gpt-5.4-nano',
  'opencode/gpt-5.3-codex', 'opencode/gpt-5.3-codex-spark',
  'opencode/gpt-5.2', 'opencode/gpt-5.1', 'opencode/gpt-5',
  'opencode/gpt-5-nano',
  // Anthropic (proprietary — 30-day retention).
  'opencode/claude-fable-5-1', 'opencode/claude-fable-5',
  'opencode/claude-opus-5-5', 'opencode/claude-opus-5',
  'opencode/claude-opus-4-8', 'opencode/claude-opus-4-7',
  'opencode/claude-opus-4-6', 'opencode/claude-opus-4-5',
  'opencode/claude-sonnet-5', 'opencode/claude-sonnet-4-6',
  'opencode/claude-sonnet-4-5', 'opencode/claude-haiku-4-5',
  // Google (proprietary).
  'opencode/gemini-3.8-flash', 'opencode/gemini-3.7-flash',
  'opencode/gemini-3.6-flash', 'opencode/gemini-3.5-flash',
  'opencode/gemini-3.5-flash-lite', 'opencode/gemini-3.1-pro',
  'opencode/gemini-3-flash',
  // xAI (proprietary).
  'opencode/grok-4.7', 'opencode/grok-4.6', 'opencode/grok-4.5',
  'opencode/grok-build-0.1',
  // Meta (proprietary).
  'opencode/muse-spark-1.3', 'opencode/muse-spark-1.2',
  // Alibaba (proprietary hosted — Qwen-Max/Plus line).
  'opencode/qwen3.8-max', 'opencode/qwen3.8-flash',
  'opencode/qwen3.7-max', 'opencode/qwen3.7-plus',
  'opencode/qwen3.6-plus', 'opencode/qwen3.5-plus',
  // Moonshot (proprietary).
  'opencode/kimi-k3', 'opencode/kimi-k2.7-code', 'opencode/kimi-k2.6',
  // MiniMax (proprietary).
  'opencode/minimax-m3', 'opencode/minimax-m2.7',
  // Open-weight models on Zen (also the GO-plan families).
  'opencode/glm-5.3-flash', 'opencode/glm-5.3', 'opencode/glm-5.2',
  'opencode/glm-5.1', 'opencode/deepseek-v4.1-flash',
  'opencode/deepseek-v4-pro', 'opencode/deepseek-v4-flash',
  'opencode/deepseek-v4-flash-vision-exp',
  // Free-on-Zen trial models.
  'opencode/big-pickle', 'opencode/space-bunny-free',
  'opencode/longcat-2.5-preview-free', 'opencode/mimo-v2.6-flash-free',
  'opencode/mimo-v2.5-free', 'opencode/ling-3.0-flash-fin-free',
  'opencode/nemotron-3-ultra-free', 'opencode/nemotron-3.5-lightning-free',
  'opencode/muse-spark-1.3-contributor-free',
]);

// --- The 10 canonical Olympus god IDs --------------------------------------
const GOD_IDS = new Set([
  'apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus',
  'hermes', 'persephone', 'prometheus', 'callimachus',
]);
const GOD_NAMES_LIST = [...GOD_IDS];

// --- Demigod model inheritance rules (GO-plan only) ------------------------
const SIMPLE_FLASH_DEMIGODS = new Set([
  'evidence-collector', 'researcher', 'finops-analyst', 'secrets-scanner',
  'instinct-curator', 'brain-backup', 'brain-restore', 'docs-verifier',
  'pattern-extractor', 'skill-indexer',
]);

const APOLLO_REASONING_DEMIGODS = new Set([
  'planner', 'architect', 'spec-author', 'demigod-author',
  'risk-assessor', 'scope-gatekeeper', 'rapid-prototyper', 'spec-miner',
]);

const ATHENA_IMPECCABLE_UPGRADE_DEMIGODS = new Set([
  'frontend-reviewer', 'ui-designer', 'visual-verifier',
]);

// --- Config shape presets --------------------------------------------------
//
// The "config shape" is the structural state of opencode.json — which
// fields are present, how many agents, whether prompts are inlined, etc.
// The shape is independent of the model map; both must be applied together
// for the strategy to work correctly.

const GO_CONFIG_SHAPE = {
  // Full OLYMPUS experience. All 128 agents, full prompts, all plugins.
  agent_count: 128,
  god_prompts: 'file_refs',     // {file:.opencode/prompts/agents/gods/<god>.txt}
  demigods_loaded: true,
  plugins: [
    './.opencode/plugins',
    './.opencode/plugins/superpowers.js',
    './.opencode/olympus',
    './.opencode/plugins/olympus-router',
    './.opencode/plugins/olympus-go-cache',
    './.opencode/plugins/olympus-skill-registry',
    './.opencode/plugins/opencode-context-cache.mjs',
    './.opencode/plugins/olympus-dynamic-context',
  ],
  instructions: [],
  // small_model is GO Flash for background tasks (compaction, summarization).
  small_model: SMALL_MODEL_GO,
};

const FREE_CONFIG_SHAPE = {
  // Minimal config for the free-tier providers (OpenRouter / NVIDIA Build).
  // - 10 gods only (no demigods — gods dispatch via Symphony without
  //   needing demigod agents pre-loaded in opencode.json)
  // - God prompts inlined and truncated to 1000 chars (keeps the request
  //   inside each provider's free rate window)
  // - Plugins trimmed to cache + router (skill registry needs skill files
  //   which would push us over the free-tier token budget)
  // - Single short instruction string
  agent_count: 10,
  god_prompts: 'inlined_truncated',  // truncate to 1000 chars
  demigods_loaded: false,
  // L1 (MADRUGA-3): the OLYMPUS overlay tools granted to every god by the
  // generator — structurally, not by patch. MADRUGA-2 D9: the free configs
  // omitted olympus-dispatch entirely, so gods could not delegate under
  // free strategies (the D5 zero-dispatch root cause). Every god gets the
  // full overlay set; demigod auto-injection handles the rest at dispatch
  // time.
  olympus_tools: [
    'olympus-dispatch',
    'olympus-instinct-query',
    'olympus-shortcircuit',
    'olympus-patterns',
    'sub-agent-instinct-query',
    'symphony-resonate',
    'symphony-harmonize',
    'symphony-decode',
    'olympus-design-review',
    'olympus-deploy-review',
    'olympus-integration-review',
  ],
  // Keep olympus-router (MCP gate) + olympus-go-cache (avoid duplicate
  // fetches). The overlay (./.opencode/olympus) MUST stay — it's the only
  // writer of ~/.olympus/metrics/cost.jsonl (tool.execute.after + event
  // hooks), so without it the Cost screen and status bar show no token
  // usage during free sessions. Drop skill-registry + dynamic-context
  // (they read skill files at startup which would blow the token budget).
  plugins: [
    './.opencode/olympus',
    './.opencode/plugins/olympus-router',
    './.opencode/plugins/olympus-go-cache',
    './.opencode/plugins/opencode-context-cache.mjs',
  ],
  instructions: [
    'You are running OLYMPUS in free-tier mode (OpenRouter/NVIDIA Build). ' +
    'Coordinate with other gods via Symphony. Keep responses concise ' +
    'to stay within the free-tier rate limits.',
  ],
  small_model: SMALL_MODEL_FREE,
};

// God prompt file paths (used to inline prompts for free-tier)
const GOD_PROMPT_FILES = {
  apollo:      '.opencode/prompts/agents/gods/apollo.txt',
  atlas:       '.opencode/prompts/agents/gods/atlas.txt',
  artemis:     '.opencode/prompts/agents/gods/artemis.txt',
  athena:      '.opencode/prompts/agents/gods/athena.txt',
  dionysus:    '.opencode/prompts/agents/gods/dionysus.txt',
  hephaestus:  '.opencode/prompts/agents/gods/hephaestus.txt',
  hermes:      '.opencode/prompts/agents/gods/hermes.txt',
  persephone:  '.opencode/prompts/agents/gods/persephone.txt',
  prometheus:  '.opencode/prompts/agents/gods/prometheus.txt',
  callimachus: '.opencode/prompts/agents/gods/callimachus.txt',
};

// Free-tier prompt truncation:
// - OpenRouter 128K context: can use up to 1000 chars per god
// The applyFreeConfigShape() function reads the model map to determine
// which limit applies per god (defaults to the conservative limit).
const OPENROUTER_PROMPT_CHAR_LIMIT = 1000;
const FREE_PROMPT_CUT_MARKER = '## Canonical Reference Patterns';

// --- Helpers ---------------------------------------------------------------

function log(msg) { console.error(`[apply-strategy] ${msg}`); }

function ts() {
  // YYYYMMDDTHHMMSS-sorted lexicographically = chronological order
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function loadProviders() {
  try {
    if (!fs.existsSync(PROVIDERS_FILE)) return null;
    return JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf-8'));
  } catch (e) {
    log(`Warning: could not parse ${PROVIDERS_FILE}: ${e.message}`);
    return null;
  }
}

function loadCustomStrategies() {
  try {
    if (!fs.existsSync(CUSTOM_STRATEGIES_FILE)) return {};
    return JSON.parse(fs.readFileSync(CUSTOM_STRATEGIES_FILE, 'utf-8'));
  } catch (e) {
    log(`Warning: could not parse ${CUSTOM_STRATEGIES_FILE}: ${e.message}`);
    return {};
  }
}

function resolveStrategy(cliFlag) {
  let strategy;
  if (cliFlag) {
    log(`Strategy from --strategy flag: ${cliFlag}`);
    strategy = cliFlag;
  } else {
    const cfg = loadProviders();
    if (cfg && cfg.strategy) {
      log(`Strategy from ${PROVIDERS_FILE}: ${cfg.strategy}`);
      strategy = cfg.strategy;
    } else {
      log('No strategy found, defaulting to go-balanced');
      strategy = 'go-balanced';
    }
  }
  return strategy;
}

/**
 * The OpenRouter-only split: primary roles on the
 * strongest OpenRouter free model live right now, specialists on the
 * second-strongest (when it can hold the OLYMPUS context), Callimachus on
 * the curated Nemotron nano (background vault work must not burn the
 * flagship's shared pool).
 */
function buildOpenRouterMixed() {
  const refresh = loadFreeModelsRefresh(); // re-read so a mid-run refresh is picked up
  const orTop = refresh?.openrouter?.top || [];

  // Primary trio (Apollo/Atlas/Hephaestus) → the strongest free model live
  // right now (curated default: nemotron-3-ultra-550b, 1M context).
  const pickPrimary = () => {
    const live = normalizeLiveId(orTop[0]?.id);
    if (live) {
      log(`  Free OpenRouter: primary roles -> ${live} (live #1 from refresh)`);
      return live;
    }
    return 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free';
  };

  // Specialist gods → the second-strongest free model, but only if it can
  // actually hold the OLYMPUS context (≥ 131K) and cleared a sanity score.
  // Falls back to the verified ling-3.0-flash.
  const pickSpecialist = () => {
    const second = orTop[1];
    if (second && second.context >= 131072 && second.score >= 30) {
      const live = normalizeLiveId(second.id);
      log(`  Free OpenRouter: specialist roles -> ${live} (live #2 from refresh)`);
      return live;
    }
    return 'openrouter/inclusionai/ling-3.0-flash:free';
  };

  const map = { ...BUILTIN_STRATEGIES['free-openrouter'] };
  for (const g of ['apollo', 'atlas', 'hephaestus']) map[g] = pickPrimary();
  for (const g of ['artemis', 'athena', 'dionysus', 'hermes', 'persephone', 'prometheus']) {
    map[g] = pickSpecialist();
  }
  // Callimachus stays on the curated Nemotron nano — background vault
  // curation runs constantly and would burn the flagship's shared pool.
  return map;
}

/**
 * The NVIDIA Build split (free-nvidia-build) — #106's ANCHOR-PIN doctrine.
 *
 * The distribution is USER-PINNED (the family-prefixed anchor map in
 * BUILTIN_STRATEGIES): every god on exactly one anchor lane, zero Nemotron
 * (the user's ban), the three heavy paths on three distinct pools,
 * callimachus + vault on the flash lane, <=3 gods per anchor. The live
 * refresh NEVER overrides the assignment — the old "strongest live #1 for
 * apollo+atlas" logic was the #106 root cause (the scorer optimized
 * per-model capability, never pool distribution, and parked the entry lane
 * on the most-contended pool).
 *
 * The refresh's only powers here: VERIFY each anchor's availability (a dead
 * anchor surfaces LOUDLY — never silently swapped) and carry renamed ids
 * (Batch B's refresh doctrine updates the pinned ids when NVIDIA renames).
 */
function getNvidiaBuildModelMap() {
  const refresh = loadFreeModelsRefresh(); // re-read so a mid-run refresh is picked up
  const nvAll = refresh?.nvidia?.all || refresh?.nvidia?.top || [];
  const map = { ...BUILTIN_STRATEGIES['free-nvidia-build'] };

  if (nvAll.length > 0) {
    // The REAL refresh-file shape (refresh-free-models.js) writes
    // `nvidia/`-prefixed ids + `rawId`; normalize to the bare id for the
    // comparison (a prefix drift here = a false "not in the live list"
    // warning on every apply — a broken verification).
    const liveIds = new Set(nvAll.map(m => {
      const id = (m && (m.rawId || m.id)) || '';
      return id.replace(/^nvidia\//, '');
    }).filter(Boolean));
    const deadAnchors = [];
    for (const [god, lane] of Object.entries(map)) {
      const bare = lane.replace(/^nvidia-[a-z]+\//, ''); // strip the family prefix
      if (!liveIds.has(bare)) deadAnchors.push(`${god}=${lane} (bare id ${bare} not in the live list)`);
    }
    if (deadAnchors.length > 0) {
      log(`  Free Nvidia Build: ANCHOR-PIN WARNING — ${deadAnchors.length} lane(s) not in the live refresh list:`);
      for (const d of deadAnchors) log(`    ${d}`);
      log(`    The anchor set is USER-PINNED — no silent replacement. If NVIDIA renamed a model,`);
      log(`    run scripts/refresh-free-models.js (the anchor-pin update path) and re-apply.`);
    } else {
      log(`  Free Nvidia Build: all anchor lanes verified live (${liveIds.size} models in the refresh list)`);
    }
  } else {
    log(`  Free Nvidia Build: no fresh refresh list — the pinned anchor map stands (probe-verified 2026-10-08, #105's law: availability claims carry probe evidence — reports/free-1/s0/E8-LIVE-MODEL-VERIFICATION.md)`);
  }
  return map;
}

function getModelMap(strategy) {
  if (strategy === 'free-big-pickle') {
    // Re-resolve at apply time so `--refresh-models` in the same run picks
    // up a newly released flagship (FREE_BIG_PICKLE_MODEL is module-load).
    const bp = getBigPickleModel();
    const map = { ...BUILTIN_STRATEGIES['free-big-pickle'] };
    for (const g of GOD_IDS) map[g] = bp;
    log(`  Free Big Pickle: every god on ${bp} (OLYMPUS_BIG_PICKLE_MODEL or live #1; refreshed each apply)`);
    return map;
  }
  if (strategy === 'free-openrouter') {
    // The OpenRouter-only split of the Free config. Requires an OpenRouter
    // key — OpenRouter models cannot be requested without one.
    // Issue #56 (BATCH 12d): --force (module flag set in main) is the
    // explicit escape hatch — validateFreeFallbackKeys itself throws when
    // NO free key exists at all, so the force path must wrap the call.
    let keys;
    try {
      keys = validateFreeFallbackKeys('free-openrouter');
    } catch (e) {
      if (FORCE_FREE_APPLY) {
        log(`  WARNING: free-openrouter key validation FAILED, but --force given — building the map anyway; model requests will fail with APIError until the key is added.`);
        keys = { openrouter: false, nvidia: false };
      } else {
        throw e;
      }
    }
    if (!keys.openrouter && !FORCE_FREE_APPLY) {
      throw new Error(
        `free-openrouter requires an OpenRouter API key — configure OpenRouter inside OpenCode (Settings → Providers) or use free-big-pickle instead.`
      );
    }
    if (!keys.openrouter && FORCE_FREE_APPLY) {
      log(`  WARNING: building free-openrouter WITHOUT an OpenRouter key (--force) — model requests will fail with APIError until the key is added.`);
    }
    return buildOpenRouterMixed();
  }
  if (strategy === 'free-nvidia-build') {
    // NVIDIA Build free endpoints. The model list is public (fetched by the
    // refresh script unconditionally), but requests need an nvapi-... key —
    // validateFreeFallbackKeys soft-warns when it is missing so the config
    // still applies.
    validateFreeFallbackKeys('free-nvidia-build');
    return getNvidiaBuildModelMap();
  }
  if (BUILTIN_STRATEGIES[strategy]) {
    return BUILTIN_STRATEGIES[strategy];
  }
  if (strategy.startsWith('custom-')) {
    const customs = loadCustomStrategies();
    const cfg = customs[strategy];
    if (!cfg) {
      throw new Error(`Custom strategy "${strategy}" not found in ${CUSTOM_STRATEGIES_FILE}`);
    }
    if (!cfg.gods || typeof cfg.gods !== 'object') {
      throw new Error(`Custom strategy "${strategy}" missing \`gods\` map`);
    }
    for (const g of GOD_IDS) {
      if (!cfg.gods[g]) {
        throw new Error(`Custom strategy "${strategy}" missing model for god: ${g}`);
      }
      // MONEY SAFETY: custom strategies are FREE-ONLY — a paid model here
      // could silently burn the user's credits. Reject with a clear error.
      if (!KNOWN_FREE_MODELS.has(cfg.gods[g])) {
        throw new Error(
          `Custom strategy "${strategy}" uses "${cfg.gods[g]}" for ${g} — custom strategies are FREE-ONLY (no paid models). ` +
          `Pick a free model or use a GO/Zen strategy for paid models.`
        );
      }
    }
    return cfg.gods;
  }
  throw new Error(
    `Unknown strategy: ${strategy}. Valid: go-max-quality, go-balanced, go-budget, zen-max-quality, zen-balanced, zen-budget (Zen), free-openrouter, free-big-pickle (Free Big Pickle), free-nvidia-build (Free Nvidia Build), custom-*`
  );
}

function loadDotEnv(filePath) {
  const vars = {};
  try {
    if (!fs.existsSync(filePath)) return vars;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key) vars[key] = value;
    }
  } catch {}
  return vars;
}

function validateFreeFallbackKeys(strategy = '') {
  // Priority 1: OpenCode's own auth.json (user configured via `olympus opencode` TUI)
  // Priority 2: ~/.olympus/llm-providers.json (legacy)
  // Priority 3: ~/.olympus/.env or .env (legacy, may be encrypted)
  // Priority 4: process.env

  let openrouterKey = '';
  let groqKey = '';
  let nvidiaKey = '';

  // Check OpenCode auth.json first (can have groq + openrouter + nvidia keys)
  for (const dir of OPENCODE_AUTH_DIRS) {
    const authFile = path.join(dir, 'auth.json');
    if (fs.existsSync(authFile)) {
      try {
        const auth = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
        // OpenCode stores providers as objects with { type, key }
        const extractKey = (obj) => {
          if (!obj) return '';
          if (typeof obj === 'string') return obj;
          if (typeof obj.key === 'string') return obj.key;
          if (typeof obj.apiKey === 'string') return obj.apiKey;
          if (typeof obj.token === 'string') return obj.token;
          return '';
        };
        if (auth.groq) groqKey = extractKey(auth.groq);
        if (auth.openrouter) openrouterKey = extractKey(auth.openrouter);
        if (auth.nvidia) nvidiaKey = extractKey(auth.nvidia);
        if (groqKey || openrouterKey || nvidiaKey) break; // found keys
      } catch {}
    }
  }

  // Priority 2: llm-providers.json (legacy)
  if (!openrouterKey && !groqKey && !nvidiaKey) {
    const cfg = loadProviders() || {};
    openrouterKey = cfg.openrouter_key || '';
    groqKey = cfg.groq_key || '';
    nvidiaKey = cfg.nvidia_key || '';
  }

  // Priority 3: .env files (legacy)
  if (!openrouterKey || !groqKey || !nvidiaKey) {
    const dotEnvFiles = [
      path.join(os.homedir(), '.olympus', '.env'),
      path.join(OLYMPUS_ROOT, '.env'),
    ];
    for (const f of dotEnvFiles) {
      const dotEnv = loadDotEnv(f);
      if (!openrouterKey && dotEnv.OLYMPUS_OPENROUTER_KEY) openrouterKey = dotEnv.OLYMPUS_OPENROUTER_KEY;
      if (!groqKey && dotEnv.OLYMPUS_GROQ_KEY) groqKey = dotEnv.OLYMPUS_GROQ_KEY;
      if (!nvidiaKey && dotEnv.OLYMPUS_NVIDIA_KEY) nvidiaKey = dotEnv.OLYMPUS_NVIDIA_KEY;
    }
  }

  // Priority 4: process.env
  if (!openrouterKey) openrouterKey = process.env.OLYMPUS_OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || '';
  if (!groqKey) groqKey = process.env.OLYMPUS_GROQ_KEY || process.env.GROQ_API_KEY || '';
  if (!nvidiaKey) nvidiaKey = process.env.OLYMPUS_NVIDIA_KEY || process.env.NVIDIA_API_KEY || '';

  // Provider-specific key requirements:
  //   - free-nvidia-build: the model list is public (apply still works), but
  //     requests need an nvapi-... key — soft-warn so the user knows dispatch
  //     will fail until the key is added.
  //   - every other free strategy routes through OpenRouter ids, which
  //     cannot be requested without the corresponding key — hard error.
  if (strategy === 'free-nvidia-build') {
    if (!nvidiaKey) {
      log('WARNING: free-nvidia-build has no NVIDIA API key configured — the config will apply, but model requests will fail until one is added.');
      log('  Get a free key at https://build.nvidia.com (Sign In → API), then add NVIDIA as a provider inside OpenCode (Settings → Providers).');
    }
  } else if (!openrouterKey && !nvidiaKey) {
    throw new Error(
      `Free-tier strategies require at least one free-tier API key.\n` +
      `\n` +
      `  Option 1 (recommended): Configure free providers inside OpenCode:\n` +
      `    olympus opencode  →  open Settings  →  add OpenRouter and/or NVIDIA API keys\n` +
      `\n` +
      `  Option 2: Set environment variables:\n` +
      `    export OPENROUTER_API_KEY=sk-or-... (get at https://openrouter.ai/keys)\n` +
      `    export NVIDIA_API_KEY=nvapi-...     (get at https://build.nvidia.com)`
    );
  }

  // Set env vars so spawned opencode processes find them
  if (groqKey && !process.env.GROQ_API_KEY) process.env.GROQ_API_KEY = groqKey;
  if (openrouterKey && !process.env.OPENROUTER_API_KEY) process.env.OPENROUTER_API_KEY = openrouterKey;
  if (nvidiaKey && !process.env.NVIDIA_API_KEY) process.env.NVIDIA_API_KEY = nvidiaKey;

  return {
    openrouter: !!openrouterKey,
    groq: !!groqKey,
    nvidia: !!nvidiaKey,
  };
}

function isFreeTierStrategy(strategy) {
  return strategy.startsWith('free-');
}

function isZenStrategy(strategy) {
  return strategy === 'zen-balanced' || strategy === 'zen-max-quality' || strategy === 'zen-budget';
}

/**
 * The config shape family: FREE uses the trimmed shape (10 gods, inlined
 * prompts, 4 plugins — overlay + router + cache + context-cache); GO and
 * ZEN use the full shape (128 agents, file-ref prompts, 8 plugins) — Zen
 * only differs in the model prefix + small_model.
 */
function strategyFamily(strategy) {
  if (isFreeTierStrategy(strategy)) return 'FREE';
  if (isZenStrategy(strategy)) return 'ZEN';
  return 'GO';
}

/**
 * Fix C1 — clear per-god overrides in ~/.olympus/llm-providers.json.
 * Settings-saved overrides are merged on top of the strategy map at apply
 * time; on a CLI strategy switch a stale pin (e.g. an old Apollo override)
 * would silently win over the new strategy's model. Returns the number of
 * overrides cleared (0 = nothing to do / no file).
 */
function clearProviderOverrides() {
  if (!fs.existsSync(PROVIDERS_FILE)) return 0;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf-8'));
  } catch (e) {
    log(`Warning: could not parse ${PROVIDERS_FILE}: ${e.message}`);
    return 0;
  }
  const overrides = (cfg && cfg.per_god_overrides) || {};
  const n = Object.keys(overrides).length;
  if (n > 0) {
    cfg.per_god_overrides = {};
    try {
      fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
    } catch (e) {
      log(`Warning: could not update ${PROVIDERS_FILE}: ${e.message}`);
      return 0;
    }
  }
  return n;
}

function isFreeTierModelMap(modelMap) {
  return Object.values(modelMap).some(m =>
    m.startsWith('openrouter/') || m.startsWith('nvidia/')
  );
}

/**
 * Merge per-god overrides from ~/.olympus/llm-providers.json into the model
 * map. Overrides are only accepted when they name a KNOWN model (a verified
 * free model from FREE_MODEL_LIMITS or a GO/Zen-plan model) — anything else
 * is dropped and replaced with the strategy default. This is what kills stale
 * overrides that point at dead endpoints (e.g. the removed
 * deepseek-chat-v3-0324:free) without breaking the user's intentional picks.
 *
 * MONEY SAFETY: on free-family strategies (`free-*` and `custom-*`) only
 * free models are accepted — a paid override in a free strategy would
 * silently burn credits. GO/Zen strategies accept their own plan's classes
 * (plus free models, so a Settings pin never gets dropped for no reason).
 */
function mergePerGodOverrides(modelMap, strategy) {
  const cfg = loadProviders();
  const overrides = (cfg && cfg.per_god_overrides) || {};
  const freeOnly = strategy.startsWith('free-') || strategy.startsWith('custom-');
  const known = freeOnly
    ? KNOWN_FREE_MODELS
    : new Set([...KNOWN_FREE_MODELS, ...KNOWN_GO_MODELS, ...KNOWN_ZEN_MODELS]);
  let merged = 0;
  let dropped = 0;
  for (const god of GOD_NAMES_LIST) {
    const cls = overrides[god] && overrides[god].class;
    if (!cls) continue;
    if (known.has(cls)) {
      if (modelMap[god] !== cls) {
        log(`  override ${god}: ${modelMap[god]} -> ${cls} (from llm-providers.json)`);
        modelMap[god] = cls;
        merged++;
      }
    } else {
      log(`  override ${god}: dropping unknown model "${cls}" (strategy default ${modelMap[god]} kept)`);
      dropped++;
    }
  }
  if (merged > 0) log(`  Merged ${merged} per-god override(s) into the model map`);
  if (dropped > 0) log(`  Dropped ${dropped} stale per-god override(s) — not in the verified model list`);
  return modelMap;
}

/**
 * Write provider.<id>.models.<model>.limit.{context,output} for every free
 * model in use. opencode 1.18 always sends max_tokens=32000; these per-model
 * output caps override that so free-tier providers stay inside their rate
 * windows. Also strips the local capture-proxy baseURL if a debug session
 * left it in the config (http://127.0.0.1:9999).
 */
function applyFreeProviderLimits(config, modelMap) {
  let changes = 0;
  const providers = config.provider || (config.provider = {});

  // Remove the debug capture-proxy baseURL if present.
  for (const [pid, pcfg] of Object.entries(providers)) {
    const base = pcfg && pcfg.options && pcfg.options.baseURL;
    if (typeof base === 'string' && base.includes('127.0.0.1:9999')) {
      delete pcfg.options.baseURL;
      if (Object.keys(pcfg.options).length === 0) delete pcfg.options;
      changes++;
      log(`  provider.${pid}: removed debug capture-proxy baseURL`);
    }
  }

  const modelsInUse = new Set();
  for (const god of GOD_NAMES_LIST) {
    if (modelMap[god]) modelsInUse.add(modelMap[god]);
  }
  modelsInUse.add(config.small_model || '');

  const limits = getFreeModelLimits();
  for (const model of modelsInUse) {
    const limit = limits[model];
    if (!limit) continue;
    const slash = model.indexOf('/');
    const providerId = model.slice(0, slash);
    const modelId = model.slice(slash + 1);
    const pcfg = providers[providerId] || (providers[providerId] = {});
    const mcfg = pcfg.models || (pcfg.models = {});
    const cur = mcfg[modelId] || (mcfg[modelId] = {});
    const curLimit = cur.limit || (cur.limit = {});
    if (curLimit.context !== limit.context) { curLimit.context = limit.context; changes++; }
    if (curLimit.output !== limit.output) { curLimit.output = limit.output; changes++; }
  }
  // F3 (MADRUGA-FIX-3): the modelsInUse SCOPE FIX — legacy lanes OUTSIDE the
  // strategy's god map (groq, stale nvidia lanes, anything a previous apply
  // left behind) must also reach the floor, or the live stays partially sick
  // after the curative apply. Every free-provider lane present in the config
  // with output < FLOOR gets the target. GO/Zen lanes (opencode-go/, opencode/)
  // are different providers — untouched.
  // F3b: dead-lane CLEANUP — a lane the strategy table no longer knows and
  // no pin uses is residue from an OLD apply (the glm-5.2 escape class);
  // leaving it re-trips the F4 preflight forever. Remove it, loudly.
  const knownLimits = getFreeModelLimits();
  for (const [pid, pcfg] of Object.entries(providers)) {
    if (pcfg && pcfg.models && typeof pcfg.models === 'object'
        && /^(openrouter|nvidia|groq)/.test(pid)) {
      for (const mid of Object.keys(pcfg.models)) {
        const fullId = `${pid}/${mid}`;
        if (!knownLimits[fullId] && !modelsInUse.has(fullId)) {
          delete pcfg.models[mid];
          changes++;
          log(`  F3b cleanup: removed dead/residual lane ${fullId} (not in the strategy's table, no pin uses it)`);
        }
      }
      if (pcfg.models && Object.keys(pcfg.models).length === 0) {
        delete providers[pid];
        changes++;
        log(`  F3b cleanup: removed empty provider block ${pid}`);
      }
    }
  }
  const FLOOR_OUTPUT = 8192, TARGET_OUTPUT = 16384;
  for (const [pid, pcfg] of Object.entries(providers)) {
    if (pcfg && pcfg.models && typeof pcfg.models === 'object'
        && /^(openrouter|nvidia|groq)/.test(pid)) {
      for (const [mid, mcfg] of Object.entries(pcfg.models)) {
        if (!mcfg || typeof mcfg !== 'object') continue;
        const lim = mcfg.limit || (mcfg.limit = {});
        if (typeof lim.output !== 'number' || lim.output < FLOOR_OUTPUT) {
          lim.output = TARGET_OUTPUT;
          changes++;
          log(`  F3 floor: ${pid}/${mid} output -> ${TARGET_OUTPUT} (legacy lane healed)`);
        }
      }
    }
  }
  if (changes > 0) log(`  Applied ${changes} provider limit(s) for free models`);
  return changes;
}

// --- #106: the provider split (free-nvidia-build) ----------------------------

/**
 * Write the per-family provider entries (nvidia-glm / nvidia-deepseek /
 * nvidia-kimi / nvidia-meta) into the config — one client pool per family,
 * each carrying ONLY its family's models with honest limits. Empirically
 * verified end-to-end 2026-10-08: a scratch config with exactly this shape
 * (npm @ai-sdk/openai-compatible + options.baseURL + an auth.json key per
 * family id) dispatched nvidia-glm/z-ai/glm-5.3 "OK" through the real
 * opencode binary. The F3b cleanup in applyFreeProviderLimits then removes
 * the old single-`nvidia` block's dead lanes (they left the generator
 * table with the old pool era).
 */
function applyNvidiaFamilyProviders(config) {
  let changes = 0;
  const providers = config.provider || (config.provider = {});
  for (const [family, fp] of Object.entries(NVIDIA_FAMILY_PROVIDERS)) {
    const pcfg = providers[family] || (providers[family] = {});
    if (pcfg.npm !== fp.npm) { pcfg.npm = fp.npm; changes++; }
    if (pcfg.name !== fp.name) { pcfg.name = fp.name; changes++; }
    pcfg.options = pcfg.options || {};
    if (pcfg.options.baseURL !== fp.options.baseURL) {
      pcfg.options.baseURL = fp.options.baseURL;
      changes++;
    }
    pcfg.models = pcfg.models || {};
    for (const [mid, mc] of Object.entries(fp.models)) {
      const cur = pcfg.models[mid] || (pcfg.models[mid] = {});
      if (cur.name !== mc.name) { cur.name = mc.name; changes++; }
      if (cur.reasoning !== mc.reasoning) { cur.reasoning = mc.reasoning; changes++; }
      if (cur.tool_call !== mc.tool_call) { cur.tool_call = mc.tool_call; changes++; }
      cur.limit = cur.limit || {};
      if (cur.limit.context !== mc.limit.context) { cur.limit.context = mc.limit.context; changes++; }
      if (cur.limit.output !== mc.limit.output) { cur.limit.output = mc.limit.output; changes++; }
    }
  }
  log(`  provider split: ${Object.keys(NVIDIA_FAMILY_PROVIDERS).length} NVIDIA family lanes written (per-family client pools)`);
  return changes;
}

/**
 * Mirror the user's `nvidia` auth.json key to the four family provider ids
 * (nvidia-glm / nvidia-deepseek / nvidia-kimi / nvidia-meta) — the standard
 * /connect flow's storage, keyed by provider id. NO new secrets are
 * introduced (the same nvapi-... key, under aliases); auth.json is never
 * tracked by git. Absent family entries are written; existing ones are
 * never overwritten. A missing `nvidia` key is a soft warning (same
 * doctrine as validateFreeFallbackKeys for this strategy).
 */
function mirrorNvidiaFamilyAuthKeys() {
  const FAMILIES = Object.keys(NVIDIA_FAMILY_PROVIDERS);
  for (const dir of OPENCODE_AUTH_DIRS) {
    const authFile = path.join(dir, 'auth.json');
    if (!fs.existsSync(authFile)) continue;
    let auth;
    try {
      auth = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
    } catch (e) {
      log(`  WARNING: could not parse ${authFile} — family key mirror skipped (${e.message})`);
      continue;
    }
    const nvidia = auth.nvidia;
    const key = !nvidia ? '' : typeof nvidia === 'string' ? nvidia
      : typeof nvidia.key === 'string' ? nvidia.key
      : typeof nvidia.apiKey === 'string' ? nvidia.apiKey : '';
    if (!key) {
      log(`  WARNING: no NVIDIA key in ${authFile} — the family lanes will dispatch APIError until one is added (Settings → Providers → NVIDIA).`);
      continue;
    }
    let written = 0;
    for (const f of FAMILIES) {
      if (!auth[f] || !(typeof auth[f] === 'object' ? (auth[f].key || auth[f].apiKey) : auth[f])) {
        auth[f] = { type: 'api', key };
        written++;
      }
    }
    if (written > 0) {
      fs.writeFileSync(authFile, JSON.stringify(auth, null, 2) + '\n', 'utf-8');
      log(`  provider split: mirrored the NVIDIA key to ${written} family auth entr${written === 1 ? 'y' : 'ies'} in ${authFile} (${FAMILIES.join(', ')})`);
    } else {
      log(`  provider split: family auth entries already present in ${authFile} (${FAMILIES.join(', ')})`);
    }
  }
}

// --- Backup / Restore ------------------------------------------------------

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('opencode.json.') && f.endsWith('.bak'))
    .sort()  // lexicographic = chronological (because of ISO timestamp)
    .reverse();  // most recent first
}

function mostRecentBackup() {
  const backups = listBackups();
  return backups.length > 0 ? path.join(BACKUP_DIR, backups[0]) : null;
}

function createBackup() {
  ensureDir(BACKUP_DIR);
  if (!fs.existsSync(OPENCODE_JSON)) return null;
  const backupName = `opencode.json.${ts()}.bak`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  fs.copyFileSync(OPENCODE_JSON, backupPath);
  log(`Backed up opencode.json -> ${backupPath}`);

  // Prune old backups (keep most recent MAX_BACKUPS)
  const backups = listBackups();  // most recent first
  if (backups.length > MAX_BACKUPS) {
    for (const old of backups.slice(MAX_BACKUPS)) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, old));
        log(`Pruned old backup: ${old}`);
      } catch {}
    }
  }
  return backupPath;
}

function restoreBackup(backupPath) {
  if (!backupPath) {
    const recent = mostRecentBackup();
    if (!recent) {
      log('ERROR: no backup found to restore');
      process.exit(2);
    }
    backupPath = recent;
  }
  if (!fs.existsSync(backupPath)) {
    log(`ERROR: backup file not found: ${backupPath}`);
    process.exit(2);
  }
  // Copy backup -> opencode.json (don't delete the backup; user may want to
  // restore again).
  fs.copyFileSync(backupPath, OPENCODE_JSON);
  log(`Restored opencode.json from ${backupPath}`);

  // Update state file
  try {
    const state = {
      strategy: '(restored — unknown)',
      applied_at: new Date().toISOString(),
      restored_from: backupPath,
      agent_count: '(unknown — re-apply a strategy to refresh)',
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch {}

  console.log(`OK: restored opencode.json from ${backupPath}`);
  console.log(`    Re-run with --strategy <id> to verify the restored config matches a known strategy.`);
  process.exit(0);
}

// --- Demigod loading -------------------------------------------------------

function loadDemigodsRegistry() {
  if (!fs.existsSync(DEMIGODS_JSON)) {
    throw new Error(
      `opencode.demigods.json not found at ${DEMIGODS_JSON}. ` +
      `This file is required for GO-plan strategies (it contains the 118 demigod definitions).`
    );
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DEMIGODS_JSON, 'utf-8'));
    if (!raw.demigods || typeof raw.demigods !== 'object') {
      throw new Error('opencode.demigods.json missing `demigods` object');
    }
    return raw.demigods;
  } catch (e) {
    throw new Error(`Could not parse ${DEMIGODS_JSON}: ${e.message}`);
  }
}

function extractParentGod(promptPath) {
  if (!promptPath || typeof promptPath !== 'string') return null;
  const m = promptPath.match(/demigods\/([^/]+)\/[^/]+\.txt/i);
  return m ? m[1] : null;
}

function demigodModel(demigodName, parentGod, parentModel, athenaOnK3, isFreeTier, prefix) {
  if (isFreeTier) {
    return parentModel;
  }
  if (SIMPLE_FLASH_DEMIGODS.has(demigodName)) {
    return `${prefix}glm-5.3-flash`;
  }
  if (APOLLO_REASONING_DEMIGODS.has(demigodName)) {
    return `${prefix}glm-5.3-flash`;
  }
  if (athenaOnK3 && ATHENA_IMPECCABLE_UPGRADE_DEMIGODS.has(demigodName)) {
    return `${prefix}glm-5.3-flash`;
  }
  return parentModel;
}

// --- Config shape application ----------------------------------------------

/**
 * Apply the GO (or Zen) config shape to opencode.json:
 *   - Restore god prompts to {file:...} references
 *   - Merge in all 118 demigods from opencode.demigods.json
 *   - Set plugin array to GO preset
 *   - Clear instructions
 *   - Set small_model to the family's Flash model (GO or Zen)
 *
 * Returns the number of structural changes made.
 */
function applyGoConfigShape(config, modelMap, forceImpeccable, family = 'GO') {
  let changes = 0;
  const isZen = family === 'ZEN';
  // Zen demigods inherit opencode/<id> models (the Zen provider); GO demigods
  // use opencode-go/<id>.
  const prefix = isZen ? 'opencode/' : 'opencode-go/';
  // Kimi K3 upgrades are a GO-plan concept (the impeccable flag forces the GO
  // K3 class). Zen has no K3 cap — the flag is ignored there.
  const athenaOnK3 = !isZen && (forceImpeccable || modelMap.athena === 'opencode-go/kimi-k3');
  const smallModel = isZen ? SMALL_MODEL_ZEN : GO_CONFIG_SHAPE.small_model;

  // --- 1. Restore god prompts to {file:...} references ---
  // L1 (MADRUGA-3 p1): the {file:} contract is only real when the file
  // exists. A missing god or a missing prompt file is an explicit error —
  // never WARN + keep whatever was there (a silent placeholder contract).
  for (const [godId, filePath] of Object.entries(GOD_PROMPT_FILES)) {
    const agent = config.agent[godId];
    if (!agent) {
      throw new Error(
        `god ${godId} missing from opencode.json — the ${family} shape requires ` +
        `all 10 gods; refusing to generate a partial pantheon.`
      );
    }
    const expectedRef = '{file:' + filePath + '}';
    // The referenced file must exist for EVERY god — a config that already
    // carries the right ref STRING to a missing file is exactly the
    // dangling-reference concession (checked even when the ref is unchanged).
    const fullPath = path.resolve(OLYMPUS_ROOT, filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `god prompt file missing for ${godId}: ${fullPath} — the ${family} ` +
        `shape references canonical prompt files; refusing to emit a config ` +
        `with a dangling reference. Restore the prompt files (they live at ` +
        `.opencode/prompts/agents/gods/) or fix opencode.json.`
      );
    }
    if (agent.prompt !== expectedRef) {
      log(`  ${godId}: prompt -> ${expectedRef}`);
      agent.prompt = expectedRef;
      changes++;
    }
  }

  // --- 2. Merge in demigods from opencode.demigods.json ---
  const demigods = loadDemigodsRegistry();
  let added = 0;
  let updatedModels = 0;
  for (const [name, dCfg] of Object.entries(demigods)) {
    const parentGod = dCfg.parent_god;
    const parentModel = modelMap[parentGod];
    if (!parentModel) {
      // L1 (MADRUGA-3 p1): a demigod whose parent has no model in the map
      // would be silently ABSENT from a config that claims all 128 agents —
      // refuse instead.
      throw new Error(
        `demigod ${name} has parent ${parentGod} with no model in the strategy ` +
        `map — the ${family} shape merges all 118 demigods; refusing to emit a ` +
        `partial registry. Fix the strategy map.`
      );
    }
    const newModel = demigodModel(name, parentGod, parentModel, athenaOnK3, false, prefix);

    if (!config.agent[name]) {
      // Add the demigod
      config.agent[name] = {
        mode: dCfg.mode || 'subagent',
        model: newModel,
        prompt: dCfg.prompt,
      };
      added++;
    } else if (config.agent[name].model !== newModel) {
      // Update model only (preserve existing prompt + mode)
      config.agent[name].model = newModel;
      updatedModels++;
    }
  }
  if (added > 0) {
    log(`  Added ${added} demigods from opencode.demigods.json`);
    changes += added;
  }
  if (updatedModels > 0) {
    log(`  Updated models for ${updatedModels} demigods`);
    changes += updatedModels;
  }

  // --- 3. Plugin array ---
  const expectedPlugins = GO_CONFIG_SHAPE.plugins;
  if (JSON.stringify(config.plugin || []) !== JSON.stringify(expectedPlugins)) {
    log(`  plugin array: ${config.plugin?.length || 0} -> ${expectedPlugins.length} entries`);
    config.plugin = [...expectedPlugins];
    changes++;
  }

  // --- 4. Instructions ---
  if (JSON.stringify(config.instructions || []) !== JSON.stringify(GO_CONFIG_SHAPE.instructions)) {
    config.instructions = [...GO_CONFIG_SHAPE.instructions];
    changes++;
  }

  // --- 5. small_model ---
  if (config.small_model !== smallModel) {
    log(`  small_model: ${config.small_model || '(none)'} -> ${smallModel}`);
    config.small_model = smallModel;
    changes++;
  }

  // --- 6. Top-level model = Apollo's model ---
  const apolloModel = modelMap.apollo;
  if (apolloModel && config.model !== apolloModel) {
    log(`  (top-level) model: ${config.model || '(none)'} -> ${apolloModel}`);
    config.model = apolloModel;
    changes++;
  }

  // --- 7. God models ---
  for (const godId of GOD_NAMES_LIST) {
    const agent = config.agent[godId];
    if (!agent) continue;
    const newModel = modelMap[godId];
    if (newModel && agent.model !== newModel) {
      log(`  ${godId}: ${agent.model || '(none)'} -> ${newModel}`);
      agent.model = newModel;
      changes++;
    }
  }

  return changes;
}

/**
 * Apply the free-tier config shape to opencode.json:
 *   - Inline + truncate god prompts (1000 chars max)
 *   - Remove all demigods (keep only the 10 gods)
 *   - Trim plugin array to free-tier preset
 *   - Set single short instruction string
 *   - Set small_model to an OpenRouter nano free model
 *
 * Returns the number of structural changes made.
 */
function applyFreeConfigShape(config, modelMap, strategy) {
  let changes = 0;

  // L1 (MADRUGA-3 p1): the free shape is a contract for all 10 gods — a
  // config that is missing one is a partial pantheon, refused loudly
  // (never silently granted/prompted around).
  for (const godId of GOD_NAMES_LIST) {
    if (!config.agent[godId]) {
      throw new Error(
        `god ${godId} missing from opencode.json — the free-tier shape ` +
        `requires all 10 gods; refusing to generate a partial pantheon.`
      );
    }
  }

  // --- 1. Inline + truncate god prompts (the free-tier token budget) ---
  // L1 (MADRUGA-3 p1): the 1000-char inline is a DESIGNED, loudly-logged
  // reduction (it keeps the request inside the provider's free rate
  // window) — never a placeholder contract. The canonical prompt file
  // must resolve to REAL content, or the apply fails with an explicit
  // error: a generated config that silently keeps a dangling {file:}
  // reference (or stale text) is exactly the concession this kills.
  const charLimit = OPENROUTER_PROMPT_CHAR_LIMIT; // single free-tier budget
  for (const godId of GOD_NAMES_LIST) {
    const agent = config.agent[godId];
    if (!agent) continue;

    const currentPrompt = agent.prompt || '';
    const promptMatch = currentPrompt.match(/\{file:([^}]+)\}/);
    let newPrompt;

    if (promptMatch) {
      // {file:...} reference — resolve it. Unreadable/missing file = the
      // config would carry a dangling reference: refuse, loudly.
      const filePath = path.resolve(OLYMPUS_ROOT, promptMatch[1]);
      let fullContent;
      try {
        fullContent = fs.readFileSync(filePath, 'utf-8');
      } catch (e) {
        throw new Error(
          `god prompt file unreadable for ${godId}: ${filePath} (${e.message}) — ` +
          `the free-tier generator inlines prompts from the canonical files and ` +
          `refuses to emit a config with a dangling reference. Restore the file ` +
          `or fix the prompt reference in opencode.json.`
        );
      }
      const cutIdx = fullContent.indexOf(FREE_PROMPT_CUT_MARKER);
      const rawCore = cutIdx > 0 ? fullContent.substring(0, cutIdx).trim() : fullContent;
      newPrompt = rawCore.length > charLimit
        ? rawCore.substring(0, charLimit)
        : rawCore;
      log(`  ${godId}: inlined prompt (${newPrompt.length} chars, was file ref, limit=${charLimit})`);
    } else if (currentPrompt.length > charLimit) {
      // Already inlined but too long — truncate (logged, by design).
      newPrompt = currentPrompt.substring(0, charLimit);
      log(`  ${godId}: truncated prompt (${charLimit} chars, was ${currentPrompt.length})`);
    } else {
      // Inlined and under the limit. The canonical prompt files are the
      // source of truth for god identity — refresh from them when the file
      // exists. Unreadable = refuse (same doctrine as above); absent = the
      // config already carries real content, nothing to generate.
      const canonicalPath = GOD_PROMPT_FILES[godId]
        ? path.resolve(OLYMPUS_ROOT, GOD_PROMPT_FILES[godId])
        : null;
      if (!canonicalPath || !fs.existsSync(canonicalPath)) continue;
      let fullContent;
      try {
        fullContent = fs.readFileSync(canonicalPath, 'utf-8');
      } catch (e) {
        throw new Error(`god prompt file unreadable for ${godId}: ${canonicalPath} (${e.message})`);
      }
      const cutIdx = fullContent.indexOf(FREE_PROMPT_CUT_MARKER);
      const rawCore = cutIdx > 0 ? fullContent.substring(0, cutIdx).trim() : fullContent;
      newPrompt = rawCore.length > charLimit
        ? rawCore.substring(0, charLimit)
        : rawCore;
      if (newPrompt === currentPrompt) continue;
      log(`  ${godId}: refreshed inlined prompt (${newPrompt.length} chars, was ${currentPrompt.length})`);
    }

    if (agent.prompt !== newPrompt) {
      agent.prompt = newPrompt;
      changes++;
    }
  }

  // --- 2. Remove demigods (keep only the 10 gods) ---
  const godSet = new Set(GOD_NAMES_LIST);
  let removed = 0;
  for (const id of Object.keys(config.agent)) {
    if (!godSet.has(id)) {
      delete config.agent[id];
      removed++;
    }
  }
  if (removed > 0) {
    log(`  Removed ${removed} demigods (free-tier keeps only the 10 gods)`);
    changes += removed;
  }

  // --- 3. Plugin array ---
  const expectedPlugins = FREE_CONFIG_SHAPE.plugins;
  if (JSON.stringify(config.plugin || []) !== JSON.stringify(expectedPlugins)) {
    log(`  plugin array: ${config.plugin?.length || 0} -> ${expectedPlugins.length} entries (free-tier preset)`);
    config.plugin = [...expectedPlugins];
    changes++;
  }

  // --- 3b. NVIDIA Build: strip cache plugins (they inject unsupported params) ---
  if (strategy === 'free-nvidia-build') {
    const nvidiaPlugins = config.plugin.filter(p =>
      !p.includes('olympus-go-cache') && !p.includes('opencode-context-cache.mjs')
    );
    if (nvidiaPlugins.length !== config.plugin.length) {
      log(`  plugin array: removed cache plugins for NVIDIA Build (${config.plugin.length} -> ${nvidiaPlugins.length})`);
      config.plugin = nvidiaPlugins;
      changes++;
    }
    // Also remove agent.skills entirely — NVIDIA rejects the 'skills' param
    // even when empty array. OpenCode core injects agent.skills into every
    // request; deleting the property prevents it from being sent.
    for (const godId of GOD_NAMES_LIST) {
      const agent = config.agent[godId];
      if (agent && 'skills' in agent) {
        delete agent.skills;
        changes++;
      }
    }
    if (changes) log(`  agent.skills: removed for all gods (NVIDIA Build incompatibility)`);
  }

  // --- 4. Instructions ---
  const expectedInstr = FREE_CONFIG_SHAPE.instructions;
  if (JSON.stringify(config.instructions || []) !== JSON.stringify(expectedInstr)) {
    config.instructions = [...expectedInstr];
    changes++;
    log(`  instructions: replaced with free-tier summary`);
  }

  // --- 5. small_model ---
  // #106: free-nvidia-build's small_model rides the strategy's own flash
  // lane (volume work on the volume lane, zero Nemotron, zero cross-provider
  // key needs). The other free strategies keep the OpenRouter nano default.
  const expectedSmallModel = strategy === 'free-nvidia-build'
    ? SMALL_MODEL_FREE_NVIDIA
    : FREE_CONFIG_SHAPE.small_model;
  if (config.small_model !== expectedSmallModel) {
    log(`  small_model: ${config.small_model || '(none)'} -> ${expectedSmallModel}`);
    config.small_model = expectedSmallModel;
    changes++;
  }

  // --- 6. Top-level model = Apollo's model (free-tier) ---
  const apolloModel = modelMap.apollo;
  if (apolloModel && config.model !== apolloModel) {
    log(`  (top-level) model: ${config.model || '(none)'} -> ${apolloModel}`);
    config.model = apolloModel;
    changes++;
  }

  // --- 7. God models ---
  for (const godId of GOD_NAMES_LIST) {
    const agent = config.agent[godId];
    if (!agent) continue;
    const newModel = modelMap[godId];
    if (newModel && agent.model !== newModel) {
      log(`  ${godId}: ${agent.model || '(none)'} -> ${newModel}`);
      agent.model = newModel;
      changes++;
    }
  }

  // --- 8. L1 (MADRUGA-3): grant the OLYMPUS overlay tools to every god ---
  // Structural fix for D9: free configs must carry the same toolset the GO
  // shape grants implicitly (via the overlay), so dispatch works on a
  // freshly generated lane with zero patches.
  for (const godId of GOD_NAMES_LIST) {
    const agent = config.agent[godId];
    if (!agent) continue;
    if (!agent.tools || typeof agent.tools !== 'object') agent.tools = {};
    for (const t of FREE_CONFIG_SHAPE.olympus_tools) {
      if (agent.tools[t] !== true) {
        agent.tools[t] = true;
        changes++;
      }
    }
  }
  log(`  L1: olympus tools granted to ${GOD_NAMES_LIST.length} gods (${FREE_CONFIG_SHAPE.olympus_tools.length} tools each)`);

  return changes;
}

// --- L4 (MADRUGA-3): live catalogue preflight -------------------------------

/**
 * MADRUGA-3 L4 / D19: validate every model ID in the candidate config
 * against the LIVE opencode catalogue (`opencode models <provider>`),
 * failing fast with the catalogue's own suggestion when an ID is dead.
 * The D19 incident: the refreshed free-models.json still mapped 3 agents
 * to nvidia/z-ai/glm-5.2, and subagent spawns died at model resolution
 * with "Model not found ... Did you mean: z-ai/glm-5.3?" — that error
 * must fire at APPLY time, not at spawn time.
 *
 * MADRUGA-3 p1 hardening — no silent skips, ever:
 *   - The probe is the opencode BINARY itself (node_modules/.bin/opencode
 *     is a native executable — invoking it via `node <path>` always fails,
 *     which made the first preflight revision silently skip every
 *     provider). It is executed directly via the shell.
 *   - Missing probe binary  -> explicit error (the ids cannot be
 *     validated; the D19 class would go uncaught).
 *   - Unqueryable provider  -> explicit error naming the provider + the
 *     ids left UNVALIDATED.
 *   Both escape with --force (the operator takes responsibility, loudly —
 *   same doctrine as the #56 key validation).
 */
function preflightModelCatalogue(config, opts = {}) {
  // Collect distinct model ids from the candidate config.
  const ids = new Set();
  if (config.model) ids.add(config.model);
  if (config.small_model) ids.add(config.small_model);
  for (const a of Object.values(config.agent || {})) {
    if (a && typeof a === 'object' && typeof a.model === 'string') ids.add(a.model);
  }
  // F4 (MADRUGA-FIX-3): LANE-SIGHT — the D19 class escaped through here: a
  // dead lane in a provider block was INVISIBLE to this preflight (it only
  // collected pinned models), so glm-5.2 sat in the config while every pin
  // validated. Every id present in provider.*.models joins the set: a dead
  // LANE fails the apply loudly with the catalogue's own suggestions.
  for (const [pid, pcfg] of Object.entries(config.provider || {})) {
    if (pcfg && pcfg.models && typeof pcfg.models === 'object') {
      for (const mid of Object.keys(pcfg.models)) {
        if (typeof mid === 'string' && mid.includes('/')) ids.add(`${pid}/${mid}`);
      }
    }
  }
  // Group by provider (first path segment). #106: family-prefixed lanes
  // (nvidia-glm/z-ai/glm-5.3 etc.) validate against the BUILT-IN `nvidia`
  // catalogue — the family entry is the same model on the same NVIDIA
  // Build endpoint, routed through a per-family client pool; before the
  // first apply writes the family providers, `opencode models nvidia-glm`
  // would report "Provider not found" (the probe reads the on-disk config).
  const FAMILY_PROVIDER_RE = /^(nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta)$/;
  const byProvider = new Map();
  for (const id of ids) {
    const family = id.split('/')[0];
    const probeProvider = FAMILY_PROVIDER_RE.test(family) ? 'nvidia' : family;
    const probeId = probeProvider !== family ? id.replace(/^nvidia-[a-z]+\//, 'nvidia/') : id;
    if (!byProvider.has(probeProvider)) byProvider.set(probeProvider, []);
    byProvider.get(probeProvider).push(probeId);
  }
  const opencodeBin = path.join(OLYMPUS_ROOT, 'node_modules', '.bin', 'opencode');
  if (!fs.existsSync(opencodeBin)) {
    const msg =
      `L4 catalogue preflight: the opencode catalogue probe is missing (${opencodeBin}) — ` +
      `model ids cannot be validated and the D19 class (dead ids breaking subagent ` +
      `spawns at resolution time) would go uncaught. Restore node_modules, or re-run ` +
      `with --force to apply unvalidated (taking responsibility for spawn failures).`;
    if (opts.force) {
      log(`WARNING: ${msg}`);
      return { ok: true, failures: [] };
    }
    return { ok: false, failures: [], msg };
  }
  const failures = [];
  const unvalidated = [];
  for (const [provider, providerIds] of byProvider) {
    let catalogue = '';
    try {
      // The probe is the opencode binary itself (a native executable) —
      // invoke it directly via the shell, never through process.execPath.
      catalogue = execSync(
        `"${opencodeBin}" models ${provider}`,
        { encoding: 'utf-8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (e) {
      unvalidated.push({ provider, ids: providerIds, err: String(e.message || e).slice(0, 120) });
      continue;
    }
    const lines = new Set(catalogue.split('\n').map(l => l.trim()).filter(Boolean));
    for (const id of providerIds) {
      if (!lines.has(id)) {
        // Suggest close matches from the live catalogue (same family).
        const family = id.split('/').slice(0, -1).join('/');
        const suggestions = [...lines].filter(l => l.startsWith(family + '/')).slice(0, 3);
        failures.push({ id, provider, suggestions });
      }
    }
  }
  const problems = [];
  if (failures.length > 0) {
    const lines = failures.map(f =>
      `    ${f.id}${f.suggestions.length ? `  (live suggestions: ${f.suggestions.join(', ')})` : ''}`);
    problems.push(
      `L4 catalogue preflight: ${failures.length} model id(s) not in the live catalogue — the D19 failure shape (stale ids break subagent spawns at resolution time):\n` +
      lines.join('\n'));
  }
  if (unvalidated.length > 0) {
    const lines = unvalidated.map(u =>
      `    provider '${u.provider}': catalogue query failed (${u.err}) — ${u.ids.length} id(s) left UNVALIDATED`);
    problems.push(
      `L4 catalogue preflight: could not validate ${unvalidated.reduce((n, u) => n + u.ids.length, 0)} model id(s):\n` +
      lines.join('\n'));
  }
  if (problems.length > 0) {
    const msg =
      problems.join('\n') +
      `\n  Fix the strategy map, or re-run with --force to apply anyway (spawns on unvalidated/dead ids WILL fail).`;
    if (opts.force) {
      log(`WARNING: ${msg}`);
      return { ok: true, failures };
    }
    return { ok: false, failures, msg };
  }
  return { ok: true, failures: [] };
}

// --- State file ------------------------------------------------------------

function writeStateFile(strategy, changes, backupPath, noOp = false) {
  try {
    const state = {
      strategy,
      applied_at: new Date().toISOString(),
      agent_count: 0,
      god_prompts: 'unknown',
      demigods_loaded: false,
      plugins_enabled: 0,
      changes,
      backup_path: backupPath,
      // N37 (SWEEP-1): a no-op apply is a NO-OP — never recorded as a bare
      // "applied". The state file carries the marker so the convergence
      // signal (the guard) stays the only source of truth.
      ...(noOp ? { noOp: true, note: 'no changes — config already matched; verify with the budget-guard, not this file' } : {}),
    };
    // Re-read the just-written opencode.json to populate state fields
    if (fs.existsSync(OPENCODE_JSON)) {
      const cfg = JSON.parse(fs.readFileSync(OPENCODE_JSON, 'utf-8'));
      state.agent_count = Object.keys(cfg.agent || {}).length;
      state.plugins_enabled = (cfg.plugin || []).length;
      state.demigods_loaded = state.agent_count > 10;
      const apollo = cfg.agent?.apollo;
      if (apollo?.prompt?.startsWith('{file:')) {
        state.god_prompts = 'file_refs';
      } else if (apollo?.prompt) {
        state.god_prompts = 'inlined';
      }
    }
    ensureDir(OLYMPUS_HOME);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    log(`State written to ${STATE_FILE}`);
  } catch (e) {
    log(`Warning: could not write state file: ${e.message}`);
  }
}

// --- Load / Save -----------------------------------------------------------

/**
 * Restart the warm `opencode serve` instance after a strategy switch.
 *
 * The warm server loads opencode.json ONCE at startup and keeps its in-memory
 * config — including per-god models — for the whole lifetime of the process.
 * Rewriting opencode.json alone (what this script previously did) never takes
 * effect on a running server, so switching e.g. free-groq → free-openrouter
 * kept serving the OLD models. The symptoms the user hit: every free strategy
 * test ran the same model (groq/gpt-oss-120b), overflowed the same 12K TPM
 * window, and fell into the same auto-compaction "anchored summary" loop.
 *
 * Killing the server here forces the next terminal message to cold-start and
 * load the freshly written opencode.json. The conversation→session map is also
 * cleared so stale sessions (created under the old models) are not resumed.
 */
function restartWarmServer() {
  const pidFile = path.join(OLYMPUS_HOME, 'opencode-server.pid');
  const sessionMapFile = path.join(OLYMPUS_HOME, 'opencode-sessions.json');
  let pid = null;
  try {
    const raw = JSON.parse(fs.readFileSync(pidFile, 'utf-8'));
    if (raw && typeof raw.pid === 'number') pid = raw.pid;
  } catch {}
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
      log(`Warm OpenCode server stopped (pid ${pid}) — next message cold-starts with the new strategy config`);
    } catch (e) {
      log(`Note: warm OpenCode server (pid ${pid}) already gone (${e.code || e.message})`);
    }
  }
  try { fs.unlinkSync(pidFile); } catch {}
  try { fs.unlinkSync(sessionMapFile); } catch {}
}

function loadOpendcodeJson() {
  if (!fs.existsSync(OPENCODE_JSON)) {
    throw new Error(`opencode.json not found at ${OPENCODE_JSON}`);
  }
  try {
    return JSON.parse(fs.readFileSync(OPENCODE_JSON, 'utf-8'));
  } catch (e) {
    throw new Error(`Could not parse opencode.json: ${e.message}`);
  }
}

function saveOpendcodeJson(config) {
  const content = JSON.stringify(config, null, 2) + '\n';
  fs.writeFileSync(OPENCODE_JSON, content, 'utf-8');
}

// --- Status ----------------------------------------------------------------

function showStatus() {
  console.log('=== OLYMPUS Strategy Status ===\n');

  // State file
  if (fs.existsSync(STATE_FILE)) {
    try {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      console.log(`Last applied strategy: ${state.strategy}`);
      console.log(`Applied at:           ${state.applied_at}`);
      console.log(`Agent count:          ${state.agent_count}`);
      console.log(`God prompts:          ${state.god_prompts}`);
      console.log(`Demigods loaded:      ${state.demigods_loaded}`);
      console.log(`Plugins enabled:      ${state.plugins_enabled}`);
      if (state.backup_path) {
        console.log(`Last backup:          ${state.backup_path}`);
      }
      console.log('');
    } catch (e) {
      console.log(`(could not read state file: ${e.message})\n`);
    }
  } else {
    console.log('(no state file — strategy never applied via this script)\n');
  }

  // Current opencode.json
  if (fs.existsSync(OPENCODE_JSON)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(OPENCODE_JSON, 'utf-8'));
      const agents = Object.keys(cfg.agent || {});
      const gods = agents.filter(a => GOD_IDS.has(a));
      const demigods = agents.filter(a => !GOD_IDS.has(a));
      const apolloPrompt = cfg.agent?.apollo?.prompt || '';
      console.log(`Current opencode.json:`);
      console.log(`  Total agents:        ${agents.length} (${gods.length} gods + ${demigods.length} demigods)`);
      console.log(`  God prompts:         ${apolloPrompt.startsWith('{file:') ? 'file_refs' : 'inlined'}`);
      console.log(`  Apollo prompt len:   ${apolloPrompt.length}`);
      console.log(`  Top-level model:     ${cfg.model}`);
      console.log(`  Small model:         ${cfg.small_model}`);
      console.log(`  Plugins:             ${(cfg.plugin || []).length}`);
      console.log(`  Instructions:        ${(cfg.instructions || []).length}`);
      console.log(`  Has skills.paths:    ${!!(cfg.skills?.paths)}`);
      console.log('');
    } catch (e) {
      console.log(`(could not parse opencode.json: ${e.message})\n`);
    }
  } else {
    console.log(`opencode.json not found at ${OPENCODE_JSON}\n`);
  }

  // Backups
  const backups = listBackups();
  console.log(`Backups (${backups.length} total, max ${MAX_BACKUPS}):`);
  if (backups.length === 0) {
    console.log('  (none)');
  } else {
    for (const b of backups.slice(0, 5)) {
      console.log(`  ${b}`);
    }
    if (backups.length > 5) {
      console.log(`  ... and ${backups.length - 5} more`);
    }
  }
  process.exit(0);
}

// --- Main ------------------------------------------------------------------

function printHelp() {
  console.log(`Usage: node scripts/apply-strategy.js [options]

Options:
  --strategy <id>    Apply a strategy. Valid:
                       go-max-quality, go-balanced, go-budget,
                       zen-max-quality, zen-balanced, zen-budget ("Zen"),
                       free-openrouter,
                       free-big-pickle ("Free Big Pickle"),
                       free-nvidia-build ("Free Nvidia Build"),
                       custom-<id>
  --refresh-models   Re-fetch the live free model lists before applying
                     (runs scripts/refresh-free-models.js first)
  --force            Bypass the free-tier key validation error (apply the
                     free strategy anyway, taking responsibility for the
                     APIError failures until the key is added). Issue #56.
  --impeccable       Force Athena's K3 upgrade (GO strategies only —
                     also upgrades Athena's UI demigods). Ignored on
                     Zen / free strategies.
  --restore [path]   Restore opencode.json from backup. If <path> is
                     omitted, restores the most recent backup.
  --status           Show current strategy state + backup list.
  --list-backups     List all backups (alias for --status's backup section).
  --dry-run          Don't write any files — just log what would change.
  --keep-overrides   Preserve per-god overrides from ~/.olympus/llm-providers.json
                     when applying a strategy (default: clear them).
  --help, -h         Show this help.

Strategy shapes:
  GO-plan strategies (go-max-quality, go-balanced, go-budget, custom-*):
    - All 128 agents present (10 gods + 118 demigods)
    - God prompts use {file:...} references (full prompt fidelity)
    - Plugin array includes all 8 local plugins
    - Empty instructions array
    - small_model = opencode-go/deepseek-v4-flash

  Zen strategies (zen-max-quality, zen-balanced, zen-budget [Zen]):
    - Same full shape as GO (128 agents, file-ref prompts, 8 plugins)
    - Models use the opencode/<id> prefix (OpenCode Zen, pay-as-you-go)
    - small_model = opencode/deepseek-v4-flash

  Free-tier strategies (free-openrouter, free-big-pickle,
  free-nvidia-build):
    - Only 10 gods present (demigods removed)
    - God prompts inlined + truncated (OpenRouter/NVIDIA: 1000 chars)
    - Plugin array trimmed to 4 (overlay + router + cache + context-cache)
    - Single short instruction string
    - small_model = openrouter/nvidia/nemotron-3-nano-30b-a3b:free
    - Provider output caps applied (free models can't take 32K max_tokens)
    - When ~/.olympus/free-models.json is fresh (≤ 7 days), gods route to
      the CURRENT top free models from the live provider lists
      (OpenRouter + NVIDIA Build)
      (run: node scripts/refresh-free-models.js to update)
    - When a free provider's rate limit runs out, switch to another free
      strategy (free-openrouter, free-big-pickle,
      free-nvidia-build) and keep going

State file:
  After each successful apply, writes ~/.olympus/active-strategy.json
  with the active strategy + config shape. opencode-spawn.ts reads this
  to verify the config matches before spawning opencode.

Backups:
  ~/.olympus/backups/opencode.json.<timestamp>.bak
  Most recent ${MAX_BACKUPS} backups are kept; older ones are pruned.

If --strategy is omitted, reads from ~/.olympus/llm-providers.json.
Defaults to go-balanced if no config found.

The script is idempotent — running twice with the same strategy is a no-op.
`);
}

function main() {
  const args = process.argv.slice(2);
  let cliStrategy = null;
  let forceImpeccable = false;
  let dryRun = false;
  let restorePath = null;
  let doRestore = false;
  let doStatus = false;
  let refreshModels = false;
  let keepOverrides = false;
  let forceApply = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--strategy' && args[i + 1]) {
      cliStrategy = args[i + 1];
      i++;
    } else if (args[i] === '--impeccable') {
      forceImpeccable = true;
    } else if (args[i] === '--force') {
      forceApply = true;
      FORCE_FREE_APPLY = true;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--refresh-models') {
      refreshModels = true;
    } else if (args[i] === '--keep-overrides') {
      keepOverrides = true;
    } else if (args[i] === '--restore') {
      doRestore = true;
      // Optional path argument
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        restorePath = args[i + 1];
        i++;
      }
    } else if (args[i] === '--status' || args[i] === '--list-backups') {
      doStatus = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printHelp();
      process.exit(0);
    } else {
      log(`ERROR: unknown argument: ${args[i]}`);
      log(`Run with --help for usage.`);
      process.exit(1);
    }
  }

  if (doStatus) {
    showStatus();
  }

  // Optionally re-fetch the live free model lists before applying (so the
  // Free / Free Big Pickle strategies pick up any newly released flagships).
  if (refreshModels) {
    const refreshScript = path.join(OLYMPUS_ROOT, 'scripts', 'refresh-free-models.js');
    if (fs.existsSync(refreshScript)) {
      log('Refreshing live free model lists...');
      try {
        execSync(`node "${refreshScript}" --force`, { stdio: 'inherit' });
      } catch (e) {
        log(`WARNING: model refresh failed (${e.message}) — continuing with cached/curated models`);
      }
    } else {
      log('WARNING: scripts/refresh-free-models.js not found — continuing with curated models');
    }
  }

  if (doRestore) {
    restoreBackup(restorePath);
  }

  // Fix C1 (2026-09-28): a CLI strategy switch clears Settings-saved per-god
  // overrides so a stale pin can never silently win over the strategy map.
  // --keep-overrides preserves the pins; --restore and --dry-run never touch
  // them.
  if (cliStrategy && !doRestore && !keepOverrides && !dryRun) {
    const cleared = clearProviderOverrides();
    if (cleared > 0) {
      log(`Cleared ${cleared} per-god override(s) (use --keep-overrides to preserve).`);
    }
  }

  log(`Olympus root: ${OLYMPUS_ROOT}`);
  log(`opencode.json: ${OPENCODE_JSON}`);
  log(`demigods.json: ${DEMIGODS_JSON}`);
  log(`backups dir:   ${BACKUP_DIR}`);
  log(`state file:    ${STATE_FILE}`);
  if (dryRun) log('** DRY RUN — no files will be written **');

  const strategy = resolveStrategy(cliStrategy);
  log(`Applying strategy: ${strategy}${forceImpeccable ? ' (impeccable forced)' : ''}`);

  let modelMap;
  try {
    modelMap = getModelMap(strategy);
  } catch (e) {
    log(`ERROR: ${e.message}`);
    if (isFreeTierStrategy(strategy) && !forceApply) {
      log(`  (Re-run with --force to apply anyway, taking responsibility for the failures.)`);
    }
    process.exit(1);
  }
  // #106: the provider split's key plumbing — mirror the user's nvidia key
  // to the family ids BEFORE the config carries family lanes (the dispatch
  // path reads auth.json per provider id). Skipped on --dry-run (no writes).
  if (strategy === 'free-nvidia-build' && !dryRun) {
    mirrorNvidiaFamilyAuthKeys();
  }

  // Validate free-tier API keys before applying any free strategy.
  if (isFreeTierStrategy(strategy)) {
    try {
      const keys = validateFreeFallbackKeys(strategy);
      log(`Free-tier keys present: openrouter=${keys.openrouter}, nvidia=${keys.nvidia}`);
    } catch (e) {
      if (forceApply) {
        // Issue #56 (BATCH 12d): --force is the explicit escape hatch —
        // the operator takes responsibility for a strategy whose key is
        // missing. Loud, never silent.
        log(`WARNING: free-tier key validation FAILED, but --force given — applying anyway.`);
        log(`  Runs on '${strategy}' will fail with APIError until the key is added.`);
        log(`  Guidance:\n${e.message}`);
      } else {
        log(`ERROR: ${e.message}`);
        log(`  (Re-run with --force to apply anyway, taking responsibility for the failures.)`);
        process.exit(1);
      }
    }
    // Issue #56 (BATCH 12d): stale free-model cache. loadFreeModelsRefresh
    // silently returns null when ~/.olympus/free-models.json is absent or
    // older than 24h — the strategy then routes gods to the curated list,
    // which may reference DEAD endpoints (the 12b finding: fetched_at was
    // two months old). ONE loud warning naming the fix, never silent.
    if (!loadFreeModelsRefresh()) {
      log(`WARNING: free-models.json is missing or older than 24h — gods will be routed to the curated offline list, which may reference dead endpoints.`);
      log(`  Refresh with: node scripts/apply-strategy.js --strategy ${strategy} --refresh-models`);
    }
  }

  // Force Athena to K3 if --impeccable is set (GO strategies only — K3 is a
  // GO-plan class; Zen/free strategies have no K3 cap to force).
  if (forceImpeccable) {
    if (strategyFamily(strategy) !== 'GO') {
      log(`  IMPECCABLE: only meaningful for GO strategies (${strategy} is ${strategyFamily(strategy).toLowerCase()}) — skipping`);
    } else if (modelMap.athena !== 'opencode-go/kimi-k3') {
      log(`  IMPECCABLE: Athena ${modelMap.athena} -> opencode-go/kimi-k3 (forced)`);
      modelMap.athena = 'opencode-go/kimi-k3';
    }
  }

  // Merge per-god overrides from ~/.olympus/llm-providers.json (Settings
  // dialog). Unknown/stale overrides are dropped in favor of the strategy
  // default; on free-family strategies (free-* + custom-*) paid-model
  // overrides are dropped too (money safety).
  modelMap = mergePerGodOverrides(modelMap, strategy);

  let config;
  try {
    config = loadOpendcodeJson();
  } catch (e) {
    log(`ERROR: ${e.message}`);
    process.exit(1);
  }

  // Create backup BEFORE modifying (only if there are changes to make)
  let backupPath = null;
  if (!dryRun) {
    backupPath = createBackup();
  }

  log('Applying config shape + model map:');
  let changes;
  try {
    const family = strategyFamily(strategy);
    if (family === 'FREE') {
      changes = applyFreeConfigShape(config, modelMap, strategy);
      // #106: the per-family provider entries (one client pool per family)
      // for the distributed pantheon — BEFORE the limit harmonizer, so the
      // family lanes exist when it runs.
      if (strategy === 'free-nvidia-build') {
        changes += applyNvidiaFamilyProviders(config);
      }
      // Output caps for the free providers (max_tokens override) + strip
      // any leftover debug proxy baseURL.
      changes += applyFreeProviderLimits(config, modelMap);
    } else {
      // GO and Zen both use the full shape (128 agents, file-ref prompts,
      // 8 plugins); only the model prefix + small_model differ.
      changes = applyGoConfigShape(config, modelMap, forceImpeccable, family);
    }
  } catch (e) {
    log(`ERROR: ${e.message}`);
    process.exit(1);
  }

  // L4 (MADRUGA-3): live catalogue preflight BEFORE writing the config —
  // the D19 class (dead model ids) must fail at apply time with the
  // catalogue's own suggestion, never at spawn time. --force escapes
  // loudly (same doctrine as the #56 key validation).
  log('L4: validating model ids against the live catalogue…');
  const preflight = preflightModelCatalogue(config, { force: forceApply });
  if (!preflight.ok) {
    log(`ERROR: ${preflight.msg}`);
    process.exit(1);
  }

  if (changes === 0) {
    log('No changes needed -- opencode.json already matches the strategy.');
    // Still update state file (in case the strategy was applied via a
    // different mechanism and the state file is stale).
    if (!dryRun) writeStateFile(strategy, 0, backupPath, true); // N37: the no-op marker
    process.exit(0);
  }

  if (dryRun) {
    log(`** DRY RUN — would have made ${changes} change(s). Not writing. **`);
    process.exit(0);
  }

  try {
    saveOpendcodeJson(config);
    log(`OK: Applied strategy "${strategy}" -- ${changes} change(s) in opencode.json`);
    writeStateFile(strategy, changes, backupPath);

    // The warm server keeps its startup config in memory — a strategy switch
    // must restart it so the new opencode.json actually takes effect (and stale
    // sessions from the previous models are not resumed).
    restartWarmServer();

    // Helpful follow-up message
    console.log('');
    const family = strategyFamily(strategy);
    if (family === 'FREE') {
      console.log('  Free-tier config applied:');
      console.log('    - 10 gods only (demigods removed)');
      console.log('    - God prompts inlined (OpenRouter/NVIDIA: 1000 chars)');
      console.log('    - Plugins trimmed to overlay + router + cache');
      if (strategy === 'free-nvidia-build') {
        console.log('    - The DISTRIBUTED PANTHEON (#106): per-god model lanes on the');
        console.log('      user-pinned NVIDIA anchors — no single pool, no Nemotron (the');
        console.log('      user\'s ban). The anchor set is pinned; the refresh verifies');
        console.log('      availability, never replaces.');
      } else {
        console.log('    - Gods routed to the strongest free models live right now');
        console.log('      (curated defaults when ~/.olympus/free-models.json is stale/absent)');
      }
      console.log('    - Per-god overrides from Settings merged in (stale ones dropped)');
      console.log('');
      console.log('  To configure free API keys: run `olympus opencode`, open Settings,');
      console.log('  and add your OpenRouter and/or NVIDIA API keys as providers');
      console.log('  (free-nvidia-build uses NVIDIA — key starts with nvapi-; the apply');
      console.log('  mirrors it to the per-family provider ids automatically).');
      console.log('');
      console.log('  To refresh the free model list from the live providers:');
      console.log('    node scripts/refresh-free-models.js');
      console.log('');
      console.log('  To switch back to GO plan:');
      console.log('    node scripts/apply-strategy.js --strategy go-balanced');
    } else if (family === 'ZEN') {
      console.log('  Zen config applied (full OLYMPUS shape on OpenCode Zen):');
      console.log('    - All 128 agents present (10 gods + 118 demigods)');
      console.log('    - God prompts use {file:...} references');
      console.log('    - All 8 local plugins enabled');
      console.log('    - All gods on Zen models (opencode/<id>)');
      console.log('');
      console.log('  To authorize Zen: run `olympus opencode`, then `/connect`');
      console.log('  and select OpenCode Zen (paste your API key).');
      console.log('');
      console.log('  To switch to the GO plan:');
      console.log('    node scripts/apply-strategy.js --strategy go-balanced');
      console.log('');
      console.log('  To switch to free-tier:');
      console.log('    node scripts/apply-strategy.js --strategy free-openrouter');
    } else {
      console.log('  GO-plan config applied:');
      console.log('    - All 128 agents present (10 gods + 118 demigods)');
      console.log('    - God prompts use {file:...} references');
      console.log('    - All 8 local plugins enabled');
      console.log('    - All gods on GO-plan models');
      console.log('');
      console.log('  To switch to Zen (pay-as-you-go, no request caps):');
      console.log('    node scripts/apply-strategy.js --strategy zen-balanced');
      console.log('');
      console.log('  To switch to free-tier (choose the provider you have a key for):');
      console.log('    node scripts/apply-strategy.js --strategy free-openrouter');
      console.log('    node scripts/apply-strategy.js --strategy free-big-pickle');
      console.log('    node scripts/apply-strategy.js --strategy free-nvidia-build');
      console.log('');
      console.log('  To restore the previous config:');
      console.log('    node scripts/apply-strategy.js --restore');
    }
    process.exit(0);
  } catch (e) {
    log(`ERROR: failed to write opencode.json: ${e.message}`);
    process.exit(1);
  }
}

// MADRUGA-FIX-3 (F2): the main-guard — importing this module (the budget
// guard imports FREE_MODEL_LIMITS) must NEVER execute the apply. Only a
// direct CLI invocation runs main().
import { pathToFileURL } from 'node:url';
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  main();
}

// F2: the curated table as GUARDABLE DATA — the budget guard reads the
// generator's source of truth directly (N29: the guard now declares its
// surfaces: the generator table + the working-tree config).
export { FREE_MODEL_LIMITS };
