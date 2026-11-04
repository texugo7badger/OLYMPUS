/**
 * alignment.ts — v0.0.80: the alignment meter before a preview is generated.
 *
 * A fast preview is only honest when the project is clear enough. This module
 * turns "is it clear?" into five explainable signals, each with the evidence
 * that earned it — never a vibe:
 *
 *   goal     the brief carries a real description
 *   audience the brief names who it is for
 *   stack    the stacks were detected/declared
 *   style    at least one design decision was recorded
 *   plan     the plan exists (the project has a shape)
 *
 * 20 points each, 100 total; `ready` at 70. The UI shows the score AND the
 * per-signal evidence, so the user can see what is missing before spending a
 * token on the preview.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from './vault-root';
import { getProject } from './project-context';

export interface AlignmentSignal {
  id: 'goal' | 'audience' | 'stack' | 'style' | 'plan';
  label: string;
  score: number;
  max: number;
  evidence: string;
}

export interface Alignment {
  project: string;
  score: number;
  ready: boolean;
  signals: AlignmentSignal[];
  missing: string[];
}

const AUDIENCE_RE = /\b(for|para|público|publico|audience|users?|clientes?|customers?|devs?|developers?|equipes?|teams?)\b/i;

export function computeAlignment(slug: string): Alignment | null {
  const project = getProject(slug);
  if (!project) return null;
  const lane = project.path || path.join(getVaultRoot(), '02_Projects', slug);
  const description = String(project.description || '').trim();
  const stacks = Array.isArray(project.stacks) ? project.stacks.filter(Boolean) : [];

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

  let styleEvidence = 'no design decision recorded';
  let styleScore = 0;
  try {
    const decisions = path.join(lane, 'design-decisions.jsonl');
    const lines = fs.readFileSync(decisions, 'utf-8').split('\n').filter(Boolean);
    if (lines.length > 0) { styleScore = 20; styleEvidence = `${lines.length} design decision(s)`; }
  } catch { /* no decisions file */ }
  const style: AlignmentSignal = { id: 'style', label: 'style', max: 20, score: styleScore, evidence: styleEvidence };

  let planEvidence = 'no dispatch-plan.json';
  let planScore = 0;
  try {
    const plan = JSON.parse(fs.readFileSync(path.join(lane, 'dispatch-plan.json'), 'utf-8'));
    const hops = Array.isArray(plan?.hops) ? plan.hops.length : 0;
    if (hops > 0) { planScore = 20; planEvidence = `${hops} hop(s) planned`; }
  } catch { /* no plan */ }
  const plan: AlignmentSignal = { id: 'plan', label: 'plan', max: 20, score: planScore, evidence: planEvidence };

  const signals = [goal, audience, stack, style, plan];
  const score = signals.reduce((s, x) => s + x.score, 0);
  return {
    project: slug,
    score,
    ready: score >= 70,
    signals,
    missing: signals.filter((s) => s.score < s.max).map((s) => s.label),
  };
}
