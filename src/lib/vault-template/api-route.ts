/**
 * Olympus Vault Template — API Route Handler
 * =============================================
 *
 * POST /api/vault/template/apply
 * body: { macro: string, vars: Record<string, string> }
 * → { ok: true, result: TemplateApplyResult }
 *
 * GET /api/vault/template/macros
 * → { ok: true, macros: Macro[] }
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { applyMacro, listMacros } from './engine';

let _apiPromise: Promise<{ api: import('../vault').VaultAPI }> | null = null;

async function getApi() {
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
  let body: { macro?: string; vars?: Record<string, string> };
  try {
    body = (await request.json()) as { macro?: string; vars?: Record<string, string> };
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.macro) {
    return Response.json({ ok: false, error: 'Missing "macro" field' }, { status: 400 });
  }
  const { api } = await getApi();
  try {
    const result = await applyMacro(api.backend, body.macro, {
      vars: body.vars || {},
      god: body.vars?.god || process.env.OLYMPUS_GOD,
      sessionId: body.vars?.sessionId || process.env.OLYMPUS_SESSION_ID,
      planVersion: body.vars?.planVersion || process.env.OLYMPUS_PLAN_VERSION,
      now: new Date().toISOString(),
      vaultRoot: api.backend.vaultRoot,
    });
    return Response.json({ ok: true, result });
  } catch (err: unknown) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}

export async function GET(): Promise<Response> {
  return Response.json({ ok: true, macros: listMacros() });
}
