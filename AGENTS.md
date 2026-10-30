# OLYMPUS Agents

> AGPL-3.0-or-later · GO-primary · Apollo-primary · OpenCode-based · 10 gods · 122 demigods · Symphony protocol · Standalone Electron desktop app

## The 10 Gods

Gods are `mode: "primary"` or `mode: "subagent"` agents in `opencode.json`. Apollo is the only god who talks to the user; the other 9 are invoked by Apollo via Symphony dispatch.

| God | Domain | Model (go-balanced) | Role |
|-----|--------|---------------------|------|
| **Apollo** | Planning & architecture | `opencode-go/glm-5.3` | The only god who talks to the user. Plans the task DAG, defines acceptance criteria, hands execution to Atlas. |
| **Atlas** | Orchestration & execution | `opencode-go/hy3` | The god who executes the plan. Apollo plans, Atlas dispatches. Hy3 is sacred — never downgraded. Excels at agent orchestration with lower token cost. |
| **Artemis** | Security & auditing | `opencode-go/qwen3.7-plus` | SAST, pentesting, compliance, threat modeling, secrets scanning. |
| **Athena** | Frontend & design | `opencode-go/qwen3.7-plus` | React/Next.js, accessibility, design systems, UI verification. |
| **Dionysus** | QA & testing | `opencode-go/deepseek-v4-pro` | TDD, E2E, evidence collection, performance testing, mutation testing. |
| **Hephaestus** | Backend code | `opencode-go/deepseek-v4-pro` | Multi-language code review, build resolution, API design, refactoring. |
| **Hermes** | Integrations & MCPs | `opencode-go/qwen3.7-plus` | MCP building, API wiring, LLM architecture, research. |
| **Persephone** | Database & persistence | `opencode-go/deepseek-v4-pro` | Schema design, migrations, data engineering, DBRE. |
| **Prometheus** | DevOps & CI/CD | `opencode-go/qwen3.7-plus` | Docker, Terraform, SRE, incident response, release engineering. |
| **Callimachus** | Vault curation | `opencode-go/deepseek-v4-flash` | Instinct lifecycle, brain backup/restore, docs verification. Runs the 7-stage brain maintenance loop on `session.idle`. |

**Total: 10 gods + 122 demigods = 132 agents.**

Apollo is always on the GLM family (sacred — never downgraded): FULL GLM-5.3 in go-max-quality (shared with Athena/Dionysus/Persephone there) AND in go-balanced (the 2026-10-16 upgrade — the planner is the quality bottleneck, and the hop runtime's small-burst request shape stretches the $3/5h rolling cap far past the old interactive-turn economics); GLM-5.3-Flash only in go-budget (the cap-aware fallback). **The free-tier clause is RETIRED (v0.0.22)**: the free tier is gone; the zero-cost path is the `local` strategy (the user's own hardware — Ollama / LM Studio / vLLM / llama.cpp / any OpenAI-compatible endpoint), where the probe names the model and the dashboard shows it. A stalled lane is not planning quality. Atlas is always on Hy3 in the GO strategies (sacred — never downgraded; Zen substitutes GPT 6 Sol/Luna because Hy3 is GO-only). Hy3 excels at agent orchestration — Atlas's domain — and is more cost-effective than alternatives.

---

## Demigods

Demigods are `mode: "subagent"` — invoked only by a god, never by the user directly. The fleet of **122 demigods** is organized under `.opencode/prompts/agents/demigods/<god>/`.

| God | Demigods | Count |
|-----|----------|-------|
| **Apollo** | planner, architect, spec-author, demigod-author, risk-assessor, scope-gatekeeper, rapid-prototyper, spec-miner | 8 |
| **Atlas** | dag-optimizer, integration-compiler, chief-of-staff, git-workflow-master, multi-agent-architect, silent-failure-hunter | 6 |
| **Artemis**  | security-reviewer, pentester, compliance-auditor, threat-analyst, secrets-scanner, cloud-security-auditor, ai-code-auditor, supply-chain-auditor, appsec-engineer, blockchain-security-auditor, privacy-engineer, security-architect | 12 |
| **Athena**  | frontend-reviewer, ui-designer, a11y-auditor, visual-verifier, 2d-asset-designer, brand-guardian, information-architect, mobile-app-builder, performance-optimizer, responsive-tester, section-508-specialist, state-architect, ux-researcher | 14 |
| **Dionysus** | tdd-guide, e2e-runner, evidence-collector, performance-tester, api-tester, flaky-test-resolver, gan-planner, harness-optimizer, mutation-tester, reality-checker, test-automation-engineer, test-results-analyzer, unit-test-author | 13 |
| **Hephaestus** | build-resolver, code-verifier, managed-reviewer, refactor-engineer, api-designer, code-explorer, code-simplifier, comment-analyzer, embedded-firmware-engineer, go-reviewer, script-reviewer, search-relevance-engineer, smart-contract-engineer, systems-reviewer, ts-reviewer, type-design-analyzer, webassembly-engineer, image-generator, vision-describer, 3d-asset-engineer | 20 |
| **Hermes** | mcp-builder, api-integrator, llm-architect, protocol-designer, webhook-engineer, ai-engineer, auth-specialist, email-intelligence-engineer, event-stream-architect, payments-billing-engineer, prompt-engineer, rag-pipeline-engineer, realtime-collaboration-engineer, researcher, video-streaming-engineer, voice-ai-engineer | 16 |
| **Persephone** | schema-reviewer, migration-engineer, data-engineer, dbre, cache-architect, clickhouse-specialist, data-migration-specialist, etl-pipeline-architect, gaussdb-expert, orm-specialist, query-optimizer | 11 |
| **Prometheus** | docker-expert, terraform-engineer, sre, incident-responder, release-engineer, finops-analyst, homelab-architect, iot-fleet-engineer, k8s-engineer, network-architect, network-config-reviewer, network-engineer, network-troubleshooter | 13 |
| **Callimachus** | instinct-curator, brain-backup, brain-restore, docs-verifier, conversation-analyzer, opensource-packager, pattern-extractor, skill-indexer, technical-writer | 9 |

Demigods are **unprefixed** — a demigod is `build-resolver`, not `hephaestus-build-resolver`. The parent god is determined by the dispatch context, not by a name prefix.

> **Editor Bridge:** OLYMPUS does not ship a built-in code editor. Gods edit code by launching the user's preferred external editor (Zed, VSCode, VSCodium, Cursor) on the active project via the Editor Bridge tab. The live terminal is shared between the Electron app and the user's IDE via the Terminal Bridge (port 3740) — see [EDITORS.md](EDITORS.md). Agent dispatch + Symphony + instinct system are unchanged.

> **Strategy engine + teams (v0.0.23):** DeepSeek V4.1 Flash (1017) is the preferred lane across the GO strategies — it replaced DeepSeek V4 Pro and GLM-5.3-Flash on the quality roles; BYOK is deleted (every provider, OpenRouter and NVIDIA included, is registered in OpenCode and chosen in the Strategy Builder). A hop's god leads a TEAM: the arsenal directive requires 2–5 independent demigods in one parallel wave, artifact verification, and a synthesis that reports the chain — trivial hops work alone. The MCP arsenal is measured (`scripts/mcp-audit.mjs`) and curated to 44 tools by default (filesystem, memory, git, context7, sequential-thinking, olympus-craft); heavy servers (rea 207 tools, grafana 79, comfyui 41) are opt-in.

> **Local lane + telemetry (v0.0.22):** the free tier is **retired**. The zero-cost path is **`local`** — the user's own hardware (Ollama `:11434`, LM Studio `:1234`, vLLM `:8000`, llama.cpp `:8080`, or any OpenAI-compatible endpoint). `scripts/local-llm-probe.js` probes all five; `apply-strategy local` wires the `local/<model>` ids into the full 132-agent config and REFUSES with the probe table when nothing answers (see [LOCAL-LLM.md](LOCAL-LLM.md)). Paid paths: the GO strategies (`go-max-quality`, `go-balanced`, `go-budget`), and the Zen strategies (`zen-max-quality`, `zen-balanced`, `zen-budget`). **Models are lanes; the cable carries context** — the gods share context through Symphony regardless of which pool each god rides. **Sessions are lanes; the disk carries the campaign** (#109's hop runtime) — an architectural task is a DETERMINISTIC SPINE (a script, zero LLM tokens) walking SMALL LLM HOPS (`src/lib/hop-runtime/`): Apollo emits `dispatch-plan.json` (a DAG of ≤16k-token hops, one god each, artifacts on disk), the walker dispatches per hop on the god's lane, verifies deterministic-first (0 tokens), and PARKS on exhaustion with resume — a burst kills one hop, never a 5-minute run. Every instinct gate evaluation is logged to `~/OLYMPUS-VAULT/05_Auto_Learning/shortcircuit-log.jsonl` for live telemetry (see the Short-Circuit Health panel in the God Intelligence Dashboard). Vault TTL pruning prevents unbounded growth (see [BENCHMARKS.md](BENCHMARKS.md)).

---

> **Honest surface + live flow (v0.0.24):** the MCP surface is now ONE canonical registry — 28 unique servers (never the old 50-row double count), the OpenCode v2 shape (`type` + one `command` array + `environment` + numeric `timeout`), a real JSON-RPC handshake, and a curated 6/44-tool default that is measured by `npm run mcp:audit`. A server without `type`, with `args`, with `env`, or with an object `timeout` is invisible to OpenCode — never write that shape. Project homes live in `~/OLYMPUS-VAULT/02_Projects/<slug>` (the legacy `~/.local/share/olympus/workspace` lane is migrated; `npm run projects:migrate -- --apply`). God-domain knowledge is seeded from `scripts/knowledge/` into `04_Knowledge/references/` (`npm run seed:knowledge`) and injected into task prompts by `src/lib/knowledge-hints.ts`. Athena's design decisions are INLINE in the chat (`olympus-design-review` → `DesignChoiceCard`), not a modal. Hops use a pluggable transport (`OLYMPUS_HOP_TRANSPORT=auto|spawn|warm`, default auto = warm first, spawn fallback; the warm lane uses OpenCode's v1 `/session/:id/message` API because the v2 prompt endpoint cannot select an agent/model) and publish one hop stream at `/api/olympus/hops/stream` for the live panel and campaign-grouped activity.

> **Stable surface (v0.0.25):** the standalone build is GATED — `ws` is externalized + force-traced, `scripts/sync-standalone-assets.mjs` completes `.next/static`+`public`, and `scripts/verify-standalone.mjs` fails the build if `ws` cannot be required from `.next/standalone`, `BUILD_ID` is stale, chunks are missing, or `server.js` does not boot (the `Cannot find module './websocket'` class is now impossible to ship). MCP health is CLASSIFIED before it is probed: `needs-auth | needs-service | needs-binary | needs-app` are amber and never spawn; `optional-unavailable` is amber; `dead` (red) is reserved for a declared dependency that is present and still fails. The panel meters the 128-tool budget and offers reset-curated / disable-unavailable / enable-available / diagnostics. Pane endpoints are cached with `src/lib/ttl-cache.ts` (stale-while-revalidate); Craft probes are cached and updates are check-only by default; `npm run perf:routes` gates warm p95 ≤ 300ms.

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

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

## Issue Taxonomy (standing rule — effective 2026-10-03, retroactive)

Every issue is complete at creation time:

- **Title:** `type(scope): title` — type ∈ feat | fix | docs | refactor | test | chore;
  scope ∈ autonomy | telemetry | permissions | harness | dev-server | free-tier | ui | hop | activity | vault |
  registry | build | cost (extend the scope set only by standing-rule update).
- **Labels:** one type label (bug / enhancement / documentation) + area labels matching
  the scope — set via the GitHub API at creation. Deferring labels is a batch defect.
- **Retroactive hygiene:** before commenting on, referencing, or closing any issue,
  verify its taxonomy; if off-pattern, retitle + relabel in the same action
  (pre-authorized — no permission needed) and log it in the batch report.
- **Batch reports:** every batch report carries a `## Taxonomy check` section listing
  issues touched as `#NN type(scope): title [labels]`.
- **Closure:** closing comments MUST link evidence (commit sha + test/probe output).
  Closing an off-pattern issue without fixing its taxonomy first is an incomplete
  closure.

Known label areas: autonomy, telemetry, permissions, harness, dev-server, free-tier, ui, hop, activity, vault,
registry.

---

## Probe-verified claims (standing rule — #105, effective 2026-10-08)

No agent narrates a live process — a dev server above all — as "running" from captured
output alone. Captured stdout proves a process STARTED; it says nothing about whether it is
STILL RUNNING (the #105 specimen: 31s of captured banner + "Ready" + "Compiled" text,
the process already dead by return time — the narration sent the user to a panel that
could never go green). The claim path, in order: probe first (the dev-server manager's
status — `probeDevServer` under the hood, `src/lib/dev-server-manager.ts`), quote the
probe result (host/port/latency), or say honestly that you could not verify. A claim about
live state carries probe evidence or it is not made; the no-probe form is the explicit
refusal "unverified — no probe evidence". The failure card follows the same law (#98's
card + the `/api/olympus/dev-server/status` route): probe evidence when green, the refusal
when there is no probe. The interactive lane cannot host a durable process — the
dev-server manager (#86) is the host; its status is the single source of truth for
"running".
