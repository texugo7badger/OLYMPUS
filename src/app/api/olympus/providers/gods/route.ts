/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
// Import LLM strategy layer from model-strategies (canonical home).
// The cli-registry re-exports these for backwards compat, but new code
// should import directly from model-strategies.
import {
  BUILTIN_PROVIDERS, LLM_STRATEGIES,
  DEFAULT_LLM_STRATEGY, isCustomStrategy,
  GO_PLAN_LAST_VERIFIED, GO_PLAN_DOCS_URL,
  ZEN_PLAN_LAST_VERIFIED, ZEN_PLAN_DOCS_URL,
  strategyFamily, modelClassesForStrategy, MODEL_CLASSES_BY_FAMILY,
  strategyApiRequirement,
  type LLMStrategy, type LLMStrategyTier,
  GOD_IDS,
} from '@/lib/model-strategies';
// Server-only auth detection — which APIs are authorized inside OpenCode.
// The strategy-activation gate blocks switching to a strategy whose required
// API is not configured.
import { checkLlmAuth } from '@/lib/llm-auth';
// Shared no-cache headers for live API routes.
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
// Invalidate the warm-server cache after a strategy switch — apply-strategy.js
// kills `opencode serve` (it keeps its startup config in memory), so the
// Next.js-side serverPromise must be dropped or the next message posts to a
// dead server.
import { invalidateServer } from '@/lib/opencode-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');
const PROVIDERS_FILE = path.join(OLYMPUS_HOME, 'llm-providers.json');
const ROOT_PROVIDERS = path.join(process.cwd(), '.opencode', 'llm-providers.json');

// God metadata. Models match the go-balanced strategy in model-strategies.ts.
// GLM-5.2 is reserved for Apollo alone; the `default_class` field is a
// legacy hint kept for backward-compat with the Settings dialog's
// per-god override table.
//
// Callimachus added. Was missing from this map, which caused
// the Settings dialog's per-god table to render only 8 rows and the
// "default_class" for Callimachus to fall through to Apollo's GLM-5.2
// whenever a strategy wasn't resolved. Mirrors src/lib/olympus.ts GOD_META.
const GOD_META: Record<string, { icon: string; default_class: string }> = {
  apollo:      { icon: 'apollo',     default_class: 'opencode-go/glm-5.2' },
  atlas:       { icon: 'git-fork',   default_class: 'opencode-go/qwen3.7-plus' },
  hephaestus:  { icon: 'hephaestus', default_class: 'opencode-go/deepseek-v4-pro' },
  athena:      { icon: 'athena',     default_class: 'opencode-go/qwen3.7-plus' },
  hermes:      { icon: 'hermes',     default_class: 'opencode-go/qwen3.7-plus' },
  artemis:     { icon: 'artemis',    default_class: 'opencode-go/qwen3.7-plus' },
  dionysus:    { icon: 'dionysus',   default_class: 'opencode-go/deepseek-v4-pro' },
  persephone:  { icon: 'persephone', default_class: 'opencode-go/deepseek-v4-pro' },
  prometheus:  { icon: 'prometheus', default_class: 'opencode-go/qwen3.7-plus' },
  callimachus: { icon: 'callimachus', default_class: 'opencode-go/deepseek-v4-flash' },
};

/**
 * Model classes offered per strategy — canonical lists live in
 * src/lib/model-strategies.ts (GO_MODEL_CLASSES / ZEN_MODEL_CLASSES /
 * FREE_MODEL_CLASSES + the provider-scoped free catalogs). GET returns the
 * ACTIVE strategy's catalog as `available_classes` (so the per-god dropdown
 * only shows the models that belong to the active plan) plus the full
 * `class_families` map so the Settings dialog can live-switch the dropdown
 * when the user picks another strategy before saving. POST validates per-god
 * overrides against the effective strategy's catalog — free strategies are
 * provider-scoped (free-openrouter -> OpenRouter only, etc.).
 */
const MODEL_CLASSES = MODEL_CLASSES_BY_FAMILY;

function loadProviders() {
  try {
    const file = fs.existsSync(PROVIDERS_FILE) ? PROVIDERS_FILE : ROOT_PROVIDERS;
    if (!fs.existsSync(file)) {
      return {
        default: 'opencode-go',
        per_god_overrides: {},
        providers: {},
        strategy: DEFAULT_LLM_STRATEGY,
      };
    }
    const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const strategy = (cfg.strategy as LLMStrategy) || DEFAULT_LLM_STRATEGY;
    return {
      default: cfg.default || 'opencode-go',
      per_god_overrides: cfg.per_god_overrides || {},
      providers: cfg.providers || {},
      strategy,
    };
  } catch {
    return {
      default: 'opencode-go',
      per_god_overrides: {},
      providers: {},
      strategy: DEFAULT_LLM_STRATEGY,
    };
  }
}

/**
 * Read the actual model for each god from opencode.json.
 * This reflects what apply-strategy.js wrote, not the static GOD_META defaults.
 */
function loadOpencodeModels(): Record<string, string> {
  const opencodePath = path.join(process.cwd(), 'opencode.json');
  try {
    if (!fs.existsSync(opencodePath)) return {};
    const raw = JSON.parse(fs.readFileSync(opencodePath, 'utf-8'));
    const agents = raw.agent || {};
    const models: Record<string, string> = {};
    for (const [id, cfg] of Object.entries(agents)) {
      if (GOD_META[id] && (cfg as any).model) {
        models[id] = (cfg as any).model;
      }
    }
    return models;
  } catch {
    return {};
  }
}

function saveProviders(cfg: any) {
  try {
    fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
    fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(cfg, null, 2));
  } catch (e: any) {
    throw new Error(`Failed to write ${PROVIDERS_FILE}: ${e.message}`);
  }
}

/**
 * Load user-defined custom strategies from ~/.olympus/custom-strategies.json.
 * Each entry must start with 'custom-' and contain the same shape as a built-in
 * strategy configuration (gods, terminal_llm, vault_llm). See model-strategies.ts.
 */
function listCustomStrategies() {
  const file = path.join(OLYMPUS_HOME, 'custom-strategies.json');
  try {
    if (!fs.existsSync(file)) return [];
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw)
      .filter(([id, cfg]: [string, any]) => id.startsWith('custom-') && cfg && cfg.gods && cfg.terminal_llm)
      .map(([id, cfg]: [string, any]) => ({
        id,
        label: cfg.name || id,
        description: cfg.description || '',
        plan: cfg.plan || 'CUSTOM',
        tier: (cfg.tier as LLMStrategyTier) || 'custom',
        reasoningModel: cfg.gods?.apollo?.model || cfg.terminal_llm?.model || '',
        codeModel: cfg.gods?.hephaestus?.model || '',
        terminalModel: cfg.terminal_llm?.model || '',
        estCostPerDay: cfg.estCostPerDay || 'varies',
        // Raw per-god map — used by the Settings dialog for the "(default)"
        // marker on custom strategies (custom strategies are FREE-ONLY).
        gods: cfg.gods,
        isCustom: true,
      }));
  } catch {
    return [];
  }
}

/**
 * GET /api/olympus/providers/gods
 * Returns the 10 gods (9 specialist gods + Callimachus) with their current model_class
 * + provider override. The `icon` field is a lucide icon key string.
 * Also returns `strategy`, `availableStrategies`, and `availableProviders` (full list).
 */
export async function GET() {
  const cfg = loadProviders();
  const overrides = cfg.per_god_overrides || {};
  const defaultProvider = cfg.default || 'opencode-go';
  const opencodeModels = loadOpencodeModels();

  const gods = Object.entries(GOD_META).map(([id, meta]) => {
    const override = overrides[id] || null;
    // Use the actual model from opencode.json (written by apply-strategy.js)
    // Falls back to GOD_META default if not found.
    const currentClass = opencodeModels[id] || override?.class || meta.default_class;
    return {
      id,
      icon: meta.icon,
      default_class: meta.default_class,
      current_class: currentClass,
      current_provider: override?.provider_model || defaultProvider,
      override,
    };
  });

  return NextResponse.json({
    gods,
    // Only the ACTIVE strategy's model classes (the user asked for
    // the per-god dropdown to show the models that belong to the plan in
    // in use: GO -> opencode-go/*, Zen -> opencode/*, free strategies are
    // provider-scoped (free-openrouter -> openrouter/*
    // :free, free-nvidia-build -> nvidia/*, free-big-pickle -> its flagship)).
    available_classes: modelClassesForStrategy(cfg.strategy),
    // Full family breakdown so the Settings dialog can live-switch the
    // dropdown when the user picks another strategy before saving.
    class_families: MODEL_CLASSES,
    strategy_family: strategyFamily(cfg.strategy),
    default_provider: defaultProvider,
    providers_file: PROVIDERS_FILE,
    // Strategy info.
    strategy: cfg.strategy,
    availableStrategies: Object.entries(LLM_STRATEGIES).map(([id, s]) => ({
      id,
      label: s.label,
      description: s.description,
      plan: s.plan,
      tier: s.tier,
      reasoningModel: s.reasoningModel,
      codeModel: s.codeModel,
      terminalModel: s.terminalModel,
      estCostPerDay: s.estCostPerDay,
      isCustom: false,
    })),
    // Also surface user-defined custom strategies (loaded from disk).
    customStrategies: listCustomStrategies(),
    availableProviders: BUILTIN_PROVIDERS,
    // Pricing/limits/caps are subject to change. Surface the
    // date we last verified the GO plan details + the canonical docs URL so
    // the UI can render "last verified YYYY-MM-DD" next to any plan mention.
    go_plan_last_verified: GO_PLAN_LAST_VERIFIED,
    go_plan_docs_url: GO_PLAN_DOCS_URL,
    zen_plan_last_verified: ZEN_PLAN_LAST_VERIFIED,
    zen_plan_docs_url: ZEN_PLAN_DOCS_URL,
    // Which APIs are authorized right now (server-side check). Client
    // components use this to BLOCK strategy activation until the required
    // API is configured — a strategy you can't call can't be activated.
    auth: checkLlmAuth(),
  }, {
    // Cache-Control: no-store so the Settings dialog shows
    // the latest per-god overrides + strategy after the user changes them.
    headers: NO_CACHE_HEADERS,
  });
}

/**
 * POST /api/olympus/providers/gods
 * Body (per-god override):
 *   { god: 'hephaestus', override: { class?: 'opencode-go/deepseek-v4-pro', provider_model?: 'opencode-go/deepseek-v4-pro' } | null }
 * Body (strategy):
 *   { strategy?: 'go-max-quality' | 'go-balanced' | 'go-budget'
 *              | 'custom-<id>' }
 * Body (default provider):
 *   { defaultProvider?: string }
 * All shapes can be POSTed in the same call.
 *
 * The `activeCli` body field is no longer accepted (ignored if
 * provided for backwards compat). OpenCode is the only CLI. Provider_model
 * examples use OpenCode GO model ids only (e.g. 'opencode-go/glm-5.2',
 * 'opencode-go/deepseek-v4-pro'). Other providers (OpenAI, Anthropic, etc.)
 * should be configured in the user's OpenCode config.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { god, override, strategy, defaultProvider, customStrategy } = body;

    // Handle custom strategy creation
    if (customStrategy) {
      const cs = customStrategy;
      // Validate required fields
      if (!cs.id || !cs.name || !cs.gods || !cs.terminal_llm || !cs.vault_llm) {
        return NextResponse.json({ ok: false, error: 'Missing required fields for custom strategy' }, { status: 400 });
      }
      if (!cs.id.startsWith('custom-')) {
        return NextResponse.json({ ok: false, error: 'Custom strategy id must start with "custom-"' }, { status: 400 });
      }
      // Validate all 10 gods present
      for (const g of GOD_IDS) {
        if (!cs.gods[g]) {
          return NextResponse.json({ ok: false, error: `Missing model for god: ${g}` }, { status: 400 });
        }
      }
      // Validate models against authorized APIs
      const auth = checkLlmAuth();
      for (const model of Object.values<string>(cs.gods)) {
        if (model.startsWith('opencode-go/') && !auth.go) {
          return NextResponse.json({ ok: false, error: `GO plan model ${model} requires GO plan authorization` }, { status: 403 });
        }
        if (model.startsWith('opencode/') && !auth.zen) {
          return NextResponse.json({ ok: false, error: `Zen model ${model} requires Zen plan authorization` }, { status: 403 });
        }
        if (model.startsWith('openrouter/') && !auth.openrouter) {
          return NextResponse.json({ ok: false, error: `OpenRouter model ${model} requires OpenRouter API key` }, { status: 403 });
        }
        if (model.startsWith('nvidia/') && !auth.nvidia) {
          return NextResponse.json({ ok: false, error: `NVIDIA model ${model} requires NVIDIA API key` }, { status: 403 });
        }
      }
      // Load existing custom strategies
      const file = path.join(OLYMPUS_HOME, 'custom-strategies.json');
      let existing: Record<string, any> = {};
      if (fs.existsSync(file)) {
        try { existing = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch {}
      }
      if (existing[cs.id]) {
        return NextResponse.json({ ok: false, error: `Custom strategy ${cs.id} already exists` }, { status: 409 });
      }
      // Save
      existing[cs.id] = {
        name: cs.name,
        description: cs.description || '',
        plan: cs.plan || 'CUSTOM',
        tier: cs.tier || 'custom',
        gods: cs.gods,
        terminal_llm: cs.terminal_llm,
        vault_llm: cs.vault_llm,
        estCostPerDay: cs.estCostPerDay || 'varies',
        created_at: new Date().toISOString(),
      };
      fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(existing, null, 2));
      // Return the created strategy entry (matching listCustomStrategies shape)
      return NextResponse.json({ ok: true, customStrategy: {
        id: cs.id,
        label: cs.name,
        description: cs.description || '',
        plan: 'CUSTOM',
        tier: cs.tier || 'custom',
        terminalModel: cs.terminal_llm.model,
        estCostPerDay: cs.estCostPerDay || 'varies',
        gods: cs.gods,
        isCustom: true,
      }});
    }

    const cfg = loadProviders();
    if (!cfg.per_god_overrides) cfg.per_god_overrides = {};

    // Persist strategy if present.
    // Accept any built-in strategy id OR any user-defined custom-* strategy.
    if (typeof strategy === 'string') {
      const isBuiltin = Object.prototype.hasOwnProperty.call(LLM_STRATEGIES, strategy);
      const isCustom = isCustomStrategy(strategy);
      if (isBuiltin || isCustom) {
        // Activation gate: a strategy is blocked until the API it needs is
        // authorized inside OpenCode (GO plan for go-*, Zen key for zen-*,
        // Groq/OpenRouter/NVIDIA keys for the free strategies). custom-*
        // strategies have no static requirement (depends on their models).
        const req = strategyApiRequirement(strategy);
        if (req) {
          const auth = checkLlmAuth();
          if (!auth[req.kind]) {
            return NextResponse.json(
              {
                ok: false,
                code: 'API_NOT_CONFIGURED',
                error: `${req.label} not configured — this strategy is blocked. ${req.hint}`,
              },
              { status: 403 },
            );
          }
        }
        cfg.strategy = strategy as LLMStrategy;
      }
    }
    // The strategy that will be applied after this request (persisted value
    // wins when the body did not include a strategy). Per-god overrides are
    // validated against THIS strategy's catalog so a user cannot pin a GO
    // model while on Zen (or vice versa) — and on free strategies only that
    // provider's free models are accepted.
    const effectiveStrategy = (cfg.strategy as string) || DEFAULT_LLM_STRATEGY;
    const effectiveClasses = modelClassesForStrategy(effectiveStrategy);

    // Drop per-god overrides that no longer belong to this strategy's catalog
    // (e.g. a super-120b pin from free-openrouter surviving a switch to
    // free-big-pickle, or a GO-model pin on a Zen strategy). Overrides are
    // merged on top of the strategy map at apply time, so a stale entry would
    // silently pin the wrong provider's model. Custom strategies keep the
    // full free catalog (FREE-ONLY — money safety is sacred).
    for (const g of Object.keys(cfg.per_god_overrides)) {
      const c = cfg.per_god_overrides[g]?.class;
      if (c && !effectiveClasses.includes(c)) delete cfg.per_god_overrides[g];
    }

    // Persist default provider if present.
    if (typeof defaultProvider === 'string' && BUILTIN_PROVIDERS.some(p => p.id === defaultProvider)) {
      cfg.default = defaultProvider;
    }

    // Per-god override (existing behavior).
    if (god !== undefined) {
      if (!GOD_META[god]) {
        return NextResponse.json({ ok: false, error: `Unknown god: ${god}` }, { status: 400 });
      }
      if (override && override.class && !effectiveClasses.includes(override.class)) {
        return NextResponse.json(
          { ok: false, error: `Unknown model class for strategy "${effectiveStrategy}": ${override.class}` },
          { status: 400 },
        );
      }
      if (override === null) {
        delete cfg.per_god_overrides[god];
      } else {
        cfg.per_god_overrides[god] = {
          class: override.class || GOD_META[god].default_class,
          ...(override.provider_model ? { provider_model: override.provider_model } : {}),
        };
      }
    }

    saveProviders(cfg);

    // Regenerate opencode.json after ANY change (strategy switch OR per-god
    // override). apply-strategy.js reads per_god_overrides from
    // llm-providers.json and merges them into the model map, so a Settings
    // override now takes effect immediately instead of only feeding telemetry.
    let strategyApplied = false;
    let strategyError: string | null = null;
    const applyScript = path.join(process.cwd(), 'scripts', 'apply-strategy.js');
    if (fs.existsSync(applyScript)) {
      try {
        // Only pass the strategy through to the shell when it matches a
        // known id format (prevents injection); otherwise re-apply the
        // persisted strategy (or the default).
        const isBuiltin = typeof strategy === 'string' && Object.prototype.hasOwnProperty.call(LLM_STRATEGIES, strategy);
        const isCustom = typeof strategy === 'string' && isCustomStrategy(strategy);
        const applyTarget = (isBuiltin || isCustom)
          ? strategy
          : (cfg.strategy && /^(go-[a-z-]+|zen-[a-z-]+|free-[a-z-]+|custom-[a-zA-Z0-9_-]+)$/.test(cfg.strategy))
            ? cfg.strategy
            : DEFAULT_LLM_STRATEGY;
        execSync(`node "${applyScript}" --strategy ${applyTarget}`, {
          cwd: process.cwd(),
          stdio: 'pipe',
          timeout: 15000,
          env: { ...process.env, FORCE_COLOR: '0' },
        });
        strategyApplied = true;
        // apply-strategy.js killed the warm server (its config is loaded at
        // startup) — drop the cached handle so the next message cold-starts
        // against the fresh opencode.json.
        invalidateServer();
      } catch (e: any) {
        strategyError = e.message || String(e);
      }
    } else {
      strategyError = 'scripts/apply-strategy.js not found';
    }

    return NextResponse.json({
      ok: true,
      god,
      override: god ? (cfg.per_god_overrides[god] || null) : undefined,
      strategy: cfg.strategy,
      strategyApplied,
      strategyError,
      defaultProvider: cfg.default,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/olympus/providers/gods?god=<name>
 * Clears the override for a single god.
 */
export async function DELETE(req: NextRequest) {
  try {
    const god = req.nextUrl.searchParams.get('god');
    const customStrategyId = req.nextUrl.searchParams.get('customStrategy');
    
    // Handle custom strategy deletion
    if (customStrategyId) {
      if (!customStrategyId.startsWith('custom-')) {
        return NextResponse.json({ ok: false, error: 'Custom strategy id must start with "custom-"' }, { status: 400 });
      }
      const file = path.join(OLYMPUS_HOME, 'custom-strategies.json');
      if (!fs.existsSync(file)) {
        return NextResponse.json({ ok: false, error: 'No custom strategies found' }, { status: 404 });
      }
      const existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (!existing[customStrategyId]) {
        return NextResponse.json({ ok: false, error: `Custom strategy ${customStrategyId} not found` }, { status: 404 });
      }
      delete existing[customStrategyId];
      fs.writeFileSync(file, JSON.stringify(existing, null, 2));
      return NextResponse.json({ ok: true, customStrategy: customStrategyId });
    }

    // Handle per-god override deletion (existing behavior)
    if (!god || !GOD_META[god]) {
      return NextResponse.json({ ok: false, error: `Unknown god: ${god}` }, { status: 400 });
    }
    const cfg = loadProviders();
    if (cfg.per_god_overrides) delete cfg.per_god_overrides[god];
    saveProviders(cfg);
    return NextResponse.json({ ok: true, god });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
