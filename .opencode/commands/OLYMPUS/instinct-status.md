---
description: Show instinct stats for a god (or all gods). v3.0: displays confidence, scope, samples, successes, failures, last_used for each instinct.
---

# Instinct Status (v3.0 VaultBrain)

Show the instinct pool for a god (or all gods).

## Usage

```
/instinct-status [god]    # e.g., /instinct-status hephaestus
/instinct-status all      # show all gods
```

## Output

For each god, display:
- Seed instincts (immutable, always visible)
- Empirical instincts (sorted by confidence descending)
  - confidence (with time decay applied — v3.0: outcome-driven, computed by RECALIBRATE)
  - scope (global/stack/project)
  - stacks, projects
  - last_used, samples
  - v3.0: successes, failures (the actual outcome counts that drive confidence)
  - trigger, action, demigod
- v3.0: cross-god dispatch chain patterns from `05_Auto_Learning/patterns/` (if any)

## Implementation

This command reads from `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/{seed,empirical}/*.md` and parses the frontmatter. v3.0: also reads `~/OLYMPUS-VAULT/05_Auto_Learning/patterns/*.md` if present. It does NOT invoke an LLM — pure filesystem read.

$ARGUMENTS
