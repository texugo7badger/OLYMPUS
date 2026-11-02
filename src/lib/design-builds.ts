/**
 * design-builds.ts — v0.0.32 (Epic P seed): the design build registry.
 *
 * A BUILD is the loadout a god equips for a task class: god + demigods +
 * skills + MCPs + model + verification. The seed builds below are the
 * combinations the arsenal already supports (OriginKit, shadcn, Playwright,
 * the design skills). The registry LEARNS: the arsenal-resonance log
 * (~/OLYMPUS-VAULT/03_Index/arsenal-resonance.jsonl) is joined by god +
 * signature keywords + exact skill/MCP/demigod matches, and the build's tier
 * is derived from real outcomes (hot ≥ 0.8 over ≥ 5 samples, warm ≥ 0.5 over
 * ≥ 2). A user-created build is `source: 'user'` and is never overwritten.
 *
 * Pure by design; the route does the fs I/O.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type BuildTier = 'hot' | 'warm' | 'cold';

export type BuildCategory = 'design' | 'code' | 'qa' | 'security' | 'data' | 'infra' | 'integration' | 'planning' | 'memory' | 'curation' | 'custom';

export interface DesignBuild {
  id: string;
  name: string;
  /** v0.0.32 — the hub groups by sector; user builds derive it. */
  category?: BuildCategory;
  /** What task class this build is for (keywords the matcher reads). */
  signature: string;
  god: string;
  demigods: string[];
  skills: string[];
  mcps: string[];
  /** Optional lane hint (a model id or class). */
  model?: string;
  verify: string[];
  /** Seed tier before evidence; the matcher may promote/demote. */
  tier: BuildTier;
  source: 'seed' | 'user';
  /** v0.0.32 — the sharing base: a user build may be published later. */
  shared?: boolean;
  note?: string;
}

export interface DesignBuildStats {
  samples: number;
  successes: number;
  /** Laplace-smoothed success (never a fake 0% on one sample). */
  rate: number;
  tier: BuildTier;
  lastUsed: string | null;
}

export interface DesignBuildWithStats extends DesignBuild {
  stats: DesignBuildStats;
}

/** One row of the arsenal-resonance log. */
export interface ResonanceRow {
  ts?: string;
  task_signature?: string;
  god?: string;
  skill?: string | null;
  mcp?: string | null;
  demigod?: string | null;
  outcome?: string;
}

export const SEED_DESIGN_BUILDS: DesignBuild[] = [
  {
    id: 'hero-editorial', name: 'Editorial hero', signature: 'landing hero headline editorial brand hero section',
    god: 'athena', demigods: ['ui-designer'], skills: ['frontend-design', 'design-md', 'impeccable'],
    mcps: ['originkit', 'context7'], verify: ['visual:hero-exists', 'a11y:contrast', 'build'], tier: 'warm',
    source: 'seed', note: 'The default premium hero: a reference-backed direction, tokens first.',
  },
  {
    id: 'dashboard-system', name: 'Dashboard system', signature: 'dashboard admin panel metrics table sidebar',
    god: 'athena', demigods: ['state-architect'], skills: ['design-system', 'frontend-patterns'],
    mcps: ['context7', 'shadcn'], verify: ['build', 'lint', 'visual:dashboard-exists'], tier: 'warm',
    source: 'seed', note: 'Right rail + shell + data surfaces; shadcn primitives for density.',
  },
  {
    id: 'auth-flow', name: 'Auth flow', signature: 'login register password reset auth session signin',
    god: 'athena', demigods: ['ui-designer'], skills: ['accessibility', 'frontend-a11y'],
    mcps: ['context7'], verify: ['interaction:login-posts', 'a11y:labels', 'build'], tier: 'warm',
    source: 'seed', note: 'Login/register/reset as ONE flow; the interaction smoke is the gate.',
  },
  {
    id: 'motion-layer', name: 'Motion layer', signature: 'animation motion transition hover micro-interaction scroll',
    god: 'athena', demigods: ['performance-optimizer'], skills: ['gsap-core', 'motion-foundations'],
    mcps: ['context7'], verify: ['perf:no-jank', 'build'], tier: 'cold',
    source: 'seed', note: 'Tasteful motion only: transform/opacity, reduced-motion honored.',
  },
  {
    id: 'a11y-audit', name: 'A11y audit', signature: 'accessibility audit aria keyboard screen reader contrast wcag',
    god: 'athena', demigods: ['a11y-auditor'], skills: ['accessibility', 'web-design-guidelines'],
    mcps: ['playwright'], verify: ['axe:0-critical', 'keyboard:focus', 'report'], tier: 'cold',
    source: 'seed', note: 'Evidence-first: axe + keyboard walk, no hand-waving.',
  },
  {
    id: 'data-viz', name: 'Data visualization', signature: 'chart graph visualization dataset d3 plot metric',
    god: 'athena', demigods: ['ui-designer'], skills: ['d3-visualization', 'color-expert'],
    mcps: ['context7'], verify: ['build', 'visual:chart-exists'], tier: 'cold',
    source: 'seed', note: 'The color expert keeps categorical palettes distinguishable.',
  },
  {
    id: 'theme-system', name: 'Theme system', signature: 'theme tokens palette dark light design system colors',
    god: 'athena', demigods: ['ui-designer'], skills: ['design-md', 'design-system', 'color-expert'],
    mcps: ['originkit'], verify: ['tokens:contrast', 'build'], tier: 'warm',
    source: 'seed', note: 'The same 12-preset discipline the app itself uses.',
  },
  {
    id: 'responsive-pass', name: 'Responsive pass', signature: 'responsive mobile breakpoint tablet layout overflow',
    god: 'athena', demigods: ['responsive-tester'], skills: ['frontend-patterns', 'web-design-guidelines'],
    mcps: ['playwright'], verify: ['viewport:375', 'viewport:1440', 'build'], tier: 'cold',
    source: 'seed', note: 'Two real viewports, not a CSS guess.',
  },
  {
    id: 'brand-identity', name: 'Brand identity', signature: 'brand logo identity palette voice naming mark',
    god: 'athena', demigods: ['brand-guardian'], skills: ['design-md', 'color-expert'],
    mcps: ['originkit'], verify: ['tokens:contrast', 'visual:logo'], tier: 'cold',
    source: 'seed', note: 'A mark and a palette that survive both modes.',
  },
  {
    id: 'visual-asset', name: 'Generated visual', signature: 'image hero illustration texture asset generate icon art',
    god: 'hephaestus', demigods: ['image-generator'], skills: ['art-generate', 'image-enhancer'],
    mcps: ['fal', 'olympus-craft'], verify: ['asset:vault', 'asset:injected'], tier: 'warm',
    source: 'seed', note: 'Draft on the free lane, final on BYOK; inject into public/assets.',
  },
  {
    id: 'craft-prototype', name: 'Craft prototype', signature: 'prototype mockup craft artcraft studio composition',
    god: 'athena', demigods: ['rapid-prototyper'], skills: ['frontend-design', 'shadcn-ui'],
    mcps: ['olympus-craft'], verify: ['artifact:preview', 'build'], tier: 'cold',
    source: 'seed', note: 'The ArtCraft Studio lane for composition-class work.',
  },
  {
    id: 'copy-direction', name: 'Copy direction', signature: 'copy headline tone voice microcopy content writing',
    god: 'athena', demigods: ['ux-researcher'], skills: ['article-writing'],
    mcps: ['brave-search'], verify: ['lint:copy', 'review'], tier: 'cold',
    source: 'seed', note: 'References from the web, voice from the user, never filler.',
  },
  {
    id: 'api-surface', name: 'API surface', signature: 'api rest endpoint route handler validation contract',
    god: 'hephaestus', demigods: ['api-designer'], skills: ['api-design', 'backend-patterns'],
    mcps: ['context7'], verify: ['tsc', 'lint', 'route:responds'], tier: 'warm',
    source: 'seed', note: 'Contract first: the route, the error shape and the types land together.',
  },
  {
    id: 'migration-safe', name: 'Safe migration', signature: 'migration schema database prisma postgres column backfill',
    god: 'persephone', demigods: ['migration-engineer'], skills: ['database-migrations', 'postgres-patterns'],
    mcps: ['postgres', 'context7'], verify: ['migrate:up', 'migrate:down', 'data:count'], tier: 'warm',
    source: 'seed', note: 'Reversible, counted, and never destructive without a dry run.',
  },
  {
    id: 'security-audit', name: 'Security audit', signature: 'security audit vulnerability secret injection authz xss',
    god: 'artemis', demigods: ['security-reviewer', 'secrets-scanner'], skills: ['security-review', 'security-scan'],
    mcps: ['github'], verify: ['scan:0-high', 'secrets:0', 'report'], tier: 'warm',
    source: 'seed', note: 'Evidence or it did not happen: the scan output is the report.',
  },
  {
    id: 'test-suite', name: 'Test suite', signature: 'test unit integration e2e coverage regression fixture',
    god: 'dionysus', demigods: ['unit-test-author', 'e2e-runner'], skills: ['test-driven-development', 'e2e-testing'],
    mcps: ['playwright'], verify: ['tests:green', 'coverage:60'], tier: 'warm',
    source: 'seed', note: 'Red first; the suite is the proof, not the promise.',
  },
  {
    id: 'ci-pipeline', name: 'CI pipeline', signature: 'ci pipeline github actions build deploy release workflow',
    god: 'prometheus', demigods: ['release-engineer'], skills: ['deployment-patterns', 'docker-patterns'],
    mcps: ['github', 'docker'], verify: ['workflow:valid', 'build:green'], tier: 'cold',
    source: 'seed', note: 'A pipeline that fails loudly beats a happy path that hides the break.',
  },
  {
    id: 'mcp-integration', name: 'MCP integration', signature: 'mcp server tool connector protocol jsonrpc integration',
    god: 'hermes', demigods: ['mcp-builder'], skills: ['mcp-server-patterns', 'api-design'],
    mcps: ['context7'], verify: ['handshake:ok', 'tools:list', 'probe:alive'], tier: 'warm',
    source: 'seed', note: 'The handshake and a real tools/list are the gate.',
  },
  {
    id: 'knowledge-ingest', name: 'Knowledge ingest', signature: 'knowledge docs context library ingestion notes cite',
    god: 'callimachus', demigods: ['docs-verifier', 'instinct-curator'], skills: ['knowledge-ops', 'continuous-learning-v2'],
    mcps: ['context7', 'memory'], verify: ['note:cited', 'index:rebuilt'], tier: 'cold',
    source: 'seed', note: 'Versioned, cited, curated; a guessed API is worse than unknown.',
  },
  {
    id: 'docs-curation', name: 'Docs curation', signature: 'docs readme architecture changelog documentation update',
    god: 'callimachus', demigods: ['technical-writer'], skills: ['writing-guidelines', 'knowledge-ops'],
    mcps: ['filesystem'], verify: ['docs:links', 'docs:truth'], tier: 'cold',
    source: 'seed', note: 'Every claim sourced; the docs move with the tag.',
  },
  {
    id: 'incident-drill', name: 'Incident drill', signature: 'incident outage rollback recovery chaos failover drill',
    god: 'prometheus', demigods: ['incident-responder', 'sre'], skills: ['deployment-patterns', 'error-handling'],
    mcps: ['docker'], verify: ['drill:recovered', 'report'], tier: 'cold',
    source: 'seed', note: 'A drill that has not failed a service has not tested recovery.',
  },
  {
    id: 'spec-first', name: 'Spec first', signature: 'spec requirements plan acceptance criteria scope interview',
    god: 'apollo', demigods: ['spec-author', 'architect'], skills: ['writing-plans', 'intent-driven-development'],
    mcps: ['context7'], verify: ['spec:approved', 'scope:closed'], tier: 'warm',
    source: 'seed', note: 'The user approves the spec before a line exists.',
  },

];

const SEED_CATEGORY: Record<string, BuildCategory> = {
  'hero-editorial': 'design', 'dashboard-system': 'design', 'auth-flow': 'design',
  'motion-layer': 'design', 'a11y-audit': 'design', 'data-viz': 'data',
  'theme-system': 'design', 'responsive-pass': 'design', 'brand-identity': 'design',
  'visual-asset': 'design', 'craft-prototype': 'design', 'copy-direction': 'design',
  'api-surface': 'code', 'migration-safe': 'data', 'security-audit': 'security',
  'test-suite': 'qa', 'ci-pipeline': 'infra', 'mcp-integration': 'integration',
  'knowledge-ingest': 'memory', 'docs-curation': 'curation', 'incident-drill': 'infra',
  'spec-first': 'planning',
};
for (const seed of SEED_DESIGN_BUILDS) {
  if (!seed.category && SEED_CATEGORY[seed.id]) seed.category = SEED_CATEGORY[seed.id];
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'your', 'uma', 'com', 'para', 'dos', 'das', 'que']);

function tokens(value: string | null | undefined): string[] {
  return String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** How strongly a log row belongs to a build (0 = unrelated). */
export function rowMatchScore(build: DesignBuild, row: ResonanceRow): number {
  if (!row || row.god !== build.god) return 0;
  let score = 0;
  if (row.skill && build.skills.includes(row.skill)) score += 2;
  if (row.mcp && build.mcps.includes(row.mcp)) score += 2;
  if (row.demigod && build.demigods.includes(row.demigod)) score += 2;
  const a = new Set(tokens(build.signature));
  const b = tokens(row.task_signature);
  const shared = b.filter((t) => a.has(t)).length;
  if (shared > 0) score += Math.min(3, shared);
  return score;
}

export function tierFor(rate: number, samples: number): BuildTier {
  if (samples >= 5 && rate >= 0.8) return 'hot';
  if (samples >= 2 && rate >= 0.5) return 'warm';
  return 'cold';
}

/** Join the builds with the resonance log (pure). */
export function mergeBuildStats(builds: DesignBuild[], rows: ResonanceRow[]): DesignBuildWithStats[] {
  return builds.map((build) => {
    let successes = 0;
    let decided = 0;
    let lastUsed: string | null = null;
    for (const row of rows) {
      if (rowMatchScore(build, row) <= 0) continue;
      if (row.ts && (!lastUsed || row.ts > lastUsed)) lastUsed = row.ts;
      const outcome = String(row.outcome ?? '').toLowerCase();
      if (outcome === 'success' || outcome === 'ok' || outcome === 'done') { successes += 1; decided += 1; }
      else if (outcome === 'failure' || outcome === 'failed' || outcome === 'parked') { decided += 1; }
      // 'unknown' is not evidence: it moves neither numerator nor denominator.
    }
    const rate = (successes + 1) / (decided + 2);
    const stats: DesignBuildStats = {
      samples: decided,
      successes,
      rate: Math.round(rate * 1000) / 1000,
      tier: decided > 0 ? tierFor(rate, decided) : build.tier,
      lastUsed,
    };
    return { ...build, stats };
  });
}

const VALID_TIER: BuildTier[] = ['hot', 'warm', 'cold'];

/** Accept a user-created build (the editor posts this); reject garbage. */
export function normalizeUserBuild(input: unknown, now = Date.now()): DesignBuild | null {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<DesignBuild>;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
  const god = typeof raw.god === 'string' ? raw.god.trim().toLowerCase() : '';
  if (!name || !god) return null;
  const list = (v: unknown, max = 12): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, 48)).slice(0, max)
      : [];
  return {
    id: `user-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    signature: typeof raw.signature === 'string' ? raw.signature.trim().slice(0, 240) : name.toLowerCase(),
    god,
    demigods: list(raw.demigods),
    skills: list(raw.skills),
    mcps: list(raw.mcps),
    ...(typeof raw.model === 'string' && raw.model.trim() ? { model: raw.model.trim().slice(0, 80) } : {}),
    verify: list(raw.verify, 8),
    tier: VALID_TIER.includes(raw.tier as BuildTier) ? (raw.tier as BuildTier) : 'cold',
    source: 'user',
    ...(typeof raw.category === 'string' ? { category: raw.category as BuildCategory } : {}),
    ...(raw.shared === true ? { shared: true } : {}),
    ...(typeof raw.note === 'string' && raw.note.trim() ? { note: raw.note.trim().slice(0, 240) } : {}),
  };
}

/** The prompt a god reads when it equips a build (copyable, honest). */
export function buildPrompt(build: DesignBuildWithStats): string {
  const lines = [
    `# Build — ${build.name}`,
    `god: ${build.god}`,
    `demigods: ${build.demigods.join(', ') || '—'}`,
    `skills: ${build.skills.join(', ') || '—'}`,
    `mcps: ${build.mcps.join(', ') || '—'}`,
    build.model ? `model: ${build.model}` : 'model: the god\'s lane',
    `verify: ${build.verify.join(', ') || 'deterministic'}`,
    `tier: ${build.stats.tier} (${build.stats.samples} sample(s), ${(build.stats.rate * 100).toFixed(0)}% smoothed success)`,
    '',
    build.note ? `Why: ${build.note}` : '',
    'Equip this loadout for the task; if a tool in it is unavailable, say which and why before substituting.',
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * v0.0.32 — the auto-description shown in the hub and the detail view. It
 * names the loadout, the evidence and the intent — never a marketing line.
 */
export function describeBuild(build: DesignBuildWithStats): string {
  const agents = build.demigods.length
    ? `${build.demigods.length} parallel agent${build.demigods.length === 1 ? '' : 's'} (${build.demigods.join(', ')})`
    : 'a solo god';
  const evidence = build.stats.samples > 0
    ? `${build.stats.samples} sample${build.stats.samples === 1 ? '' : 's'}, ${(build.stats.rate * 100).toFixed(0)}% smoothed success → ${build.stats.tier}`
    : `no evidence yet — seed tier ${build.tier}`;
  const skills = build.skills.length ? build.skills.join(', ') : 'no skills';
  const mcps = build.mcps.length ? build.mcps.join(', ') : 'no MCPs';
  return `${build.god} leads ${agents} for “${build.signature}”. Skills: ${skills}. MCPs: ${mcps}. ${build.note ? `${build.note} ` : ''}Evidence: ${evidence}.`;
}
