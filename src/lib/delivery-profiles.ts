/**
 * delivery-profiles.ts — v0.0.98-15: the campaign's size is a choice.
 *
 * The 51-hop AIME plan and the 25-hop Plan Health specimen showed the same
 * gap: OLYMPUS could warn about size but had no user-selectable contract for
 * how big a campaign should be. The four profiles are that contract.
 *
 * Pure by design: the definitions and the plan check run in the browser, the
 * API and the walker. The filesystem store lives in delivery-profile-store.ts.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export type DeliveryProfileId = 'spike' | 'demo' | 'base' | 'complete';

export interface DeliveryProfile {
  id: DeliveryProfileId;
  label: string;
  tagline: string;
  /** Maximum plan hops; a larger plan is refused when this profile is active. */
  maxHops: number;
  /** Maximum verification hops (qa/gate/design-gate). */
  maxVerificationHops: number;
  /** Hard campaign budget, in milliseconds. */
  budgetMs: number;
  /** Minimum design score; 0 means "no design gate". */
  designScore: number;
  requiresDesignGate: boolean;
  requiresQaGate: boolean;
  doD: string[];
}

export const DELIVERY_PROFILES: Record<DeliveryProfileId, DeliveryProfile> = {
  spike: {
    id: 'spike',
    label: 'Spike',
    tagline: 'Proof of concept — one flow, fastest path',
    maxHops: 4,
    maxVerificationHops: 1,
    budgetMs: 30 * 60_000,
    designScore: 0,
    requiresDesignGate: false,
    requiresQaGate: false,
    doD: ['one working flow', 'build + route gate', 'a preview URL and the honest limits'],
  },
  demo: {
    id: 'demo',
    label: 'Demo',
    tagline: 'Vertical slice — one or two flows',
    maxHops: 6,
    maxVerificationHops: 2,
    budgetMs: 45 * 60_000,
    designScore: 7,
    requiresDesignGate: true,
    requiresQaGate: true,
    doD: ['one or two flows', 'design gate 7+', 'smoke QA on the served app', 'build + route gate'],
  },
  base: {
    id: 'base',
    label: 'Base',
    tagline: 'MVP — core flows, measured',
    maxHops: 10,
    maxVerificationHops: 3,
    budgetMs: 90 * 60_000,
    designScore: 8,
    requiresDesignGate: true,
    requiresQaGate: true,
    doD: ['core flows', 'design gate 8+', 'core E2E', 'basic a11y', 'build + route gate'],
  },
  complete: {
    id: 'complete',
    label: 'Complete',
    tagline: 'Full project — all flows, full gates',
    maxHops: 60,
    maxVerificationHops: 20,
    budgetMs: 4 * 60 * 60_000,
    designScore: 9,
    requiresDesignGate: true,
    requiresQaGate: true,
    doD: ['all flows', 'design gate 9+', 'full QA + a11y + perf', 'report and honest limits'],
  },
};

export const DELIVERY_PROFILE_IDS = Object.keys(DELIVERY_PROFILES) as DeliveryProfileId[];

export function isDeliveryProfileId(value: unknown): value is DeliveryProfileId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DELIVERY_PROFILES, value);
}

export function resolveProfile(value: unknown): DeliveryProfile {
  return isDeliveryProfileId(value) ? DELIVERY_PROFILES[value] : DELIVERY_PROFILES.base;
}

export interface DeliveryPlanCheck {
  profile: DeliveryProfile;
  ok: boolean;
  violations: string[];
  warnings: string[];
}

/** Pure plan check used by the API, the UI and the walker. */
export function profilePlanCheck(plan: { hops?: Array<{ id?: string } > } | null | undefined, profileId: unknown): DeliveryPlanCheck {
  const profile = resolveProfile(profileId);
  const hops = Array.isArray(plan?.hops) ? plan!.hops : [];
  const verification = hops.filter((h) => /^(qa|gate|design-gate)[-_]/i.test(String(h?.id ?? ''))).length;
  const violations: string[] = [];
  const warnings: string[] = [];
  if (hops.length > profile.maxHops) {
    violations.push(`${hops.length} hops > ${profile.maxHops} (${profile.label})`);
  } else if (hops.length > Math.max(1, profile.maxHops - 1)) {
    warnings.push(`${hops.length}/${profile.maxHops} hops — at the profile ceiling`);
  }
  if (verification > profile.maxVerificationHops) {
    violations.push(`${verification} verification hops > ${profile.maxVerificationHops} (${profile.label})`);
  }
  if (profile.requiresDesignGate && !hops.some((h) => /^design-(gate|review)/i.test(String(h?.id ?? '')))) {
    violations.push(`${profile.label} requires a design-gate/design-review hop`);
  }
  if (profile.requiresQaGate && !hops.some((h) => /^(qa|gate)[-_]/i.test(String(h?.id ?? '')))) {
    violations.push(`${profile.label} requires a QA/gate hop`);
  }
  return { profile, ok: violations.length === 0, violations, warnings };
}
