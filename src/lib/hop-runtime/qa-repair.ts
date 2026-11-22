/**
 * qa-repair.ts — v0.0.98-9.1: a failed QA gate schedules a REPAIR, not a
 * blind re-run.
 *
 * THE SPECIMEN (AIME qa-glow-local, 2026-11-22): the QA correctly reported
 * that the served payload never carries the elected local clip. The walker
 * retried the same 7-check prompt 15 times; the upstream defect was never
 * touched. The recovery engine only inflated the tool budget (26 → 36),
 * which is the opposite of a split.
 *
 * This module turns the QA evidence into a bounded repair cycle:
 *
 *   verify-failed  → one UPSTREAM FIX hop (Athena/Hephaestus) built from the
 *                    FAIL rows + the evidence's own "next hop" paragraph,
 *                    then the QA hop re-runs as a small judge.
 *   tool-budget    → one QA HARNESS hop (Hephaestus) that writes a
 *                    deterministic script + evidence JSON, then the QA hop
 *                    re-runs as a judge that only reads the JSON.
 *
 * Max 2 repair cycles per QA hop. The third failure blocks the hop through
 * the loop guard and the campaign stops with evidence — never a 16th walk.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DispatchPlan, PlanHop } from './plan-schema';
import { applyNextPlan, nextPlanPath, planPath, computeHopHashes } from './plan-generation';

export const QA_REPAIR_FILENAME = '.olympus-qa-repairs.json';
export const QA_REPAIR_LIMIT = 2;

interface RepairEntry {
  count: number;
  lastGeneration: number;
  lastAt: string;
  lastClass: string | null;
}

interface RepairFile {
  version: 1;
  hops: Record<string, RepairEntry>;
  updatedAt: string;
}

export interface QaRepairOutcome {
  status: 'repaired' | 'blocked' | 'refused';
  reason: string;
  fixHop?: PlanHop;
  qaHop?: PlanHop;
  generation?: number;
  cycles?: number;
}

function repairPath(laneRoot: string): string {
  return path.join(laneRoot, QA_REPAIR_FILENAME);
}

function readRepairs(laneRoot: string): RepairFile {
  try {
    const raw = JSON.parse(fs.readFileSync(repairPath(laneRoot), 'utf-8'));
    return {
      version: 1,
      hops: raw && typeof raw.hops === 'object' ? raw.hops : {},
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    };
  } catch {
    return { version: 1, hops: {}, updatedAt: new Date().toISOString() };
  }
}

function writeRepairs(laneRoot: string, file: RepairFile): void {
  try {
    fs.mkdirSync(path.dirname(repairPath(laneRoot)), { recursive: true });
    fs.writeFileSync(repairPath(laneRoot), JSON.stringify({ ...file, updatedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  } catch { /* evidence, never a walk blocker */ }
}

function readEvidence(laneRoot: string, hop: PlanHop): { file: string; text: string } | null {
  const candidates = [
    ...(Array.isArray(hop.artifacts) ? hop.artifacts.filter((a) => /^evidence\/qa\//.test(String(a))).map(String) : []),
    `evidence/qa/${String(hop.id).replace(/^qa[-_]/, '')}.md`,
  ];
  for (const rel of candidates) {
    try {
      const file = path.join(laneRoot, rel);
      const text = fs.readFileSync(file, 'utf-8');
      if (text.trim()) return { file: rel, text };
    } catch { /* next candidate */ }
  }
  return null;
}

/** The FAIL rows, quoted; the judge's table is the primary evidence. */
function failingRows(evidence: string): string[] {
  return evidence
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\|\s*\*\*?FAIL\b/i.test(l) || /\|\s*FAIL\b/i.test(l) || /Overall:\s*FAIL/i.test(l))
    .slice(0, 8);
}

/**
 * The evidence's own next-step prose. The QA writes it for exactly this
 * consumer: "The next hop is one instrumented read" (glow-local) or
 * "The repair" (sheet-clip). Fall back to the FAIL rows.
 */
function nextStepText(evidence: string): string | null {
  const heading = evidence.match(/##\s*(?:the\s+)?(?:next\s+hop|next\s+lane|what\s+the\s+next|repair|next\s+step)[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (heading?.[1]?.trim()) return heading[1].trim().slice(0, 2_400);
  const inline = evidence.match(/(?:the\s+)?next\s+hop\s+is[^\n]*\n([\s\S]{0,1_600})/i);
  if (inline?.[1]?.trim()) return inline[0].trim().slice(0, 2_400);
  return null;
}

/** File paths the evidence names as the repair surface (best effort). */
function repairFiles(evidence: string): string[] {
  const files = new Set<string>();
  for (const m of evidence.matchAll(/`((?:src|app|components|scripts|lib)\/[^`\s]+)`/g)) {
    const f = m[1].replace(/[.,;:]$/, '');
    if (!f.includes('node_modules') && f.length < 200) files.add(f);
  }
  return [...files].slice(0, 8);
}

function chooseFixGod(evidence: string, qaHop: PlanHop): string {
  const hay = `${evidence} ${qaHop.prompt ?? ''}`.toLowerCase();
  if (/(server|payload|api|endpoint|route|prisma|clips?\.get|serializ|select\b)/.test(hay)) return 'hephaestus';
  if (/(component|css|layout|sheet|card|render|tailwind|ui\b|halo|glow)/.test(hay)) return 'athena';
  return 'hephaestus';
}

function trimPrompt(hop: PlanHop, add: string, toolBudget: number): string {
  return `${hop.prompt ?? ''}\n\n${add}\n\n## QA EXECUTION CONTRACT (v0.0.98-9.1)\n- Write the declared evidence artifact BEFORE any optional probing.\n- Do NOT read component sources; query selectors / the served payload.\n- Batch shell work into ONE call. Stay within ${toolBudget} tool calls.\n- If a check cannot be measured, say so; never invent a PASS.`;
}

/**
 * Plan the repair. This function is pure except for reading the evidence and
 * the repair ledger; it does not write the plan.
 */
export function planQaRepair(input: {
  laneRoot: string;
  plan: DispatchPlan;
  qaHop: PlanHop;
  failureClass: string | null;
  error?: string | null;
}): QaRepairOutcome {
  const { laneRoot, plan, qaHop } = input;
  const generation = Number(plan.generation ?? 1);
  const file = readRepairs(laneRoot);
  const prev = file.hops[qaHop.id];
  // A generation the repair did not write is a human replan: fresh count.
  const sameRepairLine = prev && Number(prev.lastGeneration) === generation;
  const cycles = sameRepairLine ? Number(prev.count) || 0 : 0;
  if (cycles >= QA_REPAIR_LIMIT) {
    return {
      status: 'blocked', cycles,
      reason: `${qaHop.id}: ${cycles} QA repair cycle(s) already ran in this generation — the evidence needs a human decision, not another walk.`,
    };
  }

  const evidence = readEvidence(laneRoot, qaHop);
  const evidenceText = evidence?.text ?? '';
  const failRows = failingRows(evidenceText);
  const nextStep = nextStepText(evidenceText);
  const files = repairFiles(evidenceText);
  const failureClass = String(input.failureClass ?? '').toLowerCase();
  const harness = failureClass === 'tool-budget' || failureClass === 'script' || failureClass === 'timeout';
  const cycle = cycles + 1;
  const suffix = String(qaHop.id).replace(/^qa[-_]/, '');
  const fixId = harness ? `qa-harness-${suffix}-${cycle}` : `fix-${suffix}-${cycle}`;
  const fixGod = harness ? 'hephaestus' : chooseFixGod(evidenceText, qaHop);
  const evidenceFile = evidence?.file ?? `evidence/qa/${suffix}.md`;

  const evidenceBlock = [
    `QA gate: \`${qaHop.id}\` (${failureClass || 'unknown'}) — cycle ${cycle} of ${QA_REPAIR_LIMIT}.`,
    `Evidence: \`${evidenceFile}\`.`,
    failRows.length > 0 ? `Failing checks:\n${failRows.map((r) => `- ${r}`).join('\n')}` : '',
    nextStep ? `The evidence's own next step:\n${nextStep}` : '',
    !evidence && input.error ? `The QA did not leave readable evidence; the park error was:\n${String(input.error).slice(0, 1_200)}` : '',
    files.length > 0 ? `Repair surface(s) named by the evidence: ${files.map((f) => `\`${f}\``).join(', ')}` : '',
  ].filter(Boolean).join('\n\n');

  const fixPrompt = harness
    ? `QA HARNESS REPAIR (cycle ${cycle}/${QA_REPAIR_LIMIT}) — the QA gate ran out of tools because the checks and the judgment shared one budget.\n\n${evidenceBlock}\n\nWrite ONE deterministic script at \`scripts/qa/${suffix}.mjs\` (or extend the existing one) that performs the measurements with Playwright/tsc/lint and writes \`evidence/qa/${suffix}.json\` with one object per check: { id, verdict: 'PASS'|'FAIL'|'UNMEASURED', evidence }. Do NOT write the final markdown and do NOT judge the feature — the QA judge hop does that from your JSON. Keep the script runnable with \`node scripts/qa/${suffix}.mjs\`; print the JSON path.`
    : `QA REPAIR (cycle ${cycle}/${QA_REPAIR_LIMIT}) — the QA gate failed and the upstream defect must be fixed before the gate re-runs.\n\n${evidenceBlock}\n\nFix the upstream surface(s) named above. Do NOT edit the QA evidence or the QA prompt; do NOT re-run the full QA gate. Make the smallest change that turns the failing comparator(s) into a measurable PASS, then write a short note to \`evidence/qa/${suffix}-repair-${cycle}.md\` with the files changed and why. The QA gate re-runs immediately after this hop.`;

  const baseAfter = (qaHop.after ?? []).filter((d) => d !== qaHop.id);
  const fixHop: PlanHop = {
    id: fixId,
    kind: 'llm',
    god: fixGod,
    prompt: fixPrompt,
    artifacts: harness ? [`scripts/qa/${suffix}.mjs`, `evidence/qa/${suffix}.json`] : [`evidence/qa/${suffix}-repair-${cycle}.md`],
    after: baseAfter,
    verify: { review: 'deterministic', checks: harness ? [`file-exists:evidence/qa/${suffix}.json`] : [] },
    budgetTokens: harness ? 8_192 : 6_144,
    toolBudget: harness ? 24 : 20,
    ...(files.length > 0 && !harness ? { artifacts: [...files, `evidence/qa/${suffix}-repair-${cycle}.md`] } : {}),
  };

  const qaJudge = harness
    ? `\n\n## JUDGE PASS (cycle ${cycle}/${QA_REPAIR_LIMIT})\nThe harness wrote \`evidence/qa/${suffix}.json\`. Read that JSON (and only that JSON plus the served page for a spot check) and write the final evidence markdown. Do not re-run the full measurement suite; do not read component sources. At most 10 tool calls. The literal final line is \`Overall: PASS\` only if every check is PASS; otherwise \`Overall: FAIL\` with the failing check ids.`
    : `\n\n## RE-RUN AFTER THE FIX (cycle ${cycle}/${QA_REPAIR_LIMIT})\nThe upstream fix hop \`${fixId}\` ran. Re-run the checks above against the served app and write the evidence markdown. At most 12 tool calls: measure, then judge; do not read component sources. The literal final line is \`Overall: PASS\` only if every check passed.`;

  const qaHopNext: PlanHop = {
    ...qaHop,
    prompt: trimPrompt(qaHop, qaJudge, harness ? 10 : 12),
    after: [...baseAfter, fixId],
    toolBudget: Math.min(harness ? 10 : 12, Number(qaHop.toolBudget ?? 26)),
    budgetTokens: Math.min(4_096, Number(qaHop.budgetTokens ?? 4_096)),
  };

  if (fs.existsSync(nextPlanPath(laneRoot))) {
    return { status: 'refused', cycles, reason: `${qaHop.id}: a staged next plan already exists — refusing to stack a QA repair on it.` };
  }

  // Replace the QA hop in place with fix + judge (the QA id stays, so the
  // completed set and the DAG edges keep their meaning).
  const hops = (plan.hops ?? []).map((h) => (String(h.id) === String(qaHop.id) ? fixHop : h));
  const qaIndex = hops.findIndex((h) => String(h.id) === String(fixId));
  if (qaIndex >= 0) hops.splice(qaIndex + 1, 0, qaHopNext);
  else hops.push(qaHopNext);

  const nextGeneration = generation + 1;
  const nextPlan: DispatchPlan = {
    ...plan,
    generation: nextGeneration,
    parentGeneration: generation,
    createdAt: new Date().toISOString(),
    hops,
  };
  nextPlan.hopHashes = computeHopHashes(nextPlan);
  try {
    fs.mkdirSync(laneRoot, { recursive: true });
    fs.writeFileSync(nextPlanPath(laneRoot), JSON.stringify(nextPlan, null, 2) + '\n');
  } catch (e) {
    return { status: 'refused', cycles, reason: `${qaHop.id}: could not write the repair generation — ${e instanceof Error ? e.message : String(e)}` };
  }
  const applied = applyNextPlan(laneRoot);
  if (!applied.applied) {
    return { status: 'refused', cycles, reason: `${qaHop.id}: the repair generation was written but not applied.` };
  }

  file.hops[qaHop.id] = {
    count: cycle,
    lastGeneration: applied.generation ?? nextGeneration,
    lastAt: new Date().toISOString(),
    lastClass: input.failureClass ?? null,
  };
  writeRepairs(laneRoot, file);

  return {
    status: 'repaired',
    cycles: cycle,
    reason: `${qaHop.id}: ${harness ? 'QA harness split' : 'upstream repair'} cycle ${cycle}/${QA_REPAIR_LIMIT} — fix hop '${fixId}' (${fixGod}) then the QA judge.`,
    fixHop,
    qaHop: qaHopNext,
    generation: applied.generation ?? nextGeneration,
  };
}

/**
 * Explicit human reset: a fresh plan/QA deserves a fresh cycle count. The
 * loop guard is separate and follows the plan generation.
 */
export function clearQaRepair(laneRoot: string, qaHopId?: string): void {
  const file = readRepairs(laneRoot);
  if (qaHopId) delete file.hops[qaHopId];
  else file.hops = {};
  writeRepairs(laneRoot, file);
}
