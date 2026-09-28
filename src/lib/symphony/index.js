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
// Protocol constants & types
export { SYMPHONY_PROTOCOL_VERSION, VAULT_BRAIN_COMPAT_VERSION, COHERENCE_FALLBACK_THRESHOLD, COHERENCE_AUGMENT_THRESHOLD, REFERENCE_GAINS, SYMPHONY_TARGET_BAND, SYMPHONY_GLYPH, SYMPHONY_TAGLINE, } from './core/protocol.js';
// Encoding layer
export { composeSignature, serializeSignature, deserializeSignature, estimateSignatureEconomy } from './encoding/signature.js';
export { quantizeIntent, extractConstraints, extractSuccessPredicates, estimateDimensions, symbolicForm, } from './encoding/semantic-quantizer.js';
export { harmonicFromResult, harmonicFromError, fuseHarmonics, unsatisfiedPredicates, } from './encoding/harmonic.js';
export { measureCoherence, measureConsensusCoherence, decideChoirMode, } from './encoding/coherence.js';
// Orchestration layer
export { conduct, attemptShortCircuit } from './core/conductor.js';
export { decode, choirHealth } from './core/choir.js';
// Vault layer
export { registerResonance, retrieveResonance, verifyAnchor, tagOutcome, readMetrics, readRecentEntries, compactRegistry, REGISTRY_PATHS, } from './vault/resonance-registry.js';
export { lookupTemplate, promoteTemplate, demoteTemplate, listTemplates, templateStats, } from './vault/harmonic-templates.js';
export { tune, recordFallback } from './vault/tuner.js';
// Re-export the Symphony Bridge's full-cycle entry
// point so it's reachable from the public barrel. Previously
// `runSymphonyCycle` was defined in symphony-bridge.ts but NOT re-exported
// from the barrel, making it unreachable from the public API. The
// olympus-dispatch tool and the API routes can now import it directly:
//
//   import { runSymphonyCycle } from '@/lib/symphony';
//
// This chains compose → conduct → decode into a single call, which is the
// "always-on" Symphony lifecycle the docs describe.
export { legacyPayloadToSignature, signatureToLegacyPrompt, dispatchFnForOpenCode, runSymphonyCycle, reconstructPayload, } from '../symphony-bridge.js';
//# sourceMappingURL=index.js.map