/** auto-generated vault-backend API route wrapper
 *  Source: src/lib/vault-periodic/api-route  (Pattern B: framework-agnostic handler adapter)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { handleVaultPeriodicRoute } from '@/lib/vault-periodic/api-route';
import { getVaultApi } from '@/lib/vault/_api-singleton';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const api = await getVaultApi();
  const result = await handleVaultPeriodicRoute(api, {
    method: 'POST',
    url: req.url,
    body,
  });
  return Response.json(result.body, { status: result.status });
}

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    description: 'Olympus vault-backend endpoint. Send a POST request with a JSON body.',
  });
}
