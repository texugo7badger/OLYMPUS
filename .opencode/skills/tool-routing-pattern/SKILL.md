---
name: tool-routing-pattern
description: Reference implementation of the toolRouting pattern — embed all tools, inject top-K per turn
tags: [routing, embedding, cost]
god_scope: [apollo, callimachus]
---

# Tool Routing Pattern

> Embed all tools, inject only top-K per turn. O(topK) tokens regardless of pool size.

## The Pattern

1. **Embed the Pool** — At boot, embed every tool (skill/sub-agent/MCP) in the pool.
2. **Embed the Query** — At runtime, embed the user's message.
3. **Cosine Search** — Search the pool for top-K most similar tools.
4. **Inject Only Top-K** — Inject only the top-K tool descriptions into the god's dynamic suffix.

## K Selection

Per arXiv 2605.24660, the sweet spot is ~7 tools. Olympus uses:
- Skills: K=5 (top-5 per god)
- Sub-agents: K=3 (top-3 per god)

## Instinct-Gated Dispatch

Before embedding search, query instincts. If confidence >= 0.85, short-circuit (cost: ~0 tokens).

## License

MIT — original OLYMPUS code
