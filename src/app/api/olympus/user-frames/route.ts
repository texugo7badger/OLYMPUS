/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { requireAuth } from '@/lib/auth';
import { isValidFrameUrl, defaultSandboxFor } from '@/lib/custom-frames-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FRAMES_FILE = path.join(os.homedir(), '.olympus', 'user-frames.json');

export interface UserFrame { id: string; displayName: string; url: string; sandbox: string; custom: true; createdAt: string; }

function loadFrames(): UserFrame[] {
  try { if (!fs.existsSync(FRAMES_FILE)) return []; const r = JSON.parse(fs.readFileSync(FRAMES_FILE, 'utf-8')); return Array.isArray(r) ? r : []; } catch { return []; }
}
function saveFrames(f: UserFrame[]): void { try { fs.mkdirSync(path.dirname(FRAMES_FILE), { recursive: true }); fs.writeFileSync(FRAMES_FILE, JSON.stringify(f, null, 2), 'utf-8'); } catch {} }

export async function GET(req: NextRequest) {
  const cssId = req.nextUrl.searchParams.get('css');
  if (cssId) {
    try {
      const id = String(cssId).replace(/[^a-zA-Z0-9_-]/g, ''); if (!id) return new Response('invalid id', { status: 400 });
      const f = path.join(os.homedir(), '.olympus', 'frame-css', `${id}.css`);
      if (!fs.existsSync(f)) return new Response('', { status: 200, headers: { 'Content-Type': 'text/plain' } });
      return new Response(fs.readFileSync(f, 'utf-8'), { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache' } });
    } catch (e: any) { return new Response(`error: ${e.message}`, { status: 500 }); }
  }
  return NextResponse.json({ frames: loadFrames() });
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req); if (authError) return authError;
  try {
    const body = await req.json();
    if (body.action === 'add') {
      const { displayName, url, sandbox } = body;
      if (!displayName || typeof displayName !== 'string') return NextResponse.json({ error: 'displayName required' }, { status: 400 });
      if (!url || typeof url !== 'string' || !isValidFrameUrl(url)) return NextResponse.json({ error: 'url must be valid http(s)://' }, { status: 400 });
      const frame: UserFrame = { id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, displayName: String(displayName).slice(0, 100), url: String(url), sandbox: typeof sandbox === 'string' && sandbox.trim() ? String(sandbox) : defaultSandboxFor(url), custom: true, createdAt: new Date().toISOString() };
      const frames = loadFrames(); frames.push(frame); saveFrames(frames);
      return NextResponse.json({ ok: true, frame });
    }
    if (body.action === 'delete') {
      const { id } = body; if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      saveFrames(loadFrames().filter(f => f.id !== id)); return NextResponse.json({ ok: true, deleted: id });
    }
    return NextResponse.json({ error: `unknown action: ${body.action}` }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
