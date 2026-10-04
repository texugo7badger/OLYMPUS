/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE TUNER — The Vault's Continuous Learning Loop
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Tuner is the active intelligence of the Master Score. It runs after
 *  every Consensus cycle and performs three things:
 *
 *    1. Outcome attribution — tags the signature-source registry entry
 *       with the cycle's outcome (success / failure / partial / fallback).
 *    2. Template promotion — if the cycle was a success, the signature's
 *       intent hash is promoted (or reinforced) in the harmonic templates
 *       file. Future signatures with the same intent can short-circuit.
 *    3. Template demotion — if the cycle was a failure, the intent hash's
 *       template is demoted. If confidence drops below 0.40, the template
 *       is unlearned entirely.
 *
 *  The tuner is invoked by the Conductor after fuseHarmonics() returns.
 *  It is also invoked by the Decoding Choir when a fallback event is
 *  recorded — so the system learns from its own safety trips.
 *
 *  This is the Symphony's "evolving internal pattern language" — the
 *  architectural realization of the vision's "the Vault evolves its
 *  internal pattern language with each interaction."
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { COHERENCE_FALLBACK_THRESHOLD, } from '../core/protocol.js';
import { tagOutcome, registerResonance } from './resonance-registry.js';
import { promoteTemplate, demoteTemplate } from './harmonic-templates.js';
import { getVaultRoot } from '../../vault-root.js';
/**
 * Run the tuner after a Consensus cycle.
 *
 *  signature : the original signature that was broadcast
 *  consensus : the fused result from the Conductor
 *  userAcknowledgedSuccess : optional — true if the user explicitly
 *                            confirmed the output was good (the strongest
 *                            signal). If undefined, the tuner infers
 *                            success from the consensus outcomes.
 */
export function tune(signature, consensus, userAcknowledgedSuccess) {
    const outcome = inferOutcome(signature, consensus, userAcknowledgedSuccess);
    const intentHash = signature.intentVector.intentHash;
    // 1. Tag the signature's registry entry
    tagOutcome(signature.vaultAnchor.anchorId, outcome, consensus.coherence);
    // 2. Register the consensus output (for audit trail)
    registerResonance({
        kind: 'consensus-output',
        godId: signature.composer,
        payload: JSON.stringify({
            signatureId: signature.id,
            coherence: consensus.coherence,
            outcomes: consensus.fusedOutcomes,
            tokenEconomy: consensus.tokenEconomy,
        }),
        checksum: crypto
            .createHash('sha256')
            .update(signature.id + consensus.fusedAt)
            .digest('hex'),
        intentHash,
        semanticTokens: signature.intentVector.semanticTokens,
        stackHints: signature.constraintMatrix.stack ?? [],
        parentSignature: signature.id,
    });
    // 3. Promote or demote the template
    let templateConfidence;
    let newTemplateCreated = false;
    let templateUnlearned = false;
    if (outcome === 'success' || outcome === 'partial') {
        const before = lookupConfidence(intentHash);
        promoteTemplate({
            intent: signature.intentVector,
            composer: signature.composer,
            constraints: signature.constraintMatrix,
            targetOrchestra: signature.targetOrchestra,
            outcome,
            canonicalAnchorId: signature.vaultAnchor.anchorId,
        });
        const after = lookupConfidence(intentHash);
        templateConfidence = after;
        newTemplateCreated = before === undefined && after !== undefined;
    }
    else if (outcome === 'failure') {
        demoteTemplate(intentHash, 'failure');
        const after = lookupConfidence(intentHash);
        templateConfidence = after;
        templateUnlearned = after === undefined;
    }
    return {
        outcome,
        intentHash,
        templateConfidence,
        newTemplateCreated,
        templateUnlearned,
        tunedAt: new Date().toISOString(),
    };
}
/**
 * Record a fallback event — when the Decoding Choir had to fall back to
 * textual mode. This is a learning signal: the system learns which
 * signatures tend to produce low-coherence consensus, and can avoid
 * the same compression strategy in the future.
 */
export function recordFallback(signature, reason) {
    registerResonance({
        kind: 'fallback-event',
        godId: signature.composer,
        payload: JSON.stringify({
            signatureId: signature.id,
            reason,
            coherenceBaseline: signature.coherenceBaseline,
        }),
        checksum: crypto
            .createHash('sha256')
            .update(signature.id + reason)
            .digest('hex'),
        intentHash: signature.intentVector.intentHash,
        semanticTokens: signature.intentVector.semanticTokens,
        stackHints: signature.constraintMatrix.stack ?? [],
        parentSignature: signature.id,
    });
}
// ─────────────────────────────────────────────────────────────────────────────
//  OUTCOME INFERENCE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Infer the cycle outcome from the consensus.
 *
 *  Rules:
 *    - If the user explicitly acknowledged success → 'success'
 *    - If consensus.coherence < COHERENCE_FALLBACK_THRESHOLD → 'fallback'
 *    - If all success predicates are satisfied → 'success'
 *    - If some predicates are satisfied → 'partial'
 *    - If no predicates are satisfied or any failed → 'failure'
 */
function inferOutcome(signature, consensus, userAck) {
    if (userAck === true)
        return 'success';
    if (consensus.coherence < COHERENCE_FALLBACK_THRESHOLD) {
        return 'fallback';
    }
    const predicates = signature.successCriteria;
    if (predicates.length === 0) {
        // No predicates → infer from coherence alone
        return consensus.coherence >= 0.85 ? 'success' : 'partial';
    }
    const outcomeMap = new Map(consensus.fusedOutcomes.map((o) => [`${o.predicateKind}|${o.target}`, o]));
    let passed = 0;
    let failed = 0;
    for (const p of predicates) {
        const o = outcomeMap.get(`${p.kind}|${p.target}`);
        if (o?.status === 'pass')
            passed++;
        else if (o?.status === 'fail')
            failed++;
    }
    if (failed > 0)
        return 'failure';
    if (passed === predicates.length)
        return 'success';
    if (passed > 0)
        return 'partial';
    return 'failure';
}
// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function lookupConfidence(intentHash) {
    // Re-implemented inline to avoid circular import with harmonic-templates.ts
    // (which exports both lookup and promote — promote is what we use above).
    try {
        const vaultRoot = getVaultRoot();
        const templatesPath = path.join(vaultRoot, '05_Auto_Learning', 'vibrations', 'templates.json');
        const raw = fs.readFileSync(templatesPath, 'utf-8');
        const templates = JSON.parse(raw);
        return templates[intentHash]?.confidence;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=tuner.js.map