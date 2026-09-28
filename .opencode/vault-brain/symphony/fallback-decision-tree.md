---
name: symphony-fallback-decision-tree
type: reference-card
protocol: symphony/1.0
---

# Symphony Fallback Decision Tree

> The Decoding Choir's decision procedure. Given a Consensus's
> coherence reading, decide which mode to operate in.

```
                   ┌─────────────────────────┐
                   │  Consensus collected    │
                   │  from parallel          │
                   │  demigods               │
                   └────────────┬────────────┘
                                │
                                ▼
                   ┌─────────────────────────┐
                   │  measureConsensusCoherence │
                   │  (encoding/coherence.ts)│
                   └────────────┬────────────┘
                                │
                                ▼
                   ┌─────────────────────────┐
                   │  coherence ≥ 0.90?      │
                   └─────┬─────────────┬─────┘
                      YES│             │NO
                        ▼             ▼
            ┌──────────────────┐  ┌─────────────────────┐
            │  MODE: symphony  │  │  coherence ≥ 0.70?  │
            │  Direct synthesis│  └─────┬──────────┬─────┘
            │  from consensus  │     YES│          │NO
            └──────────────────┘       ▼          ▼
                              ┌──────────────┐  ┌──────────────────┐
                              │ MODE:        │  │ MODE: fallback   │
                              │ augmented    │  │ WARNING A4     │
                              │              │  │                  │
                              │ Pull extra   │  │ 1. recordFallback│
                              │ context from │  │    (tuner.ts)    │
                              │ the Vault's  │  │ 2. synthesizeFall│
                              │ Resonance    │  │    back()        │
                              │ Registry to  │  │ 3. Emit notice:  │
                              │ disambiguate │  │   "Symphony      │
                              │              │  │    Coherence Low│
                              │ Synthesize   │  │    — Falling     │
                              │ with augment │  │    Back..."     │
                              │ note         │  │ 4. Use original  │
                              └──────────────┘  │    payload as   │
                                                │    the response │
                                                └──────────────────┘
```

## Coherence Measurement

Coherence is the geometric mean of three signals (encoding/coherence.ts):

1. **Symbolic coverage** — what fraction of the payload's salient tokens appear in the IntentVector's semanticTokens?
2. **Constraint preservation** — what fraction of detected constraints appear in the ConstraintMatrix?
3. **Predicate preservation** — what fraction of detected success predicates appear in the SuccessPredicate list?

Geometric mean punishes any single low score more severely than arithmetic mean — appropriate for a safety metric.

## When Fallback Fires

Fallback is a feature, not a bug. It fires when:

- The Composer's payload is too ambiguous for the semantic quantizer to factor confidently
- A demigod returns an error that breaks the consensus
- The Choir's reconstruction of the consensus drifts too far from the original intent

In all cases, the user is informed. The system never silently degrades.

## The Fallback Notice (verbatim)

> WARNING: **Symphony Coherence Low — Falling Back to Textual Mode**
>
> The Decoding Choir measured a coherence of X.XX between the vibrational consensus and the original intent. This is below the safe threshold of 0.70. As a precaution, the system is switching to a textual conversational mode for this response.
>
> **What this means:** The internal vibrational exchange between the Gods and Demigods was preserved in the Vault, but the Choir elected not to translate it directly — it would risk semantic loss. Instead, here is the original intent in plain text:
>
> ---
>
> **Original intent:**
> [source payload from the Vault's Resonance Registry]
>
> ---
>
> **Partial outcomes still recovered:**
> • [list of fused outcomes]
>
> _The system has logged this fallback event and will tune its vibrational shorthand to avoid the same drift in future cycles._

## Post-Fallback Learning

Every fallback event is registered in the Vault with kind `fallback-event`. The tuner reads these events over time and:

- Detects intent hashes that repeatedly produce fallbacks
- Down-weights their harmonic templates (if any)
- Eventually, the system avoids the same compression strategy for similar payloads

This is the Symphony's "self-improving safety net" — each fallback makes the next cycle less likely to need one.
