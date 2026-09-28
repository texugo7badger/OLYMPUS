/**
 * Olympus Vault Lint — API Route Handler
 * =========================================
 *
 * POST /api/vault/lint        — lint a single file
 *      body: { path: string, autoFix?: boolean }
 * POST /api/vault/lint/all    — lint a directory (or whole vault)
 *      body: { dir?: string, autoFix?: boolean }
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

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
  const url = new URL(request.url);
  let body: { path?: string; dir?: string; autoFix?: boolean };
  try {
    body = (await request.json()) as { path?: string; dir?: string; autoFix?: boolean };
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const { api } = await getApi();
  const autoFix = body.autoFix === true;
  if (url.pathname.endsWith('/lint/all') || body.dir !== undefined) {
    const report = await api.lintAll(body.dir || '.', autoFix);
    return Response.json({ ok: true, report });
  }
  if (!body.path) {
    return Response.json({ ok: false, error: 'Missing "path" field' }, { status: 400 });
  }
  const report = await api.lint(body.path, autoFix);
  return Response.json({ ok: true, report });
}

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    description: 'Olympus Vault Lint endpoint. POST { path, autoFix? } to lint a single file.',
  });
}
