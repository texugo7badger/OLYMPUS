/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
// Use spawnOpencode() for cross-platform support.
import { spawnOpencode, resolveDispatchCwd } from '@/lib/opencode-spawn';
// Run vault prune as part of the heartbeat.
import { runVaultPrune, loadVaultPolicy } from '@/lib/vault-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');
const CALLIMACHUS_LOCK = path.join(OLYMPUS_HOME, 'callimachus.lock');

/**
 * POST /api/olympus/callimachus/heartbeat
 *
 * Spawns Callimachus's 7-stage brain lifecycle as a subprocess.
 * Uses a lockfile (~/.olympus/callimachus.lock) to prevent concurrent runs.
 *
 * The overlay plugin's `session.idle` hook calls this endpoint when no god
 * is active. The compact-brain button calls this endpoint with `deep: true`
 * for the weekly deep compaction (adds COMPLETE ALIASES + MERGE DUPLICATES).
 *
 * Body:
 *   { deep?: boolean }   — if true, runs deep compaction (compact-brain button)
 *
 * Returns SSE stream of progress events from Callimachus subprocess.
 *
 * Cooldown: 5 minutes for regular heartbeats, 24 hours for deep compaction.
 * The cooldown is enforced via the lockfile's mtime.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deep = body.deep === true;

    // ─── Check lockfile ────────────────────────────────────────────────
    if (fs.existsSync(CALLIMACHUS_LOCK)) {
      const stat = fs.statSync(CALLIMACHUS_LOCK);
      const ageMs = Date.now() - stat.mtimeMs;
      const cooldownMs = deep ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000; // 24h or 5min

      if (ageMs < cooldownMs) {
        const remainingMs = cooldownMs - ageMs;
        const remainingMin = Math.ceil(remainingMs / (60 * 1000));
        return NextResponse.json({
          ok: false,
          error: 'cooldown',
          message: deep
            ? `Deep compaction on cooldown. Try again in ${remainingMin} minute(s).`
            : `Callimachus heartbeat on cooldown. Try again in ${remainingMin} minute(s).`,
          cooldownEndsAt: new Date(Date.now() + remainingMs).toISOString(),
        }, { status: 429 });
      }

      // Stale lock — remove it
      try { fs.unlinkSync(CALLIMACHUS_LOCK); } catch {}
    }

    // ─── Acquire lock ──────────────────────────────────────────────────
    if (!fs.existsSync(OLYMPUS_HOME)) {
      fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
    }
    fs.writeFileSync(CALLIMACHUS_LOCK, JSON.stringify({
      pid: process.pid,
      ts: new Date().toISOString(),
      deep,
    }), 'utf-8');

    // Run vault prune before spawning Callimachus.
    // The prune respects the policy in ~/.olympus/vault-policy.json (dry-run
    // by default in v0.0.1). If autoPruneOnIdle is false, the prune is skipped
    // entirely (the user can still run it manually via the API or CLI).
    let pruneResult: any = null;
    try {
      const policy = loadVaultPolicy();
      if (policy.autoPruneOnIdle) {
        pruneResult = runVaultPrune(policy);
        if (pruneResult.hasActions) {
          console.log(`[olympus:callimachus] vault prune (${pruneResult.wasDryRun ? 'dry-run' : 'live'}): ${pruneResult.actions.length} action(s), ${(pruneResult.totalBytesAffected / (1024 * 1024)).toFixed(1)} MB affected`);
        }
      }
    } catch (pruneErr: any) {
      // Prune failure is non-fatal — Callimachus should still run.
      console.error(`[olympus:callimachus] vault prune failed: ${pruneErr.message}`);
    }

    // ─── Spawn Callimachus ───────────────────────────────────────────
    // Callimachus runs via `opencode run /callimachus-heartbeat --agent callimachus`
    // We pass --deep if the compact-brain button triggered this.
    // Use spawnOpencode() for Windows shell:true + stdin:'ignore'.
    const args = ['run', '/callimachus-heartbeat', '--agent', 'callimachus'];
    if (deep) args.push('--deep');

    const child = spawnOpencode(args, {
      // #104 (the complete class, SERVE-1 Batch C): one-shot dispatches run
      // in the lane — never the repo root (the default cwd findOlympusRoot()).
      cwd: resolveDispatchCwd(),
      extraEnv: { OLYMPUS_CALLIMACHUS_DEEP: deep ? 'true' : 'false' },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        const send = (obj: any) => {
          if (closed) return;
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { closed = true; }
        };

        send({ type: 'start', deep, ts: new Date().toISOString() });

        // Emit the prune result so the UI can show
        // what was (or would be) pruned.
        if (pruneResult) {
          send({
            type: 'vault-prune',
            ts: pruneResult.ranAt,
            wasDryRun: pruneResult.wasDryRun,
            actionCount: pruneResult.actions.length,
            bytesAffected: pruneResult.totalBytesAffected,
            actions: pruneResult.actions.slice(0, 10), // cap to first 10 for stream size
            errors: pruneResult.errors.slice(0, 5),
          });
        }

        const lineBuf: string[] = [];
        const onLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          // Try to parse as JSON (Callimachus emits JSONL events)
          if (trimmed.startsWith('{')) {
            try { send(JSON.parse(trimmed)); return; } catch {}
          }
          // Otherwise send as a log line
          send({ type: 'log', msg: trimmed });
        };

        child.stdout?.on('data', (chunk) => {
          lineBuf.push(...chunk.toString().split('\n'));
          while (lineBuf.length > 1) onLine(lineBuf.shift()!);
        });
        child.stderr?.on('data', (chunk) => {
          send({ type: 'log', msg: chunk.toString().trim(), level: 'stderr' });
        });

        child.on('close', (code) => {
          if (lineBuf.length) onLine(lineBuf.shift()!);
          send({ type: 'exit', code, ts: new Date().toISOString() });

          // Release the lock
          try { fs.unlinkSync(CALLIMACHUS_LOCK); } catch {}

          try { controller.close(); } catch {}
        });

        child.on('error', (err: any) => {
          send({ type: 'error', msg: err.message });
          try { fs.unlinkSync(CALLIMACHUS_LOCK); } catch {}
          try { controller.close(); } catch {}
          closed = true;
        });

        req.signal.addEventListener('abort', () => {
          closed = true;
          try { child.kill('SIGTERM'); } catch {}
          try { fs.unlinkSync(CALLIMACHUS_LOCK); } catch {}
          try { controller.close(); } catch {}
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e: any) {
    // Clean up lock on error
    try { fs.unlinkSync(CALLIMACHUS_LOCK); } catch {}
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/olympus/callimachus/heartbeat
 * Returns the current lock status (whether Callimachus is running).
 */
export async function GET() {
  try {
    if (!fs.existsSync(CALLIMACHUS_LOCK)) {
      return NextResponse.json({
        ok: true,
        running: false,
        message: 'Callimachus is idle.',
      });
    }
    const stat = fs.statSync(CALLIMACHUS_LOCK);
    const data = JSON.parse(fs.readFileSync(CALLIMACHUS_LOCK, 'utf-8'));
    const ageMs = Date.now() - stat.mtimeMs;
    return NextResponse.json({
      ok: true,
      running: true,
      pid: data.pid,
      startedAt: data.ts,
      deep: data.deep === true,
      ageMs,
      message: `Callimachus is running (${data.deep ? 'deep' : 'regular'} mode, started ${Math.round(ageMs / 1000)}s ago).`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
