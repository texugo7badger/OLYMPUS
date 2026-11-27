/**
 * /api/olympus/retrieval/search — v0.1.3 hybrid search for the UI and gods.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { retrieve, retrievalMetrics } from '@/lib/retrieval/bus';
import { getActiveContext } from '@/lib/learning/active-context';
import type { RetrievalKind } from '@/lib/retrieval/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = new Set(['skill', 'knowledge', 'instinct', 'pattern', 'doc', 'media']);

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const q = req.nextUrl.searchParams.get('q') || '';
  const kinds = (req.nextUrl.searchParams.get('kinds') || '')
    .split(',').map((k) => k.trim()).filter((k) => KINDS.has(k)) as RetrievalKind[];
  const limit = Number(req.nextUrl.searchParams.get('limit') || 6);
  const ctx = getActiveContext();
  const hits = await retrieve({
    query: q,
    kinds: kinds.length ? kinds : undefined,
    project: ctx.slug,
    stacks: ctx.stacks,
    limit: Number.isFinite(limit) ? limit : 6,
  });
  return NextResponse.json({ ok: true, query: q, count: hits.length, hits, metrics: retrievalMetrics(hits) }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400, headers: NO_CACHE_HEADERS }); }
  const ctx = getActiveContext();
  const hits = await retrieve({
    query: String(body?.query || ''),
    kinds: Array.isArray(body?.kinds) ? body.kinds.filter((k: string) => KINDS.has(k)) : undefined,
    god: body?.god || null,
    project: body?.project ?? ctx.slug,
    stacks: Array.isArray(body?.stacks) ? body.stacks : ctx.stacks,
    limit: Number(body?.limit) || 6,
    budgetChars: Number(body?.budgetChars) || 4_000,
  });
  return NextResponse.json({ ok: true, count: hits.length, hits, metrics: retrievalMetrics(hits) }, { headers: NO_CACHE_HEADERS });
}
