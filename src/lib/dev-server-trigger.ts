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

    // The server needs a moment to boot — poll the probe briefly. Bounded
    // and deterministic-first: the probe is the truth both ways, and the
    // refusal names the wait honestly.
    const deadline = Date.now() + 15_000;
    let status = await devServerManager.status(projectSlug);
    while (!status.running && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      status = await devServerManager.status(projectSlug);
    }
    if (!status.running) {
      return {
        triggered: false,
        reason: `start issued (pid ${started.pid ?? '?'}) but the probe stayed silent for :${started.port ?? '?'} after 15s — unverified — no probe evidence (#105)`,
      };
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
