---
name: symphony-axiom-card
type: reference-card
protocol: symphony/1.0
---

# Symphony Axiom Card — The Five Non-Negotiable Rules

> Print this. Tape it to your monitor. Every implementation must satisfy these.
> Violations are bugs.

## A1 — The Anchor Axiom

> A VibrationalSignature carries intent + constraints + success criteria
> + a Vault anchor. The Vault anchor is the lossless proof of zero
> semantic degradation.

**Enforced in:** `src/lib/symphony/encoding/signature.ts:composeSignature()` — every signature is registered with the Vault's Resonance Registry before being emitted. The registry stores the FULL uncompressed payload. The signature carries only a pointer.

**Test:** `verifyAnchor(signature.vaultAnchor)` must return true for every signature. If it returns false, the signature is corrupt and must be refused.

---

## A2 — The Harmonic Axiom

> A HarmonicPattern is a partial-result tensor + a context anchor back
> into the Vault. It is never a final user-facing artifact.

**Enforced in:** `src/lib/symphony/encoding/harmonic.ts:harmonicFromResult()` — every harmonic registers its read-context in the Vault. The harmonic itself is a structured packet (outcomes + artifacts + confidence), never prose.

**Test:** If a demigod returns prose, the Bridge wraps it into a harmonic via `dispatchFnForOpenCode()`. The prose becomes an `inline://` artifact with a caveman-grade summary; the original is preserved in the Vault.

---

## A3 — The Choir Axiom

> The Decoding Choir is the ONLY layer permitted to produce natural
> language for the user. Internal agents that emit text for the user
> are violating the protocol.

**Enforced in:** `src/lib/symphony/core/choir.ts:decode()` — this is the single function that produces user-facing text. No other Symphony module emits prose for the user.

**Test:** Audit user-facing output. If it didn't pass through `decode()`, the protocol was violated. (Exception: A4 fallback also produces text, but it explicitly announces itself as a fallback.)

---

## A4 — The Fallback Axiom

> Coherence loss > 0.70 triggers a MANDATORY textual fallback. The user
> MUST be informed of the transition.

**Enforced in:** `src/lib/symphony/encoding/coherence.ts:decideChoirMode()` — at coherence < 0.70, returns `'fallback'`. The Choir's `synthesizeFallback()` produces a transparent notice:

> WARNING: Symphony Coherence Low — Falling Back to Textual Mode
> The Decoding Choir measured a coherence of X.XX...
> The system is switching to textual conversational mode for this response.

**Test:** Try sending a deliberately ambiguous payload. If coherence drops below 0.70 and the user receives a transparent fallback notice, A4 is satisfied. If the user receives degraded output without a notice, A4 is violated.

---

## A5 — The Persistence Axiom

> Every signature and every harmonic is persisted to the Vault's
> Resonance Registry. Untracked vibrations are forbidden.

**Enforced in:** `src/lib/symphony/vault/resonance-registry.ts:registerResonance()` — called by `composeSignature()` and `harmonicFromResult()` BEFORE the signature/harmonic is returned to the caller. If the registry write fails, the operation throws (A5 violation).

**Test:** After any Symphony cycle, `readRecentEntries({ limit: 10 })` must show at least one `signature-source` entry and matching `harmonic-context` entries. If any are missing, A5 was violated.

---

## The Verification Rationale (one-liner)

> "Semantic degradation is not merely minimized — it is architecturally
> impossible given the Vault anchor invariant." — ARCHITECTURE.md § "Symphony — Full Specification"

The anchor (A1) + persistence (A5) + Choir-only translation (A3) + mandatory fallback (A4) + structured harmonics (A2) form a closed proof: zero loss is guaranteed by construction, not by hope.
