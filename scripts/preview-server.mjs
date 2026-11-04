#!/usr/bin/env node
/**
 * preview-server.mjs — v0.0.80: the tiny static host for a generated preview.
 *
 * Serves ONE directory (the generated preview) on 127.0.0.1, writes
 * `server.json` with its port/pid so the app can find it, and refuses any path
 * outside the root. No framework, no dependency, no write.
 *
 * Usage: node scripts/preview-server.mjs <dir> [port]
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('preview-server: <dir> is required'); process.exit(2); }
const root = path.resolve(dir);
const port = Number(process.argv[3]) || 0;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let url = '/';
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch { /* bad url */ }
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) {
    res.writeHead(403, { 'content-type': 'text/plain' }); res.end('forbidden'); return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
});

server.listen(port, '127.0.0.1', () => {
  const p = server.address().port;
  try {
    fs.writeFileSync(path.join(root, 'server.json'), JSON.stringify({ port: p, pid: process.pid, startedAt: new Date().toISOString() }, null, 2) + '\n');
  } catch { /* the app falls back to the log */ }
  console.log(`preview-server: http://127.0.0.1:${p}/ (${root})`);
});
