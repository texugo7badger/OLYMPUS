/**
 * /api/olympus/retrieval/reindex — v0.1.3 local index maintenance.
 *
 * GET  → status (docs, embedded, model, paused)
 * POST → { force?, limit? } index in the background? This route runs the
 *        deterministic batch synchronously so the caller gets a real result;
 *        the UI keeps its own timeout. Hibernate pauses between batches.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { indexRetrieval } from '@/lib/retrieval/indexer';
import { openRetrievalStore, storeStats } from '@/lib/retrieval/store';
import { embeddingStatus, ollamaAvailable } from '@/lib/retrieval/embedding';
import { retrievalRuntimeState } from '@/lib/retrieval/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const store = openRetrievalStore();
  try {
    return NextResponse.json({
      ok: true,
      ...storeStats(store),
      embedding: embeddingStatus(),
      ollama: await ollamaAvailable(),
      runtime: retrievalRuntimeState(),
    }, { headers: NO_CACHE_HEADERS });
  } finally {
    store.close();
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch { /* optional */ }
  const result = await indexRetrieval({
    force: body?.force === true,
    limit: Number(body?.limit) || undefined,
  });
  return NextResponse.json({ ...result }, { headers: NO_CACHE_HEADERS });
}
