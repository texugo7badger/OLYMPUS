# OLYMPUS v0.0.24 — THE HONEST SURFACE

One MCP truth · one tooltip · no free-tier fiction · Athena in the chat · knowledge for every god · projects in the vault · the four open flow issues.

## MCP: the panel and OpenCode finally agree

The old panel listed **50** servers for **28** real ones, and 19 of those 28 were **invisible to OpenCode** (no `type`; `args` instead of one `command` array; `env` instead of `environment`; an object `timeout`; `${VAR}` placeholders that OpenCode treats literally).

- The merged registry **dedupes by name** and normalizes every entry to the OpenCode v2 shape.
- The health probe spawns the **full command + environment**, and remote servers get a real JSON-RPC POST (not a HEAD request that reports 405).
- `locked` (missing key) is no longer painted as `dead`.
- The curated six are connected: **filesystem 14 · memory 9 · git 12 · context7 2 · sequential-thinking 1 · olympus-craft 6 = 44 tools**.
- The heavy/domain servers stay opt-in with an honest requirement (`key`, `service`, `app`, `binary`, `optional`).

Verify: `npm run mcp:audit` · `npm run mcp:sync -- --apply` · `opencode mcp list`.

## Tooltips: one portal, horizontal, never clipped

The vertical “timeout after 5000ms” was a `::after` pseudo-element shrink-to-fitting inside an 8px dot. The rule is deleted. `GlobalTooltip` renders one fixed-position, edge-aware tooltip for every `data-tip` — MCP dots, god cards, status pills.

## LLM Strategy: the retired free tier is gone

- No “No GO or ZEN plan? Free”, no `LocalFREE`, no “Free-tier Providers”, no dead `FREE_*` plumbing.
- **Local hardware** is its own card (`$0`, your machine, probe-verified).
- The old custom-strategy modal and plus button are deleted. **Build** (the search Builder) is the only custom-strategy entry point.
- The Builder defaults to **registered providers**, adds `Free only` / `Tool calling` / `≥32k ctx`, matches the word `free`, shows provider chips with counts, and warns that free endpoints are rate-limited and slow.
- A custom strategy can only use a provider registered in OpenCode.

## Athena: design choices inside the chat

The Design Studio modal is gone. When Athena plans a visible design, she calls `olympus-design-review` with 2–6 **dynamic** options — 3 SVG logo concepts, palettes, images, layout recipes — and `DesignChoiceCard` renders them inline in the terminal. Pick one, or write a refinement (“warmer”, “more minimal”, “different mark”), and Athena generates new options. The choice is saved in `02_Projects/<slug>/design-decisions.jsonl`.

## Knowledge for every god

13 new sourced references (planning, orchestration, design/a11y, design systems, performance, QA, evidence gates, schema design, query performance, knowledge ops, release engineering, threat modeling) plus the updated MCP reference. `npm run seed:knowledge` installs them; `knowledge-hints.ts` injects the top 3 into the task prompt.

## Projects live in the vault

Every project home, artifact, plan and decision is under `~/OLYMPUS-VAULT/02_Projects/<slug>`. The legacy lane is migrated (`npm run projects:migrate -- --apply`), collisions are archived, and a VCS exclude keeps OLYMPUS runtime files out of git.

## The four open issues

- **#231** — adaptive polling (hidden tabs pause) + a paginated activity feed (60 + `since` deltas + “Load older”).
- **#226** — Recent Activity grouped by campaign with the hop chain.
- **#227** — God Intelligence “Live campaign” card (god · lane · artifacts · elapsed) fed by one hop SSE stream.
- **#241** — warm-server hop transport (`auto` = warm first, spawn fallback), dynamic concurrency, no orphan servers. The OpenCode 2.2.2 v2 prompt-body bug was found and fixed.

## Upgrade notes

- `opencode.json` was canonicalized; a backup is in `~/.olympus/backups/`.
- Start a new session after toggling an MCP — OpenCode reads the config at spawn.
- The old `free-*` strategy ids are refused with the working alternatives.
- `OLYMPUS_HOP_TRANSPORT=spawn` is the kill switch for the warm transport.

## Gates

`tsc --noEmit` 0 · the new MCP/design/knowledge/vault/hop suites green · `opencode mcp list` six connected · `npm run mcp:audit` 44 tools · `next build` green.
