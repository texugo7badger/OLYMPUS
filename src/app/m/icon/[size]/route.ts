/**
 * /m/icon/[size] — the themed OLYMPUS app icon.
 *
 * Renders the same mark as the favicon (`themedFaviconSvg`) at any install
 * size. `?maskable=1` adds the Android safe-zone padding. The icon URL in the
 * manifest carries a theme hash, so this route may cache aggressively; a
 * theme change produces a new URL instead of a stale gold icon.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { readThemeState, themedAppIconSvg } from '@/lib/theme-manifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const parsed = Number.parseInt(raw, 10);
  const size = Number.isFinite(parsed) ? Math.max(32, Math.min(1024, Math.round(parsed))) : 192;
  const maskable = req.nextUrl.searchParams.get('maskable') === '1';
  const state = readThemeState();
  const svg = themedAppIconSvg(state, { maskable });
  const cache = req.nextUrl.searchParams.has('v')
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=300, stale-while-revalidate=86400';

  try {
    const sharpModule = await import('sharp');
    const png = await sharpModule.default(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': cache,
        'X-OLYMPUS-Icon': maskable ? 'maskable' : 'any',
      },
    });
  } catch {
    // sharp is optional; a themed SVG still installs on browsers that accept
    // it, and the header names the fallback instead of pretending it is PNG.
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'X-OLYMPUS-Icon': 'svg-fallback',
      },
    });
  }
}
