/**
 * Olympus Vault Sync — Next.js API Route Handler
 * ==================================================
 *
 * Portable route handler for `POST /api/vault/sync/{commit,push,status,init}`.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { VaultAPI } from '../vault';
import { commit, push, status, init, setRemote } from './git';
import { startScheduler, stopScheduler, getSchedulerState } from './scheduler';

/**
 * Handle a POST request to `/api/vault/sync/{op}`.
 *
 * Routes:
 *   POST /api/vault/sync/commit    { message? }       → CommitResult
 *   POST /api/vault/sync/push      {}                 → PushResult
 *   POST /api/vault/sync/status    {}                 → StatusResult
 *   POST /api/vault/sync/init      { remoteUrl? }     → InitResult
 *   POST /api/vault/sync/setRemote { url }            → { ok: true }
 *   POST /api/vault/sync/scheduler { action: 'start'|'stop'|'state', intervalMs? } → SchedulerState
 */
export async function handleVaultSyncRoute(
  _api: VaultAPI,
  request: { method: string; url: string; body: unknown },
): Promise<{ status: number; body: unknown }> {
  if (request.method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed — use POST' } };
  }

  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname.replace(/\/$/, '').toLowerCase();
  const body = (request.body || {}) as Record<string, unknown>;

  try {
    if (path.endsWith('/sync/commit') || path.endsWith('/sync')) {
      const result = await commit(body.message as string | undefined);
      return { status: 200, body: result };
    }
    if (path.endsWith('/sync/push')) {
      const result = await push();
      return { status: result.ok ? 200 : 500, body: result };
    }
    if (path.endsWith('/sync/status')) {
      const result = await status();
      return { status: 200, body: result };
    }
    if (path.endsWith('/sync/init')) {
      const result = await init(body.remoteUrl as string | undefined);
      return { status: 200, body: result };
    }
    if (path.endsWith('/sync/setremote')) {
      if (!body.url) return { status: 400, body: { error: 'url is required' } };
      await setRemote(body.url as string);
      return { status: 200, body: { ok: true } };
    }
    if (path.endsWith('/sync/scheduler')) {
      const action = body.action as 'start' | 'stop' | 'state';
      if (action === 'start') {
        startScheduler(body.intervalMs as number | undefined);
      } else if (action === 'stop') {
        stopScheduler();
      }
      return { status: 200, body: getSchedulerState() };
    }
    return { status: 404, body: { error: `Unknown sync route: ${path}` } };
  } catch (err) {
    return { status: 500, body: { error: (err as Error).message } };
  }
}
