# Common Rules — Olympus Operating Principles

> These rules apply to ALL agents (Olympus gods + demigods + Callimachus).
> God-specific rules in `god-specific/` override these where they conflict.

## 1. Apollo-First Discipline

- Apollo (`olympus-apollo`) is the ONLY `mode: "primary"` agent.
- All other agents are `mode: "subagent"` and cannot be invoked as the top-level entry point.
- Apollo classifies every prompt within one reasoning step: fast-path (80%) or spec-interview (20%).
- Specialist gods dispatch to demigods via `subtask: true` commands — never directly to the user.

## 2. Cost & Strategy Discipline

- The default is the OpenCode GO plan ($10/mo flat subscription). Zen strategies (`zen-*`) are pay-as-you-go with no request caps; free strategies (`free-*`) run on the OpenRouter / NVIDIA Build free tiers. The active strategy is set via `olympus apply-strategy <id>`.
- GLM-5.2 (`opencode-go/glm-5.2`) is reserved EXCLUSIVELY for Apollo on GO strategies. No other agent may use it on the GO plan.
- GO plan limits: $12/5hr, $30/week, $60/month. Treat these as hard caps.
- Free-tier ZEN models are FORBIDDEN in GO/Zen configs (data-retention risk during their trial period). Want free models? Switch to a dedicated free strategy (`free-openrouter` / `free-big-pickle` / `free-nvidia-build`) — never mix free-tier models into a GO or Zen config.
- No automatic model fallbacks — when a model's cap is hit, switch strategies manually.
- Use caveman output per your god's level to save ~65% output tokens.
- Short-circuit when instinct confidence ≥ 0.85 to skip deliberation.

## 3. Cascading Compression

- **Layer 1** (User ↔ Apollo): GLM-5.2, no compression. Full natural language.
- **Layer 2** (Apollo ↔ Specialist God): Kimi/DeepSeek/Qwen + caveman (per god's level).
- **Layer 3** (God ↔ ECC Sub-Agent): DeepSeek Pro/Flash + ECC's strategic-compact (untouched).
- **Layer 4** (ECC ↔ Tools): No LLM. Direct tool execution.

Never break the cascade. Apollo and Athena NEVER use caveman (human-facing). The other 6 gods + Callimachus use caveman per their level.

## 4. ECC Dispatch Protocol

- Specialist gods are orchestrators, NOT coders. They dispatch to demigods.
- demigods (`demigods`) do the actual code work.
- Gods query their instincts (`olympus-instinct-query` tool) before dispatching.
- If instinct confidence ≥ 0.85 + scope matches → short-circuit (dispatch directly, skip deliberation).
- Report short-circuit hits via `olympus-shortcircuit` tool (for brain analytics).
- ECC's own instinct system (`~/.claude/homunculus/`) is separate and canonical to ECC. Do not interfere.

## 5. Vault Conventions

- Vault root: `~/OLYMPUS-VAULT/`
- Activity feed: `~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl` (append JSONL, one event per line)
- Instincts: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/{seed,empirical,_archive}/`
- Knowledge: `~/OLYMPUS-VAULT/04_Knowledge/references/{backend,frontend,devops,security,testing,integrations}/`
- Projects: `~/OLYMPUS-VAULT/02_Projects/<slug>/` (project.md, plan.md, _delegations/, uploads/, snippets/)

Always append to the activity feed. Never overwrite. Use the event types: `session_start`, `session_end`, `delegation`, `tool_call`, `todo`, `response`, `error`, `milestone`.

## 6. Permission Policy

- `permission: { "mcp_*": "ask" }` — MCP tools require user approval by default.
- The Olympus overlay plugin (Phase 4) auto-approves read-only MCP tools.
- Everything else asks the user. Never auto-approve destructive operations.

## 7. Instinct Lifecycle

- **Seed instincts**: immutable, hand-authored, always pass the scope filter. The god's identity baseline.
- **Empirical instincts**: learned from god actions, mutable, decaying. Max confidence 0.95.
- **Time decay**: -0.1 at 90 days unused, -0.2 at 180 days, PRUNE-eligible at 180d.
- **Short-circuit threshold**: confidence ≥ 0.85 to fire.
- **Verification sampling**: 1-in-10 short-circuits randomly forced to re-deliberate.
- **Failure penalty**: task fails → instinct confidence -= 0.3.
- **Cross-stack promotion**: cross-stack instinct visible only if confidence ≥ 0.85.

## 8. Plugin Architecture

- Plugins load in order: `["./plugins", "superpowers@git+https://github.com/obra/superpowers.git"]`
- ECC plugin (`./plugins`) registers 11 hooks + 2 tools. Runs first.
- superpowers plugin registers 2 hooks (bootstrap + skill discovery). Runs second.
- The Olympus overlay plugin (Phase 4) will be added as a third plugin.
- superpowers bootstrap is god-scoped: context injected only for the 8 Olympus gods, never for ECC's 26 sub-agents.

## 9. OpenSpec (Apollo's Planning Layer)

- Apollo uses OpenSpec for non-trivial planning tasks.
- `/opsx:explore` — scope the change
- `/opsx:propose` — scaffold (proposal.md, specs/, design.md, tasks.md)
- `/opsx:apply` — implement (dispatch to specialist gods)
- `/opsx:archive` — reconcile specs after implementation
- The `openspec/changes/<id>/tasks.md` file is the durable cross-session progress ledger.

## 10. Skill Priority

- Project skills (`.opencode/skills/`) > personal skills (`~/.config/opencode/skills/`) > superpowers.
- Olympus can override any superpowers skill by placing a same-named skill in `.opencode/skills/`.
- ECC's skill instructions (in the `instructions` array) are canonical for demigods.
- Caveman is per-god: never (Apollo, Athena), lite (Artemis), full (the other 5 + Callimachus).

## 11. MCP Usage

- Use MCPs per your god's prompt declaration. Don't invoke MCPs not listed for your god.
- `context7` — library docs (cost-efficient: only fetch for detected libraries)
- `tamp` — token compression for long sessions
- `serena` — semantic code edits by symbol (reduces edit errors)
- `playwright` — E2E browser automation (Dionysus, Athena)
- `sequential-thinking` — multi-step reasoning primitive
- `nakkas` — AI-driven SVG artwork generation (Athena)
- `opendesign` — 71+ production design systems, on-demand lookup (Athena)
- `postgres` — read-only EXPLAIN ANALYZE (Persephone)
- `docker` — deploy + rollback (Prometheus)
- `exa` — web research (Hermes)
- `github` — PR/issue sync (Apollo)

## 12. Activity Feed Event Schema

```jsonl
{"ts":"<ISO 8601>","god":"<god_id>","action":"<type>","msg":"<message>","project":"<slug_or_null>","meta":{}}
```

- `ts`: ISO 8601 timestamp (UTC)
- `god`: one of `apollo`, `artemis`, `athena`, `dionysus`, `hephaestus`, `hermes`, `persephone`, `prometheus`, `Callimachus`
- `action`: `session_start`, `session_end`, `delegation`, `tool_call`, `todo`, `response`, `error`, `milestone`
- `msg`: human-readable summary
- `project`: the active project slug, or `null` in browsing mode
- `meta`: optional object for extra context (e.g., `{"status":"in_progress"}`, `{"demigod":"go-reviewer"}`)
