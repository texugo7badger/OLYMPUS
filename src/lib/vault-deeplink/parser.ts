/**
 * Olympus Vault Deep Links — URI Parser
 * =======================================
 *
 * Parses an `olympus://vault/<action>?<params>` URI into a typed
 * `DeepLinkAction`. Uses the built-in `URL` + `URLSearchParams` — no
 * external dependency.
 *
 * Strict validation:
 *   - Scheme MUST be `olympus://`
 *   - Host MUST be `vault`
 *   - Pathname MUST be one of: /open, /macro, /query, /tasks, /sync
 *   - Required params per action MUST be present
 *
 * Throws `TypeError` on any malformed URI.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { DeepLinkAction } from './types';
import { ACTION_PATHS } from './types';

const VALID_ACTIONS = new Set<string>(ACTION_PATHS);

/**
 * Parse an `olympus://` URI into a `DeepLinkAction`.
 *
 * @example
 *   parse('olympus://vault/open?path=01_Gods/Apollo/profile.md&line=42')
 *   // → { type: 'open', path: '01_Gods/Apollo/profile.md', line: 42 }
 *
 *   parse('olympus://vault/macro?name=new-plan&vars.projectSlug=my-saas')
 *   // → { type: 'macro', macro: 'new-plan', vars: { projectSlug: 'my-saas' } }
 *
 *   parse('olympus://vault/query?q=TABLE%20god%20FROM%20%2206_Activity_Feed%22')
 *   // → { type: 'query', query: 'TABLE god FROM "06_Activity_Feed"' }
 *
 * @throws {TypeError} if the URI is malformed or missing required params.
 */
export function parse(uri: string): DeepLinkAction {
  if (typeof uri !== 'string') {
    throw new TypeError(`DeepLink parse: expected string, got ${typeof uri}`);
  }
  if (!uri.startsWith('olympus://')) {
    throw new TypeError(`DeepLink parse: scheme must be 'olympus://', got: ${uri.slice(0, 20)}`);
  }

  // URL requires a scheme; olympus:// is not a built-in scheme but URL
  // still parses it if we treat `olympus` as the protocol. The host will
  // be `vault` and the pathname will be `/open` (etc.).
  let url: URL;
  try {
    url = new URL(uri);
  } catch (err) {
    throw new TypeError(`DeepLink parse: malformed URI: ${(err as Error).message}`);
  }

  if (url.protocol !== 'olympus:') {
    throw new TypeError(`DeepLink parse: protocol must be 'olympus:', got: ${url.protocol}`);
  }
  if (url.host !== 'vault') {
    throw new TypeError(`DeepLink parse: host must be 'vault', got: ${url.host}`);
  }

  // url.pathname is `/open` etc. — strip the leading slash.
  const action = url.pathname.replace(/^\/+/, '').toLowerCase();
  if (!VALID_ACTIONS.has(action)) {
    throw new TypeError(
      `DeepLink parse: action must be one of [${[...VALID_ACTIONS].join(', ')}], got: ${action}`,
    );
  }

  const params = url.searchParams;

  switch (action) {
    case 'open': {
      const path = params.get('path');
      if (!path) {
        throw new TypeError("DeepLink parse: 'open' action requires 'path' param");
      }
      const lineStr = params.get('line');
      let line: number | undefined;
      if (lineStr !== null) {
        const n = Number.parseInt(lineStr, 10);
        if (!Number.isFinite(n) || n < 0) {
          throw new TypeError(`DeepLink parse: 'line' must be a non-negative integer, got: ${lineStr}`);
        }
        line = n;
      }
      return line !== undefined ? { type: 'open', path, line } : { type: 'open', path };
    }

    case 'macro': {
      const name = params.get('name');
      if (!name) {
        throw new TypeError("DeepLink parse: 'macro' action requires 'name' param");
      }
      const vars: Record<string, string> = {};
      // All `vars.<k>=<v>` params become `vars: { <k>: <v> }`.
      for (const [k, v] of params.entries()) {
        if (k.startsWith('vars.')) {
          vars[k.slice(5)] = v;
        }
      }
      return { type: 'macro', macro: name, vars };
    }

    case 'query': {
      const q = params.get('q');
      if (q === null) {
        throw new TypeError("DeepLink parse: 'query' action requires 'q' param");
      }
      return { type: 'query', query: q };
    }

    case 'tasks': {
      const filterStr = params.get('filter');
      if (filterStr === null) {
        return { type: 'tasks' };
      }
      try {
        const filter = JSON.parse(filterStr);
        if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
          throw new TypeError("'filter' must be a JSON object");
        }
        return { type: 'tasks', filter: filter as Record<string, unknown> };
      } catch (err) {
        throw new TypeError(
          `DeepLink parse: 'filter' must be valid JSON object: ${(err as Error).message}`,
        );
      }
    }

    case 'sync': {
      const op = params.get('op');
      if (op !== 'commit' && op !== 'push' && op !== 'status') {
        throw new TypeError(
          `DeepLink parse: 'sync' action requires 'op' in [commit, push, status], got: ${op}`,
        );
      }
      return { type: 'sync', op };
    }

    default: {
      // Unreachable — VALID_ACTIONS already filtered.
      throw new TypeError(`DeepLink parse: unknown action: ${action}`);
    }
  }
}
