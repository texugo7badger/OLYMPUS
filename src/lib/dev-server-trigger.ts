/**
 * dev-server-trigger.ts — #110 (FLUENCY-1, Batch D): the deterministic
 * dev-server trigger (rides #86's open automation half). When a frontend
 * artifact lands — the exit gate or a hop batch completes — a lane whose
 * package.json carries a dev script AND a frontend marker gets its dev
 * server STARTED automatically, so the user SEES it in the OLYMPUS live
 * preview.
 *
 * The #105 doctrine governs the claim: the trigger NEVER narrates
 * "running" — it returns the manager's probe-verified status (host/port/
 * latency) or the honest refusal ("unverified — no probe evidence").
 *
 * The frozen pair (live-preview.tsx + its route) stays untouched — the
 * status route already exists (#86/SERVE-1); the panel picks the server up
 * from the manager.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as devServerManager from './dev-server-manager';

/** The frontend marker set — a dev script alone is not enough (a plain
 *  node server is not the preview the user asked to see). */
export const FRONTEND_MARKERS = ['next', 'vite', 'react-scripts', 'astro', 'svelte', '@angular', 'nuxt', 'remix'];

export interface FrontendGate {
  ok: boolean;
  reason: string;
  devScript?: string;
}

/** The deterministic gate: dev script + frontend marker, read from disk. */
export function detectFrontendDevScript(laneRoot: string): FrontendGate {
  const pkgPath = join(laneRoot, 'package.json');
  if (!existsSync(pkgPath)) return { ok: false, reason: 'no package.json — not a runnable project yet' };
  let pkg: { scripts?: Record<string, unknown>; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return { ok: false, reason: 'package.json unreadable' };
  }
  const dev = pkg?.scripts?.dev;
  if (typeof dev !== 'string' || !dev.trim()) return { ok: false, reason: "no 'dev' script — nothing to run" };
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const depNames = Object.keys(deps);
  const marker = FRONTEND_MARKERS.find(
    (m) => depNames.some((d) => d === m || d.startsWith(m + '/')) || dev.includes(m),
  );
  if (!marker) {
    return { ok: false, reason: `no frontend marker (${FRONTEND_MARKERS.join('/')}) — npm run dev would not serve a preview` };
  }
  return { ok: true, reason: `frontend marker '${marker}' + a dev script`, devScript: dev };
}

export interface DevServerTriggerResult {
  triggered: boolean;
  reason: string;
  status?: {
    running: boolean;
    host: string | null;
    port: number | null;
    url: string | null;
    responseTimeMs: number | null;
    note: string;
  };
}

// ─── #118 (PLANO-MASTER-1 B4): the growing patience — the flat 15s dies ────────

/** The total probe patience. Default 90s: a cold next + Tailwind on a slow
 *  disk does not fit the old flat 15s (the s0 lesson — and my own battery
 *  harness's flat 300s killed the exit-gate suite at its tail once). */
export const DEFAULT_DEV_PROBE_PATIENCE_MS = 90_000;
/** The dead-child fast window. Once it elapses, a DEAD pid refuses fast,
 *  NAMING the death + the log tail — the s0 specimen (`sh: 1: next: not
 *  found`) died in ~1s and the terminal still showed 15s of silence. */
export const DEFAULT_DEV_FAST_SILENCE_MS = 15_000;

export function resolveDevProbePatienceMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.OLYMPUS_DEV_PROBE_PATIENCE_MS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DEV_PROBE_PATIENCE_MS;
}

export function resolveDevFastSilenceMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.OLYMPUS_DEV_FAST_SILENCE_MS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DEV_FAST_SILENCE_MS;
}

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** The log tail, surfaced INTO the refusal — the death is legible in the
 *  terminal (the s0 `next: not found` the user never saw). */
function readLogTail(logFile: string, maxChars = 240): string {
  try {
    const raw = readFileSync(logFile, 'utf-8');
    return (raw.length > maxChars ? raw.slice(-maxChars) : raw).replace(/\s+/g, ' ').trim();
  } catch { return ''; }
}

/**
 * The trigger: gate -> start -> PROBE. The claim carries probe evidence
 * (#105) or the honest refusal. Never throws — a trigger failure must
 * never break the run that produced the artifacts.
 */
export async function maybeStartDevServer(projectSlug: string, laneRoot: string): Promise<DevServerTriggerResult> {
  try {
    const gate = detectFrontendDevScript(laneRoot);
    if (!gate.ok) return { triggered: false, reason: `not triggered — ${gate.reason}` };

    const started = await devServerManager.start(projectSlug);
    if (!started.ok) {
      return { triggered: false, reason: `start refused — ${started.error ?? 'unknown error'} (pid ${started.pid ?? '?'})` };
    }

    // #118 (PLANO-MASTER-1 B4): the GROWING patience, staged:
    //   - the FAST window (default 15s, env-tunable): once it elapses, a
    //     DEAD pid refuses fast — the death NAMED + the log tail surfaced
    //     (the s0 specimen died in ~1s; the old flat wait showed 15s of
    //     silence over the corpse);
    //   - the PATIENCE ceiling (default 90s, env-tunable): a LIVE pid
    //     compiling a cold next + Tailwind gets the full window.
    // The #105 doctrine governs both refusals: probe evidence or the
    // honest "unverified — no probe evidence" — never a narrated "running".
    const patienceMs = resolveDevProbePatienceMs();
    const fastWindowMs = resolveDevFastSilenceMs();
    const t0 = Date.now();
    let status = await devServerManager.status(projectSlug);
    while (!status.running) {
      const waited = Date.now() - t0;
      const pid = started.state?.pid ?? started.pid ?? null;
      if (pid !== null && waited >= fastWindowMs && !isPidAlive(pid)) {
        const tail = readLogTail(String(started.state?.logFile ?? ''));
        return {
          triggered: false,
          reason: `start issued (pid ${pid}) but the dev process DIED after ${Math.round(waited / 1000)}s — unverified — no probe evidence (#105)${tail ? `; log tail: ${tail}` : ''}`,
        };
      }
      if (waited >= patienceMs) {
        return {
          triggered: false,
          reason: `start issued (pid ${started.pid ?? '?'}) but the probe stayed silent for :${started.port ?? '?'} after ${Math.round(patienceMs / 1000)}s — unverified — no probe evidence (#105)`,
        };
      }
      await new Promise((r) => setTimeout(r, 500));
      status = await devServerManager.status(projectSlug);
    }
    return {
      triggered: true,
      reason: `probe-green ${status.host ?? 'ipv4'} :${status.port} in ${status.responseTimeMs}ms — the live preview can open ${status.url}`,
      status: {
        running: true,
        host: status.host,
        port: status.port,
        url: status.url,
        responseTimeMs: status.responseTimeMs,
        note: status.note,
      },
    };
  } catch (e) {
    return { triggered: false, reason: `trigger failed (non-fatal): ${e instanceof Error ? e.message : String(e)}` };
  }
}
