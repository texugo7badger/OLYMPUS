/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/**
 * dev-server status route — #105 (MADRUGA-SERVE-1 Batch B): the app-flow
 * PROBE surface. Wherever the app flow can claim a dev server is running,
 * the claim comes from here (the manager's probe-verified status), never
 * from captured output text. The Live Preview panel's own integration is
 * #100's design night (its route stays frozen); this surface is additive
 * and serves the failure card (#98) its probe evidence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { status as managerStatus } from '@/lib/dev-server-manager';
import { buildDevServerClaim } from '@/lib/dev-server-claim';
import { getActiveProjectSlug } from '@/lib/project-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // The slug in hand, else the active project — the failure card has no slug.
  const slug = req.nextUrl.searchParams.get('project') || getActiveProjectSlug();
  if (!slug) {
    // No project context: the honest refusal — never a claim without a probe.
    const claim = buildDevServerClaim({ capturedText: null });
    return NextResponse.json({ status: null, claim });
  }
  const status = await managerStatus(slug);
  const claim = buildDevServerClaim({ status });
  return NextResponse.json({ status, claim });
}
