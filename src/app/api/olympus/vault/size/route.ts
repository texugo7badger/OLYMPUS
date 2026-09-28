/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { getVaultSizeReport } from '@/lib/vault-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/vault/size
 *
 * Returns a per-directory size breakdown of ~/OLYMPUS-VAULT/ + flags files
 * that are approaching the policy caps. Used by `olympus doctor` + the
 * Settings → Vault panel.
 */
export async function GET() {
  try {
    const report = getVaultSizeReport();
    return NextResponse.json(report, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Vary': '*',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
