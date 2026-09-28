/**
 * ════════════════════════════════════════════════════════════════════════════
 *  RESONANCE REGISTRY — The Vault's Master Score
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Resonance Registry is the persistent layer of the Symphony. Every
 *  vibrational signature and every harmonic return is registered here,
 *  paired with its FULL uncompressed source.
 *
 *  This is the architectural guarantee of zero-loss (Axiom A1 + A5):
 *
 *    - A signature is a tiny compressed packet, BUT it carries a Vault
 *      anchor pointing to a registry entry that contains the original
 *      free-text payload in full.
 *    - A harmonic is a structured outcome packet, BUT it carries a context
 *      anchor pointing to a registry entry that lists every file, snippet,
 *      and resource the demigod consulted.
 *
 *  The registry is append-only (JSONL) and lives at:
 *    ~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/registry.jsonl
 *
 *  The tuner (tuner.ts) reads this registry to evolve the system's
 *  vibrational shorthand — signatures whose harmonic outcomes achieved
 *  high success are up-weighted as "harmonic templates."
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export type ResonanceKind = 'signature-source' | 'harmonic-context' | 'consensus-output' | 'fallback-event';
export interface ResonanceRegistryEntry {
    readonly id: string;
    readonly kind: ResonanceKind;
    readonly godId: string;
    readonly payload: string;
    readonly checksum: string;
    readonly intentHash: string;
    readonly semanticTokens: string[];
    readonly stackHints: string[];
    readonly parentSignature?: string;
    readonly registeredAt: string;
    /** Optional: outcome tagging (set after the cycle completes) */
    outcome?: 'success' | 'failure' | 'partial' | 'fallback';
    /** Optional: confidence score (set by the tuner) */
    confidence?: number;
}
/**
 * Register a resonance entry. The payload is preserved in full — this is
 * the lossless proof of zero semantic degradation.
 *
 *  Returns the entry ID, which the caller embeds as a VaultAnchor.anchorId.
 */
export declare function registerResonance(input: {
    kind: ResonanceKind;
    godId: string;
    payload: string;
    checksum: string;
    intentHash: string;
    semanticTokens: string[];
    stackHints: string[];
    parentSignature?: string;
}): ResonanceRegistryEntry;
/**
 * Compact the registry by removing entries older than `maxAgeDays` (default 30).
 * Prevents the JSONL file from growing without bound.
 * Returns the number of entries removed.
 */
export declare function compactRegistry(maxAgeDays?: number): number;
/**
 * Retrieve a registry entry by ID. Returns null if not found.
 *  This is the lossless reconstruction path — any agent can recover the
 *  full uncompressed source by following a Vault anchor.
 *
 *  Uses the in-memory index for O(1) lookups when
 *  the index is available. Falls back to the O(N) line scan if the index
 *  is not built (first call) or if the ID is not in the index (new entry
 *  appended after the index was built — in which case we rebuild the index).
 */
export declare function retrieveResonance(id: string): ResonanceRegistryEntry | null;
/**
 * Verify a Vault anchor — check that the registry entry exists and that
 * its checksum matches. Returns true if the anchor is intact.
 *
 *  This is the tamper-detection path. If an agent ever encounters a
 *  signature whose anchor doesn't verify, it MUST refuse to act on the
 *  signature and report the integrity violation.
 */
export declare function verifyAnchor(anchor: {
    anchorType: 'registry' | 'vault-file' | 'inline';
    anchorId: string;
    inlinePayload?: string;
    checksum: string;
}): boolean;
/**
 * Tag a registry entry with its outcome. Called by the Conductor after
 * a cycle completes. The tuner reads these tags to evolve the system's
 * vibrational shorthand.
 *
 *  This is the Symphony's learning loop:
 *    1. A signature is registered with no outcome.
 *    2. The Conductor runs the cycle.
 *    3. The Conductor tags the signature with its outcome.
 *    4. The tuner promotes successful signatures to harmonic templates.
 */
export declare function tagOutcome(entryId: string, outcome: 'success' | 'failure' | 'partial' | 'fallback', confidence?: number): void;
export interface SymphonyMetrics {
    totalSignatures: number;
    totalHarmonics: number;
    totalConsensus: number;
    totalFallbacks: number;
    averageReduction: number;
    averageCoherence: number;
    updatedAt: string;
}
export declare function readMetrics(): SymphonyMetrics;
export interface RecentEntryFilters {
    kind?: ResonanceKind;
    godId?: string;
    limit?: number;
}
export declare function readRecentEntries(filters?: RecentEntryFilters): ResonanceRegistryEntry[];
export declare const REGISTRY_PATHS: Readonly<{
    root: string;
    registry: string;
    templates: string;
    metrics: string;
    vaultRoot: string;
}>;
