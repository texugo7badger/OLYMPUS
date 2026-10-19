/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { probeDevServer } from '@/lib/dev-server-probe';
import { status as managerStatus } from '@/lib/dev-server-manager';
import { getProject, parseFrontmatter, reconcileProjectPath } from '@/lib/project-context';
import path from 'node:path';

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
  // #103: the note/lane reconciliation — the path consumers should show (the
  // lane-aware truth), with the staleness surfaced, never silently clobbered.
  const reconciled = slug ? reconcileProjectPath(slug) : null;
  // #DEMO-LOGIN: an auth-gated preview may declare its seed credentials in
  // the project note frontmatter (`demoLogin: email / password`). The panel
  // surfaces the chip so the user never guesses at a login form inside the
  // iframe. The note is the user's territory — no value, no chip.
  let demoLogin: string | null = null;
  try {
    if (reconciled?.path) {
      const fm = parseFrontmatter(path.join(reconciled.path, 'project.md'));
      const v = fm?.demoLogin;
      if (typeof v === 'string' && v.trim()) demoLogin = v.trim();
    }
  } catch {}
  // #100 (v0.0.6): THE MANAGER TRUTH LAYER — the durable dev-server manager
  // (#86) is the host; its probe-verified status is the single source of
  // truth for "running" (AGENTS.md #105 doctrine). The panel's own ephemeral
  // lane probe stays (it sees servers the manager doesn't own); the manager
  // field lets the panel distinguish the two and offer start/stop control.
  let manager: Awaited<ReturnType<typeof managerStatus>> | null = null;
  try {
    manager = slug ? await managerStatus(slug) : null;
  } catch { manager = null; }
  return NextResponse.json({
    running: probe.running,
    port,
    url: probe.url,
    host: probe.host,
    responseTimeMs: probe.responseTimeMs,
    project: projectName,
    slug: slug || null,
    path: reconciled?.path ?? null,
    pathSource: reconciled?.source ?? null,
    demoLogin,
    manager,
  });
}
