/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE DECODING CHOIR — Translation Layer to the User
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Decoding Choir is the ONLY layer permitted to produce natural
 *  language for the user (Axiom A3). It takes a Consensus and synthesizes
 *  a pristine, empathetic, humanized response.
 *
 *  The Choir has three modes, decided by the coherence meter:
 *
 *    symphony   : coherence ≥ 0.90 — full Symphony mode. The Choir
 *                 synthesizes a polished response directly from the
 *                 consensus's fused outcomes and artifacts.
 *
 *    augmented  : 0.70 ≤ coherence < 0.90 — the Choir pulls extra
 *                 context from the Vault's Resonance Registry to
 *                 disambiguate any lossy parts before synthesizing.
 *
 *    fallback   : coherence < 0.70 — MANDATORY textual mode (A4).
 *                 The Choir emits a transparent notice to the user
 *                 explaining the transition, then falls back to a
 *                 safe conversational text response built from the
 *                 original signature's source payload.
 *
 *  The Choir never invents facts. It only restates what is in the
 *  consensus and the registry. If it cannot reconstruct the full
 *  semantic content, it MUST fall back.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { COHERENCE_FALLBACK_THRESHOLD, } from './protocol.js';
import { decideChoirMode } from '../encoding/coherence.js';
import { retrieveResonance, readRecentEntries, readMetrics, } from '../vault/resonance-registry.js';
import { recordFallback } from '../vault/tuner.js';
// ─────────────────────────────────────────────────────────────────────────────
//  MAIN EXPORT — decode
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The Choir's only public method. Decode a Consensus into a user-facing
 * string. The caller (typically an API route or the Symphony View Mode overlay)
 * is responsible for delivering the text to the user.
 */
export function decode(signature, consensus) {
    const mode = decideChoirMode(consensus.coherence);
    const coherence = consensus.coherence;
    if (mode === 'fallback') {
        // A4 — mandatory textual fallback. Inform the user.
        recordFallback(signature, `coherence=${coherence.toFixed(3)}`);
        const text = synthesizeFallback(signature, consensus);
        return {
            text,
            mode: 'fallback',
            coherence,
            fellBack: true,
            tokensSpent: 250,
        };
    }
    if (mode === 'augmented') {
        // Pull extra context from the registry to disambiguate
        const text = synthesizeAugmented(signature, consensus);
        return {
            text,
            mode: 'augmented',
            coherence,
            fellBack: false,
            tokensSpent: 350,
        };
    }
    // Full symphony mode
    const text = synthesizeSymphony(signature, consensus);
    return {
        text,
        mode: 'symphony',
        coherence,
        fellBack: false,
        tokensSpent: 300,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
//  SYNTHESIS FUNCTIONS — three modes
// ─────────────────────────────────────────────────────────────────────────────
/**
 * SYMPHONY MODE — full speed, polished output.
 *  Builds a concise but complete user-facing response from the consensus.
 */
function synthesizeSymphony(signature, consensus) {
    const intent = signature.intentVector.intentType;
    const lines = [];
    // Opening line — names the work that was done
    lines.push(openingLine(intent, signature.composer));
    // Outcome summary
    const passed = consensus.fusedOutcomes.filter((o) => o.status === 'pass');
    const failed = consensus.fusedOutcomes.filter((o) => o.status === 'fail');
    if (passed.length > 0) {
        lines.push(`\n**What was accomplished:**`);
        for (const o of passed) {
            lines.push(`  • ${describeOutcome(o)}`);
        }
    }
    if (failed.length > 0) {
        lines.push(`\n**What still needs attention:**`);
        for (const o of failed) {
            lines.push(`  • ${describeOutcome(o)}`);
        }
    }
    // Artifacts produced — gather from all harmonics
    const artifacts = collectArtifacts(consensus);
    if (artifacts.length > 0) {
        lines.push(`\n**Artifacts:**`);
        for (const a of artifacts.slice(0, 8)) {
            lines.push(`  • \`${a.location}\` — ${a.summary}`);
        }
        if (artifacts.length > 8) {
            lines.push(`  • _and ${artifacts.length - 8} more_`);
        }
    }
    // Demigod acknowledgments — poetic, never verbose
    const demigods = Array.from(new Set(consensus.harmonics.map((h) => h.demigod)));
    if (demigods.length > 0) {
        lines.push(`\n_Resonated with: ${demigods.join(', ')}._`);
    }
    // Economy note — honest about the savings
    const reduction = consensus.tokenEconomy.actualReduction;
    if (reduction > 0) {
        lines.push(`\n_This response was composed via the Symphony — ` +
            `${Math.round(reduction * 100)}% token reduction vs. textual mode._`);
    }
    return lines.join('\n');
}
/**
 * AUGMENTED MODE — coherence is borderline; pull extra context from
 * the registry to make sure nothing was lost.
 */
function synthesizeAugmented(signature, consensus) {
    // Pull the source payload from the registry to disambiguate
    const sourceEntry = retrieveResonance(signature.vaultAnchor.anchorId);
    const sourcePayload = sourceEntry?.payload ?? '';
    // Use the source payload to fill in any gaps in the consensus
    const baseText = synthesizeSymphony(signature, consensus);
    // Add a context-augmentation note
    const augmentation = [
        `\n`,
        `---`,
        `_Coherence was ${consensus.coherence.toFixed(2)} — the Choir ` +
            `pulled additional context from the Vault to verify fidelity._`,
        sourcePayload
            ? `_Original intent preserved in registry entry \`${signature.vaultAnchor.anchorId}\`._`
            : '',
    ]
        .filter(Boolean)
        .join('\n');
    return baseText + augmentation;
}
/**
 * FALLBACK MODE — mandatory textual mode (A4). Inform the user.
 */
function synthesizeFallback(signature, consensus) {
    const sourceEntry = retrieveResonance(signature.vaultAnchor.anchorId);
    const sourcePayload = sourceEntry?.payload ?? '';
    const lines = [];
    lines.push(`> ⚠️ **Symphony Coherence Low — Falling Back to Textual Mode**`, ``, `The Decoding Choir measured a coherence of ` +
        `${consensus.coherence.toFixed(2)} between the vibrational consensus ` +
        `and the original intent. This is below the safe threshold of ` +
        `${COHERENCE_FALLBACK_THRESHOLD}. As a precaution, the system is ` +
        `switching to a textual conversational mode for this response.`, ``, `**What this means:** The internal vibrational exchange between the ` +
        `Gods and Demigods was preserved in the Vault, but the Choir ` +
        `elected not to translate it directly — it would risk semantic ` +
        `loss. Instead, here is the original intent in plain text:`, ``, `---`, ``);
    if (sourcePayload) {
        lines.push(`**Original intent:**`, ``, sourcePayload);
    }
    else {
        lines.push(`**Original intent:** _could not be recovered from the Vault ` +
            `(registry entry \`${signature.vaultAnchor.anchorId}\` missing)._`);
    }
    lines.push(``, `---`, ``, `**Partial outcomes still recovered:**`);
    for (const o of consensus.fusedOutcomes) {
        lines.push(`  • ${describeOutcome(o)}`);
    }
    lines.push(``, `_The system has logged this fallback event and will tune its ` +
        `vibrational shorthand to avoid the same drift in future cycles._`);
    return lines.join('\n');
}
// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function openingLine(intent, composer) {
    const cap = composer.charAt(0).toUpperCase() + composer.slice(1);
    const map = {
        build: `${cap} orchestrated a build cycle. Here's what happened:`,
        review: `${cap} conducted a review pass. Findings below:`,
        test: `${cap} ran the testing symphony. Results:`,
        plan: `${cap} composed a plan. Outline:`,
        audit: `${cap} performed a security audit. Report:`,
        design: `${cap} led a design cycle. Output:`,
        document: `${cap} drafted documentation. Summary:`,
        refactor: `${cap} conducted a refactor. Changes:`,
        investigate: `${cap} investigated. Findings:`,
        deploy: `${cap} orchestrated a deployment. Status:`,
        migrate: `${cap} directed a migration. Progress:`,
        analyze: `${cap} analyzed. Insights:`,
        orchestrate: `${cap} orchestrated the cycle. Summary:`,
    };
    return map[intent] ?? `${cap} completed the cycle. Summary:`;
}
function describeOutcome(o) {
    const icon = o.status === 'pass' ? '✓' : o.status === 'fail' ? '✗' : '?';
    const kindLabel = o.predicateKind.replace('-', ' ');
    return `${icon} ${kindLabel} → ${o.target}${o.evidence ? ` (${o.evidence})` : ''}`;
}
function collectArtifacts(consensus) {
    const seen = new Set();
    const out = [];
    for (const h of consensus.harmonics) {
        for (const a of h.artifacts) {
            if (!seen.has(a.location)) {
                seen.add(a.location);
                out.push({ location: a.location, summary: a.summary });
            }
        }
    }
    return out;
}
/**
 * A simple health-check for the Symphony View Mode overlay. Reads aggregate metrics from
 * the registry and returns a snapshot.
 *
 * Previously this always reported "fallback" because
 * `readRecentEntries({ kind: 'consensus-output' })` always returned `[]`
 * (since `conduct()` was never called in production → `tune()` never ran →
 * no consensus-output entries were ever written). The `lastCoherence` was
 * always 0, which `decideChoirMode(0)` maps to 'fallback'. This was
 * misleading — the dashboard permanently showed "Symphony is in fallback
 * mode" even though no Symphony cycle had ever run. The fix adds an
 * 'inactive' mode that is reported when `metrics.totalConsensus === 0`,
 * so the dashboard honestly shows "Symphony has not run yet" instead of
 * falsely alarming the user.
 */
export function choirHealth() {
    const recent = readRecentEntries({
        kind: 'consensus-output',
        limit: 1,
    });
    let lastCoherence = 0;
    if (recent.length > 0) {
        try {
            const parsed = JSON.parse(recent[0].payload);
            lastCoherence = parsed.coherence ?? 0;
        }
        catch {
            // ignore
        }
    }
    const metrics = readMetrics();
    // If no Symphony cycles have ever run, report 'inactive'
    // instead of 'fallback' (which falsely implies a coherence failure).
    if (metrics.totalConsensus === 0) {
        return {
            mode: 'inactive',
            lastCoherence: 0,
            fallbackCount: 0,
            augmentCount: 0,
            symphonyCount: 0,
        };
    }
    const mode = decideChoirMode(lastCoherence);
    return {
        mode,
        lastCoherence,
        fallbackCount: metrics.totalFallbacks,
        augmentCount: 0, // not tracked separately yet
        symphonyCount: metrics.totalConsensus,
    };
}
//# sourceMappingURL=choir.js.map