---
description: Show real-time per-turn and cumulative session cost breakdown
agent: callimachus
---

# /trace-cost

Show the cost breakdown for the last turn AND the cumulative session cost.

## Output format

```
Last turn (turn N):
  Model: glm-5.2
  Agent: athena
  Input:    3,247 tokens  ($0.0325)
  Cached:   2,891 tokens  ($0.0145)  ← 89% cache hit ✓
  Output:     847 tokens  ($0.0127)
  Total:                  $0.0597

Session cumulative:
  Turns:        23
  Total:                    $1.424
  Avg/turn:                 $0.062

Cost ceiling:
  Session budget: $5.00
  Used:           $1.424  (28%)
```

## Implementation

- Callimachus reads ~/.olympus/metrics/cost.jsonl (written by the OLYMPUS overlay plugin)
- Cache hit rate = cached_tokens / input_tokens
- If cached_tokens is 0 on turn 2+, warn — olympus-go-cache may not be loaded
