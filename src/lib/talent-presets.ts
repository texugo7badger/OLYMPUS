/**
 * talent-presets.ts — v0.0.53: the community shelf.
 *
 * A talent is a named combination of skills, MCPs and demigods for a kind of
 * work. These presets are curated starting points, not claims of measured
 * performance; the stats are the slot math, the note is the intent. Users can
 * fork one, change every slot, export it and share it.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export interface TalentPreset {
  id: string;
  name: string;
  god: string;
  signature: string;
  note: string;
  skills: string[];
  mcps: string[];
  demigods: string[];
}

export const TALENT_PRESETS: TalentPreset[] = [
  {
    id: 'launch-architect', name: 'Launch Architect', god: 'athena',
    signature: 'landing hero pricing launch page marketing',
    note: 'A landing that converts: one signature interaction, real copy, measured spacing.',
    skills: ['frontend-design', 'landing-page'], mcps: ['context7', 'playwright'],
    demigods: ['ui-designer', 'frontend-reviewer', 'a11y-auditor'],
  },
  {
    id: 'api-forge', name: 'API Forge', god: 'hephaestus',
    signature: 'api endpoint rest schema validation backend',
    note: 'Contract first, then the smallest server that satisfies it.',
    skills: ['api-design', 'backend-patterns'], mcps: ['context7', 'postgres'],
    demigods: ['api-designer', 'code-verifier', 'refactor-engineer'],
  },
  {
    id: 'security-sentinel', name: 'Security Sentinel', god: 'artemis',
    signature: 'security audit secrets auth threat review',
    note: 'Read the attack surface before touching the feature.',
    skills: ['security-review', 'security-scan'], mcps: ['github', 'filesystem'],
    demigods: ['security-reviewer', 'secrets-scanner', 'threat-analyst'],
  },
  {
    id: 'data-alchemist', name: 'Data Alchemist', god: 'persephone',
    signature: 'database schema migration query postgres data',
    note: 'Schema with a rollback, indexes with a reason, queries with a plan.',
    skills: ['postgres-patterns', 'database-migrations'], mcps: ['postgres', 'memory'],
    demigods: ['schema-reviewer', 'query-optimizer', 'dbre'],
  },
  {
    id: 'release-pilot', name: 'Release Pilot', god: 'prometheus',
    signature: 'release deploy docker ci cd production',
    note: 'A release is a checklist with evidence, not a button.',
    skills: ['deployment-patterns', 'docker-patterns'], mcps: ['git', 'github'],
    demigods: ['docker-expert', 'sre', 'release-engineer'],
  },
  {
    id: 'test-smith', name: 'Test Smith', god: 'dionysus',
    signature: 'test tdd e2e playwright unit coverage',
    note: 'Red first, then the smallest green, then the refactor.',
    skills: ['tdd-workflow', 'e2e-testing'], mcps: ['playwright'],
    demigods: ['unit-test-author', 'e2e-runner', 'mutation-tester'],
  },
  {
    id: 'research-scout', name: 'Research Scout', god: 'hermes',
    signature: 'research api integration webhook mcp docs',
    note: 'Find the primary source, then wire the smallest integration.',
    skills: ['deep-research', 'mcp-server-patterns'], mcps: ['exa', 'context7'],
    demigods: ['researcher', 'mcp-builder', 'api-integrator'],
  },
  {
    id: 'brain-curator', name: 'Brain Curator', god: 'callimachus',
    signature: 'memory instinct knowledge docs vault curation',
    note: 'A brain that forgets on purpose: archive, dedupe, promote with evidence.',
    skills: ['knowledge-ops', 'continuous-learning-v2'], mcps: ['memory', 'filesystem'],
    demigods: ['instinct-curator', 'brain-backup', 'docs-verifier'],
  },
];
