/**
 * hibernation.ts — v0.0.52: the unattended contract when the window is gone.
 *
 * The Electron main writes `~/.olympus/hibernation.json` before it destroys
 * the renderer. The walker reads the same marker: a campaign that parks while
 * the user is away must auto-resume (bounded) even if it was started in the
 * attended UI. Without this, "hibernate" kept the current hop alive but a
 * park waited for a morning click.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function hibernationMarkerPath(home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus')): string {
  return path.join(home, 'hibernation.json');
}

export function isHibernating(home?: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(hibernationMarkerPath(home), 'utf-8'));
    return raw?.active === true;
  } catch {
    return false;
  }
}

export interface HibernationPlan {
  active: boolean;
  hours: number;
  until: string;
  autoResume: boolean;
  createdAt: string;
}

export function hibernationPlanPath(home?: string): string {
  return path.join(home || process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'hibernation-plan.json');
}

export function readHibernationPlan(home?: string): HibernationPlan | null {
  try {
    const plan = JSON.parse(fs.readFileSync(hibernationPlanPath(home), 'utf-8'));
    if (!plan || plan.active !== true || !plan.until) return null;
    return {
      active: true,
      hours: Math.max(0, Number(plan.hours) || 0),
      until: String(plan.until),
      autoResume: plan.autoResume !== false,
      createdAt: String(plan.createdAt || ''),
    };
  } catch { return null; }
}

/** The remaining autonomous window, or 0 when none is active. */
export function hibernationBudgetLeftMs(home?: string): number {
  const plan = readHibernationPlan(home);
  if (!plan) return 0;
  const left = Date.parse(plan.until) - Date.now();
  return Number.isFinite(left) && left > 0 ? left : 0;
}

export function writeHibernationPlan(input: { hours: number; autoResume: boolean; home?: string }): HibernationPlan {
  const hours = Math.max(0.25, Math.min(24, Number(input.hours) || 8));
  const plan: HibernationPlan = {
    active: true,
    hours,
    until: new Date(Date.now() + hours * 3600_000).toISOString(),
    autoResume: input.autoResume !== false,
    createdAt: new Date().toISOString(),
  };
  const file = hibernationPlanPath(input.home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(plan, null, 2) + '\n', 'utf-8');
  return plan;
}
