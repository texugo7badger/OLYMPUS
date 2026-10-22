#!/usr/bin/env node
/**
 * static-preview-server.mjs — W-S STATIC-PREVIEW (v0.0.8): the tiny static
 * file server behind the Live Preview panel for HTML lanes. A project like
 * the Atlas (atlas.html, no package.json, no dev script) is a REAL
 * deliverable the panel must show — "not a runnable project" was the 23:36
 * specimen's lie. Zero dependencies: node:http, the lane root, the entry
 * file. Served with the honest MIME table + no-store (the panel's probe
 * and the user's reloads always see the current file).
 *
 *   node scripts/static-preview-server.mjs <port> <laneRoot> <entryFile>
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [portArg, rootArg, entryArg] = process.argv.slice(2);
const port = Number.parseInt(portArg || '', 10);
const root = path.resolve(rootArg || '.');
const entry = entryArg || 'index.html';

// Port 0 = the OS assigns an ephemeral port (node semantics) — valid.
if (!Number.isFinite(port) || port < 0 || !fs.existsSync(root)) {
  console.error('usage: static-preview-server.mjs <port> <laneRoot> <entryFile>');
  process.exit(2);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  try {
    // The traversal guard: resolve inside the root only.
    const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
    let file = path.resolve(root, rel || entry);
    if (!file.startsWith(root + path.sep) && file !== path.resolve(root, entry)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('forbidden');
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // The SPA lane: unknown paths fall to the entry — a static lane is
      // its own index, never a dead 404 in the preview.
      file = path.resolve(root, entry);
      if (!fs.existsSync(file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
        return;
      }
    }
    const data = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, max-age=0',
    });
    res.end(data);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('internal error');
  }
});

server.listen(port, '127.0.0.1', () => {
  // The REAL bound port (an ephemeral-0 spawn tells the truth, not the ask).
  const bound = server.address()?.port ?? port;
  console.log(`[static-preview] serving ${root} (entry ${entry}) on http://127.0.0.1:${bound}`);
});
