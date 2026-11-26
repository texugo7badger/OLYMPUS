/**
 * POST /api/olympus/chat/hibernate — v0.0.96: the gated hibernation.
 *
 * The v0.0.32 route stopped the chat server immediately. A streaming answer
 * was cut, and every managed dev server was stopped even when a live hop
 * needed the preview. The v2 contract:
 *   - wait up to `waitMs` (default 60s) for active warm chat turns to settle;
 *   - if a live campaign has an in-flight hop, KEEP the dev servers (the hop
 *     may need the preview) and record that decision;
 *   - otherwise stop the managed dev servers and record what was stopped so
 *     the Electron wake can restore them automatically;
 *   - only then stop the chat server and prune an expired window.
 *
 * The Electron main awaits this response before destroying the renderer, so a
 * deferred hibernate keeps the window and reports the reason instead of
 * killing a live turn.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activeRunCount, cleanupServer, waitForActiveRuns } from '@/lib/opencode-session';
import { list, stop } from '@/lib/dev-server-manager';
import { pruneHibernationPlan } from '@/lib/hibernation';
import { getActiveProjectSlug } from '@/lib/project-context';
import { getVaultRoot } from '@/lib/vault-root';
import { loadHopState } from '@/lib/hop-runtime/hop-state';
import { readWalkLock } from '@/lib/hop-runtime/walk-lock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const DEVSERVERS_FILE = () => path.join(HOME(), 'hibernation-devservers.json');

function liveHopNeedsPreview(): { keep: boolean; campaignLive: boolean; slug: string | null; detail: string } {
  const slug = getActiveProjectSlug();
  if (!slug) return { keep: false, campaignLive: false, slug: null, detail: 'no active project' };
  const lane = path.join(getVaultRoot(), '02_Projects', slug);
  try {
    const lock = readWalkLock(lane);
    if (!lock.alive) return { keep: false, campaignLive: false, slug, detail: 'no live campaign' };
    const state = loadHopState(lane);
    const inFlight = state?.inFlight?.length ?? 0;
    return { keep: inFlight > 0, campaignLive: true, slug, detail: inFlight > 0 ? `${inFlight} in-flight hop(s) keep the preview` : 'campaign is live between hops' };
  } catch {
    return { keep: false, campaignLive: false, slug, detail: 'campaign state unreadable' };
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* optional body */ }
    const waitMs = Math.max(0, Math.min(90_000, Number(body?.waitMs) || 60_000));
    pruneHibernationPlan();

    // 1) Do not cut a live answer. The Electron main awaits this response.
    const started = Date.now();
    const idle = await waitForActiveRuns(waitMs);
    if (!idle) {
      return NextResponse.json({
        ok: false,
        deferred: true,
        active: activeRunCount(),
        error: `a chat turn is still streaming after ${Math.round((Date.now() - started) / 1000)}s — hibernation postponed; the window stays.`,
      }, { status: 409 });
    }

    // 2) Keep the preview when a live hop is in flight (a visual hop may need
    // it); otherwise stop every managed dev server and record the list for the
    // wake restore.
    const hop = liveHopNeedsPreview();
    const forceFree = body?.forceFree === true;
    const keepPreview = forceFree ? false : (body?.keepPreview === true || hop.keep || hop.campaignLive);
    // v0.1.1 — a live campaign owns the OpenCode/MCP server. Stopping it here
    // cut the hop's transport and turned every hibernate into a park.
    const keepChat = forceFree ? false : hop.campaignLive;
    const stopped: string[] = [];
    const kept: string[] = [];
    try {
      for (const server of await list()) {
        if (!(server.state === 'running' || server.state === 'starting' || server.running)) continue;
        if (keepPreview || hop.campaignLive) { kept.push(server.slug); continue; }
        try {
          const result = await stop(server.slug);
          if (result.ok) stopped.push(server.slug);
        } catch { /* one stubborn server must not block the rest */ }
      }
    } catch { /* dev servers are best-effort; the chat cleanup still runs */ }

    try {
      fs.mkdirSync(path.dirname(DEVSERVERS_FILE()), { recursive: true });
      fs.writeFileSync(DEVSERVERS_FILE(), JSON.stringify({
        stopped,
        kept,
        keepPreview,
        hop,
        at: new Date().toISOString(),
      }, null, 2) + '\n', { mode: 0o600 });
    } catch { /* the restore list is best-effort; never block hibernate */ }

    // 3) The chat/MCP fleet is idle now. Stop it — unless a live campaign
    // needs the same server for its next hop.
    if (!keepChat) cleanupServer();
    return NextResponse.json({
      ok: true,
      stopped: true,
      waitedMs: Date.now() - started,
      devServers: stopped,
      kept,
      keepPreview,
      hop,
      keptChat: keepChat,
      note: keepPreview
        ? (keepChat ? 'The live campaign keeps chat/MCP and the preview; the window sleeps without parking the walk.' : 'Chat/MCP stopped; the preview stays because a live hop is in flight.')
        : 'Chat/MCP and idle preview servers stopped; they restart on demand/wake.',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
