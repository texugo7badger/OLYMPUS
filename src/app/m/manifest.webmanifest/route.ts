/**
 * /m/manifest.webmanifest — the installable mobile companion, themed.
 *
 * Generated per request from the active theme so the home-screen icon and the
 * splash colors follow the user's palette. Manifest JSON is never cached.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import { mobileManifest } from '@/lib/theme-manifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new NextResponse(JSON.stringify(mobileManifest('app')), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
