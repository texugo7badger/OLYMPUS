---
description: Break down per-turn token usage by source
agent: callimachus
---

# /context-budget

Show the token breakdown for the current turn's context window, by source.

## Output format

```
Context budget (turn 23, model glm-5.2, agent athena):

  Source                          Tokens     %    Target
  System prompt (frozen prefix)    3,247    32%   ~3,000  ✓
  Agent descriptions (top-3)       1,892    19%   ~1,500  ⚠ +400
  Skill descriptions (top-5)      1,247    12%   ~1,200  ✓
  MCP tool schemas (allowlisted)    623     6%   ~1,500  ✓
  Conversation history (last 5)   1,500    15%   ~1,500  ✓
  Total                          10,307   100%
  Target                         ~10,000         ✓
```

## When to use

- After the first turn to baseline the composition
- When /trace-cost shows higher-than-expected cost
- Before/after a Phase change to measure the delta
