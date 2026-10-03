/**
 * Per-session classification context shared between the chat.message marker
 * parser (olympus-hooks.ts) and the dispatch writers (tools/dispatch.ts,
 * lib/dispatch-tracker.ts) — issue #54 join key plumbing.
 *
 * Lives in its own module so tools/dispatch.ts can read the map without
 * importing olympus-hooks.ts (which imports the tools — a cycle).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/** sessionID → classificationId for the most recent marked message. */
export const classificationIdBySession = new Map<string, string>();

/** Bounded: a long-lived warm serve accumulates sessions; cap the map. */
const MAX_ENTRIES = 512;

export function rememberClassificationId(sessionID: string, classificationId: string): void {
  classificationIdBySession.delete(sessionID);
  classificationIdBySession.set(sessionID, classificationId);
  if (classificationIdBySession.size > MAX_ENTRIES) {
    const oldest = classificationIdBySession.keys().next();
    if (!oldest.done) classificationIdBySession.delete(oldest.value);
  }
}

/** Current classificationId for a session, or null when unmarked. */
export function getClassificationId(sessionID: string | undefined | null): string | null {
  if (!sessionID) return null;
  return classificationIdBySession.get(sessionID) ?? null;
}
