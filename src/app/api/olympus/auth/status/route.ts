/**
 * GET /api/olympus/auth/status
 *
 * Returns the user's auth configuration status — specifically:
 *   - Whether OpenCode GO plan is authorized (via ~/.config/opencode/auth.json
 *     or ~/.config/opencode/opencode.jsonc)
 *   - Whether free-tier API keys (Groq, OpenRouter, NVIDIA Build) are configured
 *     (and from which store each key is authorized — OpenCode's auth.json,
 *     ~/.olympus/.env, or the legacy llm-providers.json)
 *   - Which strategy is currently active (from ~/.olympus/active-strategy.json)
 *   - Whether the active strategy is functional (config matches state)
 *   - Recommendations for what the user should do next
 *
 * Used by:
 *   - The onboarding wizard (to decide which step 3 to show)
 *   - The settings dialog (to display auth status)
 *   - The /api/olympus/health endpoint (already has its own auth check;
 *     this endpoint provides a more detailed view)
 *
 * The actual detection lives in src/lib/llm-auth.ts (shared with the
 * /api/olympus/providers/gods strategy-activation gate).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  checkGoPlanAuth, checkZenPlanAuth, checkFreeTierKeys,
  type GoPlanAuth, type ZenPlanAuth, type FreeTierAuth,
} from '@/lib/llm-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLYMPUS_HOME = join(homedir(), '.olympus');
const ACTIVE_STRATEGY_FILE = join(OLYMPUS_HOME, 'active-strategy.json');

interface AuthStatus {
  // Top-level summary
  configured: boolean;        // At least one auth path is configured
  recommended_strategy: string;  // What we think the user should use
  recommended_reason: string;    // Why

  // GO plan
  go_plan: GoPlanAuth;

  // Zen plan (pay-as-you-go)
  zen_plan: ZenPlanAuth;

  // Free-tier
  free_tier: FreeTierAuth;

  // Active strategy (from state file)
  active_strategy: {
    strategy: string | null;
    applied_at: string | null;
    agent_count: number | null;
    god_prompts: 'file_refs' | 'inlined' | 'unknown' | null;
    demigods_loaded: boolean | null;
    detail: string;
  } | null;

  // Recommendations
  recommendations: Array<{
    severity: 'info' | 'warn' | 'crit';
    action: string;
    command?: string;
  }>;
}

/**
 * Read the active-strategy state file written by apply-strategy.js.
 */
function readActiveStrategy(): AuthStatus['active_strategy'] {
  if (!existsSync(ACTIVE_STRATEGY_FILE)) {
    return {
      strategy: null,
      applied_at: null,
      agent_count: null,
      god_prompts: 'unknown',
      demigods_loaded: null,
      detail: 'No strategy applied yet. Run `node scripts/apply-strategy.js --strategy <id>`.',
    };
  }
  try {
    const state = JSON.parse(readFileSync(ACTIVE_STRATEGY_FILE, 'utf-8'));
    return {
      strategy: state.strategy || null,
      applied_at: state.applied_at || null,
      agent_count: state.agent_count ?? null,
      god_prompts: state.god_prompts || 'unknown',
      demigods_loaded: state.demigods_loaded ?? null,
      detail: `Strategy "${state.strategy}" applied at ${state.applied_at} (${state.agent_count} agents, ${state.demigods_loaded ? 'with' : 'without'} demigods).`,
    };
  } catch (e: any) {
    return {
      strategy: null,
      applied_at: null,
      agent_count: null,
      god_prompts: 'unknown',
      demigods_loaded: null,
      detail: `Could not read state file: ${e.message}`,
    };
  }
}

export async function GET() {
  const goPlan = checkGoPlanAuth();
  const zenPlan = checkZenPlanAuth();
  const freeTier = checkFreeTierKeys();
  const activeStrategy = readActiveStrategy();

  // Determine recommended strategy
  let recommendedStrategy = 'go-balanced';
  let recommendedReason = '';

  if (goPlan.configured) {
    recommendedStrategy = 'go-balanced';
    recommendedReason = 'GO plan detected — use go-balanced for the full 128-agent OLYMPUS experience. Switch to go-budget for savings or go-max-quality for best quality.';
  } else if (zenPlan.configured) {
    recommendedStrategy = 'zen-balanced';
    recommendedReason = 'OpenCode Zen detected — use zen-balanced for the full 128-agent OLYMPUS experience on pay-as-you-go models (no request caps). Zero-retention, charged per request.';
  } else if (freeTier.both_keys) {
    recommendedStrategy = 'free-openrouter';
    recommendedReason = 'Free-tier keys detected — free-openrouter routes the primary trio to the strongest OpenRouter free model currently live, specialists to the second-strongest, Callimachus to a fast background model. OpenRouter alone is enough for a working free tier.';
  } else if (freeTier.openrouter_key) {
    recommendedStrategy = 'free-openrouter';
    recommendedReason = 'Only OpenRouter key detected — free-openrouter routes gods to the strongest OpenRouter free models (nemotron-3-ultra-550b, super-120b, ling-3.0-flash).';
  } else if (freeTier.groq_key) {
    // Groq's free tier (12K TPM) cannot serve the OLYMPUS system prompt —
    // there is no free-groq strategy anymore. Tell the user to add OpenRouter.
    recommendedStrategy = '(none)';
    recommendedReason = 'Groq key detected, but the Groq free tier was removed from OLYMPUS (12K TPM window too small for the system prompt). Add an OpenRouter key (https://openrouter.ai/keys) to use the free strategies.';
  } else if (freeTier.nvidia_key) {
    recommendedStrategy = 'free-nvidia-build';
    recommendedReason = 'NVIDIA Build key detected — the "Free Nvidia Build" strategy routes gods to NVIDIA\'s free endpoints (build.nvidia.com: GLM-5.3, the Nemotron family, etc.), refreshed automatically from the live NVIDIA model list.';
  } else {
    recommendedStrategy = '(none)';
    recommendedReason = 'No auth configured. Run `olympus opencode` and either sign in to the GO plan or add free-tier API keys (OpenRouter / NVIDIA Build) inside OpenCode.';
  }

  // Build recommendations
  const recommendations: AuthStatus['recommendations'] = [];

  if (!goPlan.configured && !zenPlan.configured && !freeTier.groq_key && !freeTier.openrouter_key && !freeTier.nvidia_key) {
    recommendations.push({
      severity: 'crit',
      action: 'No LLM auth configured. OLYMPUS cannot dispatch tasks.',
      command: 'Run `olympus opencode`, then sign in to the GO plan, add OpenCode Zen (`/connect`), or add OpenRouter/NVIDIA as providers in Settings.',
    });
  } else if (!goPlan.configured && zenPlan.configured && !freeTier.groq_key && !freeTier.openrouter_key && !freeTier.nvidia_key) {
    recommendations.push({
      severity: 'info',
      action: 'OpenCode Zen authorized — the ZEN strategy (full 128-agent OLYMPUS, pay-as-you-go) is ready. Consider the GO plan for fixed monthly pricing.',
      command: 'https://opencode.ai/docs/zen/',
    });
  } else if (!goPlan.configured && !zenPlan.configured && freeTier.both_keys) {
    recommendations.push({
      severity: 'info',
      action: 'Free-tier mode ready (free-openrouter / free-big-pickle / free-nvidia-build). Consider signing up for the GO plan for better quality (Apollo on GLM-5.3, specialists on Kimi K3).',
      command: 'https://opencode.ai/docs/go/',
    });
  } else if (!goPlan.configured && freeTier.groq_key && !freeTier.openrouter_key) {
    recommendations.push({
      severity: 'warn',
      action: 'Only Groq key configured. Groq\'s free tier was removed from OLYMPUS (12K TPM window too small) — add an OpenRouter key for the free strategies.',
      command: 'Get a free key at https://openrouter.ai/keys — add inside OpenCode (`olympus opencode` → Settings → Providers).',
    });
  } else if (!goPlan.configured && !zenPlan.configured && !freeTier.groq_key && freeTier.openrouter_key) {
    recommendations.push({
      severity: 'info',
      action: 'OpenRouter key configured — free-openrouter is ready.',
      command: 'Get a free key at https://openrouter.ai/keys — add inside OpenCode (`olympus opencode` → Settings → Providers).',
    });
  } else if (!goPlan.configured && !zenPlan.configured && !freeTier.groq_key && !freeTier.openrouter_key && freeTier.nvidia_key) {
    recommendations.push({
      severity: 'info',
      action: 'NVIDIA Build key configured — the Free Nvidia Build strategy is ready (GLM-5.3 + Nemotron family free endpoints, refreshed automatically).',
      command: 'https://build.nvidia.com — or run `node scripts/apply-strategy.js --strategy free-nvidia-build`.',
    });
  }

  // Check if active strategy matches the recommended one
  if (activeStrategy?.strategy && activeStrategy.strategy !== recommendedStrategy && recommendedStrategy !== '(none)') {
    recommendations.push({
      severity: 'info',
      action: `Active strategy is "${activeStrategy.strategy}" but recommended is "${recommendedStrategy}".`,
      command: `node scripts/apply-strategy.js --strategy ${recommendedStrategy}`,
    });
  }

  // Check if active strategy is stale (no state file but auth is configured)
  if (!activeStrategy?.strategy && (goPlan.configured || zenPlan.configured || freeTier.groq_key || freeTier.openrouter_key || freeTier.nvidia_key)) {
    recommendations.push({
      severity: 'warn',
      action: 'Auth is configured but no strategy has been applied. OLYMPUS may not be using the optimal model map.',
      command: `node scripts/apply-strategy.js --strategy ${recommendedStrategy}`,
    });
  }

  const configured = goPlan.configured || zenPlan.configured || freeTier.groq_key || freeTier.openrouter_key || freeTier.nvidia_key;

  const status: AuthStatus = {
    configured,
    recommended_strategy: recommendedStrategy,
    recommended_reason: recommendedReason,
    go_plan: goPlan,
    zen_plan: zenPlan,
    free_tier: freeTier,
    active_strategy: activeStrategy,
    recommendations,
  };

  return NextResponse.json(status, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
