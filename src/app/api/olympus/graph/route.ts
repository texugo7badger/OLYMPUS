/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildGraph, brainHealth, type ActiveProjectContext } from '@/lib/olympus';
import { getProject } from '@/lib/project-context';
// Shared no-cache headers for live API routes.
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/graph?project=<slug>
 *
 * Returns the 3D graph data + brain health KPIs.
 *
 * Accepts an optional ?project=<slug>
 * query parameter. When provided, instincts are filtered by scope:
 *   - scope=global + stacks match active project → visible
 *   - scope=stack + stacks match → visible
 *   - scope=project + projects match slug → visible
 *   - cross-stack global instincts with conf ≥ 0.85 → visible (rule 2b)
 *   - everything else → hidden
 *
 * When the slug is invalid or omitted, browsing mode applies
 * (project-bound instincts hidden, all others visible).
 */
export async function GET(req: NextRequest) {
  const projectSlug = req.nextUrl.searchParams.get('project');

  let activeProject: ActiveProjectContext | null = null;
  if (projectSlug) {
    const p = getProject(projectSlug);
    if (p) {
      activeProject = {
        slug: p.slug,
        name: p.name,
        path: p.path,
        stacks: p.stacks,
      };
    }
  }

  const graph = buildGraph(activeProject);
  const health = brainHealth();
  return NextResponse.json({
    graph,
    health,
    activeProject: activeProject ? { slug: activeProject.slug, name: activeProject.name } : null,
    ts: new Date().toISOString(),
  }, {
    // Cache-Control: no-store so the brain graph reflects
    // the latest instinct file changes (was previously serving stale snapshots
    // for the 30s poll interval).
    headers: NO_CACHE_HEADERS,
  });
}
