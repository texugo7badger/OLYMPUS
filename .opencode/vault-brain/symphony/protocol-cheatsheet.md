---
name: symphony-protocol-cheatsheet
type: reference-card
protocol: symphony/1.0
vault_brain_compat: 3.0
last_updated: 2026-07-24
---

# Symphony — Protocol Cheatsheet

> The bundled hot-tier reference card for the Symphony protocol.
> Gods and Demigods consult this card at session start to remember the
> vibrational shorthand. It is read-only — runtime data lives in
> `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/`.

## The Four Strata

| Stratum | Implementation | Role |
|---|---|---|
| Composer | `src/lib/symphony/encoding/signature.ts` | Gods emit VibrationalSignatures |
| Orchestra | `src/lib/symphony/encoding/harmonic.ts` | Demigods return HarmonicPatterns |
| Score | `src/lib/symphony/vault/resonance-registry.ts` | Vault persists + tunes both |
| Choir | `src/lib/symphony/core/choir.ts` | Translates consensus → user text |

## The Five Axioms (non-negotiable)

- **A1.** A Signature carries intent + constraints + success criteria + a Vault anchor. The anchor is the lossless proof.
- **A2.** A Harmonic is a partial-result tensor + a context anchor back into the Vault. Never user-facing.
- **A3.** The Choir is the ONLY layer permitted to produce natural language for the user.
- **A4.** Coherence < 0.70 triggers a MANDATORY textual fallback. The user MUST be informed.
- **A5.** Every signature + harmonic is persisted to the Vault's Resonance Registry.

## Signature Schema (compact)

```
{
  id, composer, protocol, emittedAt,
  intentVector: { intentType, intentHash, dimensions, semanticTokens },
  constraintMatrix: { stack, scope, forbiddenPaths, forbiddenActions, mustSatisfy, budgetTokens, budgetMs },
  successCriteria: [{ kind, target, expected? }],
  vaultAnchor: { anchorType, anchorId, checksum },
  targetOrchestra: [demigodId, ...],
  broadcastMode: "parallel" | "serial",
  coherenceBaseline,
  parentSignature?,
  ttl?
}
```

## Harmonic Schema (compact)

```
{
  id, signatureId, demigod, protocol, emittedAt,
  outcomes: [{ predicateKind, target, status, evidence? }],
  artifacts: [{ kind, location, summary, bytes? }],
  contextAnchor: { anchorType, anchorId, checksum },
  confidence, tokensConsumed, durationMs,
  error?: { code, message, recoverable }
}
```

## Coherence Thresholds

| Coherence | Choir Mode | Behavior |
|---|---|---|
| ≥ 0.90 | symphony | Direct synthesis from consensus |
| 0.70 – 0.90 | augmented | Pulls extra context from the Vault |
| < 0.70 | fallback | MANDATORY textual mode (A4) |

## Token Economy Targets

| Path | Legacy | Symphony | Reduction |
|---|---|---|---|
| God → 3 demigods (parallel) | ~4500 tok | ~600 tok | ~87% |
| Demigod → God (return) | ~2000 tok | ~750 tok | ~62% |
| Inter-demigod context | ~1000 tok | ~50 tok | ~95% |
| Coordination overhead | 40-60% | 0% | ~100% |
| **Net per cycle** | **100%** | **15-28%** | **72-85%** |

## API Routes

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/symphony/resonate` | POST | Compose a signature |
| `/api/symphony/harmonize` | POST | Return a harmonic |
| `/api/symphony/decode` | POST | Invoke the Choir |
| `/api/symphony/score` | GET | Master Score snapshot |
| `/api/symphony/metrics` | GET | Lightweight metrics |

## Overlay Tools

| Tool | Caller | Purpose |
|---|---|---|
| `symphony-resonate` | God | Compose + emit a signature |
| `symphony-harmonize` | Demigod | Return a harmonic (optional — Bridge auto-wraps) |
| `symphony-decode` | Conductor | Fuse + decode for the user |

## Short-Circuit Thresholds

| Layer | Threshold | Effect |
|---|---|---|
| Instinct (legacy) | confidence ≥ 0.85 | Skip deliberation, dispatch directly (~0 deliberation tokens) |
| Harmonic Template (Symphony) | confidence ≥ 0.85 | Skip dispatch entirely, synthesize consensus from template (~0 total tokens) |

## References (the 5 mandatory citations)

1. **InterLat** — latent space communication, quality parity with CoT
2. **Slipstream v3 / ACCP** — 82% token reduction via semantic quantization
3. **RecursiveMAS / G²CP** — 73% reduction + 34% accuracy improvement
4. **KV-Cache Sharing** — 40-60% context reuse via cross-attention
5. **Cost of Coordination** — 40-60% of compute is textual overhead

## File Map (hot-tier reference)

```
src/lib/symphony/
  core/protocol.ts ← Types, axioms, constants
  core/conductor.ts ← Parallel broadcast + short-circuit
  core/choir.ts ← Decoding Choir (3 modes)
  encoding/semantic-quantizer.ts ← ACCP factorer
  encoding/signature.ts ← composeSignature()
  encoding/harmonic.ts ← harmonicFromResult() + fuseHarmonics()
  encoding/coherence.ts ← measureCoherence() + decideChoirMode()
  vault/resonance-registry.ts ← Lossless proof
  vault/harmonic-templates.ts ← Learned shorthand
  vault/tuner.ts ← Continuous learning loop
src/lib/symphony-bridge.ts ← OLYMPUS interop
src/app/api/symphony/ ← 5 API routes
src/components/symphony/ ← View-mode components (filter chip + overlay)
```
