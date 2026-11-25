/**
 * /api/olympus/boot-check — v0.1.0: the build handshake.
 *
 * The "stack of panel loaders" screen happens when the renderer loads an
 * incomplete build (missing CSS/chunks) or a stale Next server answers on
 * 3737. This route is the cheapest honest check: it verifies the BUILD_ID and
 * the CSS asset directory the running server is actually serving. The shell
 * refuses to render its panels when this fails and shows ONE repair card.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    try { if (fs.existsSync(p)) return p; } catch { /* keep looking */ }
  }
  return null;
}

export async function GET() {
  const cwd = process.cwd();
  const nextDir = firstExisting([
    path.join(cwd, '.next'),
    path.join(cwd, '..', '..', '.next'),
    path.join(cwd, '..', '.next'),
  ]);
  const buildIdFile = nextDir ? path.join(nextDir, 'BUILD_ID') : null;
  const buildId = buildIdFile && fs.existsSync(buildIdFile)
    ? fs.readFileSync(buildIdFile, 'utf-8').trim()
    : null;
  const cssDir = nextDir ? path.join(nextDir, 'static') : null;
  let cssFiles: string[] = [];
  // Next 15 put CSS in static/css; Next 16 emits static/chunks/*.css. Walk the
  // static tree so the production handshake does not reject a complete build.
  const collectCss = (dir: string, depth = 0): string[] => {
    if (depth > 3) return [];
    let out: string[] = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) out = out.concat(collectCss(abs, depth + 1));
        else if (entry.isFile() && entry.name.endsWith('.css')) out.push(abs.slice(dir.length + 1));
      }
    } catch { /* unreadable */ }
    return out;
  };
  try {
    if (cssDir && fs.existsSync(cssDir)) cssFiles = collectCss(cssDir);
  } catch { /* unreadable */ }
  const versionFile = firstExisting([
    path.join(cwd, 'VERSION'),
    path.join(cwd, '..', '..', 'VERSION'),
    path.join(cwd, '..', 'VERSION'),
  ]);
  const version = versionFile ? fs.readFileSync(versionFile, 'utf-8').trim() : null;
  // Next dev does not emit a production BUILD_ID/CSS directory; the boot
  // handshake is a production gate. The standalone build is the release path.
  const dev = process.env.NODE_ENV !== 'production';
  const ok = dev ? true : Boolean(buildId && cssFiles.length > 0);
  return NextResponse.json({
    ok,
    dev,
    version,
    buildId,
    cssFiles: cssFiles.slice(0, 8),
    nextDir,
    error: ok ? null : !buildId
      ? 'the running server has no BUILD_ID — the build is incomplete or the wrong server is on this port'
      : 'the running server has no CSS assets — the build is incomplete (run npm run build:app and restart)',
  }, {
    headers: { 'Cache-Control': 'no-store, max-age=0', Vary: '*' },
  });
}
