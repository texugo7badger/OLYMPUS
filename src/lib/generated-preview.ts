/**
 * generated-preview.ts — v0.0.80: the fast preview on disk.
 *
 * A generated preview is a single static page (HTML + inlined CSS) written to
 * `~/.olympus/previews/<slug>/` — never into the project, so a read-only lane
 * (AIME) is never touched. A tiny detached static server (scripts/
 * preview-server.mjs) serves the directory on a free localhost port; its
 * `server.json` is the state the app reads.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findOlympusRoot } from './opencode-spawn';

export interface PreviewState {
  port: number;
  pid: number;
  startedAt: string;
}

function home(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

export function previewDir(slug: string): string {
  return path.join(home(), 'previews', slug.replace(/[^a-zA-Z0-9._-]/g, '_'));
}

export function readPreviewState(slug: string): PreviewState | null {
  try {
    const st = JSON.parse(fs.readFileSync(path.join(previewDir(slug), 'server.json'), 'utf-8'));
    return typeof st?.port === 'number' ? st as PreviewState : null;
  } catch { return null; }
}

export function previewUrl(slug: string): string | null {
  const st = readPreviewState(slug);
  if (!st) return null;
  try { process.kill(st.pid, 0); } catch { return null; }
  return `http://127.0.0.1:${st.port}/`;
}

/** Write the page (CSS inlined) into the preview dir. */
export function writePreview(slug: string, html: string, css: string): string {
  const dir = previewDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  const style = css.trim() ? `<style>\n${css}\n</style>\n` : '';
  const page = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${style}</head>`)
    : `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${html}</body></html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), page, 'utf-8');
  return dir;
}

/**
 * Start the static host for the preview (idempotent: a live server is reused).
 * The child is detached; the state file is written by the server itself.
 */
export async function startPreviewServer(slug: string): Promise<{ ok: boolean; url?: string; port?: number; error?: string }> {
  const existing = previewUrl(slug);
  if (existing) return { ok: true, url: existing, port: readPreviewState(slug)?.port };
  const dir = previewDir(slug);
  if (!fs.existsSync(path.join(dir, 'index.html'))) return { ok: false, error: 'no generated preview on disk' };

  const root = findOlympusRoot();
  const script = path.join(root, 'scripts', 'preview-server.mjs');
  if (!fs.existsSync(script)) return { ok: false, error: `preview server not found: ${script}` };
  try { fs.rmSync(path.join(dir, 'server.json'), { force: true }); } catch { /* none */ }

  const log = fs.openSync(path.join(dir, 'server.log'), 'a');
  const child = spawn(process.execPath, [script, dir, '0'], { cwd: root, detached: true, stdio: ['ignore', log, log] });
  child.unref();
  try { fs.closeSync(log); } catch { /* child owns it */ }

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const st = readPreviewState(slug);
    if (st) return { ok: true, url: `http://127.0.0.1:${st.port}/`, port: st.port };
  }
  return { ok: false, error: 'the preview server did not come up (see server.log)' };
}

export function stopPreviewServer(slug: string): boolean {
  const st = readPreviewState(slug);
  if (!st) return false;
  try { process.kill(st.pid, 'SIGTERM'); } catch { /* gone */ }
  try { fs.rmSync(path.join(previewDir(slug), 'server.json'), { force: true }); } catch { /* gone */ }
  return true;
}

/** Parse the god's answer into { html, css }: tolerate fences and prose. */
export function parsePreviewAnswer(text: string): { html: string; css: string } | null {
  const cleaned = String(text).replace(/```json/gi, '```').replace(/```/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    const html = typeof obj?.html === 'string' ? obj.html : '';
    const css = typeof obj?.css === 'string' ? obj.css : '';
    if (!html.trim()) return null;
    return { html, css };
  } catch { return null; }
}
