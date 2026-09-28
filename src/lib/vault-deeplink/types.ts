/**
 * Olympus Vault Deep Links — Type Definitions
 * ==============================================
 *
 * The `olympus://` URI scheme is used by the Olympus UI for cross-app
 * linking: open a note at a specific line, apply a template macro, run a
 * DQL query, open the task board with a filter, or trigger a sync op.
 *
 * The Olympus UI owns the OS-level protocol-handler registration. The
 * backend only parses and formats URIs — no HTTP server is involved.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/**
 * A parsed `olympus://` deep link. Additive over v1 — the original 3
 * variants (`open`, `macro`, `query`) are preserved byte-for-byte so
 * existing callers don't break. v2 adds `tasks` and `sync`.
 */
export type DeepLinkAction =
  | { type: 'open'; path: string; line?: number }
  | { type: 'macro'; macro: string; vars: Record<string, string> }
  | { type: 'query'; query: string }
  | { type: 'tasks'; filter?: Record<string, unknown> }
  | { type: 'sync'; op: 'commit' | 'push' | 'status' };

/** Discriminator union of all action types. */
export type DeepLinkType = DeepLinkAction['type'];

/** The URI scheme prefix every deep link starts with. */
export const SCHEME_PREFIX = 'olympus://vault/';

/** The 5 supported action paths under `olympus://vault/`. */
export const ACTION_PATHS = ['open', 'macro', 'query', 'tasks', 'sync'] as const;
