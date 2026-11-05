/**
 * GET/POST /api/olympus/version — v0.0.81: the stable plug in Settings.
 *
 * The stable manifest is written by scripts/mark-stable.mjs ONLY when the
 * full battery is green. Settings shows the running version, the stable
 * version + its test evidence, and the channel. Development versions are
 * selectable only when the stable channel is disabled.
 *
 * Honest limit: this build selects the CHANNEL; the binary swap belongs to
 * the v0.1.0 installer/updater.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function channelPath(): string {
  return path.join(process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'version-channel.json');
}

function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function currentVersion(): string {
  try { return fs.readFileSync(path.join(process.cwd(), 'VERSION'), 'utf-8').trim(); } catch { /* package */ }
  try { return String(readJson(path.join(process.cwd(), 'package.json'))?.version ?? '0.0.0'); } catch { return '0.0.0'; }
}

function channel(): { channel: 'stable' | 'development'; version: string | null } {
  const raw = readJson(channelPath());
  const ch = raw?.channel === 'development' ? 'development' : 'stable';
  return { channel: ch, version: typeof raw?.version === 'string' ? raw.version : null };
}

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const stable = readJson(path.join(process.cwd(), 'public', 'stable.json'));
  const versions = readJson(path.join(process.cwd(), 'public', 'versions.json'));
  return NextResponse.json({
    ok: true,
    current: currentVersion(),
    stable: stable ?? null,
    versions: Array.isArray(versions?.versions) ? versions.versions : [],
    channel: channel(),
  }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const ch = body?.channel;
  if (ch !== 'stable' && ch !== 'development') {
    return NextResponse.json({ ok: false, error: "channel must be 'stable' or 'development'" }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const version = typeof body?.version === 'string' && body.version.trim() ? body.version.trim() : null;
  try {
    fs.mkdirSync(path.dirname(channelPath()), { recursive: true });
    fs.writeFileSync(channelPath(), JSON.stringify({ channel: ch, version, updatedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'could not save the channel' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
  return NextResponse.json({ ok: true, channel: { channel: ch, version } }, { headers: NO_CACHE_HEADERS });
}
