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
import type { Consensus, VibrationalSignature } from './protocol.js';
export interface ChoirOutput {
    /** The synthesized user-facing text. */
    text: string;
    /** The mode the Choir operated in. */
    mode: 'symphony' | 'augmented' | 'fallback';
    /** The coherence reading at synthesis time. */
    coherence: number;
    /** True if the Choir had to fall back to textual mode. */
    fellBack: boolean;
    /** Tokens spent on the synthesis itself (small fixed budget). */
    tokensSpent: number;
}
/**
 * The Choir's only public method. Decode a Consensus into a user-facing
 * string. The caller (typically an API route or the Symphony View Mode overlay)
 * is responsible for delivering the text to the user.
 */
export declare function decode(signature: VibrationalSignature, consensus: Consensus): ChoirOutput;
export interface ChoirHealth {
    mode: 'symphony' | 'augmented' | 'fallback' | 'inactive';
    lastCoherence: number;
    fallbackCount: number;
    augmentCount: number;
    symphonyCount: number;
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
export declare function choirHealth(): ChoirHealth;
