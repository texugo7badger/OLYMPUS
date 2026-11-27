/**
 * callimachus-loop.ts — v0.1.2: the curator's economical heartbeat.
 *
 * The quick-circuit theory is only safe when a single project's convention can
 * never become a global shortcut. This module is the deterministic half:
 *
 *   1. census — count what exists (quick circuits, technical, project memory);
 *   2. curate — archive synthetic smoke patterns, scope project memory, and
 *      promote ONLY cross-project evidence (>= 2 projects, samples >= 2,
 *      confidence >= 0.90);
 *   3. budget — a model pass is allowed at most once per hour AND only when
 *      there is real cross-project evidence to judge. No evidence, no tokens.
 *
 * The model pass (Callimachus's 7-stage loop) stays in the heartbeat route;
 * this module decides whether it is worth spawning at all.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { curateInstincts, type CurationResult } from './instinct-curation';
import { getVaultRoot } from './vault-root';
import { recalibrateFromOutcomes, type RecalibrateResult } from './learning/recalibrate';

export const CURATION_INTERVAL_MS = 15 * 60_000;
export const MODEL_PASS_INTERVAL_MS = 60 * 60_000;
export const MODEL_PASSES_PER_HOUR = 1;
export const MODEL_TOKEN_TARGET = 10_000;

const HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const CURATION_STATE = () => path.join(HOME(), 'callimachus-curation.json');
const BUDGET_STATE = () => path.join(HOME(), 'callimachus-budget.json');

export interface Census {
  quickCircuits: number;
  technical: number;
  project: number;
  total: number;
}

export interface CurationState {
  at: string;
  result: CurationResult;
  census: Census;
  recalibration?: RecalibrateResult;
}

export interface BudgetState {
  /** ISO timestamps of model passes inside the rolling hour. */
  modelPasses: string[];
  lastModelPassAt: string | null;
  nextModelPassAt: string | null;
  maxPerHour: number;
  tokenTarget: number;
}

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return null; }
}

function writeJson(file: string, value: unknown): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  } catch { /* evidence is best-effort */ }
}

/**
 * The honest census: a quick circuit is ONLY `quick_circuit: true`.
 * The old heuristic (confidence >= 0.85 && samples >= 2) counted 33
 * synthetic smoke patterns as "quick circuits" — that is the hallucination
 * this release removes.
 */
export function censusInstincts(): Census {
  const out: Census = { quickCircuits: 0, technical: 0, project: 0, total: 0 };
  const root = path.join(getVaultRoot(), '05_Auto_Learning', 'instincts');
  let gods: fs.Dirent[] = [];
  try { gods = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const god of gods) {
    if (!god.isDirectory()) continue;
    for (const tier of ['seed', 'empirical']) {
      const dir = path.join(root, god.name, tier);
      let files: string[] = [];
      try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { continue; }
      for (const file of files) {
        let text = '';
        try { text = fs.readFileSync(path.join(dir, file), 'utf-8').slice(0, 2000); } catch { continue; }
        out.total++;
        if (/^quick_circuit:\s*true\s*$/m.test(text)) out.quickCircuits++;
        if (/^kind:\s*project\s*$/m.test(text) || /^scope:\s*project\s*$/m.test(text)) out.project++;
        else out.technical++;
      }
    }
  }
  return out;
}

export interface QuickCircuitInfo {
  god: string;
  file: string;
  trigger: string;
  scope: string;
  samples: number;
  confidence: number;
}

/** The validated shortcuts, with the evidence that justifies each one. */
export function listQuickCircuits(limit = 8): QuickCircuitInfo[] {
  const out: QuickCircuitInfo[] = [];
  const root = path.join(getVaultRoot(), '05_Auto_Learning', 'instincts');
  let gods: fs.Dirent[] = [];
  try { gods = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  const field = (text: string, key: string) => {
    const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(text);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  for (const god of gods) {
    if (!god.isDirectory()) continue;
    for (const tier of ['seed', 'empirical']) {
      const dir = path.join(root, god.name, tier);
      let files: string[] = [];
      try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { continue; }
      for (const file of files) {
        let text = '';
        try { text = fs.readFileSync(path.join(dir, file), 'utf-8').slice(0, 2000); } catch { continue; }
        if (!/^quick_circuit:\s*true\s*$/m.test(text)) continue;
        out.push({
          god: god.name,
          file,
          trigger: field(text, 'trigger').slice(0, 120),
          scope: field(text, 'scope'),
          samples: Number(field(text, 'samples') || 0),
          confidence: Number(field(text, 'confidence') || 0),
        });
      }
    }
  }
  return out.sort((a, b) => b.samples - a.samples || b.confidence - a.confidence).slice(0, limit);
}

export function readCurationState(): CurationState | null {
  return readJson<CurationState>(CURATION_STATE());
}

export function readBudgetState(): BudgetState {
  const raw = readJson<Partial<BudgetState>>(BUDGET_STATE()) ?? {};
  const now = Date.now();
  const modelPasses = (Array.isArray(raw.modelPasses) ? raw.modelPasses : [])
    .filter((iso) => {
      const t = Date.parse(String(iso));
      return Number.isFinite(t) && now - t < MODEL_PASS_INTERVAL_MS;
    });
  return {
    modelPasses,
    lastModelPassAt: typeof raw.lastModelPassAt === 'string' ? raw.lastModelPassAt : (modelPasses.at(-1) ?? null),
    nextModelPassAt: typeof raw.nextModelPassAt === 'string' ? raw.nextModelPassAt : null,
    maxPerHour: MODEL_PASSES_PER_HOUR,
    tokenTarget: MODEL_TOKEN_TARGET,
  };
}

export function recordModelPass(): BudgetState {
  const now = Date.now();
  const previous = readBudgetState();
  const next: BudgetState = {
    modelPasses: [...previous.modelPasses, new Date(now).toISOString()].slice(-MODEL_PASSES_PER_HOUR),
    lastModelPassAt: new Date(now).toISOString(),
    nextModelPassAt: new Date(now + MODEL_PASS_INTERVAL_MS).toISOString(),
    maxPerHour: MODEL_PASSES_PER_HOUR,
    tokenTarget: MODEL_TOKEN_TARGET,
  };
  writeJson(BUDGET_STATE(), next);
  return next;
}

/** Run the deterministic pass and persist its state. Zero model tokens. */
export function runCurationPass(apply = true): CurationState {
  // Outcomes first: the confidence the curator reads must be the measured one.
  const recalibration = recalibrateFromOutcomes();
  const result = curateInstincts({ apply });
  const state: CurationState = {
    at: new Date().toISOString(),
    result,
    census: censusInstincts(),
    recalibration,
  };
  writeJson(CURATION_STATE(), state);
  return state;
}

export interface ModelPassDecision {
  allowed: boolean;
  reason: string;
  candidates: number;
  passesLastHour: number;
  nextAllowedAt: string | null;
}

/**
 * A model pass is justified only by cross-project evidence. Project memory
 * (the 187 AIME instincts) is not a reason to spend a single token: it is
 * already scoped and useful in place.
 */
export function decideModelPass(state: CurationState | null, deep = false): ModelPassDecision {
  const budget = readBudgetState();
  const passesLastHour = budget.modelPasses.length;
  const nextAllowedAt = passesLastHour >= MODEL_PASSES_PER_HOUR
    ? budget.nextModelPassAt ?? new Date(Date.parse(budget.modelPasses.at(-1)!) + MODEL_PASS_INTERVAL_MS).toISOString()
    : null;
  if (deep) return { allowed: true, reason: 'deep compaction requested', candidates: 0, passesLastHour, nextAllowedAt: null };
  if (passesLastHour >= MODEL_PASSES_PER_HOUR) {
    return { allowed: false, reason: 'hourly model budget reached', candidates: state?.result.candidates ?? 0, passesLastHour, nextAllowedAt };
  }
  const candidates = state?.result.candidates ?? 0;
  if (candidates < 1) {
    return { allowed: false, reason: 'no cross-project evidence — deterministic pass only', candidates: 0, passesLastHour, nextAllowedAt: null };
  }
  return { allowed: true, reason: `${candidates} cross-project candidate(s)`, candidates, passesLastHour, nextAllowedAt: null };
}

/**
 * The continuous loop: one deterministic pass every 15 minutes. The HTTP
 * call lets the heartbeat route own the lock, budget and model spawn — this
 * scheduler never spawns a model itself.
 */
export function startCallimachusLoop(): { started: boolean; reason?: string } {
  if (process.env.OLYMPUS_CALLIMACHUS_LOOP === '0') return { started: false, reason: 'disabled by env' };
  const g = globalThis as any;
  if (g.__olympusCallimachusLoop) return { started: false, reason: 'already running' };
  g.__olympusCallimachusLoop = true;

  const apiBase = process.env.OLYMPUS_URL
    || `http://127.0.0.1:${process.env.PORT || process.env.OLYMPUS_PORT || 3737}`;

  const tick = async () => {
    try {
      const res = await fetch(`${apiBase}/api/olympus/callimachus/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loop: true }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok && res.status !== 429) {
        // 429 = cooldown/lock; a normal state, never an error to narrate.
        console.error(`[callimachus-loop] heartbeat HTTP ${res.status}`);
        return;
      }
      // Drain the SSE so the route keeps its abort listener alive while a
      // model pass runs. A skipped JSON response ends immediately.
      if (res.body) {
        try {
          const reader = res.body.getReader();
          while (!(await reader.read()).done) { /* discard */ }
        } catch { /* stream closed */ }
      }
    } catch { /* the app may still be booting; next tick retries */ }
  };

  setTimeout(() => { void tick(); }, 30_000).unref?.();
  setInterval(() => { void tick(); }, CURATION_INTERVAL_MS).unref?.();
  console.log(`[callimachus-loop] deterministic pass every ${CURATION_INTERVAL_MS / 60_000}m; model pass max ${MODEL_PASSES_PER_HOUR}/h with candidates`);
  return { started: true };
}
