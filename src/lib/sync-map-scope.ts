/**
 * sync-map-scope.ts — v0.0.85: the Sync Map is the APP's ledger, not every
 * OpenCode session in the same checkout.
 *
 * The specimen: the Atlas `chat.message` hook recorded this operator
 * conversation and every `[HOP CONTRACT]` walker prompt into
 * `~/.olympus/sync-map.json`; the panel showed them as Apollo project turns
 * (657 entries, 0 app markers). A prompt belongs to the app only when:
 *   - it is a god dispatch (`origin: 'dispatch'`), or
 *   - its session is one of the app's mapped conversations
 *     (`opencode-sessions.json` values), or
 *   - it carries the app's `[OLYMPUS-SESSION <id>]` marker, or
 *   - a new entry was explicitly stamped `meta.app === true`.
 *
 * Pure + testable; the API and the plugin use the same contract.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export interface SyncEntryLike {
  origin?: string;
  intent?: string;
  meta?: Record<string, unknown> | null;
}

export interface ConversationMapRecord {
  sessionId?: string;
  lastUsedAt?: string;
}

/** Every OpenCode session the app owns (terminal, mobile, studio, handoff). */
export function appSessionSet(map: unknown): Set<string> {
  const ids = new Set<string>();
  if (!map || typeof map !== 'object') return ids;
  for (const value of Object.values(map as Record<string, ConversationMapRecord>)) {
    if (value && typeof value.sessionId === 'string' && value.sessionId) ids.add(value.sessionId);
  }
  return ids;
}

const APP_MARKER_RE = /\[OLYMPUS-SESSION\s+[^\]]+\]/;
const HOP_MARKER_RE = /\[HOP CONTRACT\]/;

/** The app's own prompt marker (the action route prepends it). */
export function isAppPromptMarker(text: string): boolean {
  return APP_MARKER_RE.test(String(text || ''));
}

/** Hop prompts are walker work, never project/operator chat. */
export function isHopPrompt(text: string): boolean {
  return HOP_MARKER_RE.test(String(text || ''));
}

/**
 * Should this sync-map row be visible in the app-scoped view?
 * Dispatches are always app work; project rows need an app session/marker.
 */
export function isAppSyncEntry(entry: SyncEntryLike, appSessions: Set<string> = new Set()): boolean {
  if (String(entry.origin || '') === 'dispatch') return true;
  if (entry.meta?.app === true) return true;
  const sessionId = typeof entry.meta?.sessionID === 'string' ? entry.meta.sessionID : '';
  if (sessionId && appSessions.has(sessionId)) return true;
  return isAppPromptMarker(String(entry.intent || ''));
}

/** Internal app prompts that are machinery, not a human turn. */
export function isInternalAppPrompt(text: string): boolean {
  const prompt = String(text || '').trim();
  if (isHopPrompt(prompt)) return true;
  return /^\[OLYMPUS ACTIVE STRATEGY\b/i.test(prompt)
    || /^PROJECT VERIFICATION VERDICT\b/i.test(prompt)
    || /^\[OLYMPUS-PLANNER\]/i.test(prompt);
}
