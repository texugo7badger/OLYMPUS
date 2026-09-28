#!/usr/bin/env python3
"""
Olympus Vault Seeder -- Phase 7 / T22 + T23 + T24

Creates the seed vault structure at ~/OLYMPUS-VAULT/ and populates it with:
  - T22: Directory structure (00_Inbox, 01_Gods, 02_Projects, 03_Index,
        04_Knowledge, 05_Auto_Learning, 06_Activity_Feed, 07_Reviews,
        08_Templates, 09_Archive -- plus per-god instinct dirs)
  - T23: Seed instinct files for each god (immutable baselines)
  - T24: Seed knowledge files (04_Knowledge/references/{backend,frontend,devops,security,testing,integrations}/)

This script is idempotent -- running it twice won't overwrite existing files.
It only creates files/directories that don't exist yet.

NOTE on legacy directories:
  Older OLYMPUS installs created 00_System, 03_Delegations, and 07_Maps.
  These are no longer used by the current OLYMPUS and are NOT created by
  this script. Re-running this seeder on an existing vault will NOT delete
  them (idempotent = create-only, never destructive). To remove them from
  an existing vault, delete them manually after running the seeder:
      rm -rf ~/OLYMPUS-VAULT/00_System
      rm -rf ~/OLYMPUS-VAULT/03_Delegations
      rm -rf ~/OLYMPUS-VAULT/07_Maps

Run: python3 /home/z/my-project/scripts/seed-vault.py
"""

import os
from pathlib import Path
from datetime import datetime, timezone

VAULT_ROOT = Path(os.path.expanduser(os.environ.get("OLYMPUS_VAULT", "~/OLYMPUS-VAULT")))
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# --- T22: Vault directory structure ----------------------------------------
#
# Canonical top-level layout of the OLYMPUS vault. Keep in sync with:
#   - src/lib/vault/fs-backend.ts  (STANDARD_DIRS)
#   - ARCHITECTURE.md              (vault structure diagram)
#
# This seeder is create-only / idempotent: existing dirs and files are left
# untouched, so legacy directories from older OLYMPUS installs (00_System,
# 03_Delegations, 07_Maps) will NOT be deleted by re-running this script.
# See the module docstring for manual cleanup instructions.

VAULT_DIRS = [
    "00_Inbox",
    "00_Inbox/_processed",
    "01_Gods",
    "02_Projects",
    "03_Index",
    "04_Knowledge",
    "04_Knowledge/references/backend",
    "04_Knowledge/references/frontend",
    "04_Knowledge/references/devops",
    "04_Knowledge/references/security",
    "04_Knowledge/references/testing",
    "04_Knowledge/references/integrations",
    "04_Knowledge/skills",
    "05_Auto_Learning",
    "05_Auto_Learning/_archive",
    "05_Auto_Learning/_compaction_log.jsonl",
    "05_Auto_Learning/vibrations",  # v1.0 Symphony — registry.jsonl, templates.json, metrics.json
    "06_Activity_Feed",
    "07_Reviews",
    "08_Templates",
    "09_Archive",
    "09_Archive/projects",
    "09_Archive/instincts",
]

# Per-god instinct directories (10 gods x 3 tiers)
GODS = ["apollo", "atlas", "artemis", "athena", "dionysus", "hephaestus",
        "hermes", "persephone", "prometheus", "callimachus"]

for god in GODS:
    VAULT_DIRS.extend([
        f"01_Gods/{god}",
        f"01_Gods/{god}/activity",
        f"05_Auto_Learning/instincts/{god}",
        f"05_Auto_Learning/instincts/{god}/seed",
        f"05_Auto_Learning/instincts/{god}/empirical",
        f"05_Auto_Learning/instincts/{god}/empirical/_staging",
        f"05_Auto_Learning/instincts/{god}/_archive",
    ])

# v3.0 VaultBrain additions: cross-god patterns, per-god episode logs, per-god metrics.
VAULT_DIRS.extend([
    "05_Auto_Learning/patterns",
    "05_Auto_Learning/patterns/_archive",
])
for god in GODS:
    VAULT_DIRS.extend([
        f"05_Auto_Learning/episodes/{god}",
        "05_Auto_Learning/metrics",
    ])
# v3.0 brain research notes directory (used by Task 5's research deliverables)
VAULT_DIRS.extend([
    "04_Knowledge/references/brain",
])

# --- T23: Seed instinct files ---------------------------------------------

SEED_INSTINCTS = {
    "apollo": [
        {
            "id": "always-primary-first",
            "trigger": "Any user prompt is received by Olympus",
            "action": "Apollo is invoked first. No other agent may be the primary entry point.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "fast-path-80-percent",
            "trigger": "User prompt is a routine dispatch (known task type with high-confidence instinct match)",
            "action": "Emit a single DISPATCH line naming the specialist god + demigod, then yield. Do not deliberate.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "spec-interview-20-percent",
            "trigger": "User prompt is ambiguous, multi-step, or architecturally significant",
            "action": "Interview the user (2-5 questions), produce plan.md + ADRs + task DAG, fan out to specialist gods.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "never-use-caveman",
            "trigger": "Apollo is generating output",
            "action": "NEVER use caveman. Output is human-facing (specs, ADRs, plans). Full natural language required.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "glm-5.2-reserved",
            "trigger": "Apollo is selecting a model",
            "action": "GLM-5.2 is reserved for Apollo alone. Never assign it to other gods. Protect the 4,300 req/month GO cap.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "use-openspec-for-planning",
            "trigger": "Apollo is planning a non-trivial feature",
            "action": "Use OpenSpec: /opsx:explore to scope, /opsx:propose to scaffold, /opsx:apply to implement, /opsx:archive to reconcile.",
            "confidence": 0.9,
            "scope": "global",
            "stacks": [],
        },
    ],
    "artemis": [
        {
            "id": "caveman-lite-only",
            "trigger": "Artemis is generating output",
            "action": "Use LITE caveman only. Security findings need clarity for human review. Never full caveman.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "cite-owasp-category",
            "trigger": "Artemis reports a security finding",
            "action": "ALWAYS cite the OWASP category (e.g., 'A03:2021 -- Injection').",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "escalate-critical-to-apollo",
            "trigger": "Artemis finds a critical security issue",
            "action": "Escalate to Apollo immediately. Do not wait for the task to complete.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "dispatch-to-security-reviewer",
            "trigger": "Security code review or audit needed",
            "action": "Dispatch to security-reviewer with caveman skill.",
            "confidence": 0.9,
            "scope": "global",
            "stacks": [],
        },
    ],
    "athena": [
        {
            "id": "never-use-caveman",
            "trigger": "Athena is generating output",
            "action": "NEVER use caveman. Design output must be in full natural language.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "use-impeccable-for-ui",
            "trigger": "Athena is making any UI change",
            "action": "Use the impeccable skill. Run /impeccable audit after patches.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "click-to-element-via-impeccable-live",
            "trigger": "User clicks an element in the live preview and describes a change",
            "action": "Use /impeccable live for 3-variant iteration via HMR. Don't build bespoke bridges.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "enforce-wcag-2.1-aa",
            "trigger": "Athena is designing or reviewing a UI component",
            "action": "ALWAYS enforce WCAG 2.1 AA minimum: ARIA, keyboard nav, contrast.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "respect-design-tokens",
            "trigger": "Athena is writing styles",
            "action": "ALWAYS respect the project's design tokens (colors, spacing, typography from DESIGN.md). NEVER introduce ad-hoc styles.",
            "confidence": 0.9,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "prefer-opendesign-for-design-systems",
            "trigger": "When a UI/design task needs a design-system reference",
            "action": "Query OpenDesign MCP (od_list_projects then od_get_project) for the specific design system that matches the task context. Do not load all systems -- query on-demand.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": ["frontend"],
        },
    ],
    "dionysus": [
        {
            "id": "caveman-full",
            "trigger": "Dionysus is generating output",
            "action": "Use FULL caveman. Compress aggressively. Output is machine-consumed.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "tdd-red-green-refactor",
            "trigger": "Dionysus is writing tests or implementing features",
            "action": "Enforce TDD: write failing test first (RED), implement to pass (GREEN), refactor.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "target-80-percent-coverage",
            "trigger": "Dionysus is assessing test coverage",
            "action": "Target 80%+ coverage. Flag gaps to Apollo.",
            "confidence": 0.9,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "hunt-edge-cases",
            "trigger": "Dionysus is reviewing tests",
            "action": "Hunt for edge cases: boundaries, null inputs, concurrency, race conditions. Never skip.",
            "confidence": 0.9,
            "scope": "global",
            "stacks": [],
        },
    ],
    "hephaestus": [
        {
            "id": "caveman-full",
            "trigger": "Hephaestus is generating output",
            "action": "Use FULL caveman. Compress aggressively. Output is machine-consumed.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "never-write-without-plan",
            "trigger": "Hephaestus is about to write production code",
            "action": "NEVER write production code without a plan from Apollo first.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "use-serena-for-edits",
            "trigger": "Hephaestus is editing code on a large codebase",
            "action": "Use serena MCP for semantic code edits (edit by symbol, not by line). Reduces edit errors.",
            "confidence": 0.9,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "use-context7-for-libs",
            "trigger": "Hephaestus is writing code that uses a library",
            "action": "Use context7 MCP for library documentation before writing library-dependent code.",
            "confidence": 0.9,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "dispatch-rust-build-errors",
            "trigger": "Rust build error involving borrow checker or lifetimes",
            "action": "Dispatch to build-resolver with caveman skill.",
            "confidence": 0.85,
            "scope": "stack",
            "stacks": ["rust"],
        },
    ],
    "hermes": [
        {
            "id": "caveman-full",
            "trigger": "Hermes is generating output",
            "action": "Use FULL caveman. Compress aggressively. Output is machine-consumed.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "use-websearch-for-research",
            "trigger": "Hermes needs to research an unfamiliar API or service",
            "action": "Use the built-in websearch tool (free on GO plan, Exa-powered). Use webfetch to retrieve specific URLs.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "use-context7-for-api-docs",
            "trigger": "Hermes is writing integration code for a third-party API",
            "action": "Use context7 MCP for third-party API documentation before writing integration code.",
            "confidence": 0.9,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "validate-webhook-signatures",
            "trigger": "Hermes is implementing a webhook endpoint",
            "action": "ALWAYS validate webhook signatures. Escalate to Artemis if security-sensitive.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
    ],
    "persephone": [
        {
            "id": "caveman-full",
            "trigger": "Persephone is generating output",
            "action": "Use FULL caveman. Compress aggressively. Output is machine-consumed.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "use-postgres-for-explain",
            "trigger": "Persephone is optimizing a query",
            "action": "Use postgres MCP for EXPLAIN ANALYZE before optimizing.",
            "confidence": 0.9,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "never-destructive-without-approval",
            "trigger": "Persephone is about to run destructive SQL (DROP, TRUNCATE)",
            "action": "NEVER run destructive SQL without explicit Apollo approval.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "migrations-must-be-reversible",
            "trigger": "Persephone is writing a database migration",
            "action": "ALWAYS ensure migrations are reversible (up + down).",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
    ],
    "prometheus": [
        {
            "id": "caveman-full",
            "trigger": "Prometheus is generating output",
            "action": "Use FULL caveman. Compress aggressively. Output is machine-consumed.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "never-deploy-without-plan-and-tests",
            "trigger": "Prometheus is about to deploy to production",
            "action": "NEVER deploy without Apollo's plan + Dionysus's test sign-off.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "always-have-rollback-plan",
            "trigger": "Prometheus is planning a deploy",
            "action": "ALWAYS have a rollback plan documented before any deploy.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "use-docker-mcp",
            "trigger": "Prometheus is managing containers",
            "action": "Use Docker MCP for container management (build, run, inspect).",
            "confidence": 0.9,
            "scope": "global",
            "stacks": [],
        },
    ],
    "callimachus": [
        {
            "id": "never-user-facing",
            "trigger": "Callimachus is running",
            "action": "NEVER user-facing. Run silently in the background.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "never-write-production-code",
            "trigger": "Callimachus is selecting what to write",
            "action": "NEVER write production code. Only write to ~/OLYMPUS-VAULT/**.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "never-modify-seed-instincts",
            "trigger": "Callimachus is curating instincts",
            "action": "NEVER modify seed instincts. Seed = immutable. Only curate empirical instincts.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "caveman-full",
            "trigger": "Callimachus is generating output",
            "action": "Use FULL caveman. Nobody reads this output.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "use-lockfile",
            "trigger": "Callimachus is starting a heartbeat",
            "action": "ALWAYS use the lockfile (~/.olympus/Callimachus.lock) to prevent concurrent runs.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
    ],
    "atlas": [
        {
            "id": "never-user-facing",
            "trigger": "Atlas is running",
            "action": "NEVER talk to the user directly. All user communication goes through Apollo. Report progress and escalations to Apollo only.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "execute-dag-as-dispatched",
            "trigger": "Atlas receives a task DAG from Apollo",
            "action": "Execute the DAG exactly as planned. Dispatch waves in dependency order, all independent sub-tasks concurrently. Never modify the DAG structure — only Apollo can re-plan.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "align-after-every-wave",
            "trigger": "Atlas completes an execution wave",
            "action": "Report to Apollo immediately: what completed, what failed, what's next. Wait for Apollo's approval before advancing to the next wave.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "probe-before-escalate",
            "trigger": "A dispatched demigod produces no output within the expected window",
            "action": "Probe once: re-dispatch with retry flag. If the retry also produces no output within half the window, confirm silent failure and escalate to Apollo.",
            "confidence": 0.95,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "never-modify-dag",
            "trigger": "Atlas detects a deviation from the plan",
            "action": "NEVER modify the DAG. Report the deviation to Apollo with evidence. Only Apollo can re-plan.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
        {
            "id": "hy3-orchestration",
            "trigger": "Atlas is selecting a model",
            "action": "Use Hy3 (opencode-go/hy3) in all GO strategies — it excels at agent orchestration and is more cost-effective than alternatives.",
            "confidence": 1.0,
            "scope": "global",
            "stacks": [],
        },
    ],
}



def write_instinct_file(god: str, instinct):
    """Write a seed instinct file."""
    inst_path = VAULT_ROOT / "05_Auto_Learning" / "instincts" / god / "seed" / f"{instinct['id']}.md"

    if inst_path.exists():
        return inst_path  # Idempotent -- don't overwrite

    stacks_str = ", ".join(instinct["stacks"]) if instinct["stacks"] else ""
    content = f"""---
god: {god}
confidence: {instinct["confidence"]}
scope: {instinct["scope"]}
stacks: [{stacks_str}]
projects: []
last_used: {NOW}
samples: 0
source: seed
immutable: true
trigger: {instinct["trigger"]}
action: {instinct["action"]}
---

# {instinct["id"]}

**Trigger:** {instinct["trigger"]}

**Action:** {instinct["action"]}

**Confidence:** {instinct["confidence"]} (seed -- immutable, always visible)

**Scope:** {instinct["scope"]}{f" (stacks: {stacks_str})" if stacks_str else " (universal)"}

---

This is a SEED instinct -- hand-authored, immutable, always visible to the god.
Callimachus never modifies seed instincts. Empirical instincts may reference
this seed as a baseline but cannot overwrite it.
"""
    _ = inst_path.parent.mkdir(parents=True, exist_ok=True)
    _ = inst_path.write_text(content, encoding="utf-8")
    return inst_path


# --- T24: Seed knowledge files --------------------------------------------

KNOWLEDGE_FILES = {
    "backend": {
        "rust.md": {"stacks": ["rust"], "title": "Rust Backend Patterns",
                    "content": "# Rust Backend Patterns\n\n## Ownership & Borrowing\n- Prefer references (&T, &mut T) over ownership transfers\n- Use Rc/Arc for shared ownership\n- Lifetime annotations: keep them simple\n\n## Error Handling\n- Use Result<T, E> for recoverable errors\n- Use thiserror for library error types\n- Use anyhow for application-level errors\n\n## Async\n- Use tokio as the async runtime\n- Prefer async fn over explicit Future types\n- Use channels (mpsc, broadcast) for inter-task communication\n\n## Testing\n- cargo test for unit tests\n- Use #[tokio::test] for async tests\n- Property testing: proptest crate"},
        "python.md": {"stacks": ["python"], "title": "Python Backend Patterns",
                      "content": "# Python Backend Patterns\n\n## Type Hints\n- Always use type hints (PEP 484)\n- Use mypy --strict for type checking\n- Prefer Pydantic for runtime validation\n\n## Async\n- Use asyncio for I/O-bound work\n- Use FastAPI for async web frameworks\n- Use httpx for async HTTP clients\n\n## Testing\n- pytest for unit tests\n- pytest-asyncio for async tests\n- Use fixtures for setup/teardown\n\n## Packaging\n- Use pyproject.toml (PEP 621)\n- Use uv or poetry for dependency management"},
        "go.md": {"stacks": ["go"], "title": "Go Backend Patterns",
                  "content": "# Go Backend Patterns\n\n## Idiomatic Go\n- Keep functions short and focused\n- Return errors explicitly (no exceptions)\n- Use context.Context for cancellation/timeouts\n\n## Concurrency\n- Use goroutines for lightweight concurrency\n- Use channels for communication (don't communicate by sharing memory)\n- Use sync.WaitGroup for goroutine coordination\n\n## Error Handling\n- Always check errors (never _)\n- Use errors.Is/errors.As for error matching\n- Wrap errors with fmt.Errorf(\"%w\", err)\n\n## Testing\n- go test for unit tests\n- Use table-driven tests\n- Use testify for assertions"},
        "java.md": {"stacks": ["java"], "title": "Java Backend Patterns",
                    "content": "# Java Backend Patterns\n\n## Modern Java\n- Use records for immutable data (Java 14+)\n- Use sealed classes/interfaces for restricted hierarchies\n- Use var for local variable type inference\n\n## Spring Boot\n- Use @RestController for REST APIs\n- Use @Valid for bean validation\n- Use @RestControllerAdvice for global exception handling\n\n## Testing\n- JUnit 5 for unit tests\n- Mockito for mocking\n- Spring Boot Test for integration tests"},
        "nodejs.md": {"stacks": ["node", "typescript", "javascript"], "title": "Node.js Backend Patterns",
                      "content": "# Node.js Backend Patterns\n\n## TypeScript\n- Always use strict mode\n- Use interfaces for object shapes\n- Use zod for runtime validation\n\n## Async\n- Use async/await (not .then() chains)\n- Use Promise.all for parallel operations\n- Handle errors with try/catch\n\n## Frameworks\n- Fastify for performance-critical APIs\n- Next.js API routes for full-stack\n- Hono for edge runtimes\n\n## Testing\n- Vitest for unit tests\n- Use supertest for API integration tests"},
        "databases.md": {"stacks": ["postgres", "mysql", "sqlite", "redis"], "title": "Database Patterns",
                         "content": "# Database Patterns\n\n## Schema Design\n- Use UUIDs for primary keys (avoid sequential IDs)\n- Add created_at and updated_at timestamps\n- Use soft deletes (deleted_at) for recoverability\n\n## Indexing\n- Index foreign keys\n- Use composite indexes for multi-column queries\n- Use EXPLAIN ANALYZE to verify index usage\n\n## Migrations\n- Always make migrations reversible (up + down)\n- Never drop columns in a single migration (deprecate first)\n- Test migrations on a copy of production data"},
    },
    "frontend": {
        "react.md": {"stacks": ["react", "nextjs", "react-native"], "title": "React Patterns",
                     "content": "# React Patterns\n\n## Component Design\n- Prefer function components with hooks\n- Keep components small and focused\n- Use composition over inheritance\n\n## State Management\n- Use useState for local state\n- Use useReducer for complex state\n- Use Zustand or Jotai for global state (avoid Redux unless needed)\n\n## Performance\n- Use React.memo for expensive components\n- Use useMemo/useCallback judiciously\n- Use React.lazy + Suspense for code splitting\n\n## Accessibility\n- Use semantic HTML (button, nav, main)\n- Add ARIA attributes where needed\n- Ensure keyboard navigation works"},
        "vue.md": {"stacks": ["vue", "nuxt"], "title": "Vue Patterns",
                   "content": "# Vue Patterns\n\n## Component Design\n- Use <script setup> for composition API\n- Keep components small and focused\n- Use provide/inject for dependency injection\n\n## State Management\n- Use Pinia for state management\n- Use composables for reusable logic\n\n## Performance\n- Use shallowRef/shallowReactive for large objects\n- Use defineAsyncComponent for lazy loading"},
        "svelte.md": {"stacks": ["svelte", "sveltekit"], "title": "Svelte Patterns",
                      "content": "# Svelte Patterns\n\n## Component Design\n- Use Svelte 5 runes ($state, $derived, $effect)\n- Keep components small and focused\n- Use SvelteKit for full-stack apps\n\n## State Management\n- Use Svelte stores for global state\n- Use context API for component trees"},
        "angular.md": {"stacks": ["angular"], "title": "Angular Patterns",
                       "content": "# Angular Patterns\n\n## Component Design\n- Use standalone components (Angular 14+)\n- Use signals for reactivity (Angular 16+)\n- Use OnPush change detection\n\n## State Management\n- Use NgRx for complex state\n- Use signals for local state"},
        "css.md": {"stacks": [], "title": "CSS Patterns (Universal)",
                   "content": "# CSS Patterns\n\n## Layout\n- Use Flexbox for 1D layouts\n- Use CSS Grid for 2D layouts\n- Use container queries for responsive design\n\n## Design Tokens\n- Use CSS custom properties for tokens\n- Define a type scale, spacing scale, color palette\n- Never hardcode values -- use tokens\n\n## Performance\n- Avoid layout thrash (batch DOM reads/writes)\n- Use will-change sparingly\n- Use content-visibility for long lists"},
        "mobile.md": {"stacks": ["react-native", "expo", "android", "ios"], "title": "Mobile Patterns",
                      "content": "# Mobile Patterns\n\n## React Native\n- Use Expo for managed workflow\n- Use React Native Paper or NativeBase for UI\n- Use Reanimated for animations\n\n## Performance\n- Use FlatList for long lists (not ScrollView)\n- Use useCallback for list item renderers\n- Avoid inline styles"},
    },
    "devops": {
        "docker.md": {"stacks": ["docker"], "title": "Docker Patterns",
                      "content": "# Docker Patterns\n\n## Dockerfile Best Practices\n- Use multi-stage builds\n- Use specific base image tags (not :latest)\n- Use .dockerignore\n- Run as non-root user\n\n## Image Size\n- Use alpine or distroless base images\n- Combine RUN commands to reduce layers\n- Clean up package caches in the same layer\n\n## Security\n- Never store secrets in images\n- Use Docker secrets or external secrets management\n- Scan images with trivy or grype"},
        "kubernetes.md": {"stacks": ["kubernetes"], "title": "Kubernetes Patterns",
                          "content": "# Kubernetes Patterns\n\n## Resource Management\n- Always set resource requests and limits\n- Use HorizontalPodAutoscaler for scaling\n- Use PodDisruptionBudget for availability\n\n## Configuration\n- Use ConfigMaps for non-sensitive config\n- Use Secrets for sensitive data\n- Use Helm for package management\n\n## Observability\n- Use liveness/readiness probes\n- Use Prometheus for metrics\n- Use structured logging (JSON)"},
        "terraform.md": {"stacks": ["terraform"], "title": "Terraform Patterns",
                         "content": "# Terraform Patterns\n\n## State Management\n- Use remote state (S3 + DynamoDB lock)\n- Never commit state files\n- Use workspaces for environments\n\n## Module Design\n- Keep modules small and focused\n- Use variables for inputs, outputs for exports\n- Version modules (Git tags)\n\n## Security\n- Never hardcode secrets (use vault provider)\n- Use `sensitive = true` for sensitive outputs"},
        "ci-cd.md": {"stacks": ["ci-cd"], "title": "CI/CD Patterns",
                     "content": "# CI/CD Patterns\n\n## Pipeline Design\n- Cache dependencies\n- Run tests in parallel\n- Use matrix builds for multiple platforms\n\n## Security\n- Use OIDC for cloud auth (no long-lived keys)\n- Scan dependencies for vulnerabilities\n- Use signed commits + signed artifacts\n\n## Deployment\n- Use blue/green or canary deployments\n- Always have a rollback plan\n- Run smoke tests after deploy"},
        "monitoring.md": {"stacks": [], "title": "Monitoring Patterns (Universal)",
                          "content": "# Monitoring Patterns\n\n## Metrics\n- Use the RED method (Rate, Errors, Duration) for services\n- Use the USE method (Utilization, Saturation, Errors) for resources\n- Use Prometheus + Grafana\n\n## Logging\n- Use structured logging (JSON)\n- Include request IDs for tracing\n- Use log levels appropriately\n\n## Alerting\n- Alert on symptoms, not causes\n- Set SLOs and alert on burn rate\n- Use runbooks for alerts"},
    },
    "security": {
        "auth.md": {"stacks": [], "title": "Authentication Patterns (Universal)",
                    "content": "# Authentication Patterns\n\n## Session Auth\n- Use httpOnly cookies for session tokens\n- Set Secure + SameSite flags\n- Rotate session IDs on login\n\n## JWT\n- Use short-lived access tokens (15 min)\n- Use refresh tokens (7-30 days)\n- Never store JWTs in localStorage\n\n## OAuth/OIDC\n- Use PKCE for public clients\n- Validate ID token signatures\n- Use nonce to prevent replay"},
        "owasp.md": {"stacks": [], "title": "OWASP Top 10 (Universal)",
                     "content": "# OWASP Top 10 (2021)\n\n## A01: Broken Access Control\n- Use deny by default\n- Validate ownership before access\n- Use server-side session invalidation\n\n## A02: Cryptographic Failures\n- Use TLS everywhere\n- Use Argon2/bcrypt for passwords\n- Never use MD5/SHA1 for security\n\n## A03: Injection\n- Use parameterized queries\n- Validate and sanitize input\n- Use allow-lists, not block-lists\n\n## A07: Identification & Auth Failures\n- Implement rate limiting\n- Use MFA where possible\n- Use secure password reset flows"},
        "secrets.md": {"stacks": [], "title": "Secrets Management (Universal)",
                       "content": "# Secrets Management\n\n## Storage\n- Never hardcode secrets in source\n- Use environment variables for dev\n- Use a secrets manager for production (Vault, AWS Secrets Manager)\n\n## Rotation\n- Rotate secrets regularly\n- Automate rotation where possible\n- Have a revocation plan\n\n## Detection\n- Use git-secrets or trufflehog to scan history\n- Use pre-commit hooks\n- Monitor for exposed secrets"},
    },
    "testing": {
        "unit.md": {"stacks": [], "title": "Unit Testing Patterns (Universal)",
                    "content": "# Unit Testing Patterns\n\n## Test Design\n- Test behavior, not implementation\n- One assertion per test (ideally)\n- Use AAA pattern: Arrange, Act, Assert\n\n## Mocking\n- Mock external dependencies\n- Use dependency injection for testability\n- Avoid mocking what you don't own\n\n## Coverage\n- Target 80%+ coverage\n- Don't chase 100% -- focus on critical paths\n- Use mutation testing to verify test quality"},
        "e2e.md": {"stacks": [], "title": "E2E Testing Patterns (Universal)",
                   "content": "# E2E Testing Patterns\n\n## Playwright\n- Use page object models\n- Use data-testid attributes for selectors\n- Run tests in parallel\n\n## Test Design\n- Test critical user journeys\n- Keep tests independent\n- Use beforeAll/beforeEach for setup\n\n## Flakiness\n- Use auto-waiting (Playwright does this)\n- Avoid fixed sleeps\n- Retry flaky tests (but investigate)"},
        "performance.md": {"stacks": [], "title": "Performance Testing Patterns (Universal)",
                           "content": "# Performance Testing Patterns\n\n## Load Testing\n- Use k6 or Artillery\n- Test realistic user patterns\n- Gradually ramp up load\n\n## Metrics\n- Measure p95 and p99 latency\n- Measure throughput (req/s)\n- Measure error rate\n\n## Profiling\n- Use flame graphs for CPU profiling\n- Use heap snapshots for memory profiling\n- Use clinic.js for Node.js profiling"},
    },
    "integrations": {
        "mcp.md": {"stacks": [], "title": "MCP Server Patterns (Universal)",
                   "content": "# MCP Server Patterns\n\n## Design\n- Keep tools focused (one tool = one action)\n- Use clear, descriptive names\n- Document with examples\n\n## Security\n- Validate all inputs with zod\n- Use permission.ask for sensitive operations\n- Never expose secrets in tool output\n\n## Testing\n- Use @modelcontextprotocol/inspector for debugging\n- Test with multiple MCP clients\n- Document the expected tool schema"},
        "apis.md": {"stacks": [], "title": "API Integration Patterns (Universal)",
                    "content": "# API Integration Patterns\n\n## REST\n- Use proper HTTP methods (GET, POST, PUT, DELETE)\n- Use status codes correctly\n- Version your API (/v1/)\n\n## Webhooks\n- Validate webhook signatures\n- Use idempotency keys\n- Have a retry strategy with backoff\n\n## Error Handling\n- Use exponential backoff\n- Circuit break for failing services\n- Log all API errors with context"},
        "webhooks.md": {"stacks": [], "title": "Webhook Patterns (Universal)",
                        "content": "# Webhook Patterns\n\n## Inbound (Receiving)\n- Validate signatures (HMAC)\n- Use idempotency to handle duplicates\n- Respond quickly (200 OK), process async\n\n## Outbound (Sending)\n- Use signed payloads\n- Implement retry with backoff\n- Provide a webhook management UI\n\n## Security\n- Use HTTPS only\n- Rotate signing secrets\n- Log all webhook events"},
    },
}


def write_knowledge_file(category: str, filename: str, data):
    """Write a seed knowledge file."""
    knowledge_path = VAULT_ROOT / "04_Knowledge" / "references" / category / filename

    if knowledge_path.exists():
        return knowledge_path  # Idempotent

    stacks_str = ", ".join(data["stacks"]) if data["stacks"] else ""
    content = f"""---
title: {data["title"]}
category: {category}
stacks: [{stacks_str}]
last_updated: {NOW}
---

{data["content"]}

---

This is a SEED knowledge file. Callimachus may update it as patterns evolve,
but the core content is hand-authored. Gods query this via the instinct-scope
filter when working on projects with matching stacks.
"""
    _ = knowledge_path.parent.mkdir(parents=True, exist_ok=True)
    _ = knowledge_path.write_text(content, encoding="utf-8")
    return knowledge_path


# --- Main -----------------------------------------------------------------

def main():
    print("Olympus Vault Seeder")
    print(f"Vault root: {VAULT_ROOT}")
    print()

    # --- T22: Create directory structure -------------------------------
    print("=== T22: Creating vault directory structure ===")
    dirs_created = 0
    for dir_rel in VAULT_DIRS:
        dir_abs = VAULT_ROOT / dir_rel
        if not dir_abs.exists():
            dir_abs.mkdir(parents=True, exist_ok=True)
            dirs_created += 1
    print(f"  Created {dirs_created} directories (total: {len(VAULT_DIRS)})")
    print()

    # --- T23: Write seed instinct files --------------------------------
    print("=== T23: Writing seed instinct files ===")
    instincts_written = 0
    for god, instincts in SEED_INSTINCTS.items():
        for instinct in instincts:
            path = write_instinct_file(god, instinct)
            if path:
                instincts_written += 1
                rel = path.relative_to(VAULT_ROOT)
                print(f"  OK {rel}")
    print(f"  Total: {instincts_written} seed instinct files")
    print()

    # --- T24: Write seed knowledge files -------------------------------
    print("=== T24: Writing seed knowledge files ===")
    knowledge_written = 0
    for category, files in KNOWLEDGE_FILES.items():
        for filename, data in files.items():
            path = write_knowledge_file(category, filename, data)
            if path:
                knowledge_written += 1
                rel = path.relative_to(VAULT_ROOT)
                print(f"  OK {rel}")
    print(f"  Total: {knowledge_written} seed knowledge files")
    print()

    # --- Create initial activity feed ----------------------------------
    feed_path = VAULT_ROOT / "06_Activity_Feed" / "live.jsonl"
    if not feed_path.exists():
        feed_path.parent.mkdir(parents=True, exist_ok=True)
        init_event = {
            "ts": NOW,
            "god": "apollo",
            "action": "session_start",
            "msg": "Olympus vault initialized",
            "project": None,
            "meta": {"event": "vault_init"},
        }
        _ = feed_path.write_text(f"{init_event}\n".replace("'", "\"").replace("None", "null"), encoding="utf-8")
        print("=== Created initial activity feed ===")
        print("  OK 06_Activity_Feed/live.jsonl")
        print()

    # --- Create Symphony runtime files (v1.0) -------------
    # The Symphony lazily creates these on first signature, but seeding them
    # here makes the install idempotent + the doctor happy.
    vibrations_dir = VAULT_ROOT / "05_Auto_Learning" / "vibrations"
    vibrations_dir.mkdir(parents=True, exist_ok=True)

    # registry.jsonl — append-only log of every signature + harmonic + consensus
    registry_path = vibrations_dir / "registry.jsonl"
    if not registry_path.exists():
        _ = registry_path.write_text("", encoding="utf-8")

    # templates.json — learned shorthand (promoted by the tuner)
    templates_path = vibrations_dir / "templates.json"
    if not templates_path.exists():
        _ = templates_path.write_text("{}", encoding="utf-8")

    # metrics.json — aggregate counters
    metrics_path = vibrations_dir / "metrics.json"
    if not metrics_path.exists():
        import json as _json
        symphony_metrics = {
            "totalSignatures": 0,
            "totalHarmonics": 0,
            "totalConsensus": 0,
            "totalFallbacks": 0,
            "averageReduction": 0,
            "averageCoherence": 0,
            "updatedAt": NOW,
        }
        _ = metrics_path.write_text(_json.dumps(symphony_metrics, indent=2), encoding="utf-8")

    print("=== Created Symphony runtime files ===")
    print("  OK 05_Auto_Learning/vibrations/registry.jsonl (empty)")
    print("  OK 05_Auto_Learning/vibrations/templates.json ({})")
    print("  OK 05_Auto_Learning/vibrations/metrics.json (zeroed)")
    print()

    # --- Create vault .gitignore (for GitHub backup) --------------------
    gitignore_path = VAULT_ROOT / ".gitignore"
    if not gitignore_path.exists():
        gitignore_content = """# Olympus Vault .gitignore
# Excludes regeneratable + transient data from git commits.

# Search index (regenerated by reindex API)
03_Index/

# Processed inbox items (moved by Callimachus, not needed in backup)
00_Inbox/_processed/

# Staging instincts (candidate instincts not yet live)
05_Auto_Learning/instincts/*/empirical/_staging/

# Compaction log (transient)
05_Auto_Learning/_compaction_log.jsonl

# Lockfiles (transient)
06_Activity_Feed/*.lock
*.lock

# OS files
.DS_Store
Thumbs.db
"""
        _ = gitignore_path.write_text(gitignore_content, encoding="utf-8")
        print("=== Created vault .gitignore ===")
        print("  OK .gitignore (excludes index, staging, processed, locks)")
        print()

    # --- Summary -------------------------------------------------------
    print("=" * 60)
    print("VAULT SEEDING COMPLETE")
    print("=" * 60)
    print(f"  Directories created: {dirs_created}")
    print(f"  Seed instincts:      {instincts_written}")
    print(f"  Seed knowledge:      {knowledge_written}")
    print(f"  Vault root:          {VAULT_ROOT}")
    print()
    print("The vault is ready. Callimachus can now curate empirical")
    print("instincts, and gods can query their seed instincts via the")
    print("olympus-instinct-query tool.")


if __name__ == "__main__":
    main()
