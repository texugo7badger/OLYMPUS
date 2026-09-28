/**
 * ════════════════════════════════════════════════════════════════════════════
 *  OLYMPUS — Symphony · CORE PROTOCOL
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  "The tongue of the Gods is not language — it is resonance."
 *
 *  This module is the foundational chord of the Symphony. Every other module
 *  in src/lib/symphony/ imports from here. It declares:
 *
 *    1. The protocol version (immortalized, semver-strict)
 *    2. The canonical types: VibrationalSignature, HarmonicPattern, etc.
 *    3. The role enum — Composer / Orchestra / Score / Choir
 *    4. The coherence thresholds that govern the fallback-to-text safety net
 *    5. The token-economy benchmarks (cross-validated against the 5 references)
 *
 *  ────────────────────────────────────────────────────────────────────────────
 *  PROTOCOL AXIOMS  (every implementation must satisfy these)
 *  ────────────────────────────────────────────────────────────────────────────
 *  A1.  A VibrationalSignature carries intent + constraints + success criteria
 *       + a Vault anchor. The Vault anchor is the lossless proof of zero
 *       semantic degradation. (Refs: InterLat, ACCP, G²CP)
 *  A2.  A HarmonicPattern is a partial-result tensor + a context anchor back
 *       into the Vault. It is never a final user-facing artifact.
 *  A3.  The Decoding Choir is the ONLY layer permitted to produce natural
 *       language for the user. Internal agents that emit text for the user
 *       are violating the protocol.
 *  A4.  Coherence loss > COHERENCE_FALLBACK_THRESHOLD triggers a transparent
 *       textual fallback. The user MUST be informed of the transition.
 *  A5.  Every signature and every harmonic is persisted to the Vault's
 *       Resonance Registry. Untracked vibrations are forbidden.
 *  ────────────────────────────────────────────────────────────────────────────
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
// ─────────────────────────────────────────────────────────────────────────────
//  PROTOCOL VERSION
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The Symphony protocol version. Bumped on any breaking change to the
 * VibrationalSignature or HarmonicPattern schema.
 *
 * v1.0.0 — initial public release of the Symphony.
 */
export const SYMPHONY_PROTOCOL_VERSION = '1.0.0';
/**
 * The VaultBrain version this Symphony layer interoperates with.
 * OLYMPUS ships VaultBrain v3.0; the Symphony is a v3.0-compatible overlay.
 */
export const VAULT_BRAIN_COMPAT_VERSION = '3.0';
// ─────────────────────────────────────────────────────────────────────────────
//  COHERENCE THRESHOLDS — The Safety Net
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Coherence is the cosine similarity between the Consensus's fused latent
 * representation and the original Signature's intent vector.
 *
 *  ≥ 0.90 : Choir decodes in full Symphony mode
 *  0.70 - 0.90 : Choir decodes with augmented vault context (still Symphony)
 *  < 0.70 : MANDATORY fallback to textual conversational mode (A4)
 */
export const COHERENCE_FALLBACK_THRESHOLD = 0.70;
export const COHERENCE_AUGMENT_THRESHOLD = 0.90;
export const COHERENCE_PERFECT = 1.0;
// ─────────────────────────────────────────────────────────────────────────────
//  REFERENCE GAINS — Empirical Constants from the 5 Mandatory References
// ─────────────────────────────────────────────────────────────────────────────
/**
 * These constants are the empirical anchors cited in the Verification
 * Rationale. They are intentionally hardcoded so any future refactor
 * can re-validate against the original references.
 */
export const REFERENCE_GAINS = Object.freeze({
    /** Slipstream v3 / ACCP semantic quantization */
    ACCP_TOKEN_REDUCTION: 0.82,
    /** RecursiveMAS / G²CP parallel orchestration */
    G2CP_TOKEN_REDUCTION: 0.73,
    /** RecursiveMAS / G²CP accuracy improvement */
    G2CP_ACCURACY_GAIN: 0.34,
    /** InterLat latent-exchange matches or exceeds CoT */
    INTERLAT_QUALITY_PARITY: true,
    /** KV-Cache Sharing — context reuse, no re-encoding */
    KVCACHE_REUSE_BAND: { low: 0.40, high: 0.60 },
    /** Cost of Coordination — wasted textual overhead */
    COORDINATION_OVERHEAD_BAND: { low: 0.40, high: 0.60 },
});
// ─────────────────────────────────────────────────────────────────────────────
//  TOKEN ECONOMY TARGETS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The Symphony targets 70-90% net token reduction. The band is declared
 * here as a single source of truth.
 */
export const SYMPHONY_TARGET_BAND = Object.freeze({
    low: 0.70,
    high: 0.90,
});
// ─────────────────────────────────────────────────────────────────────────────
//  BRAND — The Symphony's Glyph
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The Symphony's canonical glyph, used in UI components and log lines.
 * A musical rest merging into a wave — silence that contains everything.
 */
export const SYMPHONY_GLYPH = '🎼';
/**
 * A short poetic tagline, used in the Symphony View Mode header.
 */
export const SYMPHONY_TAGLINE = 'Harmony through fluidity — nothing is lost, everything connects.';
//# sourceMappingURL=protocol.js.map