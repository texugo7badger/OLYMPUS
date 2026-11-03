/**
 * GET /api/olympus/mcp/market?q= — v0.0.53.
 * The curated seed + the live directory search URL. No network call.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { searchMarket, marketSearchUrl } from '@/lib/mcp-market';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  return NextResponse.json({ ok: true, servers: searchMarket(q), searchUrl: marketSearchUrl(q), totalDirectory: 9800 }, { headers: NO_CACHE_HEADERS });
}
