---
description: Show seed + empirical instincts for a god or sub-agent
agent: callimachus
---

# /instinct-show <name>

Show all instincts for the given god or sub-agent.

## Args

- name (required): god name (e.g. athena) or sub-agent name (e.g. managed-reviewer)
- --scope <god|sub-agent> (optional): force scope (auto-detected by default)
- --archived (optional): include archived instincts

## Output format

```
Instincts for: athena
Scope: god
Path: ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/athena/

Seed instincts (5):
  1. [react] React components: review prop types, hooks deps, render cycles

Empirical instincts (12):
  1. [react, ≥0.92, n=47] managed-reviewer succeeds 95% on React components
     → promote? confidence 0.95 ≥ 0.85 → already promoted ✓

Summary:
  Total active: 17 (5 seed + 12 empirical)
  Avg confidence: 0.82
  Promotion-eligible: 1
```
