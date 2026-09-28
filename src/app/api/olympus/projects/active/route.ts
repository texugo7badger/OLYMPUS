/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { setActiveProject, getActiveProject, getActiveProjectSlug } from '@/lib/project-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const slug = getActiveProjectSlug();
    const project = slug ? getActiveProject() : null;
    return NextResponse.json({ slug, project, ts: new Date().toISOString() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const slug = body.slug === null ? null : String(body.slug || '').trim();
    if (slug === '') return NextResponse.json({ error: 'slug must be non-empty or null' }, { status: 400 });
    setActiveProject(slug);
    const project = slug ? getActiveProject() : null;
    return NextResponse.json({ success: true, slug, project });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let slug: string | null = null;
    if (body.slug === null || typeof body.slug === 'string') slug = body.slug === null ? null : String(body.slug).trim() || null;
    else if (typeof body.projectId === 'string') slug = String(body.projectId).trim() || null;
    setActiveProject(slug);
    const project = slug ? getActiveProject() : null;
    return NextResponse.json({ success: true, slug, project });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
