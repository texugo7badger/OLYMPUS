/**
 * transport.ts — the pluggable hop transport (v0.0.24, #241).
 *
 *   - `spawn` — the proven per-hop `opencode run --format json` path;
 *   - `warm`  — the per-lane `opencode serve` (warm-server.ts);
 *   - `auto`  — warm first, spawn on any setup/transport failure (default).
 *
 * Both return the SAME `{code, stdout, stderr}` dialect, so the walker's
 * classifier, telemetry and park logic are untouched.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { spawn } from 'node:child_process';
import { spawnOpencode } from '@/lib/opencode-spawn';
import { runWarmHop, WarmTransportUnavailable } from './warm-server';
import { suspendCovers } from '@/lib/power-suspend';
import { decideCeiling, hardCeilingMs } from './progress';

export type HopTransportMode = 'auto' | 'spawn' | 'warm';

export interface HopTransportRequest {
  /** The CLI args for the spawn lane (`['run', '--model', ...]`). */
  args: string[];
  prompt: string;
  agent: string;
  /** The model lane id (e.g. opencode-go/deepseek-v4.1-flash). */
  model?: string;
  cwd: string;
  timeoutMs: number;
  /** v0.0.52 — absolute per-attempt cap. The campaign deadline passes the
   *  remaining budget here so a hop can never extend past the project. */
  hardTimeoutMs?: number;
  firstByteMs: number;
  silenceMs: number;
  onNotice?: (msg: string) => void;
}

export interface HopTransportResult {
  code: number | null;
  stdout: string;
  stderr: string;
  transport: 'warm' | 'spawn';
  sessionId?: string | null;
}

export interface HopTransport {
  readonly mode: 'warm' | 'spawn';
  run(req: HopTransportRequest): Promise<HopTransportResult>;
}

/** The spawn path — the pre-v0.0.24 behavior, byte-for-byte. */
export class SpawnTransport implements HopTransport {
  readonly mode = 'spawn' as const;

  run(req: HopTransportRequest): Promise<HopTransportResult> {
    return new Promise((resolve) => {
      const child = spawnOpencode(req.args, { cwd: req.cwd, extraEnv: { OLYMPUS_LANE_GOD: req.agent } });
      let stdout = '';
      let stderr = '';
      let firstByteAt: number | null = null;
      let runStart = Date.now();
      let lastOutputAt = Date.now();
      let ceilingDeadline = runStart + req.timeoutMs;
      const hardDeadline = runStart + (req.hardTimeoutMs ?? hardCeilingMs(req.timeoutMs));
      let ceilingTimer: ReturnType<typeof setTimeout> | null = null;
      let firstByteTimer: ReturnType<typeof setTimeout> | null = null;
      let silenceTimer: ReturnType<typeof setTimeout> | null = null;
      const clearAll = () => {
        if (ceilingTimer) clearTimeout(ceilingTimer);
        if (firstByteTimer) clearTimeout(firstByteTimer);
        if (silenceTimer) clearTimeout(silenceTimer);
        ceilingTimer = firstByteTimer = silenceTimer = null;
      };
      // Epic N: a frozen machine is not a stalled provider. Each deadline
      // re-arms when its window overlaps an OS suspend; the next window starts
      // after the resume, so a healthy turn is never killed by the freeze.
      const armCeiling = () => {
        ceilingTimer = setTimeout(() => {
          const now = Date.now();
          if (suspendCovers(runStart, now)) { runStart = now; ceilingDeadline = now + req.timeoutMs; armCeiling(); return; }
          // A long turn that is still producing output is not a stuck turn
          // (the 2026-11-01 AIME v8/p3 specimen). Extend to the hard cap.
          const decision = decideCeiling({
            deadline: ceilingDeadline,
            hardDeadline,
            lastProgressAt: lastOutputAt,
            now,
          });
          if (decision.extended) {
            ceilingDeadline = decision.deadline;
            stderr += `\nhop-ceiling-extended: still producing output ${Math.round(decision.idleMs / 1000)}s ago; new deadline +${Math.round((decision.deadline - now) / 1000)}s (hard cap in ${Math.max(0, Math.round((hardDeadline - Date.now()) / 1000))}s)`;
            armCeiling();
            return;
          }
          try { child.kill('SIGKILL'); } catch { /* gone */ }
        }, Math.max(0, ceilingDeadline - Date.now()));
      };
      const armFirstByte = () => {
        firstByteTimer = setTimeout(() => {
          if (firstByteAt !== null) return;
          if (suspendCovers(runStart, Date.now())) { runStart = Date.now(); armFirstByte(); return; }
          try { child.kill('SIGKILL'); } catch { /* gone */ }
          stderr += `\nhop-first-byte-timeout (OLYMPUS_HOP_FIRST_BYTE_MS ${req.firstByteMs}ms): the turn produced ZERO output — the provider pool stalled before the first token (the empty-reasoning stall class; transient pool contention — retries absorb it)`;
        }, req.firstByteMs);
      };
      const armSilence = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        lastOutputAt = Date.now();
        silenceTimer = setTimeout(() => {
          if (suspendCovers(lastOutputAt, Date.now())) { armSilence(); return; }
          try { child.kill('SIGKILL'); } catch { /* gone */ }
          stderr += `\nhop-first-byte-timeout (OLYMPUS_HOP_SILENCE_MS ${req.silenceMs}ms rolling): the turn went SILENT mid-run after producing output — a step's provider request stalled (transient pool contention — retries absorb it)`;
        }, req.silenceMs);
      };
      armCeiling();
      armFirstByte();
      child.stdout?.on('data', (d) => {
        if (firstByteAt === null && String(d).trim()) firstByteAt = Date.now();
        stdout += String(d);
        if (String(d).trim()) armSilence();
      });
      child.stderr?.on('data', (d) => { stderr += String(d); });
      child.on('error', (e) => {
        clearAll();
        resolve({ code: -1, stdout, stderr: stderr + String(e), transport: 'spawn' });
      });
      child.on('close', (code) => {
        clearAll();
        resolve({ code, stdout, stderr, transport: 'spawn' });
      });
      armSilence();
    });
  }
}

/** The warm path — a session per hop on the lane's persistent server. */
export class WarmHopTransport implements HopTransport {
  readonly mode = 'warm' as const;

  async run(req: HopTransportRequest): Promise<HopTransportResult> {
    const r = await runWarmHop({
      laneRoot: req.cwd,
      agent: req.agent,
      model: req.model,
      text: req.prompt,
      timeoutMs: req.timeoutMs,
      firstByteMs: req.firstByteMs,
      silenceMs: req.silenceMs,
      onNotice: req.onNotice,
    });
    return { code: r.code, stdout: r.stdout, stderr: r.stderr, transport: 'warm', sessionId: r.sessionId };
  }
}

/** Warm first, spawn on any warm failure. The default lane. */
export class AutoTransport implements HopTransport {
  readonly mode = 'warm' as const;
  private warm = new WarmHopTransport();
  private spawn = new SpawnTransport();

  async run(req: HopTransportRequest): Promise<HopTransportResult> {
    try {
      const warm = await this.warm.run(req);
      // v0.0.30 — A WARM TURN THAT STALLS IS NOT A HOP FAILURE YET.
      // The d3-media specimen (22:07/22:34/22:52) parked three times on a
      // warm silence/ceiling while the spawn lane was healthy. The old
      // fallback only covered SETUP failures; a stalled turn returned
      // `code:null` and parked. Retry the SAME hop once on spawn, with a
      // bounded budget, before the walker parks it.
      const stalled = warm.code === null && /ceiling-kill|hop-first-byte-timeout|SILENT|socket hang up|timed out/i.test(warm.stderr || '');
      if (stalled) {
        req.onNotice?.('warm turn stalled — retrying the same hop on the spawn transport (bounded)');
        return this.spawn.run({ ...req, timeoutMs: Math.min(req.timeoutMs, 10 * 60_000) });
      }
      return warm;
    } catch (e: any) {
      const reason = e instanceof WarmTransportUnavailable ? e.message : (e?.message || String(e));
      req.onNotice?.(`warm transport unavailable — falling back to spawn: ${reason}`);
      return this.spawn.run(req);
    }
  }
}

export function resolveHopTransportMode(env: NodeJS.ProcessEnv = process.env): HopTransportMode {
  const v = (env.OLYMPUS_HOP_TRANSPORT ?? 'auto').trim().toLowerCase();
  return v === 'spawn' || v === 'warm' || v === 'auto' ? v : 'auto';
}

let singleton: HopTransport | null = null;
let singletonMode: HopTransportMode | null = null;

export function createHopTransport(mode: HopTransportMode = resolveHopTransportMode()): HopTransport {
  if (singleton && singletonMode === mode) return singleton;
  singleton = mode === 'spawn' ? new SpawnTransport() : mode === 'warm' ? new WarmHopTransport() : new AutoTransport();
  singletonMode = mode;
  return singleton;
}
