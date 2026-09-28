/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest } from 'next/server';
import chokidar from 'chokidar';
import { resolveSafeRoot, resolveSafePath } from '../_helpers';

/**
 * GET /api/olympus/fs/watch?path=<relative>&root=<optional-safe-root>
 *
 * Server-Sent Events stream of filesystem changes inside
 * the safe root. Used by the FileExplorer to auto-refresh when a god
 * (via OpenCode) writes a file, or when the user runs `npm run dev` and
 * the build emits new files.
 *
 * Events (one per change):
 *   data: { "type": "add"|"change"|"unlink"|"addDir"|"unlinkDir", "path": "<relative-path>" }\n\n
 *
 * The watcher debounces by 200ms (chokidar's `awaitWriteFinish`) so saving
 * a file in the user's external editor doesn't fire 5 events (truncate,
 * write, flush, etc.).
 *
 * Connection lifecycle:
 *   • The watcher lives for the lifetime of the SSE connection.
 *   • When the client disconnects (closes the tab, navigates away), the
 *     watcher is closed and the file handle released.
 *   • One watcher per connection — multiple FileExplorer instances would
 *     each get their own watcher. The chokidar module dedupes within a
 *     process so the OS-level inode watch is shared.
 *
 * Security:
 *   • The watcher is rooted at the safe root (same as the other /fs/*
 *     routes). Path traversal attempts are rejected with 403 before the
 *     watcher is created.
 *   • We do NOT watch node_modules / .next / .git by default — they
 *     generate massive event storms during builds. The renderer can pass
 *     ?includeIgnored=true to opt in.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IGNORED_DEFAULT = [
  'node_modules/**',
  '.next/**',
  '.git/**',
  'dist/**',
  'build/**',
  'dist-electron/**',
  'dist-electron-tsc/**',
  '.turbo/**',
  '.cache/**',
];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const relative = url.searchParams.get('path') || '';
  const rootHint = url.searchParams.get('root');
  const includeIgnored = url.searchParams.get('includeIgnored') === 'true';

  const safeRoot = resolveSafeRoot(rootHint);
  const target = resolveSafePath(safeRoot, relative);
  if (!target) {
    return new Response('Path is outside the safe root.', { status: 403 });
  }

  // Set up SSE headers.
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // Controller already closed.
        }
      };

      // Send an initial "ready" event so the client knows the watcher
      // has been created.
      send({ type: 'ready', root: safeRoot, path: relative });

      const watcher = chokidar.watch(target, {
        ignored: includeIgnored ? [] : IGNORED_DEFAULT,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
        depth: 50, // don't recurse infinitely
      });

      const toRelative = (p: string) => {
        try {
          return p.startsWith(safeRoot) ? p.slice(safeRoot.length + 1) : p;
        } catch {
          return p;
        }
      };

      watcher.on('add', (p) => send({ type: 'add', path: toRelative(p) }));
      watcher.on('change', (p) => send({ type: 'change', path: toRelative(p) }));
      watcher.on('unlink', (p) => send({ type: 'unlink', path: toRelative(p) }));
      watcher.on('addDir', (p) => send({ type: 'addDir', path: toRelative(p) }));
      watcher.on('unlinkDir', (p) => send({ type: 'unlinkDir', path: toRelative(p) }));
      watcher.on('error', (err: any) => {
        send({ type: 'error', message: err.message });
      });

      // Heartbeat every 30s so the connection isn't killed by proxies
      // or the browser's idle-timeout heuristics.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {}
      }, 30_000);

      // Cleanup when the client disconnects.
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        watcher.close().catch(() => {});
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable response buffering — critical for SSE.
      'X-Accel-Buffering': 'no',
    },
  });
}
