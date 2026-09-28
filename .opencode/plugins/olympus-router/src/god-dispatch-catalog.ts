/**
 * GOD_DISPATCH_CATALOG
 *
 * The canonical catalog of which demigods belong to which god. This is the
 * single source of truth for the dispatch graph — used by:
 *   - Apollo's prompt (the "Specialist Gods" table)
 *   - The olympus-router plugin (for scope enforcement)
 *   - The dispatch-tracker (for god -> demigod attribution)
 *   - apply-strategy.js (for demigod model inheritance)
 *
 * The dispatch catalog is organized by god, with each
 * god owning 6-9 demigods. The old olympus- / ecc- prefixes are
 * GONE — demigods are now unprefixed (the parent god is encoded by the
 * directory: demigods/<god>/<name>.txt).
 *
 * This file is imported by olympus-router/index.ts (replacing the implicit
 * dispatch knowledge). It is ALSO imported by apply-strategy.js (via a
 * JSON export) so the strategy applier can validate the demigod roster.
 *
 * Quality constraints (see CHANGES.md):
 *   - All `.on('error', (err) => ...)` use `(err: any)` (n/a — no listeners).
 *   - All `child.stdout`/`child.stderr` use `?.` (n/a — no child_process).
 *   - Never uses `import.meta.url` (this is a `.opencode/` plugin file).
 *   - Cross-platform — Windows, macOS, Linux.
 *   - No emojis.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export const GOD_DISPATCH_CATALOG: Record<string, string[]> = {
  apollo: [
    "planner",
    "architect",
    "spec-author",
    "demigod-author",
    "risk-assessor",
    "scope-gatekeeper",
    "rapid-prototyper",
    "spec-miner",
  ],
  artemis: [
    "security-reviewer",
    "pentester",
    "compliance-auditor",
    "threat-analyst",
    "secrets-scanner",
    "cloud-security-auditor",
    "ai-code-auditor",
    "supply-chain-auditor",
  ],
  athena: [
    "frontend-reviewer",
    "ui-designer",
    "a11y-auditor",
    "visual-verifier",
    "performance-optimizer",
    "responsive-tester",
    "i18n-specialist",
    "state-architect",
  ],
  dionysus: [
    "tdd-guide",
    "e2e-runner",
    "evidence-collector",
    "performance-tester",
    "unit-test-author",
    "flaky-test-resolver",
    "api-tester",
    "mutation-tester",
  ],
  hephaestus: [
    "systems-reviewer",
    "managed-reviewer",
    "script-reviewer",
    "go-reviewer",
    "ts-reviewer",
    "build-resolver",
    "api-designer",
    "refactor-engineer",
    "code-verifier",
  ],
  hermes: [
    "mcp-builder",
    "api-integrator",
    "researcher",
    "llm-architect",
    "webhook-engineer",
    "auth-specialist",
    "event-stream-architect",
    "protocol-designer",
  ],
  persephone: [
    "schema-reviewer",
    "migration-engineer",
    "data-engineer",
    "dbre",
    "query-optimizer",
    "cache-architect",
    "data-migration-specialist",
    "orm-specialist",
  ],
  prometheus: [
    "docker-expert",
    "terraform-engineer",
    "sre",
    "incident-responder",
    "release-engineer",
    "k8s-engineer",
    "network-engineer",
    "finops-analyst",
  ],
  callimachus: [
    "instinct-curator",
    "brain-backup",
    "brain-restore",
    "docs-verifier",
    "pattern-extractor",
    "skill-indexer",
  ],
  atlas: [
    "dag-optimizer",
    "integration-compiler",
    "chief-of-staff",
    "git-workflow-master",
    "multi-agent-architect",
    "silent-failure-hunter",
  ],
};

/**
 * Reverse lookup: demigod -> parent god.
 * Used by apply-strategy.js to determine which god's model a demigod inherits.
 */
export const DEMIGOD_TO_GOD: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [god, demigods] of Object.entries(GOD_DISPATCH_CATALOG)) {
    for (const demigod of demigods) {
      map[demigod] = god;
    }
  }
  return map;
})();

/**
 * Get the parent god for a demigod. Returns null if the demigod is not in
 * the catalog (which means it's either a god itself, or an unknown agent).
 */
export function getParentGod(demigodName: string): string | null {
  return DEMIGOD_TO_GOD[demigodName] ?? null;
}

/**
 * Get the demigods for a god. Returns an empty array if the god is not in
 * the catalog.
 */
export function getDemigodsForGod(godName: string): string[] {
  return GOD_DISPATCH_CATALOG[godName] ?? [];
}

/**
 * Is the given agent ID a god?
 */
export function isGod(agentId: string): boolean {
  return agentId in GOD_DISPATCH_CATALOG;
}

/**
 * Is the given agent ID a demigod?
 */
export function isDemigod(agentId: string): boolean {
  return agentId in DEMIGOD_TO_GOD;
}

/**
 * Total demigod count (for verification — should be 77).
 */
export const TOTAL_DEMIGODS: number = Object.values(GOD_DISPATCH_CATALOG)
  .reduce((sum, demigods) => sum + demigods.length, 0);
