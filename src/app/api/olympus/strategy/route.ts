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
import { killWarmServerForStrategy } from '@/lib/opencode-session';
import { readStrategyState, writeStrategyState } from '@/lib/strategy-state';

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
    // v0.0.22 — strategy.json is the ONE source of truth (W2). The legacy
    // llm-providers.json is mirrored by writeStrategyState/readStrategyState.
    const state = readStrategyState();
    strategy = state.strategy;
    return NextResponse.json({ ok: true, strategy, appliedAt: state.appliedAt, agentCount: state.agentCount });
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

    // v0.0.22 — The free tier is RETIRED. Any free-* strategy is refused.
    // The user's own hardware path is `local` (run `olympus apply-strategy local`).
    // Paid plans: `go-*`, `zen-*`. User's own paid key: `byok-*`.
    // Legacy saved configs with free-* must migrate; the freeze refuses them.
    if (strategy.startsWith('free-')) {
      return NextResponse.json(
        { ok: false, error: `The free tier is retired (v0.0.22). Strategy "${strategy}" cannot be applied. Choose: go-*, zen-*, byok-*, custom-*, or the new "local" strategy (run "olympus apply-strategy local" for your own hardware — see docs/LOCAL-LLM.md).` },
        { status: 400 },
      );
    }

    // Validate strategy format to prevent shell injection (since we pass it
    // to execSync as part of a command string). Accepted formats:
    //   go-* (max-quality/balanced/budget), zen-* (max-quality/balanced/budget),
    //   byok-*, custom-<id>, local (the user's own hardware, zero-cost path in v0.0.22)
    if (!/^(go-[a-z-]+|zen-[a-z-]+|byok-[a-z-]+|custom-[a-zA-Z0-9_-]+|local)$/.test(strategy)) {
      return NextResponse.json(
        { ok: false, error: `Invalid strategy format: "${strategy}". Expected go-*|zen-*|byok-*|custom-*|local (free-* is retired — see docs/LOCAL-LLM.md)` },
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
    let deferred = false;
    try {
      stdout = execSync(`node "${applyScript}" --strategy ${strategy}`, {
        cwd: root,
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // #STRATEGY-RESPECT: the warm serve KEEPS its boot config until it
      // dies — a switch must KILL it (our child or the guarded adopted
      // pid), or every session keeps riding the previous strategy's lanes
      // (the 'marked free but kept riding GO' specimen). #176: when a turn
      // is streaming the kill is DEFERRED until idle — the live turn is
      // never cut; the next prompt cold-starts on the fresh config.
      deferred = killWarmServerForStrategy().deferred;
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

    // 3. v0.0.22 (W2) — record the apply in the ONE state file. The UI and
    // every reader (run-state, providers, self-check) now agree by
    // construction, never by a reconcile band-aid.
    let applied: ReturnType<typeof writeStrategyState> | null = null;
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(root, 'opencode.json'), 'utf-8'));
      applied = writeStrategyState({
        strategy,
        agentCount: Object.keys(cfg?.agent ?? {}).length,
        plugins: Array.isArray(cfg?.plugin) ? cfg.plugin : null,
        noOp: false,
      });
    } catch { /* the apply itself already succeeded; state detail is best-effort */ }

    return NextResponse.json({
      ok: true,
      strategy,
      stdout,
      deferred,
      applied,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
