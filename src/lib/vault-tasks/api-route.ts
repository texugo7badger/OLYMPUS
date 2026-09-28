/**
 * Olympus Vault Tasks — Next.js API Route Handler
 * ==================================================
 *
 * Portable route handler for `POST /api/vault/tasks` and sub-routes.
 * Same shape as the other vault API routes (vault-query, vault-template,
 * vault-lint) — framework-agnostic, takes a Request, returns a Response.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { VaultAPI } from '../vault';
import type { TaskFilter, TaskGroupBy } from './types';

/**
 * Handle a POST request to `/api/vault/tasks[/sub]`.
 *
 * Routes:
 *   POST /api/vault/tasks           → { op: 'query' | 'group' | 'toggle' | 'setStatus' | 'create', ... }
 *   POST /api/vault/tasks/query     → { filter?, ... }
 *   POST /api/vault/tasks/group     → { filter?, groupBy? }
 *   POST /api/vault/tasks/toggle    → { notePath, line }
 *   POST /api/vault/tasks/setStatus → { notePath, line, status }
 *   POST /api/vault/tasks/create    → { notePath, text, opts? }
 *
 * The body is JSON. The `op` field on `/api/vault/tasks` selects the
 * operation; sub-routes don't need `op`.
 */
export async function handleVaultTasksRoute(
  api: VaultAPI,
  request: { method: string; url: string; body: unknown },
): Promise<{ status: number; body: unknown }> {
  if (request.method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed — use POST' } };
  }

  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname.replace(/\/$/, '');
  const body = (request.body || {}) as Record<string, unknown>;

  // Determine op from path or body.
  let op: string;
  if (path.endsWith('/query')) op = 'query';
  else if (path.endsWith('/group')) op = 'group';
  else if (path.endsWith('/toggle')) op = 'toggle';
  else if (path.endsWith('/setStatus')) op = 'setStatus';
  else if (path.endsWith('/create')) op = 'create';
  else op = (body.op as string) || 'query';

  try {
    switch (op) {
      case 'query': {
        const filter = (body.filter as TaskFilter) || {};
        const tasks = await api.tasks.parseTasks(filter);
        return { status: 200, body: { tasks, count: tasks.length } };
      }
      case 'group': {
        const filter = (body.filter as TaskFilter) || {};
        const groupBy = (body.groupBy as TaskGroupBy) || 'status';
        const groups = await api.tasks.groupTasks(filter, groupBy);
        const total = groups.reduce((s, g) => s + g.count, 0);
        return { status: 200, body: { groups, total } };
      }
      case 'toggle': {
        const notePath = body.notePath as string;
        const line = Number(body.line);
        if (!notePath || !Number.isFinite(line)) {
          return { status: 400, body: { error: 'notePath and line are required' } };
        }
        const task = await api.tasks.toggleTask(notePath, line);
        return { status: 200, body: { task } };
      }
      case 'setStatus': {
        const notePath = body.notePath as string;
        const line = Number(body.line);
        const status = body.status as TaskFilter['status'];
        if (!notePath || !Number.isFinite(line) || !status) {
          return { status: 400, body: { error: 'notePath, line, status are required' } };
        }
        const task = await api.tasks.setTaskStatus(notePath, line, status);
        return { status: 200, body: { task } };
      }
      case 'create': {
        const notePath = body.notePath as string;
        const text = body.text as string;
        const opts = (body.opts as { priority?: string; due?: string; god?: string }) || {};
        if (!notePath || !text) {
          return { status: 400, body: { error: 'notePath and text are required' } };
        }
        const task = await api.tasks.createTask(notePath, text, {
          priority: opts.priority as TaskFilter['priority'],
          due: opts.due ? new Date(opts.due) : undefined,
          god: opts.god,
        });
        return { status: 201, body: { task } };
      }
      default:
        return { status: 400, body: { error: `Unknown op: ${op}` } };
    }
  } catch (err) {
    return { status: 500, body: { error: (err as Error).message } };
  }
}
