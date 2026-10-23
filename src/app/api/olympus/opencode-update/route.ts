/**
 * /api/olympus/opencode-update — the OLYMPUS-controlled OpenCode v2 update
 * lane (#212).
 *
 * GET  ?force=1   → {installed, latest, updateAvailable, source, error?}
 * POST            → applies `npm install @opencode/cli@latest
 *                   @opencode/plugin@latest` and re-runs the CLI's
 *                   postinstall when the bin is still the stub. The warm
 *                   serve keeps the OLD binary until OLYMPUS restarts.
 *
 * The v2 CLI never auto-updates itself under OLYMPUS (every spawned
 * process carries OPENCODE_DISABLE_AUTOUPDATE=1); this route is the only
 * update path, and it reports honestly when the registry is unreachable.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { checkOpencodeUpdate, resetOpencodeUpdateCache } from '@/lib/opencode-update';
import { findOlympusRoot } from '@/lib/opencode-spawn';
import { appendActivity } from '@/lib/activity-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let applying = false;

function tail(text: string, max = 4000): string {
  return text.length > max ? text.slice(-max) : text;
}

function run(command: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(command, args, { cwd, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
    }, timeoutMs);
    child.stdout?.on('data', (d) => { output += String(d); });
    child.stderr?.on('data', (d) => { output += String(d); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: null, output: output + String(e?.message || e) }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output }); });
  });
}

/** The CLI ships a JS stub when its own postinstall was skipped. */
function cliBinIsStub(root: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', '@opencode', 'cli', 'package.json'), 'utf-8'));
    const rel = Object.values(pkg?.bin ?? {})[0];
    if (typeof rel !== 'string') return false;
    const bin = path.join(root, 'node_modules', '@opencode', 'cli', rel);
    return fs.existsSync(bin) && fs.statSync(bin).size < 1024;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const force = new URL(req.url).searchParams.get('force') === '1';
  const status = await checkOpencodeUpdate({ force });
  return NextResponse.json(status, {
    headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
  });
}

export async function POST(req: NextRequest) {
  if (process.env.OLYMPUS_DISABLE_SELF_UPDATE === '1') {
    return NextResponse.json({ ok: false, error: 'Self-update is disabled (OLYMPUS_DISABLE_SELF_UPDATE=1).' }, { status: 403 });
  }
  if (applying) {
    return NextResponse.json({ ok: false, error: 'An update is already running.' }, { status: 409 });
  }
  applying = true;
  const root = findOlympusRoot();
  try {
    const install = await run(
      'npm',
      ['install', '@opencode/cli@latest', '@opencode/plugin@latest', '--no-audit', '--no-fund'],
      root,
      5 * 60_000,
    );

    // Repair the stub when dependency scripts are disabled in this
    // environment (the observed npm config: the bin is a 229-byte shim that
    // exits 1 with "postinstall script was not run").
    let repair: { code: number | null; output: string } | null = null;
    if (install.code === 0 && cliBinIsStub(root)) {
      repair = await run(
        process.execPath,
        [path.join(root, 'node_modules', '@opencode', 'cli', 'postinstall.mjs')],
        root,
        2 * 60_000,
      );
    }

    resetOpencodeUpdateCache();
    const status = await checkOpencodeUpdate({ force: true, root });
    const ok = install.code === 0 && (repair === null || repair.code === 0) && !cliBinIsStub(root);

    try {
      appendActivity({
        god: 'system',
        action: 'opencode-update',
        msg: ok
          ? `OpenCode CLI updated to ${status.installed ?? 'latest'}${status.latest ? ` (npm latest ${status.latest})` : ''} — restart OLYMPUS to load the new binary.`
          : `OpenCode CLI update failed (install exit ${install.code}${repair ? `, postinstall exit ${repair.code}` : ''}).`,
        meta: { installed: status.installed, latest: status.latest, ok, command: status.applyCommand },
      });
    } catch { /* the feed never blocks the update report */ }

    return NextResponse.json({
      ok,
      installed: status.installed,
      latest: status.latest,
      updateAvailable: status.updateAvailable,
      restartRequired: ok,
      output: tail(install.output + (repair ? `\n[postinstall]\n${repair.output}` : '')),
      error: ok ? undefined : 'The update did not complete — see output.',
    });
  } finally {
    applying = false;
  }
}
