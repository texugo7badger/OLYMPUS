/**
 * Olympus Vault Deep Links — URI Formatter
 * ==========================================
 *
 * Formats a `DeepLinkAction` into an `olympus://vault/<action>?<params>` URI.
 * All parameter values are URL-encoded via `URLSearchParams`.
 *
 * Inverse of `parser.ts` — `format(parse(u)) === u` for any well-formed URI.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { DeepLinkAction } from './types';

/**
 * Format a `DeepLinkAction` into an `olympus://` URI.
 *
 * @example
 *   format({ type: 'open', path: '01_Gods/Apollo/profile.md', line: 42 })
 *   // → 'olympus://vault/open?path=01_Gods%2FApollo%2Fprofile.md&line=42'
 *
 *   format({ type: 'macro', macro: 'new-plan', vars: { projectSlug: 'my-saas' } })
 *   // → 'olympus://vault/macro?name=new-plan&vars.projectSlug=my-saas'
 *
 *   format({ type: 'sync', op: 'commit' })
 *   // → 'olympus://vault/sync?op=commit'
 */
export function format(action: DeepLinkAction): string {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
    throw new TypeError(`DeepLink format: expected action object, got: ${typeof action}`);
  }

  const params = new URLSearchParams();

  switch (action.type) {
    case 'open': {
      if (!action.path) {
        throw new TypeError("DeepLink format: 'open' action requires 'path'");
      }
      params.set('path', action.path);
      if (action.line !== undefined) {
        if (!Number.isFinite(action.line) || action.line < 0) {
          throw new TypeError(`DeepLink format: 'line' must be non-negative integer, got: ${action.line}`);
        }
        params.set('line', String(action.line));
      }
      return `olympus://vault/open?${params.toString()}`;
    }

    case 'macro': {
      if (!action.macro) {
        throw new TypeError("DeepLink format: 'macro' action requires 'macro' name");
      }
      params.set('name', action.macro);
      for (const [k, v] of Object.entries(action.vars || {})) {
        params.set(`vars.${k}`, String(v));
      }
      return `olympus://vault/macro?${params.toString()}`;
    }

    case 'query': {
      if (!action.query) {
        throw new TypeError("DeepLink format: 'query' action requires 'query' string");
      }
      params.set('q', action.query);
      return `olympus://vault/query?${params.toString()}`;
    }

    case 'tasks': {
      if (action.filter !== undefined) {
        params.set('filter', JSON.stringify(action.filter));
      }
      return `olympus://vault/tasks?${params.toString()}`;
    }

    case 'sync': {
      params.set('op', action.op);
      return `olympus://vault/sync?${params.toString()}`;
    }

    default: {
      // Unreachable with the closed union, but guard against runtime spoofing.
      throw new TypeError(`DeepLink format: unknown action type: ${(action as { type: string }).type}`);
    }
  }
}
