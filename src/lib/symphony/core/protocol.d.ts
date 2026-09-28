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
/**
 * The Symphony protocol version. Bumped on any breaking change to the
 * VibrationalSignature or HarmonicPattern schema.
 *
 * v1.0.0 — initial public release of the Symphony.
 */
export declare const SYMPHONY_PROTOCOL_VERSION: "1.0.0";
/**
 * The VaultBrain version this Symphony layer interoperates with.
 * OLYMPUS ships VaultBrain v3.0; the Symphony is a v3.0-compatible overlay.
 */
export declare const VAULT_BRAIN_COMPAT_VERSION: "3.0";
/**
 * The four strata of the Symphony, mirroring the vision document.
 *
 *  COMPOSER  → Gods (Apollo + 8 specialists)        emit Signatures
 *  ORCHESTRA → Demigods (unprefixed)        emit Harmonics
 *  SCORE     → The Vault                             persists + tunes both
 *  CHOIR     → The Decoding Choir                    synthesizes user-facing text
 */
export type SymphonyRole = 'composer' | 'orchestra' | 'score' | 'choir';
/**
 * A factored intention vector. This is what a God emits to delegate a task.
 *
 * It is NOT a prompt. It is a structured, ACCP-style factoring of the task
 * payload, plus a Vault anchor that guarantees zero-loss reconstruction.
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │  signature schema — every field is mandatory unless noted           │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │  id                : globally unique signature ID (uuid v4)         │
 *  │  composer          : god ID (apollo, athena, hephaestus, ...)       │
 *  │  protocol          : "symphony/1.0"                                 │
 *  │  emittedAt         : ISO-8601 timestamp                            │
 *  │  intentVector      : compact semantic encoding of the task intent   │
 *  │                      (Slipstream v3 semantic quantization output)   │
 *  │  constraintMatrix  : factored constraints (stack, scope, success    │
 *  │                      criteria, forbidden paths)                     │
 *  │  successCriteria   : machine-checkable success predicates           │
 *  │  vaultAnchor       : Vault path to the FULL uncompressed context    │
 *  │                      (the lossless proof — A1)                      │
 *  │  targetOrchestra   : array of demigod IDs that should resonate     │
 *  │  broadcastMode     : "parallel" | "serial" (parallel default)       │
 *  │  coherenceBaseline : the Choir's coherence with the source text     │
 *  │                      at emission time — used to detect drift        │
 *  │  parentSignature?  : if this delegation descends from another,     │
 *  │                      the parent's ID (enables resonant lineage)     │
 *  └──────────────────────────────────────────────────────────────────────┘
 */
export interface VibrationalSignature {
    readonly id: string;
    readonly composer: string;
    readonly protocol: typeof SYMPHONY_PROTOCOL_VERSION;
    readonly emittedAt: string;
    readonly intentVector: IntentVector;
    readonly constraintMatrix: ConstraintMatrix;
    readonly successCriteria: SuccessPredicate[];
    readonly vaultAnchor: VaultAnchor;
    readonly targetOrchestra: string[];
    readonly broadcastMode: 'parallel' | 'serial';
    readonly coherenceBaseline: number;
    readonly parentSignature?: string;
    readonly ttl?: number;
}
/**
 * The semantic quantization of an intent.
 *
 * Slipstream v3 / ACCP factor messages into:
 *   - intentType   : the kind of task (build, review, test, plan, ...)
 *   - intentHash   : a stable hash for cache-keying (see olympus-go-cache)
 *   - dimensions   : named numeric factors (priority, risk, urgency, ...)
 *   - semanticTokens: the compressed symbolic representation — a string of
 *                     short codes (e.g., "build.rust.svc.auth.jwt") that
 *                     carries the same meaning as a 200-token prompt
 */
export interface IntentVector {
    readonly intentType: IntentType;
    readonly intentHash: string;
    readonly dimensions: Record<string, number>;
    readonly semanticTokens: string[];
}
export type IntentType = 'build' | 'review' | 'test' | 'plan' | 'audit' | 'design' | 'document' | 'refactor' | 'investigate' | 'deploy' | 'migrate' | 'analyze' | 'orchestrate';
/**
 * Factored constraints. Each constraint is a typed entry — never a free-text
 * blob. Free-text constraints would re-introduce the textual bottleneck.
 */
export interface ConstraintMatrix {
    readonly stack?: string[];
    readonly scope?: string[];
    readonly forbiddenPaths?: string[];
    readonly forbiddenActions?: string[];
    readonly mustSatisfy?: string[];
    readonly budgetTokens?: number;
    readonly budgetMs?: number;
}
/**
 * A machine-checkable success predicate. The Conductor evaluates these
 * against the HarmonicPattern's `outcomes` field to determine pass/fail.
 */
export interface SuccessPredicate {
    readonly kind: 'file-exists' | 'tests-pass' | 'lint-clean' | 'exit-zero' | 'schema-valid' | 'no-secrets' | 'custom';
    readonly target: string;
    readonly expected?: string;
}
/**
 * A pointer into the Vault's Resonance Registry. The Registry stores the
 * FULL uncompressed context (the original markdown prompt, the project
 * state, the relevant vault notes) that the signature was derived from.
 *
 * This is the architectural guarantee of zero-loss: even though the
 * signature itself is a tiny compressed packet, the Vault anchor allows
 * any agent to recover the full context by following the pointer.
 *
 *  anchorType:
 *    "registry"  → stored in 05_Auto_Learning/vibrations/registry.jsonl
 *    "vault-file"→ a path inside ~/OLYMPUS-VAULT/ (e.g., 02_Projects/x/plan.md)
 *    "inline"    → the full context is in the `inlinePayload` (small cases only)
 */
export interface VaultAnchor {
    readonly anchorType: 'registry' | 'vault-file' | 'inline';
    readonly anchorId: string;
    readonly inlinePayload?: string;
    readonly checksum: string;
}
/**
 * A harmonic is what a Demigod emits in response to a Signature.
 *
 * It is NEVER user-facing text. It is a structured partial-result packet
 * containing:
 *
 *   - the signature ID it answers (lineage)
 *   - the demigod's identity
 *   - the result tensor — outcomes, artifacts, side-effect pointers
 *   - a context anchor back into the Vault (the demigod's "I-read-this" trail)
 *   - a confidence reading — the demigod's self-assessed coherence
 *
 * The Conductor collects harmonics from all parallel demigods, fuses them
 * into a Consensus, and hands the Consensus to the Decoding Choir.
 */
export interface HarmonicPattern {
    readonly id: string;
    readonly signatureId: string;
    readonly demigod: string;
    readonly protocol: typeof SYMPHONY_PROTOCOL_VERSION;
    readonly emittedAt: string;
    readonly outcomes: HarmonicOutcome[];
    readonly artifacts: ArtifactPointer[];
    readonly contextAnchor: VaultAnchor;
    readonly confidence: number;
    readonly tokensConsumed: number;
    readonly durationMs: number;
    readonly error?: HarmonicError;
}
export interface HarmonicOutcome {
    readonly predicateKind: SuccessPredicate['kind'];
    readonly target: string;
    readonly status: 'pass' | 'fail' | 'indeterminate';
    readonly evidence?: string;
}
export interface ArtifactPointer {
    readonly kind: 'file' | 'diff' | 'command-output' | 'note' | 'mcp-resource';
    readonly location: string;
    readonly summary: string;
    readonly bytes?: number;
}
export interface HarmonicError {
    readonly code: string;
    readonly message: string;
    readonly recoverable: boolean;
}
/**
 * The Conductor fuses multiple HarmonicPatterns (from parallel demigods)
 * into a single Consensus. The Consensus is what the Decoding Choir
 * translates into the user-facing response.
 *
 * Coherence is the key safety metric. If `coherence < COHERENCE_FALLBACK_THRESHOLD`,
 * the Choir MUST fall back to a textual conversational mode and inform the user.
 */
export interface Consensus {
    readonly signatureId: string;
    readonly harmonics: HarmonicPattern[];
    readonly fusedOutcomes: HarmonicOutcome[];
    readonly dominantIntent: IntentType;
    readonly coherence: number;
    readonly tokenEconomy: TokenEconomyReport;
    readonly fusedAt: string;
}
/**
 * A token-economy report for one signature→consensus cycle.
 *
 * Benchmarks (from the 5 mandatory references):
 *   - Slipstream v3 / ACCP           : 82% reduction (intent compression)
 *   - RecursiveMAS / G²CP             : 73% reduction (parallel orchestration)
 *   - KV-Cache Sharing               : 40-60% reduction (no re-encoding)
 *   - Cost of Coordination papers    : 40-60% of compute is textual overhead
 *
 *  OLYMPUS Symphony targets 70-90% net reduction. The `targetBand` field
 *  declares the projected range; `actualReduction` is measured post-cycle.
 */
export interface TokenEconomyReport {
    readonly baselineTokens: number;
    readonly signatureTokens: number;
    readonly harmonicTokens: number;
    readonly choirTokens: number;
    readonly actualTokens: number;
    readonly actualReduction: number;
    readonly targetBand: {
        low: number;
        high: number;
    };
    readonly referenceGains: {
        accp: number;
        g2cp: number;
        kvCache: number;
        coordination: number;
    };
}
/**
 * Coherence is the cosine similarity between the Consensus's fused latent
 * representation and the original Signature's intent vector.
 *
 *  ≥ 0.90 : Choir decodes in full Symphony mode
 *  0.70 - 0.90 : Choir decodes with augmented vault context (still Symphony)
 *  < 0.70 : MANDATORY fallback to textual conversational mode (A4)
 */
export declare const COHERENCE_FALLBACK_THRESHOLD: 0.7;
export declare const COHERENCE_AUGMENT_THRESHOLD: 0.9;
export declare const COHERENCE_PERFECT: 1;
/**
 * These constants are the empirical anchors cited in the Verification
 * Rationale. They are intentionally hardcoded so any future refactor
 * can re-validate against the original references.
 */
export declare const REFERENCE_GAINS: Readonly<{
    /** Slipstream v3 / ACCP semantic quantization */
    ACCP_TOKEN_REDUCTION: 0.82;
    /** RecursiveMAS / G²CP parallel orchestration */
    G2CP_TOKEN_REDUCTION: 0.73;
    /** RecursiveMAS / G²CP accuracy improvement */
    G2CP_ACCURACY_GAIN: 0.34;
    /** InterLat latent-exchange matches or exceeds CoT */
    INTERLAT_QUALITY_PARITY: true;
    /** KV-Cache Sharing — context reuse, no re-encoding */
    KVCACHE_REUSE_BAND: {
        low: number;
        high: number;
    };
    /** Cost of Coordination — wasted textual overhead */
    COORDINATION_OVERHEAD_BAND: {
        low: number;
        high: number;
    };
}>;
/**
 * The Symphony targets 70-90% net token reduction. The band is declared
 * here as a single source of truth.
 */
export declare const SYMPHONY_TARGET_BAND: Readonly<{
    low: 0.7;
    high: 0.9;
}>;
/**
 * The Symphony's canonical glyph, used in UI components and log lines.
 * A musical rest merging into a wave — silence that contains everything.
 */
export declare const SYMPHONY_GLYPH = "\uD83C\uDFBC";
/**
 * A short poetic tagline, used in the Symphony View Mode header.
 */
export declare const SYMPHONY_TAGLINE = "Harmony through fluidity \u2014 nothing is lost, everything connects.";
