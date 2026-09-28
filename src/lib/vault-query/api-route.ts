/**
 * Olympus Vault Query — API Route Handler
 * ==========================================
 *
 * Portable Next.js API route handler. The Olympus UI re-exports this
 * from `src/app/api/vault/query/route.ts` like:
 *
 *   export { POST } from '@/lib/vault-query/api-route';
 *
 * The handler accepts:
 *   POST /api/vault/query
 *   body: { query: string, params?: Record<string, unknown> }
 *
 * And returns:
 *   200: { ok: true, result: QueryResult }
 *   400: { ok: false, error: string }
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tryRunDql } from './executor';
import type { VaultAPI } from '../vault';

// Lazy singleton — constructed on first request.
let _apiPromise: Promise<{ api: import('../vault').VaultAPI }> | null = null;

async function getApi(): Promise<{ api: import('../vault').VaultAPI }> {
  if (!_apiPromise) {
    _apiPromise = (async () => {
      const { createVaultAPI } = await import('../vault');
      const api = await createVaultAPI();
      return { api };
    })();
  }
  return _apiPromise;
}

export async function POST(request: Request): Promise<Response> {
  let body: { query?: string; params?: Record<string, unknown> };
  try {
    body = (await request.json()) as { query?: string; params?: Record<string, unknown> };
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.query || typeof body.query !== 'string') {
    return Response.json({ ok: false, error: 'Missing "query" field' }, { status: 400 });
  }
  const { api } = await getApi();
  if (!api.index) {
    return Response.json({ ok: false, error: 'Vault index is disabled' }, { status: 500 });
  }
  const result = tryRunDql(api.index, body.query, body.params || {});
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, result: result.result });
}

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    description: 'Olympus Vault DQL Query endpoint. POST { query, params? } to run a query.',
    examples: [
      'TABLE god, count(*) AS events FROM "06_Activity_Feed" GROUP BY god SORT events DESC LIMIT 10',
      'LIST FROM #security',
      'TASK FROM "02_Projects/my-saas" WHERE !completed',
    ],
  });
}
