/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
// Use execSync instead of spawnSync. Turbopack statically
// analyzes spawnSync's array arguments and tries to resolve file paths as
// module imports, causing a fatal "Module not found" build error. execSync
// with a template string is treated as a shell command (not a module path),
// so it only produces non-fatal NFT warnings. This matches the pattern
// already used by src/app/api/olympus/vault/init/route.ts.
import { execSync } from 'child_process';
// Invalidate the warm-server cache after a strategy switch — apply-strategy.js
// kills `opencode serve` (it keeps its startup config in memory), so the
// Next.js-side serverPromise must be dropped or the next message posts to a
// dead server.
import { invalidateServer } from '@/lib/opencode-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LLM_PROVIDERS_PATH = path.join(os.homedir(), '.olympus', 'llm-providers.json');

/**
 * GET /api/olympus/strategy
 *
 * Returns the active LLM strategy from ~/.olympus/llm-providers.json.
 * Falls back to 'go-balanced' (the v0.0.1 default) if the file is missing
 * or doesn't contain a strategy field.
 */
export async function GET() {
  try {
    let strategy = 'go-balanced';
    if (fs.existsSync(LLM_PROVIDERS_PATH)) {
      try {
        const raw = JSON.parse(fs.readFileSync(LLM_PROVIDERS_PATH, 'utf-8'));
        if (typeof raw.strategy === 'string' && raw.strategy) {
          strategy = raw.strategy;
        }
      } catch { /* malformed — fall back to default */ }
    }
    return NextResponse.json({ ok: true, strategy });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/olympus/strategy
 *
 * Body: { strategy: 'go-balanced' | 'go-budget' | 'go-max-quality' | `custom-${string}` }
 *
 * Updates ~/.olympus/llm-providers.json's strategy field, then runs
 * `node scripts/apply-strategy.js --strategy <id>` to rewrite opencode.json
 * with the new per-god model assignments. Returns the new strategy + the
 * apply-strategy.js stdout for verification.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const strategy = typeof body.strategy === 'string' ? body.strategy : '';
    if (!strategy) {
      return NextResponse.json(
        { ok: false, error: 'Missing "strategy" in body' },
        { status: 400 },
      );
    }

    // Validate strategy format to prevent shell injection (since we pass it
    // to execSync as part of a command string). Accepted formats:
    //   go-* (max-quality/balanced/budget), zen-* (max-quality/balanced/budget),
    //   free-* (free-openrouter/free-big-pickle/free-nvidia-build),
    //   custom-<id>
    if (!/^(go-[a-z-]+|zen-[a-z-]+|free-[a-z-]+|custom-[a-zA-Z0-9_-]+)$/.test(strategy)) {
      return NextResponse.json(
        { ok: false, error: `Invalid strategy format: "${strategy}". Expected go-*|zen-*|free-*|custom-*` },
        { status: 400 },
      );
    }

    // 1. Persist the strategy field in ~/.olympus/llm-providers.json.
    let existing: any = {};
    if (fs.existsSync(LLM_PROVIDERS_PATH)) {
      try { existing = JSON.parse(fs.readFileSync(LLM_PROVIDERS_PATH, 'utf-8')); } catch { existing = {}; }
    }
    existing.strategy = strategy;
    fs.mkdirSync(path.dirname(LLM_PROVIDERS_PATH), { recursive: true });
    fs.writeFileSync(LLM_PROVIDERS_PATH, JSON.stringify(existing, null, 2), 'utf-8');

    // 2. Run apply-strategy.js to rewrite opencode.json's agent models.
    // Use process.cwd() + execSync (not spawnSync).
    // Turbopack statically analyzes spawnSync's array args and tries to
    // resolve file paths as module imports → fatal build error. execSync
    // with a template string is treated as a shell command → only non-fatal
    // NFT warnings. The /*turbopackIgnore: true*/ comment suppresses even
    // those warnings.
    const root = process.cwd();
    const applyScript = path.join(/*turbopackIgnore: true*/ root, 'scripts', 'apply-strategy.js');
    if (!fs.existsSync(applyScript)) {
      return NextResponse.json(
        { ok: false, error: `apply-strategy.js not found at ${applyScript}`, strategy },
        { status: 500 },
      );
    }
    // strategy is validated above (regex), so shell injection is not possible.
    let stdout: string;
    try {
      stdout = execSync(`node "${applyScript}" --strategy ${strategy}`, {
        cwd: root,
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // apply-strategy.js killed the warm server (its config is loaded at
      // startup) — drop the cached handle so the next message cold-starts
      // against the fresh opencode.json.
      invalidateServer();
    } catch (err: any) {
      return NextResponse.json(
        {
          ok: false,
          error: `apply-strategy.js failed: ${err.stderr || err.stdout || err.message}`,
          strategy,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      strategy,
      stdout,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
