/**
 * HITL DAG Gates — Human-in-the-Loop approval for plan phases.
 *
 * Stores pending gate state in-memory + persisted to the vault so gates
 * survive OLYMPUS restarts. Polled by the UI for Resume / Patch / Abort.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getVaultRoot } from './vault-root';

export interface HitlGate {
  id: string;
  /** The plan phase that triggered this gate (e.g. "Phase 2: Database Migration"). */
  phase: string;
  /** The action that requires approval (e.g. "Run Migration"). */
  action: string;
  /** The prompt shown to the user (e.g. "This migration adds NOT NULL column. Confirm?"). */
  approvalPrompt: string;
  /** ISO timestamp when the gate was created. */
  createdAt: string;
  /** The session ID that created the gate (for routing the response back). */
  sessionId: string;
  /** The god that's waiting for approval (usually Apollo). */
  god: string;
  /** Optional file path or command that will be executed if approved. */
  targetFile?: string;
  targetCommand?: string;
  /** The user's decision: null = pending, 'approve' = resume, 'patch' = resume with modifications, 'abort' = cancel. */
  decision: null | 'approve' | 'patch' | 'abort';
  /** ISO timestamp when the user decided. */
  decidedAt?: string;
  /** Optional user note (e.g. patch instructions when decision='patch'). */
  userNote?: string;
}

interface HitlState {
  gates: HitlGate[];
}

const STATE_FILE = join(getVaultRoot(), '05_Auto_Learning', 'hitl-gates.json');

let state: HitlState | null = null;

function loadState(): HitlState {
  if (state) return state;
  try {
    if (existsSync(STATE_FILE)) {
      const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as HitlState | null;
      state = parsed && typeof parsed === 'object' ? parsed : { gates: [] };
      if (!state.gates) state.gates = [];
    } else {
      state = { gates: [] };
    }
  } catch {
    state = { gates: [] };
  }
  return state;
}

function saveState(): void {
  try {
    mkdirSync(join(getVaultRoot(), '05_Auto_Learning'), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(loadState(), null, 2), 'utf-8');
  } catch (err: any) {
    console.error('[olympus:hitl] saveState failed:', err.message);
  }
}

/**
 * Create a new pending gate. Called by the dispatch-tracker when it
 * encounters a phase with `RequiresApproval: true`.
 */
export function createGate(params: {
  phase: string;
  action: string;
  approvalPrompt: string;
  sessionId: string;
  god: string;
  targetFile?: string;
  targetCommand?: string;
}): HitlGate {
  const s = loadState();
  const gate: HitlGate = {
    id: `gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    phase: params.phase,
    action: params.action,
    approvalPrompt: params.approvalPrompt,
    createdAt: new Date().toISOString(),
    sessionId: params.sessionId,
    god: params.god,
    targetFile: params.targetFile,
    targetCommand: params.targetCommand,
    decision: null,
  };
  s.gates.push(gate);
  saveState();
  return gate;
}

/**
 * Get all pending gates (decision === null). Polled by the UI every 5 seconds.
 */
export function getPendingGates(): HitlGate[] {
  return loadState().gates.filter(g => g.decision === null);
}

/**
 * List ALL gates (pending + resolved), oldest first. #120 (PLANO-MASTER-1
 * B6): the plan-walk flow looks up its gate's RESOLVED decision too (an
 * approved walk must not re-ask; an aborted plan stays withheld) — the
 * pending-only view cannot answer "what did the user decide".
 */
export function listGates(): HitlGate[] {
  return loadState().gates;
}

/**
 * Get a gate by ID.
 */
export function getGate(id: string): HitlGate | null {
  return loadState().gates.find(g => g.id === id) || null;
}

/**
 * Resolve a gate with the user's decision. Called by the API route when
 * the user clicks Resume / Patch / Abort.
 */
export function resolveGate(id: string, decision: 'approve' | 'patch' | 'abort', userNote?: string): HitlGate | null {
  const s = loadState();
  const gate = s.gates.find(g => g.id === id);
  if (!gate) return null;
  gate.decision = decision;
  gate.decidedAt = new Date().toISOString();
  if (userNote) gate.userNote = userNote;
  saveState();
  return gate;
}

/**
 * Clean up resolved gates older than 24 hours. Called by the vault prune
 * policy on session.idle.
 */
export function cleanupResolvedGates(): number {
  const s = loadState();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const before = s.gates.length;
  s.gates = s.gates.filter(g => {
    if (g.decision === null) return true; // keep pending
    if (!g.decidedAt) return true;
    return new Date(g.decidedAt).getTime() > cutoff;
  });
  const removed = before - s.gates.length;
  if (removed > 0) saveState();
  return removed;
}
