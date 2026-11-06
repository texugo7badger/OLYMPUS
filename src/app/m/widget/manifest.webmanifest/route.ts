/**
 * /m/widget/manifest.webmanifest — the installable live widget, themed.
 *
 * Same identity and palette as /m; only start_url/name differ, so the two
 * home-screen apps share one icon family and switch inside the same scope.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import { mobileManifest } from '@/lib/theme-manifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new NextResponse(JSON.stringify(mobileManifest('widget')), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
