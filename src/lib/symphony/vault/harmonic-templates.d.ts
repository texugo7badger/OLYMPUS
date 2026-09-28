/**
 * ════════════════════════════════════════════════════════════════════════════
 *  HARMONIC TEMPLATES — The Vault's Learned Shorthand
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  A Harmonic Template is the Symphony's learned shorthand for a recurring
 *  task pattern. When the tuner detects that a signature's intent hash
 *  (its semantic fingerprint) repeatedly produces successful consensus,
 *  the signature is "promoted" into a template.
 *
 *  Future signatures with the same intent hash can short-circuit the
 *  full composition pipeline and reuse the template — emitting a near-zero
 *  token vibrational packet that simply references the template by ID.
 *
 *  This is the architectural realization of the Vault's "continuous
 *  tuning" role described in the vision document:
 *
 *    "The Vault must continuously 'tune' these vibrations based on past
 *     successful user interactions, ensuring that the system learns and
 *     improves its internal shorthand over time."
 *
 *  Templates live at:
 *    ~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/templates.json
 *
 *  The templates file is a single JSON object keyed by intentHash. Each
 *  value is a HarmonicTemplate record.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import type { IntentVector, ConstraintMatrix } from '../core/protocol.js';
export interface HarmonicTemplate {
    /** The intent hash this template was promoted from. */
    readonly intentHash: string;
    /** Canonical semantic tokens (the signature's compressed form). */
    readonly semanticTokens: string[];
    /** The composer that originated the template. */
    readonly composer: string;
    /** Canonical constraints observed across successful instances. */
    readonly canonicalConstraints: ConstraintMatrix;
    /** Default target orchestra for this intent. */
    readonly defaultOrchestra: string[];
    /** Number of successful cycles that contributed to this template. */
    successes: number;
    /** Number of failed cycles (for confidence calculation). */
    failures: number;
    /** Confidence score in [0,1] — successes / (successes + failures). */
    confidence: number;
    /** ISO timestamp of the most recent promotion. */
    updatedAt: string;
    /**
     * Optional: a reference to a registry entry that contains the canonical
     * payload for this template. Future short-circuit dispatches can embed
     * this anchor to avoid recomposing the signature from scratch.
     */
    canonicalAnchorId?: string;
}
/**
 * Look up a template by intent hash. Returns null if no template exists
 * for this intent yet, or if the existing template's confidence is below
 * the short-circuit threshold (0.65 by default — see tuner.ts).
 */
export declare function lookupTemplate(intentHash: string, minConfidence?: number): HarmonicTemplate | null;
/**
 * Promote (or reinforce) a template after a successful cycle.
 *
 *  This is called by the tuner when a signature's consensus achieves
 *  'success'. If a template already exists for this intent hash, its
 *  success count is incremented. Otherwise a new template is created.
 */
export declare function promoteTemplate(input: {
    intent: IntentVector;
    composer: string;
    constraints: ConstraintMatrix;
    targetOrchestra: string[];
    outcome: 'success' | 'failure' | 'partial';
    canonicalAnchorId?: string;
}): HarmonicTemplate;
/**
 * Demote a template (after a failure). If confidence drops below 0.40,
 * the template is removed entirely — the system unlearns the bad shorthand.
 */
export declare function demoteTemplate(intentHash: string, outcome: 'failure' | 'partial'): void;
/**
 * List all templates, sorted by confidence (highest first).
 *  Used by the Symphony View Mode overlay.
 */
export declare function listTemplates(): HarmonicTemplate[];
/**
 * Compute aggregate template statistics.
 */
export declare function templateStats(): {
    total: number;
    highConfidence: number;
    avgConfidence: number;
    totalSuccesses: number;
    totalFailures: number;
};
