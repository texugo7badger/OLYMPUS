/**
 * build-categories.ts — v0.0.32: the LoL-style talent vocabulary.
 *
 * Each category is a node of the build tree: an animated icon (public/
 * build-icons) plus the arsenal options a god can equip. The editor lets the
 * user compose a build from these nodes — simple to read, exponential in
 * combinations — and the design-builds registry stores the result.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export interface BuildCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  skills: string[];
  mcps: string[];
  demigods: string[];
}

export const BUILD_CATEGORIES: BuildCategory[] = [
  {
    id: 'planning', name: 'Planning', icon: '/build-icons/planning.svg', color: '#D4A574',
    skills: ['brainstorming', 'writing-plans', 'intent-driven-development'],
    mcps: ['context7', 'sequential-thinking'], demigods: ['planner', 'architect'],
  },
  {
    id: 'code', name: 'Code', icon: '/build-icons/code.svg', color: '#6BAEB5',
    skills: ['frontend-patterns', 'backend-patterns', 'tdd-workflow'],
    mcps: ['context7', 'filesystem'], demigods: ['code-verifier', 'refactor-engineer'],
  },
  {
    id: 'qa', name: 'QA', icon: '/build-icons/qa.svg', color: '#7BAE8E',
    skills: ['test-driven-development', 'e2e-testing', 'verification-before-completion'],
    mcps: ['playwright'], demigods: ['e2e-runner', 'unit-test-author'],
  },
  {
    id: 'security', name: 'Security', icon: '/build-icons/security.svg', color: '#C4756A',
    skills: ['security-review', 'security-scan'], mcps: ['github'], demigods: ['security-reviewer', 'secrets-scanner'],
  },
  {
    id: 'design', name: 'Design', icon: '/build-icons/design.svg', color: '#9B7BAE',
    skills: ['frontend-design', 'design-md', 'impeccable'],
    mcps: ['originkit', 'shadcn'], demigods: ['ui-designer', 'a11y-auditor'],
  },
  {
    id: 'data', name: 'Data', icon: '/build-icons/data.svg', color: '#6B8FB5',
    skills: ['postgres-patterns', 'database-migrations'], mcps: ['postgres', 'context7'], demigods: ['schema-reviewer', 'query-optimizer'],
  },
  {
    id: 'infra', name: 'Infra', icon: '/build-icons/infra.svg', color: '#C4A265',
    skills: ['docker-patterns', 'deployment-patterns'], mcps: ['docker', 'kubernetes'], demigods: ['docker-expert', 'sre'],
  },
  {
    id: 'integration', name: 'Integration', icon: '/build-icons/integration.svg', color: '#6BAE9B',
    skills: ['api-design', 'mcp-server-patterns'], mcps: ['brave-search', 'github'], demigods: ['api-integrator', 'auth-specialist'],
  },
  {
    id: 'memory', name: 'Memory', icon: '/build-icons/memory.svg', color: '#D4A574',
    skills: ['knowledge-ops', 'continuous-learning-v2'], mcps: ['memory'], demigods: ['brain-backup', 'instinct-curator'],
  },
  {
    id: 'curation', name: 'Curation', icon: '/build-icons/curation.svg', color: '#B79BE0',
    skills: ['docs-verifier', 'skill-indexer'], mcps: ['olympus-craft'], demigods: ['docs-verifier', 'pattern-extractor'],
  },
];

export const BUILD_LIMITS = { skills: 3, mcps: 3, demigods: 5 } as const;

export function categoryById(id: string): BuildCategory | null {
  return BUILD_CATEGORIES.find((c) => c.id === id) ?? null;
}
