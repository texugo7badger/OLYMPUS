/**
 * GET /api/olympus/ui-references — W-J UI-REFERENCES (v0.0.7): the curated
 * component inspiration catalog (OriginKit + Skiper UI) + the LIVE probe
 * truth (each demo's reachability + embedability — the pane never renders
 * a dead frame). The agents' lane is the [OLYMPUS-DESIGN] marker + the
 * originkit MCP; this route serves the USER's lane (the References tab).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { UI_REFERENCES, UI_REF_LIBRARIES } from '@/lib/ui-references';
import { probeCraftApp } from '@/lib/craft-apps';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').toLowerCase().trim();
  const lib = req.nextUrl.searchParams.get('library');
  let refs = UI_REFERENCES;
  if (lib) refs = refs.filter((r) => r.library === lib);
  if (q) {
    refs = refs.filter((r) =>
      `${r.name} ${r.category} ${r.what} ${r.id}`.toLowerCase().includes(q));
  }
  // v0.0.34 — the catalog is now ALL of OriginKit + Skiper (860+ entries).
  // Probing every demo URL on every load would be 860 network calls; the
  // card no longer embeds the vendor page, so the probe is OPT-IN and
  // bounded. Default: a neutral verdict, no network.
  const wantsProbe = req.nextUrl.searchParams.get('probe') === '1' && refs.length <= 32;
  const withProbes = wantsProbe
    ? await Promise.all(refs.map(async (r) => {
        const p = await probeCraftApp(r.demoUrl, 8_000);
        return { ...r, probe: { ok: p.ok, frameable: p.frameable, inconclusive: p.inconclusive === true, httpStatus: p.httpStatus } };
      }))
    : refs.map((r) => ({ ...r, probe: { ok: true, frameable: false, inconclusive: true, httpStatus: null } }));
  return NextResponse.json({ ok: true, references: withProbes, libraries: UI_REF_LIBRARIES }, { headers: NO_CACHE_HEADERS });
}
