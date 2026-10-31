#!/usr/bin/env node
/**
 * hop-verify-content.test.mjs — v0.0.28 THE FALSE-DONE CURE.
 *
 * The AIME CAL-2 specimen: `aime-b2-brand-ui` declared three auth pages that
 * ALREADY existed and verified them with `file-exists` only — so the hop (and
 * the v0.0.27 artifact rescue) turned green with zero work. `file-contains:`
 * and `file-omits:` make the gate assert what the file must (not) contain.
 *
 * Run: npx tsx scripts/hop-verify-content.test.mjs
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { verifyHopDeterministic } from '../src/lib/hop-runtime/verify.ts';

let fails = 0;
let checked = 0;
const check = (n, ok, d = '') => {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -- ${String(d).slice(0, 300)}`}`);
  if (!ok) fails++;
};

const lane = mkdtempSync(join(tmpdir(), 'olympus-verify-content-'));
const hop = (checks, artifacts = []) => ({
  id: 't', god: 'athena', prompt: 'x', artifacts, budgetTokens: 1000,
  verify: { review: 'deterministic', checks },
});

try {
  mkdirSync(join(lane, 'src'), { recursive: true });
  writeFileSync(join(lane, 'src', 'page.tsx'), 'export default function P(){return <main>var(--night)</main>}\n');
  writeFileSync(join(lane, 'src', 'old.tsx'), 'const red = "#e11d2e"; // rounded-3xl\n');

  // ── 1. The old gate: existence alone (kept for compatibility) ───────────
  const exists = verifyHopDeterministic(hop(['file-exists:src/page.tsx']), lane);
  check('existence check still passes for an existing file', exists.ok, JSON.stringify(exists.checks));

  // ── 2. file-contains: the positive assertion ────────────────────────────
  const has = verifyHopDeterministic(hop(['file-contains:src/page.tsx::var(--night)']), lane);
  check('file-contains PASSES when the needle is present', has.ok, JSON.stringify(has.checks));

  const missing = verifyHopDeterministic(hop(['file-contains:src/page.tsx::withWordmark']), lane);
  check('file-contains FAILS when the needle is absent', !missing.ok, JSON.stringify(missing.checks));
  check('the failure detail names the missing content', /MISSING "withWordmark"/.test(missing.checks[0].detail), missing.checks[0].detail);

  // ── 3. file-omits: the negative assertion (the brand contract) ──────────
  const omitted = verifyHopDeterministic(hop(['file-omits:src/old.tsx::#e11d2e']), lane);
  check('file-omits FAILS when the forbidden text is present', !omitted.ok, JSON.stringify(omitted.checks));

  const clean = verifyHopDeterministic(hop(['file-omits:src/old.tsx::linear-gradient']), lane);
  check('file-omits PASSES when the forbidden text is absent', clean.ok, JSON.stringify(clean.checks));

  // ── 4. Malformed specs are refused, never silently ignored ──────────────
  const malformed = verifyHopDeterministic(hop(['file-contains:src/page.tsx']), lane);
  check('a malformed content spec FAILS loudly', !malformed.ok && /invalid spec/.test(malformed.checks[0].detail), JSON.stringify(malformed.checks));

  const traversal = verifyHopDeterministic(hop(['file-contains:../../etc/passwd::root']), lane);
  check('path traversal is refused', !traversal.ok && /escapes the lane root/.test(traversal.checks[0].detail), JSON.stringify(traversal.checks));

  // ── 5. THE SPECIMEN: existence-only is a false pass; content is not ─────
  // The b2 shape: three artifacts that already exist, verified by existence.
  writeFileSync(join(lane, 'src', 'login.tsx'), 'export default function L(){return null}\n');
  writeFileSync(join(lane, 'src', 'register.tsx'), 'export default function R(){return null}\n');
  writeFileSync(join(lane, 'src', 'onboarding.tsx'), 'export default function O(){return null}\n');
  const b2shape = ['src/login.tsx', 'src/register.tsx', 'src/onboarding.tsx'];
  const falsePass = verifyHopDeterministic(
    hop(b2shape.map((p) => `file-exists:${p}`), b2shape),
    lane,
  );
  check('SPECIMEN: the old b2 shape (files already exist) still false-passes — this is WHY the content checks exist',
    falsePass.ok, JSON.stringify(falsePass.checks));

  const realGate = verifyHopDeterministic(
    hop(b2shape.map((p) => `file-contains:${p}::@/components/logo`), b2shape),
    lane,
  );
  check('SPECIMEN: the same hop with content checks FAILS until the work is done',
    !realGate.ok && realGate.checks.filter((c) => c.check.startsWith('file-contains:')).every((c) => !c.ok),
    JSON.stringify(realGate.checks));

  // ── 6. build/lint remain wired (no package.json = honest refusal) ───────
  const build = verifyHopDeterministic(hop(['build']), lane);
  check('build check reports the missing package.json (no silent green)', !build.ok && /no package.json/.test(build.checks[0].detail), build.checks[0].detail);

  // ── 7. The AIME live plan uses real content checks, not existence-only ──
  // (the plan is the other half of the cure; a good verifier with an
  // existence-only plan is still a false pass.)
  const { readFileSync } = await import('node:fs');
  const planPath = process.env.OLYMPUS_AIME_PLAN || '/home/texugo/OLYMPUS-VAULT/02_Projects/aime/dispatch-plan.json';
  try {
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
    const b2 = plan.hops.find((h) => h.id === 'aime-b2-brand-ui');
    check('AIME plan: b2 asserts content, not existence', !!b2 && b2.verify.checks.some((c) => c.startsWith('file-contains:')), JSON.stringify(b2?.verify));
    const b3 = plan.hops.find((h) => h.id === 'aime-b3-verify');
    // The gate is honest either way: a deterministic build/lint run, OR the
    // brand-check artifact that quotes both commands (Apollo's plan shape).
    const b3Checks = b3?.verify?.checks ?? [];
    const b3Gated = b3Checks.includes('build') && b3Checks.includes('lint');
    const b3Evidence = b3Checks.includes('file-contains:BRAND-CHECK.md::npm run build')
      && b3Checks.includes('file-contains:BRAND-CHECK.md::npm run lint');
    check('AIME plan: b3 gates on a real build + lint (or their quoted evidence)', !!b3 && (b3Gated || b3Evidence), JSON.stringify(b3?.verify));
    const ids = new Set(plan.hops.map((h) => h.id));
    check('AIME plan: the completed f3-4 is NOT re-run', !ids.has('aime-f3-4'), [...ids].join(','));
    check('AIME plan: every hop after its dependency', plan.hops.every((h) => (h.after ?? []).every((d) => ids.has(d))), 'dangling after edge');
  } catch (e) {
    check('AIME plan is present and parseable', false, String(e));
  }
} finally {
  try { rmSync(lane, { recursive: true, force: true }); } catch { /* best-effort */ }
}

console.log(fails === 0 ? `\nAll ${checked} verify-content assertions passed` : `\n${fails} assertion(s) failed`);
process.exit(fails === 0 ? 0 : 1);
