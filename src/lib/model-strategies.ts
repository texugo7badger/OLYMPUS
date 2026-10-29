/**
 * Model Strategies — the LLM strategy layer for Olympus v0.0.1.
 *
 * v0.0.1 ships with OpenCode as the only CLI. There is no multi-CLI registry.
 * This file is the canonical source of LLM strategies (go-max-quality,
 * go-balanced, go-budget, zen-max-quality, zen-balanced, zen-budget,
 * free-openrouter, free-big-pickle, free-nvidia-build) consumed by:
 *   - scripts/apply-strategy.js (rewrites opencode.json's agent block)
 *   - src/app/api/olympus/providers/gods/route.ts (surfaces strategies to UI)
 *   - src/components/olympus/settings-dialog.tsx (strategy picker)
 *   - src/components/olympus/provider-settings.tsx (strategy display)
 *   - src/lib/olympus-store.ts (LLMStrategy type + state)
 *
 * v0.0.1 architecture:
 *   - 9 built-in strategies: 3 GO-plan + 3 Zen (pay-as-you-go) + 3 free
 *     (free-openrouter, free-big-pickle, free-nvidia-build). Groq's free tier
 *     was removed — its 12K TPM window cannot serve the OLYMPUS system prompt.
 *   - GLM-5.3 reserved for Apollo + Artemis in go-max-quality only; the
 *     daily strategies (go-balanced/go-budget) keep Apollo on GLM-5.3-Flash
 *     (cap-aware — the $3/5h rolling cap would blow in a week at 5h/day).
 *   - Kimi K3 (in go-max-quality for top specialists) joins Kimi K2.7 Code,
 *     DeepSeek V4 Pro/Flash, Qwen3.7 Plus, MiMo V2.5, Grok 4.5, MiniMax M3/M2.7.
 *   - Callimachus always uses DeepSeek V4 Flash (background vault curation).
 *   - The free strategies are provider-specific: free-openrouter is the
 *     OpenRouter-only split; free-big-pickle runs every god — including
 *     Callimachus — on one
 *     free flagship model; free-nvidia-build is the DISTRIBUTED PANTHEON
 *     (#106) — per-god model lanes on the user-pinned NVIDIA anchor set
 *     (NO Nemotron — the user's ban), all probe-verified. Keeps the "Always
 *     free" promise from the README.
 *
 * PRICING/LIMITS POLICY:
 *   Plan prices, model list, request caps, and rate limits are NOT static —
 *   they change as OpenCode adds models / adjusts tiers. We no longer hardcode
 *   specific dollar amounts or request counts in user-facing strings. Anywhere
 *   the user needs to know the current price/limits, we point them at the
 *   official docs (https://opencode.ai/docs/go/ for the GO plan,
 *   https://opencode.ai/docs/zen/ for Zen) and stamp the date we last
 *   verified the information via GO_PLAN_LAST_VERIFIED / ZEN_PLAN_LAST_VERIFIED.
 *
 * Custom user-defined strategies (`custom-*`) remain supported via
 * ~/.olympus/custom-strategies.json (loaded at runtime by apply-strategy.js).
 *
 * Docs: https://opencode.ai/docs/go/ · https://opencode.ai/docs/zen/
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/**
 * The date we last verified the GO plan's pricing, model list, and limits
 * against https://opencode.ai/docs/go/. Update this whenever you re-check
 * the docs. The UI surfaces this next to any plan/pricing mention so the
 * user knows how fresh the information is.
 *
 * Format: ISO 8601 date (YYYY-MM-DD) in UTC.
 */
export const GO_PLAN_LAST_VERIFIED = '2026-10-25';

/** Canonical docs URL — shown in the UI next to the last-verified date. */
export const GO_PLAN_DOCS_URL = 'https://opencode.ai/docs/go/';

/**
 * The date we last verified the Zen plan's model list and pricing against
 * https://opencode.ai/docs/zen/ and https://opencode.ai/zen/v1/models.
 * Update this whenever you re-check the docs.
 *
 * Format: ISO 8601 date (YYYY-MM-DD) in UTC.
 */
export const ZEN_PLAN_LAST_VERIFIED = '2026-10-25';

/** Canonical Zen docs URL — shown in the UI next to the last-verified date. */
export const ZEN_PLAN_DOCS_URL = 'https://opencode.ai/docs/zen/';

/**
 * Strategy tier — every strategy exposes a quality/balance/budget tier so
 * users can reason about quality vs cost.
 *  - quality : best GO has to offer; GLM-5.3 for Apollo + Artemis, Kimi K2.7
 *              Code / GLM-5.3-Flash / MiniMax M3 for specialists
 *  - balanced: GLM-5.3-Flash for Apollo + mid-tier (Kimi K2.7 Code / Qwen3.7
 *              Plus / GLM-5.3-Flash / MiniMax M3)
 *              for specialists
 *  - budget  : DeepSeek V4 Flash across all gods (effectively unlimited)
 *  - local   : The user's own hardware — local LLM server (Ollama, LM Studio,
 *              vLLM, llama.cpp, or any OpenAI-compatible endpoint). Zero cost,
 *              zero network dependency; runs the full 132-agent arsenal when
 *              the machine has ≥32 GB RAM / ≥48 GB VRAM. Always honest about
 *              what's serving (see docs/LOCAL-LLM.md).
 * Custom user-defined strategies use the 'custom' tier.
 */
export type LLMStrategyTier = 'quality' | 'balanced' | 'budget' | 'local' | 'custom';

export type LLMStrategy =
  | 'go-max-quality'         // GLM-5.3 (Apollo+Artemis) + Kimi K2.7 Code / GLM-5.3-Flash / MiniMax M3 (specialists) + GLM-5.3-Flash (vault) — best quality within GO caps
  | 'go-balanced'            // GLM-5.3-Flash (Apollo, cap-aware) + Kimi K2.7 Code / Qwen3.7 Plus / GLM-5.3-Flash / MiniMax M3 (specialists) + GLM-5.3-Flash (vault) — sustainable 5h/day
  | 'go-budget'              // GLM-5.3-Flash everywhere but Atlas (Hy3) — sustainable 8h/day within GO caps
  | 'zen-max-quality'        // "ZEN Max Quality" — proprietary frontier on OpenCode Zen (Claude Sonnet 5 coding + GPT-5.4 reasoning, opencode/<id>, no caps)
  | 'zen-balanced'           // "ZEN" — full 128-agent OLYMPUS on OpenCode Zen's proprietary models (opencode/<id>), no request caps
  | 'zen-budget'             // "ZEN Budget" — lowest cost on OpenCode Zen (MiniMax M2.7 everywhere but Apollo), still proprietary
  | 'local'                  // "Local" — the user's own hardware (Ollama / LM Studio / vLLM / llama.cpp / any OpenAI-compatible endpoint); full arsenal; zero cost
  | `custom-${string}`;      // user-defined strategy (see ~/.olympus/custom-strategies.json)

/**
 * The 8 Olympus gods + Callimachus. Used as the canonical key set for the
 * per-god model map in each strategy.
 */
export const GOD_IDS = [
  'apollo', 'atlas', 'artemis', 'athena', 'dionysus',
  'hephaestus', 'hermes', 'persephone', 'prometheus',
  'callimachus',
] as const;
export type GodId = typeof GOD_IDS[number];

/**
 * Per-strategy configuration. The `gods` field maps each god ID to its
 * `opencode-go/<model-id>` for this strategy. apply-strategy.js reads this
 * and rewrites opencode.json's `agent` block.
 *
 * `estCostPerDay` is a QUALITATIVE hint ('low' | 'moderate' | 'higher' | 'free')
 * instead of a dollar range — actual cost depends on usage and the GO plan's
 * current tier structure (see GO_PLAN_LAST_VERIFIED). Free strategies use
 * 'free' and display a FREE badge in the LLM Strategy menu.
 */
export interface LLMStrategyConfig {
  label: string;
  description: string;
  plan: 'GO' | 'ZEN' | 'CUSTOM' | 'LOCAL';
  tier: LLMStrategyTier;
  /** Apollo's model (the terminal/primary LLM). */
  reasoningModel: string;
  /** Default specialist god model (informational; the per-god map is authoritative). */
  codeModel: string;
  /** The model ID used for the OpenCode `model` top-level field (= Apollo's model). */
  terminalModel: string;
  /** Per-god model map. Keys are GodId, values are `opencode-go/<model-id>` (GO), `opencode/<model-id>` (Zen) or free-tier ids. */
  gods: Record<GodId, string>;
  /** Model used for vault documentation writes (instincts, session logs, plans). */
  vaultLlm: string;
  /** Qualitative cost hint — see GO_PLAN_DOCS_URL / ZEN_PLAN_DOCS_URL for current pricing. */
  estCostPerDay: 'low' | 'moderate' | 'higher' | 'free';
}

export const LLM_STRATEGIES: Record<Exclude<LLMStrategy, `custom-${string}`>, LLMStrategyConfig> = {
  'go-max-quality': {
    label: 'GO Max Quality',
    description:
      'Best quality within GO caps. Apollo plans on DeepSeek V4.1 Flash (1M ctx / 384k out — the 1017 benchmark leader at $0.15/$0.60), Atlas orchestrates on Hy3, Hephaestus codes on Kimi K2.7 Code (262k out), Athena/Hermes on Qwen3.7 Plus, Artemis on Kimi K3 (security depth), Dionysus/Persephone/Callimachus on DeepSeek V4.1 Flash, Prometheus on MiniMax M3. DeepSeek V4 Pro is retired — V4.1 Flash 1017 beats it while costing a fraction.',
    plan: 'GO',
    tier: 'quality',
    reasoningModel: 'deepseek-v4.1-flash',
    codeModel: 'deepseek-v4.1-flash',
    terminalModel: 'opencode-go/deepseek-v4.1-flash',
    gods: {
      apollo:      'opencode-go/deepseek-v4.1-flash',
      atlas:       'opencode-go/hy3',
      hephaestus:  'opencode-go/kimi-k2.7-code',
      athena:      'opencode-go/qwen3.7-plus',
      artemis:     'opencode-go/kimi-k3',
      dionysus:    'opencode-go/deepseek-v4.1-flash',
      hermes:      'opencode-go/qwen3.7-plus',
      persephone:  'opencode-go/deepseek-v4.1-flash',
      prometheus:  'opencode-go/minimax-m3',
      callimachus: 'opencode-go/deepseek-v4.1-flash',
    },
    vaultLlm: 'opencode-go/deepseek-v4.1-flash',
    estCostPerDay: 'higher',
  },
  'go-balanced': {
    label: 'GO Balanced',
    description:
      'Default — sustainable 8h/day. Apollo plans on DeepSeek V4.1 Flash (1M ctx / 384k out, 173k req/mo — the 1017 benchmark leader), Atlas orchestrates on Hy3 (cheapest per hop), Hephaestus/Artemis/Persephone/Callimachus ride DeepSeek V4.1 Flash, Athena/Dionysus/Hermes ride Qwen3.7 Plus, Prometheus on MiniMax M3. DeepSeek V4 Pro is retired: V4.1 Flash 1017 is better and cheaper.',
    plan: 'GO',
    tier: 'balanced',
    reasoningModel: 'deepseek-v4.1-flash',
    codeModel: 'deepseek-v4.1-flash',
    terminalModel: 'opencode-go/deepseek-v4.1-flash',
    gods: {
      apollo:      'opencode-go/deepseek-v4.1-flash',
      atlas:       'opencode-go/hy3',
      hephaestus:  'opencode-go/deepseek-v4.1-flash',
      athena:      'opencode-go/qwen3.7-plus',
      artemis:     'opencode-go/deepseek-v4.1-flash',
      dionysus:    'opencode-go/qwen3.7-plus',
      hermes:      'opencode-go/qwen3.7-plus',
      persephone:  'opencode-go/deepseek-v4.1-flash',
      prometheus:  'opencode-go/minimax-m3',
      callimachus: 'opencode-go/deepseek-v4.1-flash',
    },
    vaultLlm: 'opencode-go/deepseek-v4.1-flash',
    estCostPerDay: 'moderate',
  },
  'go-budget': {
    label: 'GO Budget',
    description:
      'Lowest cost within GO caps — sustainable 8h/day. Apollo stays on DeepSeek V4.1 Flash (the planner is the quality floor), Atlas on Hy3, Hephaestus/Artemis/Persephone on DeepSeek V4.1 Flash, Athena on Qwen3.8 Flash, and the volume gods on MiMo-V2.6-Flash ($0.14/$0.28, 150k req/mo). DeepSeek V4 Pro is retired.',
    plan: 'GO',
    tier: 'budget',
    reasoningModel: 'deepseek-v4.1-flash',
    codeModel: 'deepseek-v4.1-flash',
    terminalModel: 'opencode-go/deepseek-v4.1-flash',
    gods: {
      apollo:      'opencode-go/deepseek-v4.1-flash',
      atlas:       'opencode-go/hy3',
      hephaestus:  'opencode-go/deepseek-v4.1-flash',
      athena:      'opencode-go/qwen3.8-flash',
      artemis:     'opencode-go/deepseek-v4.1-flash',
      dionysus:    'opencode-go/mimo-v2.6-flash',
      hermes:      'opencode-go/mimo-v2.6-flash',
      persephone:  'opencode-go/deepseek-v4.1-flash',
      prometheus:  'opencode-go/mimo-v2.6-flash',
      callimachus: 'opencode-go/mimo-v2.6-flash',
    },
    vaultLlm: 'opencode-go/deepseek-v4.1-flash',
    estCostPerDay: 'low',
  },
  /**
   * "ZEN Max Quality" — the frontier tier on OpenCode Zen (pay-as-you-go,
   * no request caps), built around PROPRIETARY APIs — the whole point of
   * Zen vs the GO plan (which runs the open-weight line). Apollo stays on
   * GLM-5.3 (sacred). Atlas uses GPT 6 Sol for orchestration — Hy3 is
   * GO-only, so the ZEN sacred-orchestration substitute is the strongest
   * Zen reasoning model. Hephaestus + Artemis + Hermes get Claude Sonnet 5
   * (best-in-class coding); Athena GPT 5.6 Terra (frontend); Dionysus
   * GPT 5.6 Luna (QA); Persephone Gemini 3.1 Pro (data/schemas);
   * Prometheus Grok Build 0.1. Callimachus uses Claude Haiku 4.5; the vault
   * uses GLM-5.3.
   *
   * NOTE: OpenAI/Anthropic models on Zen retain requests for 30 days (their
   * data policies) — the open-weight models on Zen are zero-retention.
   * Model ids use the opencode/<id> prefix. Verified 2026-09-28.
   */
  'zen-max-quality': {
    label: 'ZEN Max Quality',
    description:
      'Frontier private models on OpenCode Zen (pay-as-you-go, no request caps). Apollo/Atlas/Dionysus on GPT 6.1 Sol, Hephaestus/Hermes/Artemis on Claude Sonnet 5.5 and Opus 5.5 (security), Athena on GPT 6 Sol, Persephone on Gemini 3.1 Pro, Prometheus on Grok 4.7, Callimachus on Claude Haiku 5.5.',
    plan: 'ZEN',
    tier: 'quality',
    reasoningModel: 'glm-5.3',
    codeModel: 'claude-sonnet-5',
    terminalModel: 'opencode/glm-5.3',
    gods: {
      apollo:      'opencode/gpt-6.1-sol',
      atlas:       'opencode/gpt-6.1-sol',
      hephaestus:  'opencode/claude-sonnet-5-5',
      athena:      'opencode/gpt-6-sol',
      artemis:     'opencode/claude-opus-5-5',
      dionysus:    'opencode/gpt-6.1-sol',
      hermes:      'opencode/claude-sonnet-5-5',
      persephone:  'opencode/gemini-3.1-pro',
      prometheus:  'opencode/grok-4.7',
      callimachus: 'opencode/claude-haiku-5-5',
    },
    vaultLlm: 'opencode/glm-5.3-flash',
    estCostPerDay: 'higher',
  },
  /**
   * "ZEN" — the full 128-agent OLYMPUS experience on OpenCode Zen's
   * pay-as-you-go models. Zen is OpenCode's curated AI gateway: sign in via
   * `olympus opencode` → `/connect` → OpenCode Zen, paste your API key
   * (stored in OpenCode's own auth.json under the `opencode` provider).
   *
   * No request caps (charged per request; auto-reload below $5 adds $20;
   * optional monthly limits). Model IDs use the `opencode/<model-id>` prefix
   * — distinct from the GO plan's `opencode-go/<id>`. All 128 agents (10
   * gods + 118 demigods) load, with full {file:...} prompt references and
   * all 8 plugins — the same config shape as the GO strategies.
   *
   * Apollo stays on GLM-5.3 (sacred, $1.40/$4.40 per 1M).
   * Atlas uses GPT 6 Sol for orchestration (Hy3 is GO-only).
   * Hephaestus + Artemis get Claude Sonnet 5 (best-in-class coding);
   * Athena GPT 5.6 Terra (frontend); Dionysus GPT 5.6 Luna (QA);
   * Hermes GPT 5.4 Mini; Persephone Gemini 3.1 Pro; Prometheus Grok Build
   * 0.1; Callimachus Claude Haiku 4.5; vault GLM-5.3-Flash
   * ($0.15/$0.50 per 1M — ideal for background work). Everything except
   * Apollo is a proprietary API — Zen's whole point vs the GO plan's
   * open-weight lineup.
   */
  'zen-balanced': {
    label: 'ZEN Balanced',
    description:
      'Full OLYMPUS on OpenCode Zen without runaway cost. Apollo on GPT 6.1 Sol, Atlas/Athena/Hermes on GPT 6 Luna, Hephaestus/Artemis on Claude Sonnet 5.5, Dionysus/Callimachus on Claude Haiku 5.5, Persephone on DeepSeek V4.1 Flash, Prometheus on Grok Build 0.1.',
    plan: 'ZEN',
    tier: 'balanced',
    reasoningModel: 'glm-5.3',
    codeModel: 'claude-sonnet-5',
    terminalModel: 'opencode/glm-5.3',
    gods: {
      apollo:      'opencode/gpt-6.1-sol',
      atlas:       'opencode/gpt-6-luna',
      hephaestus:  'opencode/claude-sonnet-5-5',
      athena:      'opencode/gpt-6-luna',
      artemis:     'opencode/claude-sonnet-5-5',
      dionysus:    'opencode/claude-haiku-5-5',
      hermes:      'opencode/gpt-6-luna',
      persephone:  'opencode/deepseek-v4.1-flash',
      prometheus:  'opencode/grok-build-0.1',
      callimachus: 'opencode/claude-haiku-5-5',
    },
    vaultLlm: 'opencode/glm-5.3-flash',
    estCostPerDay: 'moderate',
  },
  /**
   * "ZEN Budget" — the lowest-cost tier on OpenCode Zen, still on
   * proprietary APIs: Apollo stays on GLM-5.3 (sacred), Atlas uses GPT 6
   * Luna for orchestration, every other god drops to GLM-5.3-Flash
   * ($0.15/$0.50 per 1M — the cheapest workhorse class on Zen), and
   * Callimachus uses Claude Haiku 4.5. Verified 2026-09-28.
   */
  'zen-budget': {
    label: 'ZEN Budget',
    description:
      'Lowest cost on OpenCode Zen. Apollo/Atlas on GPT 6 Luna, the volume gods on DeepSeek V4.1 Flash and GLM-5.3-Flash, Callimachus on Claude Haiku 5.5.',
    plan: 'ZEN',
    tier: 'budget',
    reasoningModel: 'glm-5.3',
    codeModel: 'glm-5.3-flash',
    terminalModel: 'opencode/glm-5.3',
    gods: {
      apollo:      'opencode/gpt-6-luna',
      atlas:       'opencode/gpt-6-luna',
      hephaestus:  'opencode/deepseek-v4.1-flash',
      athena:      'opencode/glm-5.3-flash',
      artemis:     'opencode/deepseek-v4.1-flash',
      dionysus:    'opencode/deepseek-v4.1-flash',
      hermes:      'opencode/deepseek-v4.1-flash',
      persephone:  'opencode/deepseek-v4.1-flash',
      prometheus:  'opencode/glm-5.3-flash',
      callimachus: 'opencode/claude-haiku-5-5',
    },
    vaultLlm: 'opencode/glm-5.3-flash',
    estCostPerDay: 'low',
  },
  /**
   * "Free Hybrid" — THE ONE FREE STRATEGY (2026-10-23, the user's directive).
   *
   * Replaces the three free splits (Free OpenRouter / Free Beam / Free
   * Nvidia Build), which each depended on ONE key and left power on the
   * table. The Free Hybrid reads every free source the user has registered
   * and distributes the strongest live model per god:
   *
   *   1. OpenCode GO free lanes  (opencode-go/*-free — Beam 1.0, MiniMax
   *      M3.1 Flash, Cat Jam, LongCat, Step 5)
   *   2. OpenCode Zen free lanes (opencode/*-free — DeepSeek V4.1 Flash,
   *      Beam, MiniMax M3.1 Flash, Kimi K2.5, Cat Jam, …)
   *   3. OpenRouter free         (inkling 1M/262k, dots-3-note 512k/460k,
   *      north-mini-code, …)
   *   4. NVIDIA Build free       (GLM-5.3, MiniMax M3.1 Flash, Muse
   *      Glimmer 30B, GPT-OSS-20B — NO Nemotron, the user's ban)
   *
   * More registered APIs = a stronger free pantheon. The roster below is the
   * probe-verified best-of-market snapshot (2026-10-23); `resolveFreeHybrid`
   * picks the first available lane per god, spreads load (<=3 gods per
   * lane), and honours `~/.olympus/free-hybrid-overrides.json` so the user
   * can pin any god to any model ("o usuário pode modar").
   *
   * The static `gods` map is the FULL-POWER resolution (all four sources
   * available) — the UI shows it and opencode.json receives it; a machine
   * missing a provider gets the next available lane instead (the apply
   * script resolves at apply time and logs what it chose).
   */
  'local': {
    label: 'Local',
    description:
      'OLYMPUS running entirely on YOUR hardware — no cloud keys, no rate limits, no data leaving this machine. A local LLM server (Ollama / LM Studio / vLLM / llama.cpp / any OpenAI-compatible endpoint) serves all 10 gods + the 122 demigods through the full arsenal. Requires a working local endpoint with a model that supports tool calling and at least 32k context (see docs/LOCAL-LLM.md and run `olympus apply-strategy local` which probes your setup). Always honest: the Settings → Strategy shows which model serves each god, the cost is $0, and the dashboard reports the measured token rate + estimated session time. If no endpoint is found, the apply refuses with the probe result (host/port + why) so nothing is hidden.',
    plan: 'LOCAL',
    tier: 'local',
    reasoningModel: 'opencode-go/glm-5.3-flash',
    codeModel: 'opencode-go/deepseek-v4.1-flash',
    terminalModel: 'opencode-go/glm-5.3-flash',
    gods: {
      apollo:      'opencode-go/glm-5.3-flash',
      atlas:       'opencode-go/hy3',
      artemis:     'opencode-go/glm-5.3-flash',
      athena:      'opencode-go/qwen3.7-plus',
      dionysus:    'opencode-go/deepseek-v4.1-flash',
      hephaestus:  'opencode-go/kimi-k2.7-code',
      hermes:      'opencode-go/kimi-k2.7-code',
      persephone:  'opencode-go/deepseek-v4.1-flash',
      prometheus:  'opencode-go/minimax-m3',
      callimachus: 'opencode-go/glm-5.3-flash',
    },
    vaultLlm: 'opencode-go/glm-5.3-flash',
    estCostPerDay: 'free',
  },
  // Legacy free ids REMOVED in v0.0.22 — the free tier has been retired.
  // The user's own hardware path is `local` (see LLM_STRATEGIES['local']).
  // Paid plans: `go-*`, `zen-*`. Any other provider: custom-* via the Strategy Builder.

};

/**
 * The Free Hybrid sources, strongest first. A source is available when the
 * user has registered its key in OpenCode (auth.json): `opencode` and
 * `opencode-go` unlock the Zen/GO free lanes; `openrouter` unlocks the
 * OpenRouter `:free` pool; `nvidia` unlocks the NVIDIA Build families.
 */
export const FREE_HYBRID_SOURCES = ['opencode-go', 'opencode', 'openrouter', 'nvidia'] as const;
export type FreeHybridSource = typeof FREE_HYBRID_SOURCES[number];

export interface FreeHybridLane {
  /** Which registered source serves this lane. */
  source: FreeHybridSource;
  /** The full provider-prefixed model id written into opencode.json. */
  id: string;
  /** Why this lane — the god-task fit (shown in logs/docs). */
  why: string;
}

/**
 * The per-god roster — BEST lane first. Ordering is deliberate: each god's
 * first lane is the model that fits its TASK (planning needs long context,
 * QA needs output width, code needs DeepSeek's benchmark strength), and the
 * later entries are the graceful degradation path for a machine missing a
 * source. NO Nemotron anywhere (the user's ban, forever).
 */
export const FREE_HYBRID_ROSTER: Record<GodId, FreeHybridLane[]> = {
  apollo: [
    { source: 'openrouter', id: 'openrouter/thinkingmachines/inkling:free', why: 'planner: inkling 1M/262k free — probe-verified SERVABLE free reasoner (planner-class)' },
    { source: 'nvidia', id: 'nvidia-openai/openai/gpt-oss-20b', why: 'planner: GPT-OSS-20B — NVIDIA Build free (fallback)' },
    { source: 'opencode', id: 'opencode/deepseek-v4.1-flash-free', why: 'planner: Zen free lane (quota-gated — last resort)' },
    { source: 'opencode-go', id: 'opencode-go/beam-free', why: 'planner: GO Beam (quota-gated — last resort)' },
  ],
  atlas: [
    { source: 'nvidia', id: 'nvidia-minimaxai/minimaxai/minimax-m3.1-flash', why: 'orchestrator: MiniMax M3.1 Flash — NVIDIA Build free, VERIFIED' },
    { source: 'openrouter', id: 'openrouter/thinkingmachines/inkling:free', why: 'orchestrator: inkling 1M/262k (fallback)' },
    { source: 'opencode', id: 'opencode/deepseek-v4.1-flash-free', why: 'orchestrator: Zen free lane (quota-gated — last resort)' },
    { source: 'opencode-go', id: 'opencode-go/beam-free', why: 'orchestrator: GO Beam (quota-gated — last resort)' },
  ],
  artemis: [
    { source: 'nvidia', id: 'nvidia-meta/meta/muse-glimmer-30b', why: 'security: Muse Glimmer 30B — NVIDIA Build free, VERIFIED' },
    { source: 'openrouter', id: 'openrouter/thinkingmachines/inkling:free', why: 'security: inkling 1M (fallback)' },
    { source: 'opencode', id: 'opencode/deepseek-v4.1-flash-free', why: 'security: Zen free lane (quota-gated — last resort)' },
    { source: 'opencode-go', id: 'opencode-go/beam-free', why: 'security: GO Beam (quota-gated — last resort)' },
  ],
  athena: [
    { source: 'nvidia', id: 'nvidia-meta/poolside/laguna-xs-2.1', why: 'frontend: Laguna XS 2.1 — NVIDIA Build free, VERIFIED' },
    { source: 'openrouter', id: 'openrouter/thinkingmachines/inkling:free', why: 'frontend: inkling 1M/262k (fallback)' },
    { source: 'opencode', id: 'opencode/deepseek-v4.1-flash-free', why: 'frontend: Zen free lane (quota-gated — last resort)' },
    { source: 'opencode-go', id: 'opencode-go/beam-free', why: 'frontend: GO Beam (quota-gated — last resort)' },
  ],
  dionysus: [
    { source: 'nvidia', id: 'nvidia-minimaxai/minimaxai/minimax-m3.1-flash', why: 'QA: MiniMax M3.1 Flash — NVIDIA Build free, VERIFIED' },
    { source: 'openrouter', id: 'openrouter/thinkingmachines/inkling:free', why: 'QA: inkling 1M/262k (fallback)' },
    { source: 'opencode', id: 'opencode/deepseek-v4.1-flash-free', why: 'QA: Zen free lane (quota-gated — last resort)' },
    { source: 'opencode-go', id: 'opencode-go/beam-free', why: 'QA: GO Beam (quota-gated — last resort)' },
  ],
  hephaestus: [
    { source: 'nvidia', id: 'nvidia-meta/poolside/laguna-xs-2.1', why: 'backend code: Laguna XS 2.1 — NVIDIA Build free, VERIFIED' },
    { source: 'openrouter', id: 'openrouter/cohere/north-mini-code:free', why: 'backend code: north-mini-code (fallback)' },
    { source: 'opencode', id: 'opencode/deepseek-v4.1-flash-free', why: 'backend code: Zen free lane (quota-gated — last resort)' },
    { source: 'opencode-go', id: 'opencode-go/beam-free', why: 'backend code: GO Beam (quota-gated — last resort)' },
  ],
  hermes: [
    { source: 'nvidia', id: 'nvidia-meta/meta/muse-glimmer-30b', why: 'integrations: Muse Glimmer 30B — NVIDIA Build free, VERIFIED' },
    { source: 'openrouter', id: 'openrouter/thinkingmachines/inkling:free', why: 'integrations: inkling 1M/262k (fallback)' },
    { source: 'opencode', id: 'opencode/deepseek-v4.1-flash-free', why: 'integrations: Zen free lane (quota-gated — last resort)' },
    { source: 'opencode-go', id: 'opencode-go/beam-free', why: 'integrations: GO Beam (quota-gated — last resort)' },
  ],
  persephone: [
    { source: 'nvidia', id: 'nvidia-openai/openai/gpt-oss-20b', why: 'database: GPT-OSS-20B — NVIDIA Build free, VERIFIED' },
    { source: 'openrouter', id: 'openrouter/cohere/north-mini-code:free', why: 'database: north-mini-code (fallback)' },
    { source: 'opencode', id: 'opencode/deepseek-v4.1-flash-free', why: 'database: Zen free lane (quota-gated — last resort)' },
    { source: 'opencode-go', id: 'opencode-go/beam-free', why: 'database: GO Beam (quota-gated — last resort)' },
  ],
  prometheus: [
    { source: 'nvidia', id: 'nvidia-meta/poolside/laguna-xs-2.1', why: 'devops: Laguna XS 2.1 — NVIDIA Build free, VERIFIED' },
    { source: 'openrouter', id: 'openrouter/recursive/flint-v1.0:free', why: 'devops: flint 262k (fallback)' },
    { source: 'opencode', id: 'opencode/deepseek-v4.1-flash-free', why: 'devops: Zen free lane (quota-gated — last resort)' },
    { source: 'opencode-go', id: 'opencode-go/beam-free', why: 'devops: GO Beam (quota-gated — last resort)' },
  ],
  callimachus: [
    { source: 'nvidia', id: 'nvidia-minimaxai/minimaxai/minimax-m3.1-flash', why: 'vault curation: MiniMax M3.1 Flash — NVIDIA Build free, VERIFIED' },
    { source: 'openrouter', id: 'openrouter/cohere/north-mini-code:free', why: 'vault curation: north-mini-code (fallback)' },
    { source: 'opencode', id: 'opencode/deepseek-v4.1-flash-free', why: 'vault curation: Zen free lane (quota-gated — last resort)' },
    { source: 'opencode-go', id: 'opencode-go/beam-free', why: 'vault curation: GO Beam (quota-gated — last resort)' },
  ],
};





export const DEFAULT_LLM_STRATEGY: LLMStrategy = 'go-balanced';

/**
 * Helper — is the given id a custom (user-defined) strategy?
 * Custom strategies use the `custom-<id>` naming convention and live in
 * ~/.olympus/custom-strategies.json. They are loaded at runtime by
 * scripts/apply-strategy.js and surfaced in the UI as a 'Custom' badge.
 */
export function isCustomStrategy(id: string): boolean {
  return typeof id === 'string' && id.startsWith('custom-');
}

/**
 * Helper — type guard for the LLM_STRATEGIES table.
 * Returns true for any built-in GO strategy id (does not include custom strategies,
 * which are loaded dynamically from disk at runtime).
 */
export function isBuiltinStrategy(id: string): id is Exclude<LLMStrategy, `custom-${string}`> {
  return Object.prototype.hasOwnProperty.call(LLM_STRATEGIES, id);
}

/**
 * Vault LLM — used in ALL strategies for vault documentation (session logs,
 * instincts, plans, delegations, dashboards). Always DeepSeek V4 Flash on GO
 * (effectively unlimited for background vault writes on the GO plan).
 *
 * v0.0.1: switched from opencode/mimo-v2.5-free (ZEN free-tier model, which
 * may retain data for training) to opencode-go/deepseek-v4-flash (GO plan,
 * zero-retention). This protects user vault data from training-data retention.
 *
 * The ZEN strategies use their own per-strategy vaultLlm (GLM-5.3 on
 * zen-max-quality, GLM-5.3-Flash on zen-balanced/zen-budget — all
 * zero-retention on Zen; the free-on-Zen trial models may retain data for
 * training during their trial period).
 */
export const VAULT_LLM_MODEL = 'opencode-go/glm-5.3-flash';

/**
 * LLM providers supported by OLYMPUS.
 *
 * OpenRouter + NVIDIA Build are the free-tier providers behind the
 * three free strategies (free-openrouter, free-big-pickle,
 * free-nvidia-build). They're first-class strategies — no GO or ZEN plan
 * needed, no request caps. Quality is lower and each provider has its own rate
 * limits (switch to another free strategy when one runs dry), but OLYMPUS
 * remains 100% functional on any of them.
 *
 * - OpenCode GO: paid subscription for open-weight coding models (GLM-5.3,
 *   Kimi K3 / K2.7 Code, DeepSeek V4 Pro/Flash, Qwen3.7, MiMo V2.5, Grok 4.5,
 *   MiniMax M3/M2.7). Model ID format: opencode-go/<model-id>.
 *   Pricing/limits/caps are subject to change — see GO_PLAN_DOCS_URL and
 *   GO_PLAN_LAST_VERIFIED for the date we last verified the plan details.
 * - OpenCode Zen: curated pay-as-you-go gateway for tested/verified coding
 *   models (GLM-5.3, Kimi K3 / K2.7 Code, DeepSeek V4 Pro/Flash, Qwen3.7,
 *   MiniMax, Grok 4.5, Claude Sonnet 5, GPT 5.x, Gemini 3.x + free trial
 *   models). Model ID format: opencode/<model-id>. Zero-retention (except
 *   the free-on-Zen trial models). Sign in via `olympus opencode` →
 *   `/connect` → OpenCode Zen; the key is stored in OpenCode's auth.json
 *   under the `opencode` provider. See ZEN_PLAN_DOCS_URL and
 *   ZEN_PLAN_LAST_VERIFIED for the date we last verified the plan details.
 * - OpenRouter (free tier): aggregator with free variants of DeepSeek V3,
 *   Llama 3.1, Gemma 2. Model ID format: openrouter/<vendor>/<model>:free.
 *   Rate limit: 20 req/min. Get a key at https://openrouter.ai/keys.
 * - NVIDIA Build (free tier): NVIDIA's free endpoints at
 *   https://build.nvidia.com — GLM-5.3, GLM-5.3-Flash, Kimi K3, Muse
 *   Glimmer, DeepSeek, etc. Model ID format: nvidia-<family>/<vendor>/<model>
 *   (#106's provider split — one client pool per family: nvidia-glm,
 *   nvidia-deepseek, nvidia-kimi, nvidia-meta; same base URL
 *   https://integrate.api.nvidia.com/v1, same nvapi-... key via auth.json
 *   per-family entries). The Nemotron family is BANNED by the user (low
 *   effective context) — zero gods on it, forever. The model list is public
 *   (https://integrate.api.nvidia.com/v1/models). Get a key at
 *   https://build.nvidia.com (Sign In → API).
 *
 * Why no OpenAI/Anthropic providers? If a user has OpenAI/Anthropic API keys,
 * they'd use those vendors' own CLIs (Codex, Claude) — not OLYMPUS via
 * OpenCode. Adding them would be a non-feature. OLYMPUS's value is the
 * multi-agent orchestration on top of open-weight models, not a thin wrapper
 * over proprietary APIs.
 */
export interface LLMProvider {
  id: string;
  displayName: string;
  envKey?: string;
  isFree: boolean;
  requiresAvx2: boolean;
  /** Short description — does NOT cite specific prices/limits (they change). */
  description: string;
}

export const BUILTIN_PROVIDERS: LLMProvider[] = [
  {
    id: 'opencode-go',
    displayName: 'OpenCode GO',
    envKey: 'OPENCODE_GO_API_KEY',
    isFree: false,
    requiresAvx2: false,
    description:
      'OpenCode GO plan — paid subscription for open-weight coding models ' +
      '(Hy3, GLM-5.3, Kimi K3 / K2.7 Code, DeepSeek V4 Pro/Flash, Qwen3.7 Plus, ' +
      'MiMo V2.5, Grok 4.5, MiniMax M3/M2.7). Model format: opencode-go/<id>. ' +
      'Zero-retention. Pricing/limits verified ' + GO_PLAN_LAST_VERIFIED + ' — ' +
      'see ' + GO_PLAN_DOCS_URL + ' for current details.',
  },
  /**
   * OpenCode Zen — curated pay-as-you-go gateway. Sign in via
   * `olympus opencode` → `/connect` → OpenCode Zen and paste the API key;
   * it is stored in OpenCode's own auth.json under the `opencode` provider
   * (env override: OPENCODE_API_KEY). No request caps — charged per request.
   */
  {
    id: 'opencode',
    displayName: 'OpenCode ZEN',
    envKey: 'OPENCODE_API_KEY',
    isFree: false,
    requiresAvx2: false,
    description:
      'OpenCode Zen — curated pay-as-you-go AI gateway for tested coding ' +
      'models (GLM-5.3, Kimi K3 / K2.7 Code, DeepSeek V4 Pro/Flash, Qwen3.7, ' +
      'MiniMax M3/M2.7, Grok 4.5, Claude Sonnet 5, GPT 5.x, Gemini 3.x + free ' +
      'trial models). Model format: opencode/<id>. Zero-retention. Pricing ' +
      'verified ' + ZEN_PLAN_LAST_VERIFIED + ' — see ' + ZEN_PLAN_DOCS_URL +
      ' for current details.',
  },
  /**
   * OpenRouter free tier. Get a key at
   * https://openrouter.ai/keys (free, no credit card). Set as
   * OLYMPUS_OPENROUTER_KEY in env or ~/.olympus/llm-providers.json.
   */
  {
    id: 'openrouter',
    displayName: 'OpenRouter (Free)',
    envKey: 'OLYMPUS_OPENROUTER_KEY',
    isFree: true,
    requiresAvx2: false,
    description:
      'OpenRouter free tier — aggregator with free variants of DeepSeek V3, ' +
      'Llama 3.1, Gemma 2. Model format: openrouter/<vendor>/<model>:free. ' +
      'Rate limit: ~20 req/min. Get a key at https://openrouter.ai/keys.',
  },
  /**
   * NVIDIA Build free tier. Get a free nvapi-... key at
   * https://build.nvidia.com (Sign In → API). Set as OLYMPUS_NVIDIA_KEY in
   * env or ~/.olympus/llm-providers.json, or configure the `nvidia`
   * provider inside OpenCode. The model list is public (no key needed to
   * fetch); the key is only required at request time.
   */
  {
    id: 'nvidia',
    displayName: 'NVIDIA Build (Free)',
    envKey: 'OLYMPUS_NVIDIA_KEY',
    isFree: true,
    requiresAvx2: false,
    description:
      'NVIDIA Build free endpoints (build.nvidia.com) — GLM-5.3, the ' +
      'Nemotron family, DeepSeek, Kimi, Mistral, etc. Model format: ' +
      'nvidia/<vendor>/<model>. Requires a free nvapi-... key.',
  },
];

export const DEFAULT_PROVIDER_ID = 'opencode-go';

/**
 * Legacy constant kept for backwards-compat with code that referenced a
 * single "free" provider. Free strategies are now provider-specific
 * (free-openrouter, free-big-pickle, free-nvidia-build), so this
 * points at the default GO provider.
 */
export const DEFAULT_FREE_PROVIDER_ID = 'opencode-go';

export function getProviderById(id: string): LLMProvider | undefined {
  return BUILTIN_PROVIDERS.find(p => p.id === id);
}

/**
 * Strategy family — the provider world a strategy lives in. Used to decide
 * which model classes are offered in the per-god dropdown and which models
 * apply-strategy.js accepts as per-god overrides.
 *
 *   - GO    → opencode-go/<id> models (GO plan subscription)
 *   - ZEN   → opencode/<id> models (OpenCode Zen, pay-as-you-go)
 *   - FREE  → openrouter/<vendor>/<model>:free + nvidia/<vendor>/<model> (no plan needed)
 *   - CUSTOM → user-defined (~/.olympus/custom-strategies.json)
 */
export type StrategyFamily = 'GO' | 'ZEN' | 'LOCAL' | 'CUSTOM';

export function strategyFamily(id: string): StrategyFamily {
  if (id === 'local') return 'LOCAL';
  if (id.startsWith('custom-')) return 'CUSTOM';
  const cfg = LLM_STRATEGIES[id as Exclude<LLMStrategy, `custom-${string}`>];
  if (cfg && cfg.plan === 'ZEN') return 'ZEN';
  return 'GO';
}

/**
 * The API a strategy needs authorized before it can be activated. Strategies
 * are BLOCKED (Settings UI + providers API) until the required API is
 * configured inside OpenCode — you cannot switch to a plan you can't call.
 *
 *   - go-* strategies  → `opencode-go` provider (GO plan subscription)
 *   - zen-* strategies → `opencode` provider (OpenCode Zen, pay-as-you-go)
 *   - free-*           → the free provider each strategy routes through
 *                        (free-big-pickle rides the GO plan's free beam
 *                        model, so it needs the GO subscription, #190;
 *                        free-openrouter needs the OpenRouter key;
 *                        free-nvidia-build needs the NVIDIA Build key)
 *   - custom-*         → null (depends on the models the user picked)
 *
 * Pure function — safe for client components. The actual detection of which
 * APIs are authorized lives server-side in src/lib/llm-auth.ts (checkLlmAuth).
 */
export type StrategyApiKind = 'go' | 'zen' | 'groq' | 'openrouter' | 'nvidia';

export interface StrategyApiRequirement {
  kind: StrategyApiKind;
  /** Short label shown on a blocked strategy card. */
  label: string;
  /** What to do to unlock the strategy (shown on the blocked card). */
  hint: string;
}

export function strategyApiRequirement(strategy: string): StrategyApiRequirement | null {
  if (strategy.startsWith('custom-')) return null;
  if (strategy.startsWith('go-')) {
    return {
      kind: 'go',
      label: 'GO API',
      hint: 'Requires an active OpenCode GO subscription. Sign in with `olympus opencode` → Settings → add the GO plan (opencode-go provider).',
    };
  }
  if (strategy.startsWith('zen-')) {
    return {
      kind: 'zen',
      label: 'ZEN API',
      hint: 'Requires an OpenCode Zen key. Run `olympus opencode`, then /connect and select OpenCode Zen.',
    };
  }
  // v0.0.22 — the free tier is RETIRED. A saved free-* id resolves to the
  // retirement hint (the apply refuses it; the picker never shows it).
  if (strategy.startsWith('free-')) {
    return {
      kind: 'go',
      label: 'Free tier retired',
      hint: 'The free tier is retired (v0.0.22). Choose GO, Zen, or the Local strategy (your own hardware — see docs/LOCAL-LLM.md).',
    };
  }
  return null;
}

/**
 * GO-plan model catalog (opencode-go/<id>) — the open-weight line the GO
 * plan is built around (GLM, DeepSeek, Qwen, plus Hy3 orchestration and the
 * GO-hosted Kimi/Grok/MiniMax classes). ZEN_MODEL_CLASSES below is the
 * proprietary-API catalog.
 */
export const GO_MODEL_CLASSES = [
  'opencode-go/hy3',
  'opencode-go/glm-5.3',
  'opencode-go/glm-5.3-flash',
  'opencode-go/glm-5.2',
  'opencode-go/beam-free',
  'opencode-go/kimi-k3',
  'opencode-go/kimi-k2.7-code',
  'opencode-go/kimi-k2.6',
  'opencode-go/deepseek-v4.1-flash',
  'opencode-go/deepseek-v4-pro',
  'opencode-go/deepseek-v4-flash',
  'opencode-go/qwen3.8-max',
  'opencode-go/qwen3.8-flash',
  'opencode-go/qwen3.7-plus',
  'opencode-go/mimo-v2.6-flash',
  'opencode-go/mimo-v2.6-pro',
  'opencode-go/mimo-v2.5',
  'opencode-go/grok-4.7',
  'opencode-go/grok-4.6',
  'opencode-go/grok-4.5',
  'opencode-go/minimax-m3',
  'opencode-go/minimax-m2.7',
  'opencode-go/gpt-6-luna',
  'opencode-go/gpt-5.6-luna',
  'opencode-go/longcat-2.0',
];

/**
 * The Zen catalog — every model OpenCode Zen supports (opencode/<id>),
 * verified against https://opencode.ai/docs/zen/ on 2026-07-31 (deprecated
 * models from that list are excluded). Zen's differentiator vs the GO plan
 * is PROPRIETARY APIs: GPT (OpenAI), Claude (Anthropic), Gemini (Google),
 * Grok (xAI), Kimi (Moonshot), MiniMax, and the Qwen-Max/Plus line
 * (Alibaba) are closed models only reachable through Zen — the GO plan
 * runs the open-weight line (GLM, DeepSeek, Hy3).
 *
 * NOTE: OpenAI/Anthropic requests are retained 30 days per their data
 * policies; the open-weight + free-on-Zen trial models are zero-retention
 * (see https://opencode.ai/docs/zen/#privacy).
 */
export const ZEN_MODEL_CLASSES = [
  // OpenAI (proprietary — 30-day retention).
  'opencode/gpt-6-astra',
  'opencode/gpt-6-sol',
  'opencode/gpt-6-luna',
  'opencode/gpt-5.6-sol',
  'opencode/gpt-5.6-terra',
  'opencode/gpt-5.6-luna',
  'opencode/gpt-5.5',
  'opencode/gpt-5.5-pro',
  'opencode/gpt-5.4',
  'opencode/gpt-5.4-pro',
  'opencode/gpt-5.4-mini',
  'opencode/gpt-5.4-nano',
  'opencode/gpt-5.3-codex',
  'opencode/gpt-5.3-codex-spark',
  'opencode/gpt-5.2',
  'opencode/gpt-5.1',
  'opencode/gpt-5',
  'opencode/gpt-5-nano',
  // Anthropic (proprietary — 30-day retention).
  'opencode/claude-fable-5-1',
  'opencode/claude-fable-5',
  'opencode/claude-opus-5-5',
  'opencode/claude-opus-5',
  'opencode/claude-opus-4-8',
  'opencode/claude-opus-4-7',
  'opencode/claude-opus-4-6',
  'opencode/claude-opus-4-5',
  'opencode/claude-sonnet-5',
  'opencode/claude-sonnet-4-6',
  'opencode/claude-sonnet-4-5',
  'opencode/claude-haiku-4-5',
  // Google (proprietary).
  'opencode/gemini-3.8-flash',
  'opencode/gemini-3.7-flash',
  'opencode/gemini-3.6-flash',
  'opencode/gemini-3.5-flash',
  'opencode/gemini-3.5-flash-lite',
  'opencode/gemini-3.1-pro',
  'opencode/gemini-3-flash',
  // xAI (proprietary).
  'opencode/grok-4.7',
  'opencode/grok-4.6',
  'opencode/grok-4.5',
  'opencode/grok-build-0.1',
  // Meta (proprietary).
  'opencode/muse-spark-1.3',
  'opencode/muse-spark-1.2',
  // Alibaba (proprietary hosted — Qwen-Max/Plus line).
  'opencode/qwen3.8-max',
  'opencode/qwen3.8-flash',
  'opencode/qwen3.7-max',
  'opencode/qwen3.7-plus',
  'opencode/qwen3.6-plus',
  'opencode/qwen3.5-plus',
  // Moonshot (proprietary).
  'opencode/kimi-k3',
  'opencode/kimi-k2.7-code',
  'opencode/kimi-k2.6',
  // MiniMax (proprietary).
  'opencode/minimax-m3',
  'opencode/minimax-m2.7',
  // Open-weight models on Zen (also the GO-plan families).
  'opencode/glm-5.3-flash',
  'opencode/glm-5.3',
  'opencode/glm-5.2',
  'opencode/glm-5.1',
  'opencode/deepseek-v4.1-flash',
  'opencode/deepseek-v4-pro',
  'opencode/deepseek-v4-flash',
  'opencode/deepseek-v4-flash-vision-exp',
  // Free-on-Zen trial models (zero-cost; may retain data for training
  // during their trial period — see https://opencode.ai/docs/zen/#privacy).
  'opencode/big-pickle',
  'opencode/space-bunny-free',
  'opencode/longcat-2.5-preview-free',
  'opencode/mimo-v2.6-flash-free',
  'opencode/mimo-v2.5-free',
  'opencode/ling-3.0-flash-fin-free',
  'opencode/muse-spark-1.3-contributor-free',
];

export const FREE_MODEL_CLASSES = [
  // OpenRouter free — every id carries the `:free` suffix (the bare slug is
  // paid; only the `:free` variant is $0). Pruned + re-verified live
  // 2026-10-23 (#192): cohere/north-mini-code:free healthy 200 @ 839ms (the
  // volume lane); thinkingmachines/inkling:free 403 'agentic harnesses only'
  // (= ALIVE-FOR-OPENCODE — the W-X class; apollo's harness-only planner
  // lane) with inkling-small:free the same probe-verified family (the
  // callimachus/fallback lane). REMOVED as dead/unhealthy tonight:
  // google/gemma-4-31b-it:free (429), google/gemma-4-26b-a4b-it:free,
  // poolside/laguna-s-2.1:free, poolside/laguna-xs-2.1:free (429-class
  // flakiness). NO free beam exists on OpenRouter (the #190 beam flagship
  // is GO-only). Nemotron ids are BANNED from the ranked lists entirely
  // (the user's ban — refresh-free-models.js excludes them from top/all).
  'openrouter/cohere/north-mini-code:free',
  'openrouter/thinkingmachines/inkling:free',
  'openrouter/thinkingmachines/inkling-small:free',
  // NVIDIA Build free endpoints — THE DISTRIBUTED PANTHEON's anchor lanes
  // (#106): per-family provider entries (nvidia-glm / nvidia-minimaxai /
  // nvidia-meta / nvidia-openai), each carrying ONLY its family's models.
  // Same base URL (https://integrate.api.nvidia.com/v1), same nvapi-... key
  // (auth.json per-family entries, mirrored from the user's NVIDIA key by
  // apply-strategy.js). The anchor set is USER-PINNED — the refresh
  // verifies availability, never replaces. The Nemotron family is banned
  // by the user (low effective context) — zero gods, forever.
  // 2026-10-23 (#191) live 1-token probe table (20s timeout each):
  //   z-ai/glm-5.3            200 @ 821/2661/4887/2564ms  (healthy 4/4)
  //   minimaxai/minimax-m3.1-flash 200 @ 750/513/2630ms  (NEW volume lane)
  //   meta/muse-glimmer-30b   200 @ 723/655/751/974ms
  //   openai/gpt-oss-20b      200 @ 1178/1595/1367/988ms
  //   google/gemma-4-31b-it   DEAD — 20s timeout x2 (lane REMOVED; the
  //                            nvidia-google family retired with it)
  //   z-ai/glm-5.3-flash + deepseek-ai/deepseek-v4.1-flash DEAD (20s
  //                            timeouts); stepfun-ai/step-5-preview alive
  //                            but UNSTABLE (1-of-3 timeout — NOT pinned);
  //                            poolside/laguna-xs-2.1 flaky (429-class).
  'nvidia-glm/z-ai/glm-5.3',
  'nvidia-minimaxai/minimaxai/minimax-m3.1-flash',
  'nvidia-meta/meta/muse-glimmer-30b',
  'nvidia-openai/openai/gpt-oss-20b',
];

/** All model classes, keyed by family. */
export const MODEL_CLASSES_BY_FAMILY: Record<Exclude<StrategyFamily, 'CUSTOM' | 'LOCAL'>, string[]> = {
  GO: GO_MODEL_CLASSES,
  ZEN: ZEN_MODEL_CLASSES,
};

/**
 * Provider-scoped free catalogs — each free strategy only offers the models
 * that can actually route through its own provider (a Groq pin on
 * free-openrouter would never dispatch, since that strategy doesn't even
 * require a Groq key). `custom-*` keeps the full free catalog because it may
 * mix providers.
 *
 * NOTE: Groq's free tier (12K TPM window) cannot serve the OLYMPUS system
 * prompt (~46K tokens) — every request overflowed and fell into opencode's
 * auto-compaction loop. The free-groq strategy was removed and no groq/*
 * models are offered anywhere (not even custom) so a broken pin can't be set.
 */
export const OPENROUTER_FREE_MODELS = FREE_MODEL_CLASSES.filter(c => c.startsWith('openrouter/'));
// #106: the NVIDIA lanes are family-prefixed (nvidia-glm/ nvidia-deepseek/
// nvidia-kimi/ nvidia-meta/ nvidia-minimaxai/) — one client pool per family.
// The prefix set must stay in sync with NVIDIA_FAMILY_PROVIDERS in
// apply-strategy.js (the 2026-10-23 lane set: glm / minimaxai / meta /
// openai; the dead families nvidia-google/nvidia-step stay matched for
// legacy configs).
export const NVIDIA_FREE_MODELS = FREE_MODEL_CLASSES.filter(c =>
  /^(nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta|nvidia-google|nvidia-step|nvidia-openai|nvidia-minimaxai)\//.test(c));

/**
 * Returns the model classes offered for a given strategy — the strategy's
 * catalog (used by the Settings per-god dropdown and the per-god override
 * validation in /api/olympus/providers/gods). Free strategies are
 * provider-scoped so the dropdown only shows the models that strategy can
 * actually route.
 *
 * #97 (UAT-BUILD-1 Batch A): the return boundary DEDUPES. A duplicated id in
 * any source array reaches the Settings dropdown as two <option key={c}> nodes
 * with the same key and crashes React (the 2026-10-07 UAT crash at
 * settings-dialog.tsx:1073, free-nvidia-build active). The battery suite
 * scripts/catalog-uniqueness.test.mjs gates both layers: the arrays themselves
 * AND this boundary — defense in depth, the arrays should stay clean too.
 */
export function modelClassesForStrategy(strategy: string): string[] {
  return [...new Set(modelClassesForStrategyRaw(strategy))];
}

function modelClassesForStrategyRaw(strategy: string): string[] {
  const fam = strategyFamily(strategy);
  if (fam === 'CUSTOM') {
    // Custom strategies are user-defined (free-only guard retired in v0.0.22).
    // The local strategy (`local`) is the zero-cost path; custom stays for
    // special configurations (e.g., OpenRouter/NVIDIA lanes, enterprise endpoints).
    return FREE_MODEL_CLASSES.length ? FREE_MODEL_CLASSES : GO_MODEL_CLASSES;
  }
  return MODEL_CLASSES_BY_FAMILY[fam];
}

/** True when the model id belongs to the given strategy family. */
export function isModelInFamily(model: string, family: StrategyFamily): boolean {
  if (family === 'GO') return model.startsWith('opencode-go/');
  // `opencode/` does NOT match `opencode-go/` (the char after `opencode` is
  // `-` for GO ids, so the prefix check is unambiguous).
  if (family === 'ZEN') return model.startsWith('opencode/');
  return true; // custom / local — any model id (the user picks their own lane)
}

/**
 * Estimate the cost tier of a custom strategy based on the selected models
 * and the user's authorized APIs.
 * Returns tier ('free' | 'low' | 'moderate' | 'higher') and a human-readable description.
 */
export interface CostEstimate {
  tier: 'free' | 'low' | 'moderate' | 'higher' | 'unknown';
  description: string;
}

export function estimateStrategyCost(
  godModels: Record<string, string>,
  auth: { go?: boolean; zen?: boolean; openrouter?: boolean; nvidia?: boolean; groq?: boolean } | null
): CostEstimate {
  if (!auth || Object.keys(godModels).length === 0) {
    return { tier: 'unknown', description: 'Select models for all gods to estimate cost' };
  }

  const models = Object.values(godModels);
  const uniqueModels = [...new Set(models)];

  // Check if ALL models are free-tier (openrouter/ or nvidia/)
  const allFree = uniqueModels.every(m => m.startsWith('openrouter/') || m.startsWith('nvidia/'));
  if (allFree) {
    // Verify the user has the corresponding free keys
    const needsOpenRouter = uniqueModels.some(m => m.startsWith('openrouter/'));
    const needsNvidia = uniqueModels.some(m => m.startsWith('nvidia/'));
    const hasOpenRouter = auth.openrouter === true;
    const hasNvidia = auth.nvidia === true;
    if ((needsOpenRouter && !hasOpenRouter) || (needsNvidia && !hasNvidia)) {
      return { tier: 'unknown', description: 'Missing API key for selected free models' };
    }
    return { tier: 'free', description: 'All gods on free-tier models — no cost' };
  }

  // Check if all models are from GO plan (opencode-go/)
  const allGO = uniqueModels.every(m => m.startsWith('opencode-go/'));
  if (allGO && auth.go) {
    // Estimate based on model types
    const hasK3 = uniqueModels.some(m => m.includes('kimi-k3'));
    const hasPro = uniqueModels.some(m => m.includes('deepseek-v4-pro') || m.includes('qwen3.7-plus'));
    const allFlash = uniqueModels.every(m => m.includes('deepseek-v4-flash'));
    if (hasK3) return { tier: 'higher', description: 'GO plan with Kimi K3 (tight monthly cap)' };
    if (hasPro) return { tier: 'moderate', description: 'GO plan with Pro-tier models (Qwen3.7 Plus / DeepSeek V4 Pro)' };
    if (allFlash) return { tier: 'low', description: 'GO plan with Flash models only (effectively unlimited)' };
    return { tier: 'moderate', description: 'GO plan mixed models' };
  }

  // Check if all models are from Zen plan (opencode/)
  const allZen = uniqueModels.every(m => m.startsWith('opencode/'));
  if (allZen && auth.zen) {
    const hasClaudeSonnet5 = uniqueModels.some(m => m.includes('claude-sonnet-5'));
    const hasGPT54 = uniqueModels.some(m => m.includes('gpt-5.4'));
    const hasKimiK27 = uniqueModels.some(m => m.includes('kimi-k2.7-code'));
    const allMiniMax = uniqueModels.every(m => m.includes('minimax-m2.7'));
    const allFreeOnZen = uniqueModels.every(m => m.includes('-free'));
    if (hasClaudeSonnet5 || hasGPT54) return { tier: 'higher', description: 'Zen with frontier proprietary models (Claude Sonnet 5 / GPT-5.4)' };
    if (hasKimiK27) return { tier: 'moderate', description: 'Zen with Kimi K2.7 Code + proprietary mix' };
    if (allMiniMax) return { tier: 'low', description: 'Zen with MiniMax M2.7 (lowest proprietary cost)' };
    if (allFreeOnZen) return { tier: 'free', description: 'Zen free-tier models only (trial, may retain data)' };
    return { tier: 'moderate', description: 'Zen plan mixed proprietary models' };
  }

  // Mixed providers -> higher uncertainty
  const hasPaid = uniqueModels.some(m => m.startsWith('opencode-go/') || m.startsWith('opencode/'));
  if (hasPaid) return { tier: 'higher', description: 'Mixed providers — cost varies by usage' };

  return { tier: 'unknown', description: 'Unable to estimate — check API authorization' };
}
