# CREDITS

> OLYMPUS v0.0.2 — built on the shoulders of giants. This file lists the upstream projects that make OLYMPUS possible.

OLYMPUS is built on the shoulders of giants. This file lists the upstream projects that make OLYMPUS possible.

## License Summary

| Component | License | Source |
|-----------|---------|--------|
| OLYMPUS-original code | AGPL-3.0-or-later | This repository |
| ECC plugin (hooks system) | MIT | [ECC](https://github.com/ecc) |
| agency-agents (demigod design patterns) | MIT | [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) |
| Superpowers skill | MIT | [superpowers](https://github.com/obra/superpowers) |
| Caveman skill | MIT | [caveman](https://github.com/obra/caveman) |
| Impeccable skill | MIT | [impeccable](https://github.com/obra/impeccable) |
| OpenDesign references | MIT | [OpenDesign](https://github.com/opendesign) |
| OpenDesign MCP (opendesign-mcp) | MIT | [nexu-io/open-design](https://github.com/nexu-io/open-design) |
| olympus-go-cache (recipe port) | MIT | [opencode-go-cache](https://github.com/sst/opencode) |
| opencode-context-cache.mjs | MIT | [JackDrogon/opencode-context-cache](https://github.com/JackDrogon/opencode-context-cache) |
| brain-atlas (renderer) | MIT | [brain-atlas](https://github.com/obra/brain-atlas) |
| mcp-compressor | Apache-2.0 | [mcp-compressor](https://github.com/atlassian/mcp-compressor) |
| tamp | MIT | [tamp](https://github.com/obra/tamp) |
| sqlite-vec | MIT | [sqlite-vec](https://github.com/asg017/sqlite-vec) |
| better-sqlite3 | MIT | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |

All OLYMPUS-original code is licensed under AGPL-3.0-or-later. Vendored upstream code retains its own license.

---

## Key upstream projects

### OpenCode
The agent runtime that powers OLYMPUS. OpenCode provides the plugin system, tool definitions, hook events, and the `opencode run` CLI that spawns agents.
- [opencode.ai](https://opencode.ai)

### ECC (Enhanced Claude Code)
The hooks system (tool.execute.before/after, session.idle, permission.ask) is based on ECC's plugin architecture. The `.opencode/plugins/ecc-hooks.ts` file translates Claude Code hooks to OpenCode's plugin system.
- MIT licensed

### agency-agents (msitarzewski/agency-agents)
The 118-demigod fleet's design patterns — phase-gated pipelines, per-demigod specialty with no overlap, god-review protocol, clv2 instinct-querying integration — are adapted from The Agency's 230+ specialized AI agents. Each OLYMPUS god now has 4-5 deeply specialized demigods (identity, mission, critical rules, deliverables, workflow) modeled on this roster.
- MIT licensed — [github.com/msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)

### Superpowers / Caveman / Impeccable
The three core skills that form OLYMPUS's compression + quality layer:
- **Superpowers** — dispatching parallel agents, writing plans, verification-before-completion
- **Caveman** — output compression (natural language → terse caveman, 65% reduction)
- **Impeccable** — code quality enforcement

### brain-atlas
The 3D brain visualization renderer (WebGL2 + Canvas2D fallback). Provides the point-cloud brain surface, node positioning, lobe regions, and edge rendering.
- MIT licensed

### mcp-compressor
Atlassian's MCP schema compressor. Wraps the 3 heaviest MCP servers (github, context7, serena) and compresses their tool descriptions/schemas by 70–97%.
- Apache-2.0

### sqlite-vec
SQLite extension for vector search. Powers the skill index (TF-IDF cosine search across 330 skills).
- MIT licensed

---

## Vendored skills (330)

The `.opencode/skills/` directory contains 330 vendored skills from multiple sources:
- Superpowers repo (14 sub-skills)
- ECC repo
- OpenDesign references
- OLYMPUS gap-fillers (caveman, impeccable, continuous-learning-v2, etc.)
- Additional specialist skills

Each skill retains its upstream license. See individual `SKILL.md` files for attribution.
