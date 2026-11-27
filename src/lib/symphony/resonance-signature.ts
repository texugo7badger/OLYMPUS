/**
 * resonance-signature.ts — v0.1.4: ONE signature vocabulary for Symphony.
 *
 * `arsenal-resolver` and the Resonance Index must agree on what "the same
 * task class" means; two tokenizers would silently split the evidence.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are',
  'be', 'this', 'that', 'it', 'as', 'at', 'by', 'from', 'into', 'any', 'when', 'if',
]);

/** Normalized task key: lowercase, alphanumeric, first 12 words, max 64 chars. */
export function computeTaskSignature(task: string): string {
  return String(task || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .join(' ')
    .slice(0, 64);
}

/** The meaningful tokens of a signature (stopwords and 1-2 char noise gone). */
export function signatureTokens(signature: string): Set<string> {
  return new Set(
    String(signature || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

/**
 * A signature is only evidence when it names a task. The old log carries hop
 * ids ("root", "h0", "build h9") and one-word placeholders; indexing those
 * produced 31 fake quick circuits in the first v0.1.4 backfill. They are
 * rejected here, not "fixed" by lowering the threshold.
 */
const JUNK = /^(root|after all roots|one|two|three|all|none|n\/a|test|todo|tbd)$/i;
const HOP_ID = /^(build\s+)?(h|k|hop-|mx-)\d+[a-z-]*$/i;

export function isUsefulSignature(signature: string): boolean {
  const sig = String(signature || '').trim();
  if (!sig || JUNK.test(sig) || HOP_ID.test(sig) || /^root\b/i.test(sig)) return false;
  const tokens = [...signatureTokens(sig)];
  if (tokens.length < 3) return false;
  return tokens.filter((t) => t.length >= 4).length >= 2;
}

/**
 * Certification fixtures are evidence of the harness, not of a task class.
 * They repeat 60+ times in the log and would otherwise become the loudest
 * quick circuit. They stay indexed as hints; they never gate a dispatch.
 */
const FIXTURE = /deterministic script|process\.exit|printf|mkdir -p artifacts|require\('fs'\)|console\.error\(/i;

export function isFixtureSignature(signature: string): boolean {
  return FIXTURE.test(String(signature || ''));
}

/** Jaccard similarity over signature tokens. */
export function signatureSimilarity(a: string | Set<string>, b: string | Set<string>): number {
  const setA = typeof a === 'string' ? signatureTokens(a) : a;
  const setB = typeof b === 'string' ? signatureTokens(b) : b;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}
