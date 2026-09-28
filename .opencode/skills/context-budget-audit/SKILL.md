---
name: context-budget-audit
description: Breaks down per-turn token usage by source — run by Callimachus via /context-budget command
tags: [cost, audit, tokens]
god_scope: [callimachus]
---

# Context Budget Audit

## The Audit

Breaks down the current turn's context window by source:

| Source | Target |
|---|---|
| System prompt (frozen prefix) | ~3,000 |
| Agent descriptions (top-3) | ~1,500 |
| Skill descriptions (top-5) | ~1,200 |
| Command descriptions (top-8) | ~1,000 |
| MCP tool schemas (allowlisted) | ~1,500 |
| Conversation history (last 5) | ~1,500 |
| Conversation summary | ~1,000 |
| Instinct queries (top-3) | ~500 |
| **Total** | **~10,000** |

## License

MIT — ported from ECC (https://github.com/affaan-m/ECC)
