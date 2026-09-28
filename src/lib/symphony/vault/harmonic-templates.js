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
import * as fs from 'fs';
import { REGISTRY_PATHS } from './resonance-registry.js';
// ─────────────────────────────────────────────────────────────────────────────
//  I/O
// ─────────────────────────────────────────────────────────────────────────────
function loadTemplates() {
    if (!fs.existsSync(REGISTRY_PATHS.templates)) {
        return {};
    }
    try {
        const raw = fs.readFileSync(REGISTRY_PATHS.templates, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
function saveTemplates(templates) {
    fs.writeFileSync(REGISTRY_PATHS.templates, JSON.stringify(templates, null, 2), 'utf-8');
}
// ─────────────────────────────────────────────────────────────────────────────
//  TEMPLATE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Look up a template by intent hash. Returns null if no template exists
 * for this intent yet, or if the existing template's confidence is below
 * the short-circuit threshold (0.65 by default — see tuner.ts).
 */
export function lookupTemplate(intentHash, minConfidence = 0.65) {
    const templates = loadTemplates();
    const t = templates[intentHash];
    if (!t)
        return null;
    if (t.confidence < minConfidence)
        return null;
    return t;
}
/**
 * Promote (or reinforce) a template after a successful cycle.
 *
 *  This is called by the tuner when a signature's consensus achieves
 *  'success'. If a template already exists for this intent hash, its
 *  success count is incremented. Otherwise a new template is created.
 */
export function promoteTemplate(input) {
    const templates = loadTemplates();
    const existing = templates[input.intent.intentHash];
    const successes = (existing?.successes ?? 0) + (input.outcome === 'success' ? 1 : 0);
    const failures = (existing?.failures ?? 0) + (input.outcome === 'failure' ? 1 : 0);
    const total = successes + failures;
    const confidence = total === 0 ? 0 : successes / total;
    const template = {
        intentHash: input.intent.intentHash,
        semanticTokens: input.intent.semanticTokens,
        composer: input.composer,
        canonicalConstraints: input.constraints,
        defaultOrchestra: input.targetOrchestra,
        successes,
        failures,
        confidence,
        updatedAt: new Date().toISOString(),
        canonicalAnchorId: input.canonicalAnchorId ?? existing?.canonicalAnchorId,
    };
    templates[input.intent.intentHash] = template;
    saveTemplates(templates);
    return template;
}
/**
 * Demote a template (after a failure). If confidence drops below 0.40,
 * the template is removed entirely — the system unlearns the bad shorthand.
 */
export function demoteTemplate(intentHash, outcome) {
    const templates = loadTemplates();
    const t = templates[intentHash];
    if (!t)
        return;
    if (outcome === 'failure')
        t.failures++;
    // Don't increment successes for partial — it's neutral
    const total = t.successes + t.failures;
    t.confidence = total === 0 ? 0 : t.successes / total;
    t.updatedAt = new Date().toISOString();
    if (t.confidence < 0.40) {
        delete templates[intentHash];
    }
    else {
        templates[intentHash] = t;
    }
    saveTemplates(templates);
}
/**
 * List all templates, sorted by confidence (highest first).
 *  Used by the Symphony View Mode overlay.
 */
export function listTemplates() {
    const templates = loadTemplates();
    return Object.values(templates).sort((a, b) => b.confidence - a.confidence);
}
/**
 * Compute aggregate template statistics.
 */
export function templateStats() {
    const templates = loadTemplates();
    const list = Object.values(templates);
    const total = list.length;
    const highConfidence = list.filter((t) => t.confidence >= 0.85).length;
    const avgConfidence = total === 0 ? 0 : list.reduce((s, t) => s + t.confidence, 0) / total;
    const totalSuccesses = list.reduce((s, t) => s + t.successes, 0);
    const totalFailures = list.reduce((s, t) => s + t.failures, 0);
    return { total, highConfidence, avgConfidence, totalSuccesses, totalFailures };
}
//# sourceMappingURL=harmonic-templates.js.map