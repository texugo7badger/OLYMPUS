/** auto-generated vault-backend API route
 *  Source: src/lib/vault  (direct VaultAPI facade method call)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { getVaultApi } from '@/lib/vault/_api-singleton';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const api = await getVaultApi();
  const result = api.health();
  return Response.json({ ok: true, result });

}

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    description: "Vault health: total_notes, broken_links, orphans, etc.",
  });
}
