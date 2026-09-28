/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import net from 'net';
import { getProject } from '@/lib/project-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tcpProbe(host: string, port: number, timeoutMs: number): Promise<{ ok: boolean; ms: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const s = new net.Socket(); s.setTimeout(timeoutMs); let done = false;
    const fin = (ok: boolean) => { if (done) return; done = true; try { s.destroy(); } catch {} resolve({ ok, ms: Date.now() - start }); };
    s.once('connect', () => fin(true)); s.once('timeout', () => fin(false)); s.once('error', () => fin(false));
    try { s.connect(port, host); } catch { fin(false); }
  });
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('project');
  const DEFAULT_PORT = 3000;
  let port = DEFAULT_PORT; let projectName: string | null = null;
  if (slug) { const project = getProject(slug); if (project) { projectName = project.name; port = project.livePreviewPort || DEFAULT_PORT; } }
  const probe = await tcpProbe('127.0.0.1', port, 1500);
  return NextResponse.json({ running: probe.ok, port, url: `http://127.0.0.1:${port}`, responseTimeMs: probe.ms, project: projectName, slug: slug || null });
}
