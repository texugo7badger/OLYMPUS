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
  // The live probe of the demo URLs (parallel, bounded) — the embed verdict.
  const probes = await Promise.all(refs.map((r) => probeCraftApp(r.demoUrl, 8_000)));
  const withProbes = refs.map((r, i) => ({ ...r, probe: { ok: probes[i].ok, frameable: probes[i].frameable, httpStatus: probes[i].httpStatus } }));
  return NextResponse.json({ ok: true, references: withProbes, libraries: UI_REF_LIBRARIES }, { headers: NO_CACHE_HEADERS });
}
