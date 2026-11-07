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

/**
 * v0.0.28 — CONTENT CHECKS (the false-DONE cure). File existence alone
 * passed hops that changed nothing: the CAL-2 b2 hop declared three auth
 * pages that ALREADY existed, so `file-exists` (and the artifact rescue)
 * marked it green with zero work. These two checks let a plan assert what
 * the file must (or must not) contain — still 0 LLM tokens.
 *
 * Syntax: `file-contains:<rel>::<text>` / `file-omits:<rel>::<text>`.
 */
function fileContentCheck(
  laneRoot: string,
  rel: string,
  needle: string,
  shouldContain: boolean,
): HopCheckResult {
  const kind = shouldContain ? 'file-contains' : 'file-omits';
  const check = `${kind}:${rel}::${needle}`;
  const abs = laneRelative(laneRoot, rel);
  if (!abs) return { check, ok: false, detail: 'path escapes the lane root — refused' };
  if (!existsSync(abs)) return { check, ok: false, detail: `MISSING — ${rel} does not exist` };
  let text = '';
  try {
    text = readFileSync(abs, 'utf-8');
  } catch (e: any) {
    return { check, ok: false, detail: `unreadable: ${e?.message || e}` };
  }
  const found = text.includes(needle);
  const ok = shouldContain ? found : !found;
  return {
    check,
    ok,
    detail: ok
      ? shouldContain ? 'present' : 'absent (as required)'
      : shouldContain
        ? `MISSING "${needle}" — the hop declared this content and did not write it`
        : `FOUND "${needle}" — the contract forbids it`,
  };
}

type ScriptGate = 'build' | 'lint' | 'test' | 'typecheck';

function scriptCheck(laneRoot: string, script: ScriptGate): HopCheckResult {
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
  // v0.0.86 (#341) — test/typecheck join build/lint as real deterministic
  // gates. The timeout is per gate: build 180s, tests 180s, typecheck 120s.
  const timeout = script === 'typecheck' ? 120_000 : 180_000;
  const r = spawnSync('npm', ['run', script], { cwd: laneRoot, timeout, encoding: 'utf-8' });
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
 * v0.0.66 — #308: THE MOUNT CHECK. An artifact that exists but is never
 * imported is not a delivered feature (the work card was GREEN while the
 * component was dead). `mounted:<artifact>::<entry>` reads the entry file and
 * requires the artifact's module path (or basename) to appear in it.
 */
function mountedCheck(laneRoot: string, artifact: string, entry: string): HopCheckResult {
  const check = `mounted:${artifact}::${entry}`;
  const artifactAbs = laneRelative(laneRoot, artifact);
  const entryAbs = laneRelative(laneRoot, entry);
  if (!artifactAbs || !entryAbs) return { check, ok: false, detail: 'path escapes the lane root — refused' };
  if (!existsSync(artifactAbs)) return { check, ok: false, detail: `MISSING — ${artifact} does not exist` };
  if (!existsSync(entryAbs)) return { check, ok: false, detail: `MISSING — the entry ${entry} does not exist` };
  let text = '';
  try { text = readFileSync(entryAbs, 'utf-8'); } catch (e: any) { return { check, ok: false, detail: `unreadable: ${e?.message || e}` }; }
  const base = artifact.replace(/\.[^.]+$/, '').replace(/^src\//, '');
  const tail = base.split('/').slice(-2).join('/');
  const ok = text.includes(base) || text.includes(tail) || text.includes(`/${tail.split('/').pop()}`);
  return {
    check, ok,
    detail: ok ? `imported by ${entry}` : `NOT imported by ${entry} — the artifact exists but is dead code`,
  };
}

/**
 * v0.0.66 — #305: THE VISUAL GATE. A UI hop must leave a visual review that
 * says the surface is visible (opacity), the console is clean and the login
 * (when the app has one) works. `visual:<json>` reads that file; any declared
 * false fails the hop. 0 tokens — the reviewer writes the JSON, the gate reads
 * it.
 */
function visualCheck(laneRoot: string, file = 'visual-review.json'): HopCheckResult {
  const check = `visual:${file}`;
  const abs = laneRelative(laneRoot, file);
  if (!abs) return { check, ok: false, detail: 'path escapes the lane root — refused' };
  if (!existsSync(abs)) return { check, ok: false, detail: `MISSING — ${file} (opacity/console/login review)` };
  try {
    const r = JSON.parse(readFileSync(abs, 'utf-8'));
    const keys = ['opacity', 'console', 'login'].filter((k) => typeof r?.[k] === 'boolean');
    if (keys.length === 0) return { check, ok: false, detail: 'no opacity/console/login booleans in the review' };
    const bad = keys.filter((k) => r[k] !== true);
    return {
      check, ok: bad.length === 0,
      detail: bad.length === 0 ? `visual review PASS (${keys.join(', ')})` : `visual review FAIL: ${bad.join(', ')} false`,
    };
  } catch (e: any) {
    return { check, ok: false, detail: `unparseable: ${e?.message || e}` };
  }
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
    } else if (c === 'build' || c === 'lint' || c === 'test' || c === 'typecheck') {
      checks.push(scriptCheck(laneRoot, c));
    } else if (c.startsWith('file-contains:') || c.startsWith('file-omits:')) {
      const prefix = c.startsWith('file-contains:') ? 'file-contains:' : 'file-omits:';
      const spec = c.slice(prefix.length);
      const sep = spec.indexOf('::');
      if (sep <= 0 || sep + 2 >= spec.length) {
        checks.push({ check: c, ok: false, detail: 'invalid spec — expected file-contains:<rel>::<text> or file-omits:<rel>::<text>' });
      } else {
        checks.push(fileContentCheck(laneRoot, spec.slice(0, sep), spec.slice(sep + 2), prefix === 'file-contains:'));
      }
    } else if (c.startsWith('mounted:')) {
      const spec = c.slice('mounted:'.length);
      const sep = spec.indexOf('::');
      if (sep <= 0 || sep + 2 >= spec.length) {
        checks.push({ check: c, ok: false, detail: 'invalid spec — expected mounted:<artifact>::<entry>' });
      } else {
        checks.push(mountedCheck(laneRoot, spec.slice(0, sep), spec.slice(sep + 2)));
      }
    } else if (c === 'visual' || c.startsWith('visual:')) {
      checks.push(visualCheck(laneRoot, c === 'visual' ? 'visual-review.json' : c.slice('visual:'.length)));
    } else if (c.startsWith('design-score:')) {
      // #DESIGN-INTELLIGENCE D2: the design-review gate — reads
      // design-review.json and checks the overall score against the
      // threshold. The review is a real critique by a design god; the
      // gate is deterministic (0 tokens — just reads the JSON).
      const threshold = Number.parseFloat(c.slice('design-score:'.length));
      if (!Number.isFinite(threshold)) {
        checks.push({ check: c, ok: false, detail: 'invalid threshold in the check spec' });
      } else {
        try {
          const review = JSON.parse(readFileSync(join(laneRoot, 'design-review.json'), 'utf-8'));
          const ok = typeof review.overall === 'number' && review.overall >= threshold;
          checks.push({
            check: c, ok,
            detail: ok
              ? `design review: overall ${review.overall} >= ${threshold} — PASS`
              : `design review: overall ${review.overall} < ${threshold} — FAIL (issues: ${(review.issues || []).slice(0, 2).join('; ')})`,
          });
        } catch (e: any) {
          checks.push({ check: c, ok: false, detail: `design-review.json not found or unparseable: ${e?.message || e}` });
        }
      }
    } else {
      checks.push({ check: c, ok: false, detail: 'unknown check (supported: file-exists:<rel> | file-contains:<rel>::<text> | file-omits:<rel>::<text> | mounted:<artifact>::<entry> | visual[:<json>] | build | lint | test | typecheck | design-score:<n>)' });
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
