/**
 * ════════════════════════════════════════════════════════════════════════════
 *  OLYMPUS SYMPHONY — PUBLIC API BARREL
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Single import surface for the Symphony.
 *
 *    import {
 *      composeSignature,
 *      conduct,
 *      decode,
 *      runSymphonyCycle,
 *      ...
 *    } from '@/lib/symphony';
 *
 *  Everything below this line is the stable public API. Internal modules
 *  may refactor freely; this barrel is the contract.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export { SYMPHONY_PROTOCOL_VERSION, VAULT_BRAIN_COMPAT_VERSION, COHERENCE_FALLBACK_THRESHOLD, COHERENCE_AUGMENT_THRESHOLD, REFERENCE_GAINS, SYMPHONY_TARGET_BAND, SYMPHONY_GLYPH, SYMPHONY_TAGLINE, } from './core/protocol.js';
export type { SymphonyRole, VibrationalSignature, IntentVector, IntentType, ConstraintMatrix, SuccessPredicate, VaultAnchor, HarmonicPattern, HarmonicOutcome, ArtifactPointer, HarmonicError, Consensus, TokenEconomyReport, } from './core/protocol.js';
export { composeSignature, serializeSignature, deserializeSignature, estimateSignatureEconomy } from './encoding/signature.js';
export type { SignatureCompositionInput, SignatureEconomyEstimate } from './encoding/signature.js';
export { quantizeIntent, extractConstraints, extractSuccessPredicates, estimateDimensions, symbolicForm, } from './encoding/semantic-quantizer.js';
export { harmonicFromResult, harmonicFromError, fuseHarmonics, unsatisfiedPredicates, } from './encoding/harmonic.js';
export { measureCoherence, measureConsensusCoherence, decideChoirMode, } from './encoding/coherence.js';
export type { ChoirMode } from './encoding/coherence.js';
export { conduct, attemptShortCircuit } from './core/conductor.js';
export type { DispatchOptions, DispatchResult } from './core/conductor.js';
export { decode, choirHealth } from './core/choir.js';
export type { ChoirOutput, ChoirHealth } from './core/choir.js';
export { registerResonance, retrieveResonance, verifyAnchor, tagOutcome, readMetrics, readRecentEntries, compactRegistry, REGISTRY_PATHS, } from './vault/resonance-registry.js';
export type { ResonanceKind, ResonanceRegistryEntry, RecentEntryFilters, SymphonyMetrics, } from './vault/resonance-registry.js';
export { lookupTemplate, promoteTemplate, demoteTemplate, listTemplates, templateStats, } from './vault/harmonic-templates.js';
export type { HarmonicTemplate } from './vault/harmonic-templates.js';
export { tune, recordFallback } from './vault/tuner.js';
export type { TunerReport } from './vault/tuner.js';
export { legacyPayloadToSignature, signatureToLegacyPrompt, dispatchFnForOpenCode, runSymphonyCycle, reconstructPayload, } from '../symphony-bridge.js';
