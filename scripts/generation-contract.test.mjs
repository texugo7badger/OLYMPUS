#!/usr/bin/env node
/**
 * generation-contract.test.mjs — MADRUGA-FIX-1 F2+F3: the prompt-layer
 * contract + harness hygiene wiring, content-asserted at every layer.
 * Run: npx tsx scripts/generation-contract.test.mjs   (exit 0 = pass)
 *
 * F3 (the generator source kills, prompt-layer):
 *   P-A composition contract · P-B manifest discipline (npm view) ·
 *   P-C export-surface validation · P-G lockfile · the gate as the
 *   done-condition — asserted in BOTH prompt layers:
 *   (a) the repo rules contract (.opencode/rules/common/generated-project-delivery.md)
 *   (b) the campaign driver's prompt builder (sandbox driver.mjs — the
 *       confirmed source that generated the bench projects)
 * F2 (harness hygiene): the driver's scaffold + runOnce put harness
 *   artifacts (opencode.json, .opencode, transcript.jsonl, OLYMPUS_ROOT)
 *   at the LANE level, never inside the deliverable; the gate script
 *   carries the zero-absolute-symlinks check.
 * F1 (wiring): the driver's census calls the repo gate (the byte-counting
 *   gateEvaluate is retired from the run path); the gate script exists and
 *   implements the seven checks.
 *
 * Hermetic (R11): pure file reads; zero OLYMPUS state touched.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const RULES = join(ROOT, '.opencode', 'rules', 'common', 'generated-project-delivery.md');
const GATE = join(ROOT, 'scripts', 'project-exit-gate.mjs');
const GATE_TEST = join(ROOT, 'scripts', 'project-exit-gate.test.mjs');
const DRIVER = join(homedir(), 'OLYMPUS-VAULT', '02_Projects', 'madruga-2', 'driver.mjs');

let fails = 0;
let checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${String(detail).slice(0, 220)}`}`);
  if (!ok) fails++;
}
const has = (src, needle) => src.includes(needle);

// ── F3 (a): the repo rules contract ─────────────────────────────────────────
{
  check('F3 repo contract file exists (rules/common/generated-project-delivery.md)', existsSync(RULES));
  if (existsSync(RULES)) {
    const r = readFileSync(RULES, 'utf-8');
    check('F3 P-A: composition contract (layout+page compose the built sections)', /app\/layout\.tsx.*app\/page\.tsx.*composes|compose the built sections/i.test(r.replace(/\n/g, ' ')), 'missing composition clause');
    check('F3 P-B: manifest discipline (npm view resolution + imports declared)', has(r, 'npm view') && /imported package is declared/i.test(r));
    check('F3 P-C: export-surface validation (no names from memory; lucide case)', /Export-surface validation/i.test(r) && has(r, 'lucide-react'));
    check('F3 P-G: lockfile is part of the deliverable', /package-lock\.json/i.test(r));
    check('F3 gate-as-done-condition (exit 0 = the definition of done)', has(r, 'project-exit-gate.mjs') && /gate.*exit|exits 0/i.test(r.replace(/\n/g, ' ')));
    check('F3 P-E: harness artifacts never inside the deliverable', /never live inside the deliverable|Harness artifacts .* never/i.test(r.replace(/\n/g, ' ')));
  }
}

// ── F3 (b) + F1/F2 wiring: the campaign driver (the confirmed source) ───────
{
  check('F2 driver present (sandbox madruga-2/driver.mjs — the bench generator)', existsSync(DRIVER));
  if (existsSync(DRIVER)) {
    const d = readFileSync(DRIVER, 'utf-8');
    // F3 prompt contract carried by the driver:
    check('F3 driver prompt carries the CONTRATO DE ENTREGA', has(d, 'CONTRATO DE ENTREGA'));
    check('F3 driver prompt: composition clause (A)', /A\. COMPOSIÇÃO/.test(d));
    check('F3 driver prompt: manifest discipline clause (B, npm view + lockfile)', /B\. MANIFESTO/.test(d) && has(d, 'npm view'));
    check('F3 driver prompt: export-surface clause (C, lucide)', /C\. EXPORTS/.test(d) && has(d, 'lucide-react'));
    check('F3 driver prompt: the gate as the final step (D, exit 0 = pronto)', /D\. GATE FINAL/.test(d) && has(d, 'project-exit-gate.mjs'));
    // F2 lane-wrapper scaffold:
    check('F2 driver scaffold: deliverable is <lane>/project (lane-wrapper layout)', /path\.join\(lane, 'project'\)/.test(d) || /const dir = path\.join\(lane, 'project'\)/.test(d));
    check('F2 driver scaffold: .opencode symlink at LANE level, never in the deliverable', /const oc = path\.join\(lane, '\.opencode'\)/.test(d));
    check('F2 driver scaffold: opencode.json copied at LANE level', /path\.join\(lane, 'opencode\.json'\)/.test(d));
    check('F2 driver runOnce: transcript at LANE level (not in the deliverable)', /path\.join\(lane, 'transcript\.jsonl'\)/.test(d));
    check('F2 driver runOnce: OLYMPUS_ROOT points at the lane (injection target outside the deliverable)', /OLYMPUS_ROOT: lane/.test(d));
    // F1 census wiring:
    check('F1 driver census: the repo exit gate is invoked (spawnSync + GATE_SCRIPT)', has(d, 'GATE_SCRIPT') && /spawnSync\(process\.execPath, \[GATE_SCRIPT/.test(d));
    check('F1 driver census: gateEvaluate retired from the run path (the only call is the definition)', !/gate = gateEvaluate\(/.test(d));
    check('F1 driver census: missing gate script = LOUD failure, never silent byte-fallback', /GATE SCRIPT FAILED/.test(d));
  }
}

// ── F1: the gate script itself (behavioral markers, R12's text-level grep) ───
{
  check('F1 gate script exists (scripts/project-exit-gate.mjs)', existsSync(GATE));
  if (existsSync(GATE)) {
    const g = readFileSync(GATE, 'utf-8');
    const checks = ['lockfile', 'npm-ci', 'build', 'dev-curl-200', 'symlinks', 'imports-deps', 'composition'];
    for (const c of checks) {
      check(`F1 gate implements check: ${c}`, has(g, `'${c}'`));
    }
    check('F1 gate: structured JSON report (--json), never a bare exit', has(g, '--json') && has(g, 'verdict'));
    check('F1 gate: EDQUOT loud degrade (--skip-build => LIVE-PROBE-SKIPPED)', has(g, 'LIVE-PROBE-SKIPPED'));
    check('F1 gate: ephemeral dev port (21000+ range, R6 ports documented as untouched) + self-kill', has(g, 'freeEphemeralPort') && has(g, '21000') && has(g, 'SIGKILL') && has(g, '3737/3738/3740/3777') && has(g, 'untouched'));
    check('F1 gate: composition = composes the kit (the byte-counting metric is dead)', /COMPOSED/.test(g) && !/bytes >= 2000.*bench floor/.test(g.replace(/\n/g, ' ')));
  }
  check('F1 gate fixture exists (scripts/project-exit-gate.test.mjs)', existsSync(GATE_TEST));
  if (existsSync(GATE_TEST)) {
    const t = readFileSync(GATE_TEST, 'utf-8');
    check('F1 gate fixture: RED on the no-route shape + phantom manifest; GREEN on completed trees', has(t, 'red-no-route') && has(t, 'red-phantom-manifest') && has(t, 'green-escola') && has(t, 'green-cafeteria'));
  }
}

if (fails > 0) { console.error(`\n${fails}/${checked} generation-contract assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} generation-contract (F1+F2+F3 wiring) assertions passed`);
