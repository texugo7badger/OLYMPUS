/**
 * alignment.ts — v0.0.80: the alignment meter before a preview is generated.
 * v0.0.81 — MODE-AWARE. A new brief, a continuation and a refactor are three
 * different questions; asking a running project "who is the audience?" is the
 * wrong lens. `mode` is detected from the lane (dispatch-plan with hops =
 * continue) and can be forced by the caller.
 *
 * new       goal, audience, stack, style, plan
 * continue  progress, next hop, invariants, acceptance, evidence
 * refactor  current behavior, target delta, coverage, blast radius, rollback
 *
 * 20 points each, 100 total; `ready` at 70. The UI shows the score AND the
 * per-signal evidence, so the user can see what is missing before spending a
 * token.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from './vault-root';
import { getProject } from './project-context';

export type AlignmentMode = 'new' | 'continue' | 'refactor';

export interface AlignmentSignal {
  id: string;
  label: string;
  score: number;
  max: number;
  evidence: string;
}

export interface Alignment {
  project: string;
  mode: AlignmentMode;
  score: number;
  ready: boolean;
  signals: AlignmentSignal[];
  missing: string[];
}

const AUDIENCE_RE = /\b(for|para|público|publico|audience|users?|clientes?|customers?|devs?|developers?|equipes?|teams?)\b/i;

type PlanHop = { id?: string; status?: string; verify?: unknown; artifacts?: string[] };
type Plan = { hops?: PlanHop[] };

function readPlan(lane: string): Plan | null {
  try { return JSON.parse(fs.readFileSync(path.join(lane, 'dispatch-plan.json'), 'utf-8')) as Plan; } catch { return null; }
}

function readHopState(lane: string): { completed?: string[]; inFlight?: Array<{ hopId?: string }> } | null {
  try { return JSON.parse(fs.readFileSync(path.join(lane, '.olympus-hop-state.json'), 'utf-8')); } catch { return null; }
}

function countLines(file: string): number {
  try { return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).length; } catch { return 0; }
}

function exists(file: string): boolean {
  try { return fs.existsSync(file); } catch { return false; }
}

/** A plan with hops is a continuation; an explicit refactor marker wins. */
export function detectMode(slug: string, lane?: string): AlignmentMode {
  const root = lane || path.join(getVaultRoot(), '02_Projects', slug);
  const plan = readPlan(root);
  const hops = Array.isArray(plan?.hops) ? plan.hops.length : 0;
  if (hops > 0) return 'continue';
  try {
    const note = fs.readFileSync(path.join(root, 'project.md'), 'utf-8').slice(0, 4000);
    if (/^mode:\s*refactor/im.test(note) || /^##\s+refactor/im.test(note)) return 'refactor';
  } catch { /* no note */ }
  return 'new';
}

export function computeAlignment(slug: string, forced?: AlignmentMode): Alignment | null {
  const project = getProject(slug);
  if (!project) return null;
  const lane = project.path || path.join(getVaultRoot(), '02_Projects', slug);
  const description = String(project.description || '').trim();
  const stacks = Array.isArray(project.stacks) ? project.stacks.filter(Boolean) : [];
  const mode = forced || detectMode(slug, lane);

  if (mode === 'continue') {
    const plan = readPlan(lane);
    const hops = Array.isArray(plan?.hops) ? plan.hops : [];
    const state = readHopState(lane);
    const completed = new Set(state?.completed ?? []);
    const done = hops.filter((h) => h.id && completed.has(h.id)).length;
    const next = hops.find((h) => h.id && !completed.has(h.id));
    const decisions = countLines(path.join(lane, 'design-decisions.jsonl'));
    const tests = exists(path.join(lane, 'tests')) || exists(path.join(lane, 'vitest.config.ts')) || exists(path.join(lane, 'playwright.config.ts'));
    const evidence = exists(path.join(lane, '.olympus-hop-telemetry.jsonl')) || exists(path.join(lane, 'evidence'));
    const acceptance = hops.some((h) => h.verify && (Array.isArray((h.verify as { checks?: unknown[] }).checks) || typeof (h.verify as { review?: unknown }).review === 'string'));

    const signals: AlignmentSignal[] = [
      {
        id: 'progress', label: 'progress', max: 20,
        score: hops.length > 0 ? 20 : 0,
        evidence: hops.length > 0 ? `${done}/${hops.length} hop(s) completed` : 'no dispatch-plan.json with hops',
      },
      {
        id: 'next', label: 'next hop', max: 20,
        score: next ? 20 : 0,
        evidence: next ? `next: ${next.id}` : 'no pending hop — the plan is complete',
      },
      {
        id: 'invariants', label: 'invariants', max: 20,
        score: decisions > 0 || tests ? 20 : 0,
        evidence: decisions > 0 ? `${decisions} design decision(s)` : tests ? 'a test harness is present' : 'no design decisions or tests recorded',
      },
      {
        id: 'acceptance', label: 'acceptance', max: 20,
        score: acceptance ? 20 : 0,
        evidence: acceptance ? 'the plan carries verify checks' : 'no verify checks in the plan',
      },
      {
        id: 'evidence', label: 'evidence', max: 20,
        score: evidence ? 20 : 0,
        evidence: evidence ? 'hop telemetry / evidence directory present' : 'no hop telemetry or evidence yet',
      },
    ];
    const score = signals.reduce((s, x) => s + x.score, 0);
    return { project: slug, mode, score, ready: score >= 70, signals, missing: signals.filter((s) => s.score < s.max).map((s) => s.label) };
  }

  if (mode === 'refactor') {
    const tests = exists(path.join(lane, 'tests')) || exists(path.join(lane, 'vitest.config.ts')) || exists(path.join(lane, 'playwright.config.ts'));
    const coverage = exists(path.join(lane, 'coverage')) || exists(path.join(lane, '.coverage'));
    let note = '';
    try { note = fs.readFileSync(path.join(lane, 'project.md'), 'utf-8').slice(0, 12000); } catch { /* no note */ }
    const signals: AlignmentSignal[] = [
      { id: 'current', label: 'current behavior', max: 20, score: tests ? 20 : 0, evidence: tests ? 'a test harness captures the current behavior' : 'no test harness' },
      { id: 'delta', label: 'target delta', max: 20, score: /target delta|delta desejado|mudança desejada/i.test(note) ? 20 : 0, evidence: /target delta|delta desejado|mudança desejada/i.test(note) ? 'the note names the target delta' : 'no target delta in project.md' },
      { id: 'coverage', label: 'coverage', max: 20, score: coverage ? 20 : 0, evidence: coverage ? 'a coverage report exists' : 'no coverage report' },
      { id: 'blast', label: 'blast radius', max: 20, score: /blast radius|raio de impacto|blast/i.test(note) ? 20 : 0, evidence: /blast radius|raio de impacto|blast/i.test(note) ? 'the blast radius is named' : 'no blast radius in project.md' },
      { id: 'rollback', label: 'rollback', max: 20, score: /rollback|reverter|voltar atrás/i.test(note) ? 20 : 0, evidence: /rollback|reverter|voltar atrás/i.test(note) ? 'a rollback path is named' : 'no rollback path in project.md' },
    ];
    const score = signals.reduce((s, x) => s + x.score, 0);
    return { project: slug, mode, score, ready: score >= 70, signals, missing: signals.filter((s) => s.score < s.max).map((s) => s.label) };
  }

  // new-project brief (the v0.0.80 rubric)
  const goal: AlignmentSignal = {
    id: 'goal', label: 'goal', max: 20,
    score: description.length >= 24 ? 20 : description.length >= 8 ? 10 : 0,
    evidence: description ? `${description.length} chars: "${description.slice(0, 80)}"` : 'no description in project.md',
  };
  const audience: AlignmentSignal = {
    id: 'audience', label: 'audience', max: 20,
    score: AUDIENCE_RE.test(description) ? 20 : description.length >= 8 ? 8 : 0,
    evidence: AUDIENCE_RE.test(description) ? 'the description names who it is for' : description ? 'the description does not name an audience yet' : 'no description',
  };
  const stack: AlignmentSignal = {
    id: 'stack', label: 'stack', max: 20,
    score: stacks.length > 0 ? 20 : 0,
    evidence: stacks.length > 0 ? stacks.slice(0, 6).join(', ') : 'no stacks detected/declared',
  };
  const decisions = countLines(path.join(lane, 'design-decisions.jsonl'));
  const style: AlignmentSignal = {
    id: 'style', label: 'style', max: 20,
    score: decisions > 0 ? 20 : 0,
    evidence: decisions > 0 ? `${decisions} design decision(s)` : 'no design decision recorded',
  };
  const plan = readPlan(lane);
  const hopCount = Array.isArray(plan?.hops) ? plan.hops.length : 0;
  const planSignal: AlignmentSignal = {
    id: 'plan', label: 'plan', max: 20,
    score: hopCount > 0 ? 20 : 0,
    evidence: hopCount > 0 ? `${hopCount} hop(s) planned` : 'no dispatch-plan.json',
  };
  const signals = [goal, audience, stack, style, planSignal];
  const score = signals.reduce((s, x) => s + x.score, 0);
  return { project: slug, mode, score, ready: score >= 70, signals, missing: signals.filter((s) => s.score < s.max).map((s) => s.label) };
}
