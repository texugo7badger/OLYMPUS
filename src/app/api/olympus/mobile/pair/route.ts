/**
 * GET  /api/olympus/mobile/pair  → the QR payload (LAN URL + token + mode)
 * POST /api/olympus/mobile/pair  → { action: 'set-mode', mode } | { action: 'rotate' }
 *
 * The payload carries the bearer token, so the route is gated by `requireAuth`:
 * loopback-only Host/Origin in local mode, bearer token in lan/tunnel mode.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { requireAuth } from '@/lib/auth';
import {
  buildPairPayload,
  ensureSessionToken,
  olympusHome,
  readNetworkMode,
  tokenPath,
  writeNetworkMode,
  type NetworkMode,
} from '@/lib/mobile-pairing';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  try {
    const payload = await buildPairPayload({ hostHeader: req.headers.get('host') });
    return NextResponse.json(
      { ok: true, ...payload },
      { headers: NO_CACHE_HEADERS },
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'pairing failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  try {
    if (body?.action === 'rotate') {
      // Revocation: a new secret invalidates every paired phone.
      fs.mkdirSync(olympusHome(), { recursive: true });
      const crypto = await import('node:crypto');
      const token = crypto.randomBytes(32).toString('base64url');
      fs.writeFileSync(tokenPath(), `${token}\n`, { mode: 0o600 });
      const payload = await buildPairPayload({ hostHeader: req.headers.get('host') });
      return NextResponse.json({ ok: true, rotated: true, ...payload }, { headers: NO_CACHE_HEADERS });
    }
    if (body?.action === 'set-mode') {
      const mode = String(body.mode || '') as NetworkMode;
      if (mode !== 'local' && mode !== 'lan' && mode !== 'tunnel') {
        return NextResponse.json({ ok: false, error: 'mode must be local | lan | tunnel' }, { status: 400 });
      }
      ensureSessionToken();
      writeNetworkMode(mode);
      const current = readNetworkMode();
      return NextResponse.json({
        ok: true,
        mode: current,
        restartRequired: true,
        note: 'The bind is chosen when OLYMPUS starts. Restart the desktop app to apply it.',
      });
    }
    return NextResponse.json({ ok: false, error: 'action must be set-mode | rotate' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'pairing update failed' }, { status: 500 });
  }
}
