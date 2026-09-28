---
name: silent-on-pass-verifier
description: Verifier pattern — clean-context evaluation, silent on pass, speaks only on failure
tags: [verification, pattern, clean-context]
god_scope: [persephone]
---

# Silent-on-Pass Verifier Pattern

## The Pattern

1. **Clean Context** — The verifier runs in a separate context. It does NOT see the producing conversation.
2. **Silent on Pass** — If all axes >= 4/5, return ONLY: `PASS — no issues found.`
3. **Speak on Failure** — If ANY axis < 4/5, return a structured critique with evidence.

## Why Silent-on-Pass?

- Token efficiency (5 tokens vs 200 tokens)
- Cognitive efficiency (Apollo doesn't parse praise)
- Bias elimination (no optimizing for praise)
- Signal-to-noise (when the verifier speaks, something is wrong)

## License

MIT — ported from OpenDesign (https://github.com/manalkaff/opendesign)
