/**
 * atlas-warden.ts — v0.0.89: Atlas stays on, without hijacking Apollo.
 *
 * The v0.0.88 campaign-health work made the park visible; this module makes
 * Atlas ACT on it continuously. The warden is a server-side loop (no model,
 * no token, no prompt):
 *
 *   - scans every project lane with a plan;
 *   - inside a live walk it only observes (the walker owns the lane);
 *   - after the user opted that campaign into auto-resume, it applies the
 *     deterministic recovery and starts the detached walk again (bounded by
 *     the recovery ledger + a per-lane throttle);
 *   - before the opt-in, it writes ONE decision: "continue this campaign" or
 *     "start another project" — the UI renders that box;
 *   - a provider/auth/unknown park becomes NEEDS-YOU, never a blind restart;
 *   - it NEVER dispatches Apollo or Atlas model turns. The user talks to a
 *     god only by clicking a button.
 *
 * Atlas's own lane is pinned to `opencode-go/hy3` whenever a lane config
 * drifts (the "nemotron Atlas" specimen from the live box).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getVaultRoot } from './vault-root';
import { readWalkLock } from './hop-runtime/walk-lock';
import { loadHopState } from './hop-runtime/hop-state';
import { readFrozenPlan, readPlanFile, planPath } from './hop-runtime/plan-generation';
import { buildCampaignHealth, type CampaignHealth } from './campaign-health';
import { patrolLane } from './atlas-patrol';
import { decideRecovery, applyRecovery, readRecoveries } from './hop-runtime/recovery';
import { startDetachedWalk, readSupervisor } from './hop-runtime/supervisor';
import { appendActivity } from './activity-feed';

export const ATLAS_MODEL = 'opencode-go/hy3';
export const ATLAS_DECISION_FILE = 'atlas-decision.json';
export const ATLAS_WARDEN_FILE = 'atlas-warden.json';
export const ATLAS_OPTIN_FILE = 'atlas-optin.json';
export const ATLAS_STARTS_FILE = 'atlas-warden-starts.json';

const TICK_MS = 30_000;
const MIN_START_GAP_MS = 120_000;
const MAX_WARDEN_STARTS = 6;

export type WardenDecisionKind = 'interrupted' | 'parked' | 'needs-user';

export interface WardenDecision {
  id: string;
  slug: string;
  laneRoot: string;
  kind: WardenDecisionKind;
  hopId: string | null;
  reason: string;
  message: string;
  at: string;
  actions: Array<'continue' | 'new-project' | 'dismiss'>;
}

export interface WardenLane {
  slug: string;
  laneRoot: string;
  generation: number;
  completed: number;
  total: number;
  running: number;
  verdict: CampaignHealth['verdict'];
  health: string;
  parked: string | null;
  optedIn: boolean;
  supervisor: 'running' | 'idle' | 'none';
  lastAction: string | null;
}

export interface WardenState {
  active: boolean;
  model: typeof ATLAS_MODEL;
  at: string;
  lanes: WardenLane[];
  decision: WardenDecision | null;
  lastAction: { at: string; slug: string; action: string; detail: string } | null;
}

function homeDir(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

function statePath(): string { return path.join(homeDir(), ATLAS_WARDEN_FILE); }
function decisionPath(): string { return path.join(homeDir(), ATLAS_DECISION_FILE); }
function optInPath(): string { return path.join(homeDir(), ATLAS_OPTIN_FILE); }
function startsPath(): string { return path.join(homeDir(), ATLAS_STARTS_FILE); }

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return fallback; }
}

function writeJson(file: string, value: unknown): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  } catch { /* best effort: the warden never breaks the app */ }
}

export function readWardenState(): WardenState {
  const raw = readJson<Partial<WardenState> | null>(statePath(), null);
  return {
    active: raw?.active !== false,
    model: ATLAS_MODEL,
    at: raw?.at ?? new Date(0).toISOString(),
    lanes: Array.isArray(raw?.lanes) ? raw!.lanes! : [],
    decision: readDecision(),
    lastAction: raw?.lastAction ?? null,
  };
}

export function readDecision(): WardenDecision | null {
  const raw = readJson<WardenDecision | null>(decisionPath(), null);
  return raw && typeof raw.id === 'string' && raw.slug ? raw : null;
}

/** Idempotent: the same decision is never re-dated on every tick. */
export function writeDecision(decision: WardenDecision): WardenDecision {
  const prev = readDecision();
  if (prev?.id === decision.id) return prev;
  writeJson(decisionPath(), decision);
  try {
    appendActivity({
      god: 'atlas', action: 'needs-user', project: decision.slug,
      msg: `Atlas needs a decision: ${decision.message}`,
      meta: { kind: 'atlas-decision', hop: decision.hopId, reason: decision.reason, lane: decision.laneRoot },
    });
  } catch { /* best effort */ }
  return decision;
}

export function clearDecision(slug?: string): void {
  const prev = readDecision();
  if (!prev) return;
  if (slug && prev.slug !== slug) return;
  try { fs.unlinkSync(decisionPath()); } catch { /* gone */ }
}

function readOptIns(): Record<string, { at: string }> {
  return readJson<Record<string, { at: string }>>(optInPath(), {});
}

export function readOptIn(slug: string): boolean {
  return Boolean(readOptIns()[slug]);
}

export function writeOptIn(slug: string, on = true): void {
  const all = readOptIns();
  if (on) all[slug] = { at: new Date().toISOString() };
  else delete all[slug];
  writeJson(optInPath(), all);
}

interface StartRecord { last: number; count: number }
function readStarts(): Record<string, StartRecord> {
  const raw = readJson<Record<string, StartRecord | number>>(startsPath(), {});
  const out: Record<string, StartRecord> = {};
  for (const [slug, v] of Object.entries(raw)) {
    out[slug] = typeof v === 'number' ? { last: v, count: 1 } : { last: Number(v?.last ?? 0), count: Number(v?.count ?? 0) };
  }
  return out;
}

function noteStart(slug: string, now: number): void {
  const all = readStarts();
  all[slug] = { last: now, count: (all[slug]?.count ?? 0) + 1 };
  writeJson(startsPath(), all);
}

function startCount(slug: string): number {
  return readStarts()[slug]?.count ?? 0;
}

/**
 * The "nemotron Atlas" cure: a lane config that drifted must say HY3 before
 * the next walk. The root config already does; lanes are copied on drift, but
 * a legacy lane can survive an app upgrade. Only called when no walk is live.
 */
export function pinAtlasHy3(laneRoot: string): { changed: boolean; from: string | null } {
  const file = path.join(laneRoot, 'opencode.json');
  const cfg = readJson<any | null>(file, null);
  if (!cfg?.agent?.atlas) return { changed: false, from: null };
  const from = String(cfg.agent.atlas.model ?? '');
  if (from === ATLAS_MODEL) return { changed: false, from };
  try {
    const backup = `${file}.bak-atlas-hy3-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(file, backup);
    cfg.agent.atlas.model = ATLAS_MODEL;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
    try {
      appendActivity({
        god: 'atlas', action: 'lane-config', project: path.basename(laneRoot),
        msg: `Atlas pinned to ${ATLAS_MODEL} (was ${from || 'unset'}) — the lane config is corrected before the next walk.`,
        meta: { kind: 'atlas-hy3', from, lane: laneRoot },
      });
    } catch { /* best effort */ }
    return { changed: true, from };
  } catch {
    return { changed: false, from };
  }
}

function activeSlug(): string | null {
  const raw = readJson<{ slug?: string } | null>(path.join(homeDir(), 'active-project.json'), null);
  return String(raw?.slug ?? '') || null;
}

function listLanes(vaultRoot: string): string[] {
  const projects = path.join(vaultRoot, '02_Projects');
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(projects, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e) => path.join(projects, e.name))
    .filter((lane) => fs.existsSync(planPath(lane)))
    .slice(0, 40);
}

export interface WardenTickOptions {
  /** Test seam: the real default spawns the detached walker. */
  start?: (opts: { slug: string; laneRoot: string; autoResume?: boolean; keepQuarantine?: boolean; retryParkedHop?: boolean }) => { ok: boolean; pid?: number; reason?: string };
  now?: number;
  vaultRoot?: string;
  /** Do not touch the real supervisor/opt-in in a fixture. */
  persist?: boolean;
}

/** One scan. Pure-ish: no model, no tokens, no Apollo prompt. */
export function wardenTick(opts: WardenTickOptions = {}): WardenState {
  const now = opts.now ?? Date.now();
  const vault = opts.vaultRoot ?? getVaultRoot();
  const start = opts.start ?? startDetachedWalk;
  const persist = opts.persist !== false;
  const previous = readWardenState();
  const lanes: WardenLane[] = [];
  const decisions: WardenDecision[] = [];
  let lastAction = previous.lastAction;

  for (const laneRoot of listLanes(vault)) {
    const slug = path.basename(laneRoot);
    const plan = readFrozenPlan(laneRoot) ?? readPlanFile(planPath(laneRoot));
    if (!plan?.hops?.length) continue;
    const lock = readWalkLock(laneRoot);
    const live = Boolean(lock.holder && lock.alive);
    const state = loadHopState(laneRoot);
    const health = buildCampaignHealth(laneRoot);
    const supervisor = readSupervisor(slug);
    const optedIn = readOptIn(slug) || supervisor.state?.autoResume === true;
    const parked = state?.parked ?? null;
    const pending = health.total - health.completed;

    if (health.verdict === 'DONE' && pending <= 0) {
      if (persist) clearDecision(slug);
      lanes.push({
        slug, laneRoot, generation: health.generation, completed: health.completed, total: health.total,
        running: health.running, verdict: health.verdict, health: health.line, parked: parked?.hopId ?? null,
        optedIn, supervisor: supervisor.alive ? 'running' : supervisor.state ? 'idle' : 'none', lastAction: null,
      });
      continue;
    }

    if (live) {
      if (persist) clearDecision(slug);
      lanes.push({
        slug, laneRoot, generation: health.generation, completed: health.completed, total: health.total,
        running: health.running, verdict: health.verdict, health: health.line, parked: parked?.hopId ?? null,
        optedIn, supervisor: 'running', lastAction: null,
      });
      continue;
    }

    // No live walk and pending hops. The user's opt-in decides whether Atlas
    // may start it; without it, ONE decision box is the only action.
    if (!optedIn) {
      const decision: WardenDecision = {
        id: `${slug}:${parked?.hopId ?? 'interrupted'}:${parked?.reason ?? 'no-live-walk'}`,
        slug, laneRoot,
        kind: parked ? (health.verdict === 'NEEDS-YOU' ? 'needs-user' : 'parked') : 'interrupted',
        hopId: parked?.hopId ?? null,
        reason: parked?.reason ?? 'no live walk',
        message: parked
          ? `${slug} is parked at ${parked.hopId} (${parked.reason}). Continue the campaign or start another project?`
          : `${slug} has ${pending} hop(s) pending and no live walk. Continue the campaign or start another project?`,
        at: new Date(now).toISOString(),
        actions: ['continue', 'new-project', 'dismiss'],
      };
      decisions.push(decision);
      lanes.push({
        slug, laneRoot, generation: health.generation, completed: health.completed, total: health.total,
        running: 0, verdict: health.verdict, health: health.line, parked: parked?.hopId ?? null,
        optedIn: false, supervisor: supervisor.state ? 'idle' : 'none', lastAction: null,
      });
      continue;
    }

    // Opted in: recover + resume, bounded. A provider/auth/unknown park stops
    // and asks; it never burns the night on the same lane.
    const last = readStarts()[slug]?.last ?? 0;
    if (now - last < MIN_START_GAP_MS) {
      lanes.push({
        slug, laneRoot, generation: health.generation, completed: health.completed, total: health.total,
        running: 0, verdict: health.verdict, health: health.line, parked: parked?.hopId ?? null,
        optedIn: true, supervisor: supervisor.state ? 'idle' : 'none', lastAction: 'throttled',
      });
      continue;
    }
    if (readRecoveries(laneRoot).filter((r) => r?.action === 'retry').length >= MAX_WARDEN_STARTS
      || startCount(slug) >= MAX_WARDEN_STARTS) {
      const decision: WardenDecision = {
        id: `${slug}:${parked?.hopId ?? 'budget'}:recovery-budget`,
        slug, laneRoot, kind: 'needs-user', hopId: parked?.hopId ?? null,
        reason: 'recovery-budget', message: `${slug}: the automatic recovery budget is exhausted. The user needs to decide.`,
        at: new Date(now).toISOString(), actions: ['new-project', 'dismiss'],
      };
      decisions.push(decision);
      lanes.push({
        slug, laneRoot, generation: health.generation, completed: health.completed, total: health.total,
        running: 0, verdict: 'NEEDS-YOU', health: health.line, parked: parked?.hopId ?? null,
        optedIn: true, supervisor: supervisor.state ? 'idle' : 'none', lastAction: 'needs-user',
      });
      continue;
    }

    const patrol = (() => { try { return patrolLane(laneRoot); } catch { return null; } })();
    const finding = patrol?.parked[0] ?? patrol?.stuck[0] ?? null;
    if (finding) {
      const recovery = decideRecovery(laneRoot, finding);
      if (recovery.action === 'stop') {
        const decision: WardenDecision = {
          id: `${slug}:${finding.hopId}:${finding.failureClass}:stop`,
          slug, laneRoot, kind: 'needs-user', hopId: finding.hopId,
          reason: finding.failureClass, message: `${slug}: ${recovery.message}`,
          at: new Date(now).toISOString(), actions: ['new-project', 'dismiss'],
        };
        decisions.push(decision);
        lanes.push({
          slug, laneRoot, generation: health.generation, completed: health.completed, total: health.total,
          running: 0, verdict: 'NEEDS-YOU', health: health.line, parked: finding.hopId,
          optedIn: true, supervisor: supervisor.state ? 'idle' : 'none', lastAction: 'needs-user',
        });
        continue;
      }
      if (persist) {
        try { applyRecovery(laneRoot, finding, recovery); } catch { /* the start still tries */ }
      }
    }

    if (persist) pinAtlasHy3(laneRoot);
    const started = start({ slug, laneRoot, autoResume: true, keepQuarantine: true, retryParkedHop: true });
    if (persist) {
      noteStart(slug, now);
      lastAction = {
        at: new Date(now).toISOString(), slug,
        action: started.ok ? 'resume' : 'resume-refused',
        detail: started.ok ? `pid ${started.pid ?? '?'}` : (started.reason || 'start refused'),
      };
      if (started.ok) {
        try {
          appendActivity({
            god: 'atlas', action: 'milestone', project: slug,
            msg: `Atlas warden resumed ${slug}${finding ? ` after ${finding.failureClass} on ${finding.hopId}` : ''} — pid ${started.pid ?? '?'}.`,
            meta: { kind: 'atlas-warden-resume', hop: finding?.hopId ?? null, lane: laneRoot },
          });
        } catch { /* best effort */ }
      }
    }
    lanes.push({
      slug, laneRoot, generation: health.generation, completed: health.completed, total: health.total,
      running: 0, verdict: started.ok ? 'DEGRADED' : health.verdict, health: health.line, parked: parked?.hopId ?? null,
      optedIn: true, supervisor: started.ok ? 'running' : (supervisor.state ? 'idle' : 'none'),
      lastAction: started.ok ? 'resuming' : (started.reason || 'refused'),
    });
  }

  const preferred = decisions.find((d) => d.slug === activeSlug()) ?? decisions[0] ?? null;
  if (persist && preferred) writeDecision(preferred);
  const state: WardenState = {
    active: true, model: ATLAS_MODEL, at: new Date(now).toISOString(),
    lanes, decision: persist ? readDecision() : preferred, lastAction,
  };
  if (persist) writeJson(statePath(), state);
  return state;
}

/** Resolve the single decision box. `continue` is the only path to autonomy. */
export function resolveDecision(
  action: 'continue' | 'new-project' | 'dismiss',
  slugOverride?: string,
  opts: { start?: WardenTickOptions['start'] } = {},
): { ok: boolean; slug?: string; pid?: number; openNewProject?: boolean; error?: string } {
  const decision = readDecision();
  const slug = slugOverride || decision?.slug;
  if (!slug) return { ok: false, error: 'no decision and no slug' };
  const laneRoot = decision?.laneRoot ?? path.join(getVaultRoot(), '02_Projects', slug);
  if (action === 'new-project') {
    clearDecision(slug);
    return { ok: true, slug, openNewProject: true };
  }
  if (action === 'dismiss') {
    clearDecision(slug);
    return { ok: true, slug };
  }
  writeOptIn(slug, true);
  clearDecision(slug);
  const start = opts.start ?? startDetachedWalk;
  const started = start({ slug, laneRoot, autoResume: true, keepQuarantine: true, retryParkedHop: true });
  if (started.ok) noteStart(slug, Date.now());
  try {
    appendActivity({
      god: 'atlas', action: 'milestone', project: slug,
      msg: started.ok
        ? `Atlas will keep ${slug} walking (auto-resume on) — pid ${started.pid ?? '?'}.`
        : `Atlas could not resume ${slug}: ${started.reason || 'refused'}.`,
      meta: { kind: 'atlas-optin', lane: laneRoot },
    });
  } catch { /* best effort */ }
  return { ok: started.ok, slug, pid: started.pid, error: started.ok ? undefined : started.reason };
}

/** Start the one server-side warden. Idempotent; one interval per process. */
export function startAtlasWarden(): void {
  if (process.env.OLYMPUS_ATLAS_WARDEN === '0') return;
  const g = globalThis as unknown as { __olympusAtlasWarden?: { timer: NodeJS.Timeout; booted: boolean } };
  if (g.__olympusAtlasWarden) return;
  const boot = setTimeout(() => { void wardenTick(); }, 6_000);
  boot.unref?.();
  const timer = setInterval(() => { void wardenTick(); }, TICK_MS);
  timer.unref?.();
  g.__olympusAtlasWarden = { timer, booted: true };
}

/** Test/force helper: a fresh scan without the interval. */
export function atlasWardenSnapshot(): WardenState {
  return wardenTick({ persist: false });
}
