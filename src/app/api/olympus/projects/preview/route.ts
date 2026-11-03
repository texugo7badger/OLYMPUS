/**
 * /api/olympus/projects/preview — v0.0.63: the phone can reach the preview.
 *
 * WHY THIS EXISTS: `/m` built the preview URL as
 * `http://<window.location.hostname>:<port>`. On the Cloudflare tunnel the
 * hostname is the tunnel's (the port is not exposed there) and the page is
 * HTTPS while the preview is HTTP — the browser blocks mixed content. The
 * button could never work away from the desktop.
 *
 * THE CONTRACT (one endpoint, probe-verified):
 *   GET  ?slug=aime → { port, running, lanUrl, localUrl, tunnelUrl,
 *                       recommendedUrl, remote, probe, note }
 *   POST { slug, action: 'start' | 'stop' | 'start-tunnel' | 'stop-tunnel' }
 *
 * LAN preview needs no tunnel: the phone on the same Wi-Fi opens the desktop's
 * IPv4. Remote preview gets a per-port cloudflared quick tunnel (HTTPS, public
 * but unguessable, stoppable from the phone).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { getProject } from '@/lib/project-context';
import { probeDevServer } from '@/lib/dev-server-probe';
import { status as managerStatus, start as startDevServer, stop as stopDevServer } from '@/lib/dev-server-manager';
import {
  lanAddress,
  isRemoteRequestHost,
  previewTunnelStatus,
  startPreviewTunnel,
  stopPreviewTunnel,
} from '@/lib/preview-tunnel';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PreviewState = {
  ok: boolean;
  slug: string;
  name: string | null;
  /** null until the project has a port (the note's, or one the manager assigned) */
  port: number | null;
  running: boolean;
  remote: boolean;
  lanUrl: string | null;
  localUrl: string;
  tunnelUrl: string | null;
  recommendedUrl: string | null;
  tunnelAvailable: boolean;
  probeMs: number | null;
  note: string;
  error?: string;
};

async function describe(slug: string, host: string | null): Promise<PreviewState> {
  const project = getProject(slug);
  const lan = lanAddress();
  const remote = isRemoteRequestHost(host, lan);

  // THE PORT IS MEASURED, NEVER GUESSED: the manager's state first (it owns
  // the spawn), then the note's preference. With neither, we do NOT probe
  // :3000 — that could be an unrelated app and would point the phone at the
  // wrong surface. The manager assigns a free port when the start runs.
  const status = await managerStatus(slug).catch(() => null);
  const port = status?.port ?? project?.livePreviewPort ?? null;
  const probe = port ? await probeDevServer(port) : { running: false, responseTimeMs: null };
  const running = Boolean(probe.running || status?.running);
  const tunnel = port ? previewTunnelStatus(port) : null;

  const localUrl = port ? `http://127.0.0.1:${port}` : '';
  const lanUrl = port && lan ? `http://${lan}:${port}` : null;
  const tunnelUrl = tunnel?.running ? tunnel.url : null;

  // Remote pages are HTTPS: only an HTTPS tunnel URL is usable there. LAN
  // pages are HTTP: the LAN address is the direct, fastest path.
  const recommendedUrl = remote ? tunnelUrl : (lanUrl ?? localUrl);

  const where = port ? `:${port}` : 'no port assigned yet';
  const note = !running
    ? `the preview server is not running (${where}) — start it from this screen`
    : remote && !tunnelUrl
      ? `running on ${where} — open a preview tunnel to reach it from this network`
      : remote
        ? `running on ${where} — HTTPS tunnel (public but unguessable; stop it when done)`
        : `running on ${where} — same Wi-Fi, direct LAN`;

  return {
    ok: true,
    slug,
    name: project?.name ?? null,
    port,
    running,
    remote,
    lanUrl,
    localUrl,
    tunnelUrl,
    recommendedUrl: running ? recommendedUrl : null,
    tunnelAvailable: Boolean(tunnel?.binary ?? false),
    probeMs: probe.responseTimeMs ?? null,
    note,
  };
}

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;
  const slug = req.nextUrl.searchParams.get('project') || req.nextUrl.searchParams.get('slug') || '';
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  if (!getProject(slug)) return NextResponse.json({ ok: false, error: `project '${slug}' not found` }, { status: 404, headers: NO_CACHE_HEADERS });
  try {
    const state = await describe(slug, req.headers.get('host'));
    return NextResponse.json(state, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'preview probe failed' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  let body: any = {};
  try { body = await req.json(); } catch { /* invalid */ }
  const slug = String(body?.slug || body?.project || '');
  const action = String(body?.action || '');
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  if (!getProject(slug)) return NextResponse.json({ ok: false, error: `project '${slug}' not found` }, { status: 404, headers: NO_CACHE_HEADERS });

  const status = await managerStatus(slug).catch(() => null);
  const knownPort = status?.port ?? getProject(slug)?.livePreviewPort ?? null;

  try {
    if (action === 'start') {
      // No explicit port when the note has none: the manager picks a free one
      // and records it, so the phone never lands on an unrelated :3000.
      const started = await startDevServer(slug, knownPort ?? undefined);
      if (!started.ok) {
        const state = await describe(slug, req.headers.get('host'));
        return NextResponse.json({ ...state, ok: false, error: started.error || 'the dev server could not start' }, { status: 409, headers: NO_CACHE_HEADERS });
      }
    } else if (action === 'stop') {
      await stopDevServer(slug);
      if (knownPort) stopPreviewTunnel(knownPort);
    } else if (action === 'start-tunnel') {
      if (!knownPort) {
        const state = await describe(slug, req.headers.get('host'));
        return NextResponse.json({ ...state, ok: false, error: 'start the preview server first — it has no port yet' }, { status: 409, headers: NO_CACHE_HEADERS });
      }
      const probe = await probeDevServer(knownPort);
      if (!probe.running) {
        const state = await describe(slug, req.headers.get('host'));
        return NextResponse.json({ ...state, ok: false, error: `start the preview server on :${knownPort} before opening a tunnel` }, { status: 409, headers: NO_CACHE_HEADERS });
      }
      await startPreviewTunnel(knownPort);
    } else if (action === 'stop-tunnel') {
      if (knownPort) stopPreviewTunnel(knownPort);
    } else {
      return NextResponse.json({ ok: false, error: `unknown action '${action}' — use start | stop | start-tunnel | stop-tunnel` }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const state = await describe(slug, req.headers.get('host'));
    return NextResponse.json(state, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    const state = await describe(slug, req.headers.get('host')).catch(() => null);
    return NextResponse.json({ ...(state ?? { ok: false, slug, port: knownPort }), ok: false, error: e?.message || 'preview action failed' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
