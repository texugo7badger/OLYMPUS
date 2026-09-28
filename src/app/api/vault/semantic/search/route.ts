/** auto-generated vault-backend API route
 *  Source: src/lib/vault  (direct VaultAPI facade method call)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { getVaultApi } from '@/lib/vault/_api-singleton';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body: { query?: string; limit?: number } = {};
  try { body = await req.json(); } catch { body = {}; }
  if (!body.query || typeof body.query !== 'string') {
    return Response.json({ ok: false, error: 'Missing "query" field' }, { status: 400 });
  }
  const api = await getVaultApi();
  const results = api.semanticSearch(body.query, body.limit ?? 10);
  return Response.json({ ok: true, results, count: results.length });

}

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    description: "Semantic search via TF-IDF + sqlite-vec KNN. POST { query, limit? }",
  });
}
