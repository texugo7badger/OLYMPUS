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
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* gone */ }
      }, req.timeoutMs);
      const firstByteTimer = setTimeout(() => {
        if (firstByteAt !== null) return;
        try { child.kill('SIGKILL'); } catch { /* gone */ }
        stderr += `\nhop-first-byte-timeout (OLYMPUS_HOP_FIRST_BYTE_MS ${req.firstByteMs}ms): the turn produced ZERO output — the provider pool stalled before the first token (the empty-reasoning stall class; transient pool contention — retries absorb it)`;
      }, req.firstByteMs);
      let silenceTimer: ReturnType<typeof setTimeout> | null = null;
      const armSilence = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* gone */ }
          stderr += `\nhop-first-byte-timeout (OLYMPUS_HOP_SILENCE_MS ${req.silenceMs}ms rolling): the turn went SILENT mid-run after producing output — a step's provider request stalled (transient pool contention — retries absorb it)`;
        }, req.silenceMs);
      };
      child.stdout?.on('data', (d) => {
        if (firstByteAt === null && String(d).trim()) firstByteAt = Date.now();
        stdout += String(d);
        if (String(d).trim()) armSilence();
      });
      child.stderr?.on('data', (d) => { stderr += String(d); });
      child.on('error', (e) => {
        clearTimeout(timer);
        clearTimeout(firstByteTimer);
        if (silenceTimer) clearTimeout(silenceTimer);
        resolve({ code: -1, stdout, stderr: stderr + String(e), transport: 'spawn' });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        clearTimeout(firstByteTimer);
        if (silenceTimer) clearTimeout(silenceTimer);
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
      return await this.warm.run(req);
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
