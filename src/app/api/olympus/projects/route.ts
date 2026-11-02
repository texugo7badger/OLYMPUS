/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { listProjects, createProject, getActiveProject, getActiveProjectSlug } from '@/lib/project-context';
import { detectProjectStacks, projectSummary, readProjectPackage } from '@/lib/project-summary';
import { buildProjectBrief } from '@/lib/project-brief';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // v0.0.38 — the folder is the identity. The note's creation prompt is NOT
    // a description; each project gets its detected stacks and a real summary.
    const projects = listProjects().map((p) => {
      const pkg = readProjectPackage(p.path);
      const stacks = Array.from(new Set([...(p.stacks || []), ...detectProjectStacks(p.path, pkg)]));
      const brief = buildProjectBrief(p.path);
      return {
        ...p,
        stacks,
        // v0.0.45 — every project carries its own status at a glance.
        brief: { status: brief.status, completed: brief.completed, total: brief.total, parked: brief.parked, updatedAt: brief.updatedAt },
        description: projectSummary({ slug: p.slug, pkg, root: p.path, stacks, port: p.livePreviewPort }),
      };
    });
    const activeSlug = getActiveProjectSlug();
    const active = activeSlug ? projects.find((p) => p.slug === activeSlug) ?? getActiveProject() : null;
    return NextResponse.json({ projects, active });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || typeof body.name !== 'string') return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!body.path || typeof body.path !== 'string') return NextResponse.json({ error: 'path is required' }, { status: 400 });
    const result = createProject({
      name: String(body.name), path: String(body.path),
      stacks: Array.isArray(body.stacks) ? body.stacks : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
    });
    return NextResponse.json({ success: true, project: result.project, detection: result.detection });
  } catch (e: any) {
    const msg = e.message || 'create failed';
    const isClientError = msg.includes('already exists') || msg.includes('does not exist') || msg.includes('not a directory') || msg.includes('non-empty slug');
    return NextResponse.json({ error: msg }, { status: isClientError ? 400 : 500 });
  }
}
