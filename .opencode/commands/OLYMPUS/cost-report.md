---
description: Show GO plan usage report. Displays estimated token usage per agent, per model, against the GO plan limits ($12/5hr, $30/week, $60/month).
---

# Cost Report — GO Plan Usage

Show estimated token usage against the GO plan limits.

## Output

- Current 5-hour window usage ($12 cap)
- Current weekly usage ($30 cap)
- Current monthly usage ($60 cap)
- Per-agent breakdown (tokens + estimated cost)
- Per-model breakdown
- Recommendations (e.g., "Switch to go-budget strategy if you're hitting the 5hr cap frequently")

## Data Source

The activity feed (`~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl`) for dispatch counts and cost events. The OLYMPUS overlay plugin writes a cost event per tool call to `~/.olympus/metrics/cost.jsonl`, which the Cost dashboard reads. No separate token-monitor plugin needed.

$ARGUMENTS

  --period <5h|weekly|monthly>  Default: 5h
  --format <table|json>         Default: table

## Example

```
> /cost-report --period monthly --format table

Model              Requests     Input Tokens     Output Tokens      Est. Cost
─────────────────────────────────────────────────────────────────────────────
GLM-5.3               1,234         4.2M             120K            $2.10
DeepSeek V4 Pro         567         1.1M              45K            $0.55
DeepSeek V4 Flash     3,456         2.3M             890K            $0.92
Hy3                     234         0.8M              23K            $0.18

Total                  5,491         8.4M            1,078K           $3.75
GO plan usage:  6.3% of $60 monthly cap
```

## See Also

- The Cost dashboard in the OLYMPUS UI (Activity Bar → Cost)
- `/strategy-current` to check which strategy is active
- `node scripts/apply-strategy.js --help` for CLI strategy switching
