# OLYMPUS Agents

> AGPL-3.0-or-later · GO-primary · Apollo-primary · OpenCode-based · 10 gods · 118 demigods · Symphony protocol · Standalone Electron desktop app

## The 10 Gods

Gods are `mode: "primary"` or `mode: "subagent"` agents in `opencode.json`. Apollo is the only god who talks to the user; the other 9 are invoked by Apollo via Symphony dispatch.

| God | Domain | Model (go-balanced) | Role |
|-----|--------|---------------------|------|
| **Apollo** | Planning & architecture | `opencode-go/glm-5.2` | The only god who talks to the user. Plans the task DAG, defines acceptance criteria, hands execution to Atlas. |
| **Atlas** | Orchestration & execution | `opencode-go/hy3` | The god who executes the plan. Apollo plans, Atlas dispatches. Hy3 is sacred — never downgraded. Excels at agent orchestration with lower token cost. |
| **Artemis** | Security & auditing | `opencode-go/qwen3.7-plus` | SAST, pentesting, compliance, threat modeling, secrets scanning. |
| **Athena** | Frontend & design | `opencode-go/qwen3.7-plus` | React/Next.js, accessibility, design systems, UI verification. |
| **Dionysus** | QA & testing | `opencode-go/deepseek-v4-pro` | TDD, E2E, evidence collection, performance testing, mutation testing. |
| **Hephaestus** | Backend code | `opencode-go/deepseek-v4-pro` | Multi-language code review, build resolution, API design, refactoring. |
| **Hermes** | Integrations & MCPs | `opencode-go/qwen3.7-plus` | MCP building, API wiring, LLM architecture, research. |
| **Persephone** | Database & persistence | `opencode-go/deepseek-v4-pro` | Schema design, migrations, data engineering, DBRE. |
| **Prometheus** | DevOps & CI/CD | `opencode-go/qwen3.7-plus` | Docker, Terraform, SRE, incident response, release engineering. |
| **Callimachus** | Vault curation | `opencode-go/deepseek-v4-flash` | Instinct lifecycle, brain backup/restore, docs verification. Runs the 7-stage brain maintenance loop on `session.idle`. |

**Total: 10 gods + 118 demigods = 128 agents.**

Apollo is always on GLM-5.2 in balanced and max-quality strategies (sacred — never downgraded). Atlas is always on Hy3 in all strategies (sacred — never downgraded). In go-budget, Apollo stays on GLM-5.2 and Atlas stays on Hy3 while all other gods drop to DeepSeek V4 Flash. Hy3 excels at agent orchestration — Atlas's domain — and is more cost-effective than alternatives.

---

## Demigods

Demigods are `mode: "subagent"` — invoked only by a god, never by the user directly. The fleet of **118 demigods** is organized under `.opencode/prompts/agents/demigods/<god>/`.

| God | Demigods | Count |
|-----|----------|-------|
| **Apollo** | planner, architect, spec-author, demigod-author, risk-assessor, scope-gatekeeper, rapid-prototyper, spec-miner | 8 |
| **Atlas** | dag-optimizer, integration-compiler, chief-of-staff, git-workflow-master, multi-agent-architect, silent-failure-hunter | 6 |
| **Artemis**  | security-reviewer, pentester, compliance-auditor, threat-analyst, secrets-scanner, cloud-security-auditor, ai-code-auditor, supply-chain-auditor, appsec-engineer, blockchain-security-auditor, privacy-engineer, security-architect | 12 |
| **Athena**  | frontend-reviewer, ui-designer, a11y-auditor, visual-verifier, brand-guardian, information-architect, mobile-app-builder, performance-optimizer, responsive-tester, section-508-specialist, state-architect, ux-researcher | 13 |
| **Dionysus** | tdd-guide, e2e-runner, evidence-collector, performance-tester, api-tester, flaky-test-resolver, gan-planner, harness-optimizer, mutation-tester, reality-checker, test-automation-engineer, test-results-analyzer, unit-test-author | 13 |
| **Hephaestus** | build-resolver, code-verifier, managed-reviewer, refactor-engineer, api-designer, code-explorer, code-simplifier, comment-analyzer, embedded-firmware-engineer, go-reviewer, script-reviewer, search-relevance-engineer, smart-contract-engineer, systems-reviewer, ts-reviewer, type-design-analyzer, webassembly-engineer | 17 |
| **Hermes** | mcp-builder, api-integrator, llm-architect, protocol-designer, webhook-engineer, ai-engineer, auth-specialist, email-intelligence-engineer, event-stream-architect, payments-billing-engineer, prompt-engineer, rag-pipeline-engineer, realtime-collaboration-engineer, researcher, video-streaming-engineer, voice-ai-engineer | 16 |
| **Persephone** | schema-reviewer, migration-engineer, data-engineer, dbre, cache-architect, clickhouse-specialist, data-migration-specialist, etl-pipeline-architect, gaussdb-expert, orm-specialist, query-optimizer | 11 |
| **Prometheus** | docker-expert, terraform-engineer, sre, incident-responder, release-engineer, finops-analyst, homelab-architect, iot-fleet-engineer, k8s-engineer, network-architect, network-config-reviewer, network-engineer, network-troubleshooter | 13 |
| **Callimachus** | instinct-curator, brain-backup, brain-restore, docs-verifier, conversation-analyzer, opensource-packager, pattern-extractor, skill-indexer, technical-writer | 9 |

Demigods are **unprefixed** — a demigod is `build-resolver`, not `hephaestus-build-resolver`. The parent god is determined by the dispatch context, not by a name prefix.

> **Editor Bridge:** OLYMPUS does not ship a built-in code editor. Gods edit code by launching the user's preferred external editor (Zed, VSCode, VSCodium, Cursor) on the active project via the Editor Bridge tab. The live terminal is shared between the Electron app and the user's IDE via the Terminal Bridge (port 3740) — see [EDITORS.md](EDITORS.md). Agent dispatch + Symphony + instinct system are unchanged.

> **Free tier + telemetry:** OLYMPUS ships three free LLM strategies — `free-openrouter` (the OpenRouter-only split), `free-big-pickle` (all 10 gods on one free flagship), and `free-nvidia-build` (NVIDIA Build's free endpoints — GLM-5.2 + the Nemotron family) — plus three Zen strategies (`zen-max-quality`, `zen-balanced`, `zen-budget` — OpenCode Zen, pay-as-you-go, full 128-agent OLYMPUS with no request caps; see [MODEL-STRATEGIES.md](MODEL-STRATEGIES.md)). Free strategies pick the strongest free models currently live from the provider lists (OpenRouter + NVIDIA Build, refreshed automatically via `scripts/refresh-free-models.js`). Every instinct gate evaluation is logged to `~/OLYMPUS-VAULT/05_Auto_Learning/shortcircuit-log.jsonl` for live telemetry (see the Short-Circuit Health panel in the God Intelligence Dashboard). Vault TTL pruning prevents unbounded growth (see [BENCHMARKS.md](BENCHMARKS.md)).

---

## Dispatch protocol

Every god-to-demigod dispatch flows through **Symphony** — there is no textual dispatch path.

1. The god calls `olympus-dispatch({ godId, demigod, task, skill, mcp })`.
2. The tool composes a `VibrationalSignature` (intent vector + constraints + success criteria).
3. The signature is broadcast to the target demigod.
4. The `dispatch-tracker` registers an open dispatch.
5. The `tool.execute.after` hook attributes subsequent tool calls to this dispatch.
6. When the active agent changes, the dispatch is finalized with outcome + duration + tokens.
7. The outcome is logged to the Arsenal Resonance log (skill confidence feedback loop).

If the god's instinct gate finds a high-confidence match (≥ 0.85), the dispatch **short-circuits** — the god skips deliberation and dispatches directly per the instinct's action.

---

## Instinct system

Instincts are learned patterns stored in the vault:

- **Seed instincts** — immutable baselines authored at install time (`~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/seed/`)
- **Empirical instincts** — learned from dispatch outcomes (`.../<god>/empirical/`)
- **Archived instincts** — stale instincts kept for pattern matching (`.../<god>/_archive/`)

Each instinct has a `confidence` score (0.0–1.0). When confidence ≥ 0.85, the god short-circuits. Callimachus's 7-stage loop curates the pool: archive stale, dedup similar, promote high-confidence empirical instincts to seed.

---

## Skill arsenal

Each god declares mastered skills in `.opencode/vault-brain/mastered-skills/<god>.md`. The **hot/warm/cold tier system** keeps the input budget lean:

- **Hot** — mastered skills (always loaded, ~5–10 per god)
- **Warm** — stack-relevant skills (loaded for non-trivial tasks, capped at 20)
- **Cold** — all other skills (not loaded; lazy via skill index search)

The skill index (`~/OLYMPUS-VAULT/03_Index/skill-vec.db`) provides sub-millisecond TF-IDF cosine search across all 330 skills. When the instinct gate doesn't short-circuit, the router searches the index for the top-5 relevant skills and surfaces them as hints.

---

## Symphony Arsenal Resolver

The Arsenal Resolver is Symphony's quick-circuit layer for arsenal selection. It queries the Arsenal Resonance log (`~/OLYMPUS-VAULT/03_Index/arsenal-resonance.jsonl`) for past dispatch outcomes that match the current task signature (Jaccard similarity ≥ 0.4). If coherence ≥ 0.85, a quick-circuit fires — returning the proven arsenal (skills, MCPs, demigods) as hints. Gods are not dependent on quick-circuits; they evaluate the task + instincts at dispatch time and may override.
