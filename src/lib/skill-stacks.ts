/**
 * Skill → stack mapping.
 *
 * Maps each skill in GOD_SKILLS (olympus.ts) to the stacks it applies to.
 * Skills NOT in this map are treated as stack-agnostic (visible in every
 * project). Skills IN this map are only visible when the active project
 * has a matching stack.
 *
 * This is the second layer of the per-project brain atlas:
 *   Layer 1: instinct scope filter (instinct-scope.ts) — already shipped in v1
 *   Layer 2: skill stack filter (this file) — ships in addendum v2
 *   Layer 3: knowledge node stack filter (olympus.ts) — ships in addendum v2
 *
 * When a project is active, the brain atlas shows:
 *   - All 8 gods (orchestrators are always relevant)
 *   - The active project as a hub node (purple, frontal lobe)
 *   - Skills that are stack-agnostic OR match the project's stacks
 *   - Knowledge nodes that match the project's stacks
 *   - Instincts that pass the scope filter (v1)
 *
 * In browsing mode (no active project), everything is shown (v1 behavior).
 *
 * References:
 *  - ECC skills catalog (github.com/affaan-m/ECC) — skill names + domains
 *  - Odin vault-template/04_Knowledge/references/ — knowledge file layout
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/**
 * Maps skill name → stacks. Omitted = stack-agnostic.
 *
 * The skill names here match the strings in GOD_SKILLS (olympus.ts).
 * If a skill name contains a stack keyword (e.g. "docker-patterns"),
 * it's tagged with that stack. Generic skills (e.g. "backend-patterns",
 * "api-design") are stack-agnostic and omitted.
 *
 * DEAD REFERENCES REMOVED. The previous version of this map
 * referenced `python-patterns`, `rust-patterns`, `react-performance`,
 * `postgres-patterns`, `clickhouse-io`, and `bun-runtime` — NONE of these
 * skill directories exist on disk (`.opencode/skills/`). The dynamic context
 * loader (olympus-dynamic-context) reads this map to decide which skills to
 * load per project stack, so dead references caused the loader to silently
 * filter out skills that didn't exist. They are now removed.
 *
 * Skill tags for the actual 330 vendored skills are added below. Stack tags
 * follow the convention: a skill is tagged with a stack if it is only
 * useful when that stack is present in the active project.
 */
export const SKILL_STACKS: Record<string, string[]> = {
  // ─── Hephaestus (backend) ──────────────────────────────────────────
  // backend-patterns, api-design, hexagonal-architecture, coding-standards,
  // error-handling → stack-agnostic
  'docker-patterns':       ['docker'],
  'kubernetes-patterns':   ['kubernetes', 'k8s'],
  'deployment-patterns':   ['ci-cd', 'terraform', 'ansible'],

  // ─── Athena (frontend) ───────────────────────────────────────────
  'frontend-patterns':     ['react', 'vue', 'svelte', 'angular', 'nextjs', 'typescript'],
  'frontend-a11y':         ['react', 'vue', 'svelte', 'angular', 'nextjs'],
  'impeccable':            ['react', 'nextjs', 'typescript'],
  'design-system':         ['react', 'vue', 'svelte', 'angular'],
  'design-brief':          [],
  'brand-extract':         [],
  'brand-guidelines':      [],
  'color-expert':          [],

  // ─── Hermes (integrations) ──────────────────────────────────────
  // intent-driven-development, api-design, tool-routing-pattern,
  // search-first, deep-research → stack-agnostic

  // ─── Artemis (security) ─────────────────────────────────────────
  // security-review, production-audit → stack-agnostic

  // ─── Dionysus (QA) ──────────────────────────────────────────────
  // e2e-testing, eval-harness, tdd-workflow → stack-agnostic

  // ─── Persephone (database) ───────────────────────────────────────
  // backend-patterns, error-handling → stack-agnostic

  // ─── Apollo (planning) ───────────────────────────────────────────
  // brainstorming, writing-plans, subagent-driven-development,
  // requesting-code-review, finishing-a-development-branch,
  // dispatching-parallel-agents, executing-plans, using-superpowers
  // → all stack-agnostic

  // ─── Callimachus (vault) ─────────────────────────────────────────
  // continuous-learning-v2, writing-skills → stack-agnostic
};

/**
 * Returns true if a skill should be visible given the active project's stacks.
 *
 *  - Stack-agnostic skills (not in SKILL_STACKS) → always visible
 *  - Stack-tagged skills → visible if any of its stacks match activeStacks
 *  - In browsing mode (activeStacks empty) → always visible
 */
export function isSkillVisible(
  skillName: string,
  activeStacks: string[],
): { visible: boolean; reason: string; stacks?: string[] } {
  const stacks = SKILL_STACKS[skillName];

  // Stack-agnostic
  if (!stacks || stacks.length === 0) {
    return { visible: true, reason: 'stack-agnostic' };
  }

  // Browsing mode — show everything
  if (activeStacks.length === 0) {
    return { visible: true, reason: 'browsing (stack-tagged)', stacks };
  }

  // Stack match?
  const intersect = stacks.filter(s => activeStacks.includes(s));
  if (intersect.length > 0) {
    return {
      visible: true,
      reason: `stack match (${intersect.join(',')})`,
      stacks: intersect,
    };
  }

  return {
    visible: false,
    reason: `stack mismatch (${stacks.join(',')} vs ${activeStacks.join(',')})`,
    stacks,
  };
}

/**
 * Maps knowledge file paths (relative to 04_Knowledge/references/) to stacks.
 * Used by olympus.ts to load + filter knowledge nodes per active project.
 *
 * The vault template ships these files:
 *   backend/{rust,python,go,java,nodejs,databases}.md
 *   frontend/{react,vue,svelte,angular,css,mobile}.md
 *   devops/{docker,kubernetes,terraform,ci-cd,monitoring}.md
 *   security/{auth,owasp,secrets}.md         ← stack-agnostic
 *   testing/{e2e,performance,unit}.md          ← stack-agnostic
 *   integrations/{mcp,apis,webhooks}.md        ← stack-agnostic
 */
export const KNOWLEDGE_STACK_MAP: Record<string, string[]> = {
  // backend/
  'backend/rust.md':       ['rust'],
  'backend/python.md':     ['python'],
  'backend/go.md':         ['go'],
  'backend/java.md':       ['java'],
  'backend/nodejs.md':     ['node', 'typescript', 'javascript'],
  'backend/databases.md':  ['postgres', 'mysql', 'sqlite', 'redis'], // generic DB ref
  // frontend/
  'frontend/react.md':     ['react', 'nextjs', 'react-native', 'expo'],
  'frontend/vue.md':       ['vue', 'nuxt'],
  'frontend/svelte.md':    ['svelte', 'sveltekit'],
  'frontend/angular.md':   ['angular'],
  'frontend/css.md':       [],  // stack-agnostic
  'frontend/mobile.md':    ['react-native', 'expo', 'android', 'ios'],
  // devops/
  'devops/docker.md':         ['docker'],
  'devops/kubernetes.md':     ['kubernetes'],
  'devops/terraform.md':      ['terraform'],
  'devops/ci-cd.md':          ['ci-cd'],
  'devops/monitoring.md':     [],  // stack-agnostic
  // security/, testing/, integrations/ → all stack-agnostic (omitted = visible always)
};

/**
 * Returns true if a knowledge file should be visible given active stacks.
 * Same logic as isSkillVisible but for knowledge files.
 */
export function isKnowledgeVisible(
  knowledgePath: string,
  activeStacks: string[],
): { visible: boolean; reason: string; stacks?: string[] } {
  const stacks = KNOWLEDGE_STACK_MAP[knowledgePath];

  // Not in map = stack-agnostic (security, testing, integrations, css, monitoring)
  if (!stacks || stacks.length === 0) {
    return { visible: true, reason: stacks === undefined ? 'stack-agnostic' : 'universal' };
  }

  if (activeStacks.length === 0) {
    return { visible: true, reason: 'browsing (stack-tagged)', stacks };
  }

  const intersect = stacks.filter(s => activeStacks.includes(s));
  if (intersect.length > 0) {
    return { visible: true, reason: `stack match (${intersect.join(',')})`, stacks: intersect };
  }

  return {
    visible: false,
    reason: `stack mismatch (${stacks.join(',')} vs ${activeStacks.join(',')})`,
    stacks,
  };
}

/**
 * Stats helper — counts how many skills/knowledge nodes are visible
 * for a given active project. Used by brainHealth() for the dashboard.
 */
export function countVisibleSkills(allSkills: string[], activeStacks: string[]) {
  let visible = 0;
  let stackAgnostic = 0;
  let stackMatched = 0;
  let hidden = 0;
  for (const s of allSkills) {
    const r = isSkillVisible(s, activeStacks);
    if (r.visible) {
      visible++;
      if (r.reason === 'stack-agnostic') stackAgnostic++;
      else stackMatched++;
    } else {
      hidden++;
    }
  }
  return { total: allSkills.length, visible, stackAgnostic, stackMatched, hidden };
}
