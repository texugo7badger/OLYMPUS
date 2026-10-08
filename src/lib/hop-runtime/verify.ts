/**
 * verify.ts — #109 the hop runtime (FLUENCY-1, Batch C): the deterministic-
 * first hop verification. ZERO LLM tokens: file-exists for the declared
 * artifacts + the optional build/lint checks (the project-exit-gate class).
 * `hop.verify.review === 'llm'` is the opt-in reviewer on a DIFFERENT pool
 * (the #106 law gives this free) — NOT WIRED TONIGHT (the config flag for
 * later nights); the walker proceeds on the deterministic result and the
 * telemetry row records the honest note.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import type { PlanHop } from './plan-schema';

export interface HopCheckResult {
  check: string;
  ok: boolean;
  detail: string;
}

export interface HopVerifyResult {
  ok: boolean;
  review: 'deterministic' | 'llm';
  checks: HopCheckResult[];
  /** Honest note when review:'llm' was requested but is not wired. */
  note?: string;
}

/** Resolve an artifact path inside the lane, refusing traversal escapes. */
function laneRelative(laneRoot: string, rel: string): string | null {
  const abs = resolve(laneRoot, rel);
  const rootAbs = resolve(laneRoot) + sep;
  if (!abs.startsWith(rootAbs) && abs !== resolve(laneRoot)) return null;
  return abs;
}

function fileExistsCheck(laneRoot: string, rel: string): HopCheckResult {
  const abs = laneRelative(laneRoot, rel);
  if (!abs) return { check: `file-exists:${rel}`, ok: false, detail: 'path escapes the lane root — refused' };
  return {
    check: `file-exists:${rel}`,
    ok: existsSync(abs),
    detail: existsSync(abs) ? 'present' : 'MISSING — the hop declared this artifact and did not write it',
  };
}

function scriptCheck(laneRoot: string, script: 'build' | 'lint'): HopCheckResult {
  const pkgPath = join(laneRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    return { check: script, ok: false, detail: 'no package.json in the lane' };
  }
  let scripts: Record<string, string> = {};
  try {
    scripts = JSON.parse(readFileSync(pkgPath, 'utf-8')).scripts ?? {};
  } catch {
    return { check: script, ok: false, detail: 'package.json unreadable' };
  }
  if (typeof scripts[script] !== 'string') {
    return { check: script, ok: false, detail: `no '${script}' script declared` };
  }
  const r = spawnSync('npm', ['run', script], { cwd: laneRoot, timeout: 180_000, encoding: 'utf-8' });
  const ok = r.status === 0;
  return {
    check: script,
    ok,
    detail: ok
      ? `'npm run ${script}' exit 0`
      : `'npm run ${script}' exit ${r.status} — ${(r.stderr || r.stdout || '').slice(-400)}`,
  };
}

/**
 * Run the hop's deterministic checks — 0 LLM tokens, 0 pools. The check
 * list = the declared verify.checks PLUS an implicit file-exists for every
 * declared artifact (the artifact list IS the contract).
 */
export function verifyHopDeterministic(hop: PlanHop, laneRoot: string): HopVerifyResult {
  const declared = (hop.verify?.checks ?? []).filter((c) => typeof c === 'string');
  const checks: HopCheckResult[] = [];
  for (const rel of hop.artifacts) checks.push(fileExistsCheck(laneRoot, rel));
  for (const c of declared) {
    if (c.startsWith('file-exists:')) {
      const rel = c.slice('file-exists:'.length);
      if (!hop.artifacts.includes(rel)) checks.push(fileExistsCheck(laneRoot, rel));
    } else if (c === 'build' || c === 'lint') {
      checks.push(scriptCheck(laneRoot, c));
    } else {
      checks.push({ check: c, ok: false, detail: 'unknown check (supported: file-exists:<rel> | build | lint)' });
    }
  }
  const review = hop.verify?.review ?? 'deterministic';
  return {
    ok: checks.every((c) => c.ok),
    review,
    checks,
    note: review === 'llm'
      ? "review:'llm' requested — not wired tonight (deterministic result stands; the flag is the config seam for later nights)"
      : undefined,
  };
}
