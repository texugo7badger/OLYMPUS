/**
 * model-pricing.ts — #181 (v0.0.9 EXACT-COST): live-catalog pricing.
 *
 * THE shared pricing module. Every consumer that needs a $ figure for a
 * model lane goes through here — never through a private hardcoded table:
 *
 *   - .opencode/olympus/olympus-hooks.ts estimateSpendUsd()  → the per-tool
 *     ESTIMATE rows in cost.jsonl (source: 'estimate')
 *   - src/lib/tasks-sheet.ts deriveCost()                     → the per-hop
 *     derived $ on the task sheet (labeled 'estimate' when the price did
 *     not come from the live catalog)
 *   - src/lib/olympus.ts + status-bar                        → surfaced via
 *     costSummary()'s split real/estimated figures
 *
 * Resolution order (issue #181 — the 2026-09-28 hardcoded snapshot is a
 * FALLBACK, not the source):
 *   1. CATALOG — ~/.cache/opencode/models.json, the CLI's own live catalog
 *      (shape: { "<providerId>": { models: { "<modelId>": { cost:
 *      { input, output } } } } }, per-1M USD). Cached in-module for 10
 *      minutes; the file is ~6 MB and polling consumers hit this every
 *      few seconds.
 *   2. FALLBACK — the pinned per-1M table ported from the old
 *      MODEL_PRICING_USD_PER_1M snapshot (olympus-hooks.ts, verified
 *      2026-09-28). Labeled 'fallback' so consumers can mark the figure
 *      as an estimate.
 *   3. UNKNOWN — no rate anywhere: $0, honestly, with source 'unknown'.
 *      Free catalog models are NOT unknown — they are 'catalog' at $0.
 *
 * Model ids are accepted BOTH as "provider/model" lanes (the strategy
 * vocabulary, e.g. "opencode-go/deepseek-v4.1-flash") AND as bare ids
 * ("deepseek-v4.1-flash"). Provider aliases like the #106 per-family
 * entries ("nvidia-glm/..." → the catalog's "nvidia" provider) resolve
 * via the provider stem.
 *
 * Node-only: fs + path + os, no other dependencies.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

/** Where the spend figure came from — consumers label anything that is
 *  not 'catalog' as an estimate. */
export type PricingSource = 'catalog' | 'fallback' | 'unknown';

export interface PricedTokens {
  /** USD for the given token counts, rounded to 6 decimal places. */
  spendUsd: number;
  source: PricingSource;
}

interface RatePair {
  input: number;
  output: number;
}

/**
 * Candidate locations for OpenCode's live model catalog. Mirrors
 * src/app/api/olympus/context-usage/route.ts (the established lookup):
 * the explicit ~/.opencode override first, then the XDG cache dir (where
 * the CLI actually writes it), then the platform defaults.
 */
const CATALOG_CANDIDATES = [
  path.join(os.homedir(), '.opencode', 'models.json'),
  process.env.XDG_CACHE_HOME
    ? path.join(process.env.XDG_CACHE_HOME, 'opencode', 'models.json')
    : null,
  path.join(os.homedir(), '.cache', 'opencode', 'models.json'),
  path.join(os.homedir(), 'Library', 'Caches', 'opencode', 'models.json'),
].filter((p): p is string => Boolean(p));

/** The catalog is ~6 MB — hold the parsed object for 10 minutes. */
const CATALOG_CACHE_MS = 10 * 60 * 1000;

let catalogCache: { loadedAt: number; data: any } | null = null;

function loadCatalog(): any | null {
  if (catalogCache && Date.now() - catalogCache.loadedAt < CATALOG_CACHE_MS) {
    return catalogCache.data;
  }
  for (const file of CATALOG_CANDIDATES) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (data && typeof data === 'object') {
        catalogCache = { loadedAt: Date.now(), data };
        return data;
      }
    } catch {
      // Missing/corrupt candidate — try the next location.
    }
  }
  // Keep any previous cache alive on a failed refresh (a mid-write catalog
  // must not zero out pricing for 10 minutes); only miss when never loaded.
  return catalogCache ? catalogCache.data : null;
}

/**
 * FALLBACK table — the 2026-09-28 snapshot ported VERBATIM from
 * olympus-hooks.ts MODEL_PRICING_USD_PER_1M (prices verified against
 * https://opencode.ai/docs/go/ + /zen/ on that date). Catalog misses
 * (offline machine, brand-new lane not yet in the catalog) fall back to
 * these pinned rates, labeled 'fallback' — the consumer marks the figure
 * as an estimate. Never edit silently: refresh against the docs and date
 * the change.
 */
const FALLBACK_PRICING_USD_PER_1M: Record<string, RatePair> = {
  // OpenCode GO (https://opencode.ai/docs/go/, verified 2026-09-28).
  'opencode-go/glm-5.3': { input: 1.4, output: 4.4 },
  'opencode-go/glm-5.3-flash': { input: 0.15, output: 0.5 },
  'opencode-go/glm-5.2': { input: 1.4, output: 4.4 },
  'opencode-go/kimi-k3': { input: 3.0, output: 15.0 },
  'opencode-go/kimi-k2.7-code': { input: 0.95, output: 4.0 },
  'opencode-go/minimax-m3': { input: 0.3, output: 1.2 },
  'opencode-go/qwen3.7-plus': { input: 0.4, output: 1.6 },
  'opencode-go/hy3': { input: 0.14, output: 0.58 },
  'opencode-go/deepseek-v4-flash': { input: 0.3, output: 1.2 },
  'opencode-go/deepseek-v4-pro': { input: 0.66, output: 1.98 }, // live catalog 2026-10-23
  'opencode-go/deepseek-v4.1-flash': { input: 0.15, output: 0.6 }, // live catalog 2026-10-23 (was the Zen price)
  'opencode-go/grok-4.7': { input: 4.0, output: 12.0 },
  'opencode-go/grok-4.6': { input: 4.0, output: 12.0 },
  'opencode-go/grok-4.5': { input: 4.0, output: 12.0 },
  'opencode-go/mimo-v2.5': { input: 0.14, output: 0.28 },
  // v0.0.23 — the rebuilt GO/ZEN rosters (opencode.ai/v2/docs/console/go, verified 2026-10-29).
  'opencode-go/mimo-v2.6-flash': { input: 0.14, output: 0.28 },
  'opencode-go/qwen3.8-flash': { input: 0.15, output: 0.47 },
  'opencode-go/qwen3.8-max': { input: 2.0, output: 6.0 },
  'opencode-go/gpt-6-luna': { input: 0.1, output: 0.5 },
  'opencode-go/claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'opencode-go/kimi-k3.1-pro': { input: 2.0, output: 10.0 },
  'opencode/gpt-6.1-sol': { input: 2.0, output: 10.0 },
  'opencode/claude-sonnet-5-5': { input: 2.0, output: 10.0 },
  'opencode/claude-opus-5-5': { input: 4.0, output: 20.0 },
  'opencode/claude-haiku-5-5': { input: 0.1, output: 0.5 },
  // #190: the GO free promotional flagship — honestly $0.
  'opencode-go/beam-free': { input: 0, output: 0 },
  // Free Hybrid (2026-10-23): every free lane is honestly $0.
  'opencode-go/minimax-m3.1-flash-free': { input: 0, output: 0 },
  'opencode-go/cat-jam-free': { input: 0, output: 0 },
  'opencode-go/longcat-2.5-preview-free': { input: 0, output: 0 },
  'opencode-go/step-5-preview-free': { input: 0, output: 0 },
  'opencode/beam-free': { input: 0, output: 0 },
  'opencode/minimax-m3.1-flash-free': { input: 0, output: 0 },
  'opencode/kimi-k2.5-free': { input: 0, output: 0 },
  'opencode/deepseek-v4.1-flash-free': { input: 0, output: 0 },
  'opencode/deepseek-v4-flash-free': { input: 0, output: 0 },
  'opencode/cat-jam-free': { input: 0, output: 0 },
  'opencode/glm-5-free': { input: 0, output: 0 },
  'opencode/glm-5.3-flash-free': { input: 0, output: 0 },
  'opencode/qwen3.6-plus-free': { input: 0, output: 0 },
  // OpenRouter free lanes used by Free Hybrid — honestly $0.
  'openrouter/thinkingmachines/inkling:free': { input: 0, output: 0 },
  'openrouter/thinkingmachines/inkling-small:free': { input: 0, output: 0 },
  'openrouter/cohere/north-mini-code:free': { input: 0, output: 0 },
  'openrouter/recursive/flint-v1.0:free': { input: 0, output: 0 },
  'openrouter/xingchen-agi/xing4.0-29b-a4b:free': { input: 0, output: 0 },
  // Free Hybrid v0.0.19 (NVIDIA Build free, verified working):
  'nvidia-openai/openai/gpt-oss-20b': { input: 0, output: 0 },
  'nvidia-meta/meta/muse-glimmer-30b': { input: 0, output: 0 },
  'nvidia-minimaxai/minimaxai/minimax-m3.1-flash': { input: 0, output: 0 },
  'nvidia-meta/poolside/laguna-xs-2.1': { input: 0, output: 0 },
  'openrouter/dots-studio/dots-3-note-preview:free': { input: 0, output: 0 },
  // OpenCode Zen (pay-as-you-go) — published per-1M rates
  // (https://opencode.ai/docs/zen/, verified 2026-09-28).
  'opencode/glm-5.3': { input: 1.4, output: 4.4 },
  'opencode/glm-5.3-flash': { input: 0.15, output: 0.5 },
  'opencode/glm-5.2': { input: 1.4, output: 4.4 },
  'opencode/kimi-k3': { input: 3.0, output: 15.0 },
  'opencode/kimi-k2.7-code': { input: 0.95, output: 4.0 },
  'opencode/deepseek-v4-pro': { input: 1.74, output: 3.48 },
  'opencode/deepseek-v4-flash': { input: 0.14, output: 0.28 },
  'opencode/deepseek-v4.1-flash': { input: 0.3, output: 1.2 },
  'opencode/qwen3.7-plus': { input: 0.4, output: 1.6 },
  'opencode/qwen3.7-max': { input: 2.5, output: 7.5 },
  'opencode/qwen3.8-max': { input: 2.0, output: 6.0 },
  'opencode/qwen3.8-flash': { input: 0.15, output: 0.47 },
  'opencode/grok-4.7': { input: 4.0, output: 12.0 },
  'opencode/grok-4.6': { input: 4.0, output: 12.0 },
  'opencode/grok-4.5': { input: 2.0, output: 6.0 },
  'opencode/grok-build-0.1': { input: 1.0, output: 2.0 },
  'opencode/minimax-m3': { input: 0.3, output: 1.2 },
  'opencode/minimax-m2.7': { input: 0.3, output: 1.2 },
  'opencode/gemini-3.1-pro': { input: 4.0, output: 18.0 },
  'opencode/gemini-3.5-flash': { input: 1.5, output: 9.0 },
  'opencode/claude-sonnet-5': { input: 2.0, output: 10.0 },
  'opencode/claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'opencode/gpt-6-sol': { input: 4.0, output: 15.0 },
  'opencode/gpt-6-luna': { input: 0.2, output: 0.75 },
  'opencode/gpt-5.6-terra': { input: 4.0, output: 18.0 },
  'opencode/gpt-5.6-luna': { input: 0.4, output: 1.8 },
  'opencode/gpt-5.4-mini': { input: 0.75, output: 4.5 },
};

function nonNegativeRate(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Read a catalog entry's per-1M cost pair; null when absent/partial. */
function catalogEntryCost(entry: any): RatePair | null {
  const cost = entry?.cost;
  if (!cost || typeof cost !== 'object') return null;
  const input = nonNegativeRate(cost.input);
  const output = nonNegativeRate(cost.output);
  if (input == null || output == null) return null;
  return { input, output };
}

/**
 * Resolve a model's per-1M rates from the live catalog.
 *
 * Accepted forms:
 *   - "provider/model" and "provider/vendor/model" lanes — split at the
 *     FIRST slash (the provider id never contains one; the model id may:
 *     "z-ai/glm-5.3", "cohere/north-mini-code:free").
 *   - bare model ids — scanned across every provider.
 *
 * Provider resolution for "provider/model":
 *   1. the exact provider id (opencode-go, openrouter, nvidia...);
 *   2. the provider STEM (first hyphen segment) — the #106 distributed
 *      pantheon's per-family aliases: "nvidia-glm" → "nvidia";
 *   3. the full lane string as a model key under the provider (some
 *      catalogs key models as "vendor/model");
 *   4. the model id as a key across every provider.
 *
 * A $0 catalog hit (free model) is a VALID hit — it resolves, it just
 * costs nothing. Null means "not in the catalog at all".
 */
function catalogRates(model: string): RatePair | null {
  const data = loadCatalog();
  if (!data || typeof data !== 'object') return null;

  const slash = model.indexOf('/');
  if (slash > 0) {
    const provider = model.slice(0, slash);
    const modelId = model.slice(slash + 1);
    const under = (pid: string): RatePair | null =>
      catalogEntryCost(data[pid]?.models?.[modelId]) ??
      catalogEntryCost(data[pid]?.models?.[model]);

    let hit = under(provider);
    if (hit) return hit;
    const stem = provider.split('-')[0];
    if (stem && stem !== provider) {
      hit = under(stem);
      if (hit) return hit;
    }
    for (const pid of Object.keys(data)) {
      hit = catalogEntryCost(data[pid]?.models?.[modelId]);
      if (hit) return hit;
    }
    return null;
  }

  for (const pid of Object.keys(data)) {
    const hit = catalogEntryCost(data[pid]?.models?.[model]);
    if (hit) return hit;
  }
  return null;
}

/**
 * Resolve rates from the pinned fallback table. Exact lane match first,
 * then the model part (so "opencode-go/glm-5.3" matches "opencode/glm-5.3"
 * keys' model part only when the exact lane is absent, and bare ids match
 * any provider's entry).
 */
function fallbackRates(model: string): RatePair | null {
  const direct = FALLBACK_PRICING_USD_PER_1M[model];
  if (direct) return direct;
  const modelPart = model.includes('/')
    ? model.slice(model.lastIndexOf('/') + 1)
    : model;
  if (!modelPart) return null;
  for (const key of Object.keys(FALLBACK_PRICING_USD_PER_1M)) {
    if (key.slice(key.lastIndexOf('/') + 1) === modelPart) {
      return FALLBACK_PRICING_USD_PER_1M[key];
    }
  }
  return null;
}

/**
 * Price a token count for a model lane.
 *
 *   priceTokens('opencode-go/deepseek-v4.1-flash', { input: 1_000_000, output: 500_000 })
 *     → the live catalog's 0.15/0.60 per-1M → { spendUsd: 0.45, source: 'catalog' }
 *
 * Unknown models return $0 with source 'unknown' — never a guessed rate.
 */
export function priceTokens(
  model: string,
  tokens: { input: number; output: number },
): PricedTokens {
  const id = typeof model === 'string' ? model.trim() : '';
  if (!id) return { spendUsd: 0, source: 'unknown' };

  const fromCatalog = catalogRates(id);
  const rates = fromCatalog ?? fallbackRates(id);
  if (!rates) return { spendUsd: 0, source: 'unknown' };

  const input = Math.max(0, Number(tokens?.input) || 0);
  const output = Math.max(0, Number(tokens?.output) || 0);
  const spendUsd =
    (input / 1_000_000) * rates.input + (output / 1_000_000) * rates.output;
  return {
    spendUsd: Math.round(spendUsd * 1_000_000) / 1_000_000, // 6dp
    source: fromCatalog ? 'catalog' : 'fallback',
  };
}
