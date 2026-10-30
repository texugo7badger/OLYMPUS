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
    recommendedReason = 'GO plan detected — use go-balanced for the full 132-agent OLYMPUS experience. Switch to go-budget for savings or go-max-quality for best quality.';
  } else if (zenPlan.configured) {
    recommendedStrategy = 'zen-balanced';
    recommendedReason = 'OpenCode Zen detected — use zen-balanced for the full 132-agent OLYMPUS experience on pay-as-you-go models (no request caps). Zero-retention, charged per request.';
  } else {
    recommendedStrategy = 'local';
    recommendedReason = 'No GO or ZEN plan detected. The zero-cost path is the LOCAL lane (your own hardware — Ollama / LM Studio / vLLM / llama.cpp / any OpenAI-compatible endpoint). You can also build a custom strategy from any provider registered in OpenCode (free endpoints included, with a speed/limit warning).';
  }

  // Build recommendations
  const recommendations: AuthStatus['recommendations'] = [];

  if (!goPlan.configured && !zenPlan.configured && !freeTier.openrouter_key && !freeTier.nvidia_key) {
    recommendations.push({
      severity: 'crit',
      action: 'No LLM auth configured. OLYMPUS cannot dispatch tasks.',
      command: 'Run `olympus opencode`, then sign in to the GO plan, add OpenCode Zen (`/connect`), or add a provider in Settings. The zero-cost path is the Local lane.',
    });
  } else if (!goPlan.configured && !zenPlan.configured) {
    recommendations.push({
      severity: 'info',
      action: 'No GO or ZEN plan detected. The zero-cost path is the Local strategy (your own hardware). A custom strategy may also use any provider registered in OpenCode — free endpoints are allowed but are slow and rate-limited.',
      command: 'https://opencode.ai/docs/go/ · https://opencode.ai/docs/zen/',
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
