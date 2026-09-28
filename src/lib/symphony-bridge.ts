/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SYMPHONY BRIDGE — OLYMPUS / Symphony Interop Layer (always-on)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Bridge is the symmetric adapter between OLYMPUS's textual
 *  infrastructure (caveman, handoff-prompt-builder, olympus-dispatch tool,
 *  VaultBrain v3.0) and the Symphony vibrational protocol.
 *
 *  Symphony is ALWAYS-ON in v0.0.1. It is the standard language between
 *  Gods and Demigods — every dispatch is a VibrationalSignature. The bridge
 *  preserves every existing behavior while making Symphony the transport:
 *
 *    - The caveman skill continues to compress agent output. Symphony
 *      signatures use caveman-grade summaries for the `summary` field of
 *      ArtifactPointers — caveman is the OUTPUT compression, Symphony is
 *      the TRANSPORT compression.
 *
 *    - The olympus-dispatch tool is Symphony-native: it composes a
 *      VibrationalSignature and broadcasts it. The conductor uses dispatchFn
 *      as the injection point — in production, dispatchFn is a wrapper that
 *      calls olympus-dispatch under the hood.
 *
 *    - The VaultBrain v3.0 instinct lifecycle is preserved. Symphony's
 *      tuner is an ANALOG of the instinct lifecycle, operating at the
 *      vibrational level. The two layers coexist: Symphony tracks
 *      signatures and harmonics, the VaultBrain tracks instincts and
 *      dispatch outcomes. They share the same vault root.
 *
 *  The bridge exposes:
 *
 *    - legacyPayloadToSignature : wrap a textual handoff into a signature
 *    - signatureToLegacyPrompt  : unwrap a signature back into a textual
 *                                 prompt (for demigods that haven't yet
 *                                 been Symphony-enabled)
 *    - dispatchFnForOpenCode    : the production dispatchFn that calls
 *                                 olympus-dispatch under the hood
 *    - handoffToSymphony        : a drop-in replacement for the existing
 *                                 handoff-prompt-builder.ts that returns
 *                                 a signature (plus a Choir-ready
 *                                 fallback prompt for legacy demigods)
 *    - runSymphonyCycle         : the single entry point — compose,
 *                                 conduct, decode. Used by the API routes.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
  *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
*/

import type {
  VibrationalSignature,
  HarmonicPattern,
  HarmonicOutcome,
  ArtifactPointer,
} from './symphony/core/protocol.js';
import { composeSignature } from './symphony/encoding/signature.js';
import {
  harmonicFromResult,
  harmonicFromError,
} from './symphony/encoding/harmonic.js';
import { conduct } from './symphony/core/conductor.js';
import { decode } from './symphony/core/choir.js';
import { retrieveResonance } from './symphony/vault/resonance-registry.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEGACY → SYMPHONY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a legacy textual handoff payload into a VibrationalSignature.
 *
 *  This is the entry point for Symphony-enabling a God that currently
 *  emits markdown handoff prompts. The God continues to compose its
 *  payload as text; the bridge wraps the payload into a signature.
 *  The payload itself is preserved in the Vault's Resonance Registry —
 *  zero-loss.
 *
 *  composer        : the God's ID
 *  payload         : the markdown handoff prompt (preserved in full)
 *  targetOrchestra : the demigod IDs the God would have dispatched to
 */
export function legacyPayloadToSignature(input: {
  composer: string;
  payload: string;
  targetOrchestra: string[];
  parentSignature?: string;
}): VibrationalSignature {
  return composeSignature({
    composer: input.composer,
    payload: input.payload,
    targetOrchestra: input.targetOrchestra,
    parentSignature: input.parentSignature,
    broadcastMode: 'parallel',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  SYMPHONY → LEGACY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a VibrationalSignature back into a textual prompt — for
 * demigods that have NOT yet been Symphony-enabled (i.e., demigods that
 * still expect a textual handoff rather than a vibrational broadcast).
 *
 *  The reconstructed prompt is NOT a verbatim copy of the original
 *  payload. It is a SUMMARY that includes:
 *    - The intent type and semantic tokens
 *    - The constraints
 *    - The success predicates
 *    - A pointer to the Vault registry entry (for full context)
 *
 *  This means a Symphony-native God can dispatch to a legacy demigod
 *  WITHOUT re-encoding the full payload — the demigod receives a
 *  compact summary plus a Vault pointer.
 */
export function signatureToLegacyPrompt(sig: VibrationalSignature): string {
  const tokens = sig.intentVector.semanticTokens.join(', ');
  const stacks = sig.constraintMatrix.stack?.join(', ') ?? '(auto-detect)';
  const scopes = sig.constraintMatrix.scope?.join(', ') ?? '(whole project)';
  const forbiddenPaths =
    sig.constraintMatrix.forbiddenPaths?.join(', ') ?? '(none)';
  const forbiddenActions =
    sig.constraintMatrix.forbiddenActions?.join(', ') ?? '(none)';
  const mustSatisfy =
    sig.constraintMatrix.mustSatisfy?.join('; ') ?? '(none)';
  const budgetTokens = sig.constraintMatrix.budgetTokens ?? '(default)';
  const budgetMs = sig.constraintMatrix.budgetMs ?? '(default)';

  const predicates = sig.successCriteria
    .map((p) => `  - ${p.kind}: ${p.target}${p.expected ? ` (expected: ${p.expected})` : ''}`)
    .join('\n');

  const dims = sig.intentVector.dimensions;
  const dimStr = `priority=${dims.priority.toFixed(2)}, risk=${dims.risk.toFixed(2)}, complexity=${dims.complexity.toFixed(2)}, novelty=${dims.novelty.toFixed(2)}`;

  return `# Symphony Signature → Legacy Bridge

You are receiving a vibrational signature from **${sig.composer}**.
This is a compact representation of the original intent. The full
uncompressed context is preserved in the Vault at registry entry
\`${sig.vaultAnchor.anchorId}\` (checksum: \`${sig.vaultAnchor.checksum.slice(0, 12)}…\`).

## Intent
- **Type:** ${sig.intentVector.intentType}
- **Semantic tokens:** ${tokens}
- **Dimensions:** ${dimStr}
- **Intent hash:** \`${sig.intentVector.intentHash}\`

## Constraints
- **Stack:** ${stacks}
- **Scope:** ${scopes}
- **Forbidden paths:** ${forbiddenPaths}
- **Forbidden actions:** ${forbiddenActions}
- **Must satisfy:** ${mustSatisfy}
- **Token budget:** ${budgetTokens}
- **Time budget (ms):** ${budgetMs}

## Success Predicates
${predicates || '  (none declared — use your best judgment)'}

## Vault Anchor
- **Type:** ${sig.vaultAnchor.anchorType}
- **ID:** \`${sig.vaultAnchor.anchorId}\`
- **Checksum:** \`${sig.vaultAnchor.checksum}\`

If you need the full original context, query the Vault's Resonance
Registry with the anchor ID above.

## Mode
- **Broadcast:** ${sig.broadcastMode} (targets: ${sig.targetOrchestra.join(', ')})
- **Emitted at:** ${sig.emittedAt}
- **TTL (ms):** ${sig.ttl ?? 300000}
- **Coherence baseline:** ${sig.coherenceBaseline.toFixed(3)}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PRODUCTION DISPATCHFN — wraps olympus-dispatch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A production-ready dispatchFn that bridges to OLYMPUS's existing
 * olympus-dispatch tool. In a live OLYMPUS deployment, this is the
 * callback passed to `conduct()`.
 *
 *  For each target demigod, this function:
 *    1. Calls signatureToLegacyPrompt() to produce a compact prompt.
 *    2. Invokes the demigod via OpenCode's subtask mechanism (in
 *       production this would call the olympus-dispatch tool; in
 *       the Symphony test harness it can be a stub).
 *    3. Wraps the demigod's textual output into a HarmonicPattern.
 *
 *  The wrapped harmonic carries:
 *    - The demigod's textual output as an inline artifact (summary form)
 *    - A "pass" outcome if the demigod didn't error
 *    - The demigod's reported token consumption (if available)
 */
export function dispatchFnForOpenCode(
  invokeDemigod: (demigod: string, prompt: string) => Promise<{
    output: string;
    tokensConsumed?: number;
    durationMs?: number;
    artifacts?: Array<{ location: string; summary: string }>;
    error?: { code: string; message: string; recoverable: boolean };
  }>,
): (demigod: string, sig: VibrationalSignature) => Promise<HarmonicPattern> {
  return async (demigod, sig) => {
    const prompt = signatureToLegacyPrompt(sig);
    const start = Date.now();
    try {
      const result = await invokeDemigod(demigod, prompt);
      const durationMs = result.durationMs ?? Date.now() - start;

      if (result.error) {
        return harmonicFromError({
          signatureId: sig.id,
          demigod,
          error: result.error,
          tokensConsumed: result.tokensConsumed ?? 0,
          durationMs,
        });
      }

      const outcomes: HarmonicOutcome[] = sig.successCriteria.map((p) => ({
        predicateKind: p.kind,
        target: p.target,
        status: 'pass' as const,
        evidence: result.output.slice(0, 80),
      }));

      const artifacts: ArtifactPointer[] = [
        {
          kind: 'note',
          location: `inline://${demigod}/${sig.id}`,
          summary: cavemanize(result.output),
          bytes: result.output.length,
        },
        ...(result.artifacts ?? []).map((a) => ({
          kind: 'note' as const,
          location: a.location,
          summary: a.summary,
        })),
      ];

      return harmonicFromResult({
        signatureId: sig.id,
        demigod,
        outcomes,
        artifacts,
        contextRead: prompt,
        tokensConsumed: result.tokensConsumed ?? Math.ceil(result.output.length / 4),
        durationMs,
        confidence: 0.85, // default — the tuner will adjust this
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return harmonicFromError({
        signatureId: sig.id,
        demigod,
        error: {
          code: 'E_DISPATCH',
          message,
          recoverable: !message.toLowerCase().includes('not found'),
        },
        tokensConsumed: 0,
        durationMs: Date.now() - start,
      });
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  FULL CYCLE — emit, conduct, decode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a complete Symphony cycle: compose → conduct → decode.
 *
 *  This is the single entry point — used by the API routes and by the
 *  olympus-dispatch tool. A God calls this with its payload and target
 *  orchestra, and receives a polished user-facing response (plus the
 *  underlying Consensus for audit / brain-atlas overlay).
 */
export async function runSymphonyCycle(input: {
  composer: string;
  payload: string;
  targetOrchestra: string[];
  invokeDemigod: (demigod: string, prompt: string) => Promise<{
    output: string;
    tokensConsumed?: number;
    durationMs?: number;
    artifacts?: Array<{ location: string; summary: string }>;
    error?: { code: string; message: string; recoverable: boolean };
  }>;
}): Promise<{
  signature: VibrationalSignature;
  consensus: ReturnType<typeof conduct> extends Promise<infer R> ? R : never;
  choirOutput: ReturnType<typeof decode>;
}> {
  // 1. Compose the signature
  const signature = legacyPayloadToSignature({
    composer: input.composer,
    payload: input.payload,
    targetOrchestra: input.targetOrchestra,
  });

  // 2. Conduct the broadcast
  const dispatchFn = dispatchFnForOpenCode(input.invokeDemigod);
  const conductResult = await conduct(signature, dispatchFn);

  // 3. Decode for the user
  const choirOutput = decode(signature, conductResult.consensus);

  return {
    signature,
    consensus: conductResult,
    choirOutput,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  CAVEMAN COMPATIBILITY — reuse the existing compression skill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A minimal caveman-grade compression — drops articles, filler, and
 * hedging. This mirrors the OLYMPUS caveman skill at the function level,
 * so the Symphony can produce caveman-grade summaries for ArtifactPointer
 *  summaries without invoking the full skill.
 *
 *  In production, this would defer to the caveman skill itself. The
 *  Symphony is non-destructive: caveman continues to be the OUTPUT
 *  compression, Symphony is the TRANSPORT compression.
 */
function cavemanize(text: string): string {
  const filler = /\b(just|really|basically|actually|simply|sure|certainly|of course|happy to|i think|i believe|perhaps|maybe|kind of|sort of)\b/gi;
  const articles = /\b(a|an|the)\b/gi;
  const hedging = /\b(might|may|could|would|should|perhaps|possibly)\b/gi;
  let out = text.replace(filler, '');
  out = out.replace(articles, '');
  out = out.replace(hedging, '');
  // Collapse double spaces and trim
  out = out.replace(/\s+/g, ' ').trim();
  // Truncate to 200 chars
  if (out.length > 200) {
    out = out.slice(0, 197) + '...';
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//  RECONSTRUCTION — for audit / debugging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconstruct the original payload from a signature's Vault anchor.
 *  This is the lossless proof path — used by the Choir in fallback mode
 *  and by the brain-atlas overlay for audit.
 */
export function reconstructPayload(sig: VibrationalSignature): string | null {
  const entry = retrieveResonance(sig.vaultAnchor.anchorId);
  return entry?.payload ?? null;
}
