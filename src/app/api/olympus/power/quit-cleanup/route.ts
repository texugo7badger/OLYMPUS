/**
 * POST /api/olympus/power/quit-cleanup — v0.0.96.
 *
 * Called by the Electron main on a real quit (X or tray → Quit). A closed
 * window must not leave a 3.4 GB preview or the chat/MCP fleet in the app
 * scope. Unlike hibernate, this stops every managed dev server and does NOT
 * write a wake-restore list.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupServer } from '@/lib/opencode-session';
import { list, stop } from '@/lib/dev-server-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  try { fs.writeFileSync(path.join(home, 'stopping.json'), JSON.stringify({ at: new Date().toISOString() }) + '\n', { mode: 0o600 }); } catch { /* best effort */ }
  const stopped: string[] = [];
  const failures: string[] = [];
  try {
    for (const server of await list()) {
      if (!(server.state === 'running' || server.state === 'starting' || server.running)) continue;
      try {
        const result = await stop(server.slug);
        if (result.ok) stopped.push(server.slug);
        else failures.push(`${server.slug}: ${result.error || 'stop refused'}`);
      } catch (e: any) {
        failures.push(`${server.slug}: ${e?.message || e}`);
      }
    }
  } catch { /* best effort */ }
  cleanupServer();
  try { fs.unlinkSync(path.join(home, 'hibernation-devservers.json')); } catch { /* none */ }
  return NextResponse.json({ ok: true, stopped, failures });
}
