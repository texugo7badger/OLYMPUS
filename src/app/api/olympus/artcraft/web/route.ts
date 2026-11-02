/**
 * /api/olympus/artcraft/web — v0.0.32 (Epic Q): web references via Brave.
 *
 * The board needs real references, not adjectives. Brave Image Search returns
 * a title, the page URL and a thumbnail; the project stores the LINK and the
 * provenance only (license unknown → never a copied asset). The key is the
 * same BRAVE_API_KEY the MCP lane uses (integration env: api-configs/.env/shell).
 *
 * GET ?q=<query>&count=12
 *   → { ok, results: [{ name, demoUrl, imageUrl, source, library: 'web' }] }
 *   → { ok: false, needsKey: true } when no key is configured (never a 500)
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse, NextRequest } from 'next/server';
import { loadIntegrationEnv } from '@/lib/integration-env';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; results: WebReference[] }>();

interface WebReference {
  name: string;
  demoUrl: string;
  imageUrl: string | null;
  source: string;
  library: 'web';
}

function braveKey(): string | null {
  const env = loadIntegrationEnv({ processEnv: process.env });
  const key = env.BRAVE_API_KEY;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 120);
  const count = Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get('count')) || 12));
  if (q.length < 2) {
    return NextResponse.json({ ok: false, error: 'q is required (2+ chars)' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const key = braveKey();
  if (!key) {
    return NextResponse.json({
      ok: false,
      needsKey: true,
      error: 'BRAVE_API_KEY is not configured — add it in the API Keys dialog.',
    }, { headers: NO_CACHE_HEADERS });
  }
  const cacheKey = `${q}|${count}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ok: true, cached: true, results: hit.results }, { headers: NO_CACHE_HEADERS });
  }
  try {
    const url = new URL('https://api.search.brave.com/res/v1/images/search');
    url.searchParams.set('q', q);
    url.searchParams.set('count', String(count));
    url.searchParams.set('safesearch', 'strict');
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': key },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ ok: false, needsKey: true, error: `Brave rejected the key (HTTP ${res.status})` }, { headers: NO_CACHE_HEADERS });
    }
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Brave HTTP ${res.status}` }, { status: 502, headers: NO_CACHE_HEADERS });
    }
    const data: any = await res.json();
    const results: WebReference[] = (Array.isArray(data?.results) ? data.results : [])
      .map((r: any) => {
        const demoUrl = typeof r?.url === 'string' ? r.url : typeof r?.source === 'string' ? r.source : '';
        if (!demoUrl.startsWith('http')) return null;
        const source = typeof r?.source === 'string' ? r.source.slice(0, 80) : 'web';
        return {
          name: (String(r?.title ?? '').replace(/<[^>]*>/g, '').trim() || source || 'reference').slice(0, 120),
          demoUrl,
          imageUrl: typeof r?.thumbnail?.src === 'string' ? r.thumbnail.src : null,
          source,
          library: 'web' as const,
        };
      })
      .filter(Boolean)
      .slice(0, count);
    cache.set(cacheKey, { at: Date.now(), results });
    return NextResponse.json({ ok: true, results }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.name === 'TimeoutError' ? 'Brave timed out' : (e?.message || String(e)) },
      { status: 504, headers: NO_CACHE_HEADERS },
    );
  }
}
