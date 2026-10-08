/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { probeDevServer } from '@/lib/dev-server-probe';
import { getProject } from '@/lib/project-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('project');
  const DEFAULT_PORT = 3000;
  let port = DEFAULT_PORT; let projectName: string | null = null;
  if (slug) { const project = getProject(slug); if (project) { projectName = project.name; port = project.livePreviewPort || DEFAULT_PORT; } }
  // #102: the dual-stack probe — 127.0.0.1 AND ::1 in parallel; the response
  // url is the REACHABLE url (bracketed for IPv6), not a computed guess.
  const probe = await probeDevServer(port, 1500);
  return NextResponse.json({ running: probe.running, port, url: probe.url, host: probe.host, responseTimeMs: probe.responseTimeMs, project: projectName, slug: slug || null });
}
