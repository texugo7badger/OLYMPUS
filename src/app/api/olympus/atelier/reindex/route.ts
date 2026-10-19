/**
 * POST /api/olympus/atelier/reindex — W-A RAG-CERT A2 (v0.0.6): the vault
 * re-index action. reindexVault (media-vault-vec.ts) existed with zero
 * callers — assets described BEFORE an embedding key existed were never
 * embedded, so the semantic lane stayed blind to the older vault. This route
 * is the maintenance entry point (the Atelier panel's "re-index" button):
 * every asset gets the embedding pass (idempotent), the response is HONEST
 * about whether the semantic lane is keyed at all (no key → all skipped,
 * the keyword fallback keeps running — never a narrated success).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import { reindexVault, readAtelierKeys } from '@/lib/media-vault-vec';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const semantic = Boolean(readAtelierKeys().pollinations_key);
    const { indexed, skipped } = await reindexVault();
    return NextResponse.json({
      ok: true,
      indexed,
      skipped,
      semantic,
      note: semantic
        ? 'the semantic lane is keyed — the vault is embedded'
        : 'no embedding key configured — every asset skipped (the honest keyword fallback keeps running; set POLLINATIONS_KEY in the API Keys dialog)',
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
