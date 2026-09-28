/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getVaultRoot,
  setVaultRoot,
  resetVaultRoot,
  getDefaultVaultRoot,
  isCustomVaultRoot,
} from '@/lib/vault-root';
import { existsSync, mkdirSync } from 'node:fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/vault/root
 *   Returns the current vault root + whether it's the default or custom.
 */
export async function GET() {
  try {
    const root = getVaultRoot();
    const exists = existsSync(root);
    return NextResponse.json({
      ok: true,
      root,
      exists,
      isCustom: isCustomVaultRoot(),
      default: getDefaultVaultRoot(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/olympus/vault/root
 *   Body: { action: 'set' | 'reset', path?: string }
 *   - action='set': switches the vault root to `path`. Creates the directory
 *     if it doesn't exist. The user must restart OLYMPUS for the change to
 *     take effect (the OpenCode overlay plugin reads the vault path at startup).
 *   - action='reset': resets to the default (~/OLYMPUS-VAULT/).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === 'set') {
      const path = typeof body.path === 'string' ? body.path.trim() : '';
      if (!path) {
        return NextResponse.json({ ok: false, error: 'Missing "path" in body' }, { status: 400 });
      }
      // Create the directory if it doesn't exist.
      try {
        mkdirSync(path, { recursive: true });
      } catch (e: any) {
        return NextResponse.json({ ok: false, error: `Failed to create vault directory: ${e.message}` }, { status: 500 });
      }
      setVaultRoot(path);
      return NextResponse.json({
        ok: true,
        root: path,
        message: 'Vault root switched. Restart OLYMPUS for the change to take effect (the OpenCode overlay plugin reads the vault path at startup).',
      });
    }

    if (action === 'reset') {
      resetVaultRoot();
      return NextResponse.json({
        ok: true,
        root: getDefaultVaultRoot(),
        message: 'Vault root reset to default. Restart OLYMPUS for the change to take effect.',
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Missing or invalid `action`. Expected "set" or "reset".' },
      { status: 400 },
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
