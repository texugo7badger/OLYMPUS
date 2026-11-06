/**
 * resume-intent.ts — v0.0.84 edit: resume the walk without an LLM turn.
 *
 * The bug (2026-11-06): "Continue o projeto aime!" was classified as a
 * planning prompt, dispatched to Apollo, and the post-run hook was the only
 * thing that resumed the walk. When the provider returned HTTP 429 and the
 * lane stalled for 180s, the turn never completed — so the walk was never
 * resumed. The user could not resume from the phone or the PC while the lane
 * was down.
 *
 * This parser recognizes ONLY an unambiguous resume command (no extra
 * instructions), so a real task is never hijacked. The action route then
 * starts the detached supervisor directly: zero LLM tokens, no provider
 * dependency.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

const RESUME_RE = /^(?:please\s+|por favor,?\s+)?(?:continue|continuar|resume|retome|retomar)\s+(?:com\s+)?(?:o\s+|a\s+|the\s+)?(?:projeto\s+|project\s+)?([a-z0-9][a-z0-9-]{0,63})$/i;

const STOP_WORDS = new Set(['o', 'a', 'the', 'com', 'projeto', 'project', 'it', 'isso', 'ai']);

/**
 * Returns the project slug for an unambiguous resume command, else null.
 *
 * Accepted: "Continue o projeto aime!", "continuar projeto aime",
 * "Continue com o projeto aime", "resume the project aime", "resume aime".
 * Rejected (a real task): "Continue o projeto aime e rode os testes".
 */
export function parseResumeIntent(text: string): string | null {
  const clean = String(text ?? '')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  const m = clean.match(RESUME_RE);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  if (!slug || STOP_WORDS.has(slug)) return null;
  return slug;
}
