/**
 * burn-policy.ts — v0.0.96: the quota-aware quality router.
 *
 * The user's rule: use the best models the plan can afford, burn the monthly
 * allowance by the reset day, and step down automatically when the projection
 * would cross the cap or a 5h/weekly window is near its ceiling.
 *
 * This module is PURE. It takes the account truth (console anchor + local
 * delta) and returns a roster (one model per god) with the reason. The
 * runtime applies the roster at the next hop/message; it never rewrites
 * opencode.json and never kills the warm server mid-turn.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type BurnMode = 'off' | 'pace' | 'burn' | 'reserve';
export type GodId = 'apollo' | 'atlas' | 'artemis' | 'athena' | 'dionysus' | 'hephaestus' | 'hermes' | 'persephone' | 'prometheus' | 'callimachus';

export interface BurnLadder {
  /** Best quality for the role. */
  top: string;
  /** The daily driver (base). */
  daily: string;
  /** The cost-effective reserve. */
  reserve: string;
}

export const BURN_LADDERS: Record<GodId, BurnLadder> = {
  // GO Plus models only. The live GO catalog (inference/go/v1/models) is the
  // authority: it does not list Claude Opus/Sonnet — those are Zen models.
  // Kimi K3 is the strongest GO reasoning/code-review lane; Kimi K2.7 Code
  // is the coding daily driver; DeepSeek V4.1 Flash 1017 is the value leader;
  // Qwen3.7 Plus covers frontend/integrations; Hy3 stays Atlas; MiniMax M3
  // covers DevOps. Claude Haiku 5.5 is the cheap reserve.
  apollo: { top: 'opencode-go/kimi-k2.7-code', daily: 'opencode-go/deepseek-v4.1-flash', reserve: 'opencode-go/glm-5.3-flash' },
  atlas: { top: 'opencode-go/hy3', daily: 'opencode-go/hy3', reserve: 'opencode-go/hy3' },
  hephaestus: { top: 'opencode-go/kimi-k2.7-code', daily: 'opencode-go/kimi-k2.7-code', reserve: 'opencode-go/deepseek-v4.1-flash' },
  athena: { top: 'opencode-go/deepseek-v4.1-flash', daily: 'opencode-go/deepseek-v4.1-flash', reserve: 'opencode-go/glm-5.3-flash' },
  artemis: { top: 'opencode-go/kimi-k2.7-code', daily: 'opencode-go/deepseek-v4.1-flash', reserve: 'opencode-go/glm-5.3-flash' },
  dionysus: { top: 'opencode-go/deepseek-v4.1-flash', daily: 'opencode-go/deepseek-v4.1-flash', reserve: 'opencode-go/glm-5.3-flash' },
  hermes: { top: 'opencode-go/mimo-v2.6-flash', daily: 'opencode-go/mimo-v2.6-flash', reserve: 'opencode-go/deepseek-v4.1-flash' },
  persephone: { top: 'opencode-go/deepseek-v4.1-flash', daily: 'opencode-go/deepseek-v4.1-flash', reserve: 'opencode-go/glm-5.3-flash' },
  prometheus: { top: 'opencode-go/mimo-v2.6-flash', daily: 'opencode-go/mimo-v2.6-flash', reserve: 'opencode-go/deepseek-v4.1-flash' },
  callimachus: { top: 'opencode-go/deepseek-v4.1-flash', daily: 'opencode-go/deepseek-v4.1-flash', reserve: 'opencode-go/glm-5.3-flash' },
};

export const BURN_GODS: GodId[] = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];

export interface BurnPolicyState {
  mode: BurnMode;
  /** The end-of-period target (the reserve is 100 - target). */
  targetPct: number;
  /** Hard ceiling for a single model's monthly allowance before it is skipped. */
  modelCeilingPct: number;
  updatedAt: string;
}

export const DEFAULT_BURN_POLICY: BurnPolicyState = {
  mode: 'off',
  targetPct: 95,
  modelCeilingPct: 85,
  updatedAt: new Date(0).toISOString(),
};

export interface BurnModelUsage {
  /** Bare GO model id (no provider prefix). */
  model: string;
  /** Monthly % of the model's own cap, when known. */
  pctMonth: number | null;
  limitUsd: number | null;
}

export interface BurnInput {
  policy: Pick<BurnPolicyState, 'mode' | 'targetPct' | 'modelCeilingPct'>;
  /** Account monthly %, from the console anchor (null = no exact truth). */
  accountPct: number | null;
  /** The measured account burn, % per day. */
  dailyPct: number;
  /** Days until the subscription reset. */
  daysLeft: number;
  h5Pct: number | null;
  weeklyPct: number | null;
  /** Age of the console anchor; >5 min freezes upgrades. */
  anchorAgeMs?: number | null;
  /** The console's rolling reset, shown when quota-hit. */
  rollingResetAt?: string | null;
  models: BurnModelUsage[];
  /** Registered/enabled model ids (`opencode-go/<id>`); empty = no filter. */
  enabledModels?: string[];
}

export interface BurnReason {
  god: GodId;
  model: string;
  tier: 'top' | 'daily' | 'reserve';
  reason: string;
}

export interface BurnDecision {
  active: boolean;
  mode: BurnMode;
  targetPct: number;
  accountPct: number | null;
  dailyPct: number;
  projectedPct: number | null;
  daysLeft: number;
  step: -1 | 0 | 1;
  roster: Partial<Record<GodId, string>>;
  reasons: BurnReason[];
  /** Set when the decision cannot be made honestly. */
  blocked: 'off' | 'console-sync-required' | 'stale-anchor' | 'quota-hit' | null;
  /** When quota-hit, the console's rolling reset (resume time). */
  resumeAt?: string | null;
  generatedAt: string;
}

function bare(model: string): string {
  return String(model || '').replace(/^opencode-go\//, '');
}

function full(model: string): string {
  return model.startsWith('opencode-go/') ? model : `opencode-go/${model}`;
}

/**
 * The pure decision. It intentionally uses a BAND (not a per-token
 * optimizer): quality work is bursty, and a stable roster that changes only
 * when the projection leaves the band avoids thrash mid-campaign.
 */
export function chooseBurnRoster(input: BurnInput): BurnDecision {
  const { policy } = input;
  const now = new Date().toISOString();
  const projectedPct = input.accountPct == null ? null : Math.min(999, input.accountPct + Math.max(0, input.dailyPct) * Math.max(0, input.daysLeft));
  if (policy.mode === 'off') {
    return {
      active: false, mode: 'off', targetPct: policy.targetPct,
      accountPct: input.accountPct, dailyPct: input.dailyPct, projectedPct,
      daysLeft: input.daysLeft, step: 0, roster: {}, reasons: [],
      blocked: 'off', generatedAt: now,
    };
  }
  if (input.accountPct == null || projectedPct == null) {
    return {
      active: true, mode: policy.mode, targetPct: policy.targetPct,
      accountPct: null, dailyPct: input.dailyPct, projectedPct: null,
      daysLeft: input.daysLeft, step: 0, roster: {}, reasons: [],
      blocked: 'console-sync-required', generatedAt: now,
    };
  }
  // v0.0.97 — A STALE ANCHOR CANNOT UPGRADE. The old controller saw the local
  // 26.6% while the console was 41%/71% rolling and recommended an upgrade.
  // An anchor older than five minutes freezes the roster; the user must sync.
  if (input.anchorAgeMs != null && Number.isFinite(input.anchorAgeMs) && input.anchorAgeMs > 5 * 60_000) {
    return {
      active: true, mode: policy.mode, targetPct: policy.targetPct,
      accountPct: input.accountPct, dailyPct: input.dailyPct, projectedPct,
      daysLeft: input.daysLeft, step: 0, roster: {}, reasons: [],
      blocked: 'stale-anchor', generatedAt: now,
    };
  }

  const rolling = input.h5Pct ?? 0;
  const weekly = input.weeklyPct ?? 0;
  const target = Math.max(10, Math.min(100, Number(policy.targetPct) || 95));
  const behind = projectedPct < target - 8;
  const ahead = projectedPct > target + 5;
  // The rolling window is the immediate ceiling; 65% is the step-down line,
  // 80% the hard reserve line. The monthly/weekly guards are equally hard.
  if (rolling >= 100) {
    return {
      active: true, mode: policy.mode, targetPct: policy.targetPct,
      accountPct: input.accountPct, dailyPct: input.dailyPct, projectedPct,
      daysLeft: input.daysLeft, step: -1, roster: {}, reasons: [],
      blocked: 'quota-hit', resumeAt: input.rollingResetAt ?? null, generatedAt: now,
    };
  }
  const pressure = rolling >= 65 || weekly >= 75;
  const hardPressure = rolling >= 80 || weekly >= 90 || input.accountPct >= 80 || projectedPct > 100;
  const step: -1 | 0 | 1 = pressure || hardPressure || ahead ? -1 : behind ? 1 : 0;

  const usage = new Map(input.models.map((m) => [bare(m.model), m]));
  const enabled = new Set((input.enabledModels ?? []).map(full));
  const ceiling = Math.max(50, Math.min(99, Number(policy.modelCeilingPct) || 85));

  const roster: Partial<Record<GodId, string>> = {};
  const reasons: BurnReason[] = [];
  const picks = new Map<string, number>();
  for (const god of BURN_GODS) {
    const ladder = BURN_LADDERS[god];
    const order: Array<{ tier: 'top' | 'daily' | 'reserve'; model: string }> = step > 0
      ? [{ tier: 'top', model: ladder.top }, { tier: 'daily', model: ladder.daily }, { tier: 'reserve', model: ladder.reserve }]
      : step < 0
        ? [{ tier: 'reserve', model: ladder.reserve }, { tier: 'daily', model: ladder.daily }, { tier: 'top', model: ladder.top }]
        : [{ tier: 'daily', model: ladder.daily }, { tier: 'top', model: ladder.top }, { tier: 'reserve', model: ladder.reserve }];
    let picked: { tier: 'top' | 'daily' | 'reserve'; model: string } | null = null;
    let skip: string | null = null;
    for (const candidate of order) {
      const model = full(candidate.model);
      if (enabled.size > 0 && !enabled.has(model)) { skip = `${model} is not enabled in OpenCode`; continue; }
      const u = usage.get(bare(model));
      if (u?.pctMonth != null && u.pctMonth >= ceiling) { skip = `${bare(model)} at ${Math.round(u.pctMonth)}% of its own cap`; continue; }
      // Diversify: a top lane with a small per-model cap must not carry all
      // ten gods. Two top / four daily assignments per model is the ceiling;
      // the next god falls to the next rung.
      const used = picks.get(model) ?? 0;
      if (candidate.tier === 'top' && used >= 2) { skip = `${bare(model)} already carries two top roles`; continue; }
      if (candidate.tier === 'daily' && used >= 4) { skip = `${bare(model)} already carries four daily roles`; continue; }
      picked = candidate;
      picks.set(model, used + 1);
      break;
    }
    if (!picked) {
      // Never invent a lane: keep the static config for this god.
      reasons.push({ god, model: '', tier: 'reserve', reason: skip ?? 'no enabled lane within the model ceiling — static config stays' });
      continue;
    }
    roster[god] = picked.model;
    const why = step > 0
      ? `behind: projected ${Math.round(projectedPct)}% < ${target}% target`
      : step < 0
        ? (pressure || hardPressure ? `window pressure (rolling ${Math.round(rolling)}%, weekly ${Math.round(weekly)}%) — step down` : `ahead: projected ${Math.round(projectedPct)}% > ${target}% target`)
        : `inside the ${Math.max(0, target - 8)}–${target + 5}% band`;
    reasons.push({ god, model: picked.model, tier: picked.tier, reason: `${why} → ${picked.tier}` });
  }

  return {
    active: true,
    mode: policy.mode,
    targetPct: target,
    accountPct: input.accountPct,
    dailyPct: input.dailyPct,
    projectedPct,
    daysLeft: input.daysLeft,
    step,
    roster,
    reasons,
    blocked: null,
    generatedAt: now,
  };
}

/** Normalize an untrusted policy file. */
export function normalizeBurnPolicy(input: unknown): BurnPolicyState {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<BurnPolicyState>;
  const mode: BurnMode = raw.mode === 'pace' || raw.mode === 'burn' || raw.mode === 'reserve' ? raw.mode : 'off';
  const target = Number(raw.targetPct);
  const ceiling = Number(raw.modelCeilingPct);
  return {
    mode,
    targetPct: Number.isFinite(target) ? Math.max(50, Math.min(100, target)) : DEFAULT_BURN_POLICY.targetPct,
    modelCeilingPct: Number.isFinite(ceiling) ? Math.max(50, Math.min(99, ceiling)) : DEFAULT_BURN_POLICY.modelCeilingPct,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
  };
}
