/**
 * Olympus Vault Deep Links — Public API (v2.0.0)
 * ================================================
 *
 * Parse and format `olympus://` URIs used by the Olympus UI for cross-app
 * linking. Replaces the v1 stub (which threw `'Tier 2 — not implemented'`).
 *
 * The Olympus UI registers the protocol handler with the OS; the backend
 * just parses and formats URIs. No HTTP server is involved.
 *
 * URI scheme (5 actions, additive over v1's 3):
 *
 *   olympus://vault/open?path=<relPath>&line=<n>
 *       Open a note at line N. `line` is optional.
 *
 *   olympus://vault/macro?name=<macroName>&vars.<k>=<v>&...
 *       Apply a template macro. All `vars.*` params become the `vars` map.
 *
 *   olympus://vault/query?q=<dql-query-urlencoded>
 *       Run a DQL query.
 *
 *   olympus://vault/tasks?filter=<json>
 *       Open the task board with a filter. `filter` is optional.
 *
 *   olympus://vault/sync?op=commit|push|status
 *       Trigger a sync operation.
 *
 * Round-trip guarantee: `format(parse(u)) === u` for any well-formed URI
 * (param order may differ but the parsed action is identical).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type { DeepLinkAction, DeepLinkType } from './types';
export { SCHEME_PREFIX, ACTION_PATHS } from './types';
export { parse } from './parser';
export { format } from './formatter';

import type { DeepLinkAction } from './types';
import { parse } from './parser';

/**
 * Validate whether a string is a well-formed `olympus://` URI prefix.
 * Pure logic — no IO, no throw. Used by the UI to decide whether to
 * intercept a clicked link.
 *
 * This does NOT validate the action or params — only the scheme + host.
 * Use `tryParse()` for full validation that never throws.
 */
export function isDeepLink(s: string): boolean {
  return typeof s === 'string' && s.startsWith('olympus://vault/');
}

/**
 * Safe parse — returns `null` on any malformed URI instead of throwing.
 * Useful when consuming untrusted input (clicked links, pasted text).
 *
 * @example
 *   tryParse('olympus://vault/open?path=x.md')  // → { type: 'open', path: 'x.md' }
 *   tryParse('https://example.com/')             // → null
 *   tryParse('olympus://vault/bogus')            // → null
 */
export function tryParse(uri: string): DeepLinkAction | null {
  try {
    return parse(uri);
  } catch {
    return null;
  }
}

// (parse + format are re-exported above via `export ... from`)

