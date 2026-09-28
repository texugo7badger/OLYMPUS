---
description: Dispatch the last output to a clean-context verifier sub-agent
agent: apollo
---

# /verify [output-type]

Dispatch the last god's output to a clean-context verifier sub-agent.

## Args

- output-type (optional): code | design | infra | docs
  If omitted, Apollo infers from the last god:
  - Hephaestus/Athena → code
  - Dionysus → design
  - Hermes → infra
  - Callimachus → docs

## Behavior

1. Capture the last god's output
2. Dispatch to verifier (clean context — no shared history)
3. PASS → return output to user with ✓
4. FAIL → route critique back to god for revision (max 2 rounds)

## Silent-on-pass

If all axes >= 4/5, verifier returns ONLY: `PASS — no issues found.`
No praise, no elaboration.

## Examples

```
User: /verify
Apollo: ✓ Verified — no issues found. <shows output>

User: /verify design
Apollo: ✗ FAIL — Contrast scored 2/5. <evidence>
        Dionysus is revising...
        ✓ Revised output verified. <shows revised output>
```
