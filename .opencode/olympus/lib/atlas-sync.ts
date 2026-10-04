/**
 * ATLAS SYNC — the sync-map: one writer, everyone reads.
 *
 * MADRUGA-3 rev 2, Part 2. Atlas is the sync center for ANY prompt the
 * system receives — project-side (human, via the chat.message hook) or
 * god dispatch (via the dispatch tool's entry, matching the Part 1
 * tool-side spine doctrine) — recorded in the sync-map BEFORE anything
 * else happens for that prompt.
 *
 * The entry contract (Phase 2):
 *   { id, origin: 'project'|'dispatch', source, ts, intent, status }
 *   status lifecycle: received → routed → done | failed.
 *   A prompt/dispatch that dies mid-flight lands 'failed' — never vanishes
 *   (pairs with E1: the exit-path finalize).
 *
 * SINGLE WRITER (Phase 3): only Atlas writes the map. Enforced by a hard
 * runtime guard, not convention:
 *   - writeSyncMapEntry(actor, entry) requires the module-internal ATLAS
 *     token (a non-exported symbol) — outsiders cannot forge it; every
 *     refused write names the offender and the funnel path.
 *   - The map is hash-chained: each Atlas write recomputes the chain;
 *     any out-of-band file write (a foreign entry, a hand-edited status)
 *     breaks the chain and the read path flags it — tamper-evident, no
 *     silent side-channels.
 *
 * READ PATH (Phase 4): atlasQueryPathState({reader}) — any god queries;
 * the returned state is reader-independent (the reader tag is query
 * metadata, not part of the state).
 *
 * State lives at ~/.olympus/sync-map.json (OLYMPUS_HOME — overridable for
 * hermetic fixtures per R11). Atomic writes (tmp + rename).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

// D21: the single canonical vault resolver (no direct env reads).
import { getVaultRoot } from "../../../src/lib/vault-root.js";
import {
  finalizeLocalDispatchesOnExit,
  hasLocalDispatchRegistrations,
  getOpenDispatches,
} from "./dispatch-tracker.js";

const OLYMPUS_HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), ".olympus");
const STATE_FILE = path.join(OLYMPUS_HOME, "sync-map.json");
const LIVE_FEED = path.join(getVaultRoot(), "06_Activity_Feed", "live.jsonl");

export type SyncOrigin = "project" | "dispatch";
export type SyncStatus = "received" | "routed" | "done" | "failed";

export interface SyncMapEntry {
  /** Unique entry id (sync-<uuid>). */
  id: string;
  origin: SyncOrigin;
  /** Source identity: the funnel + session/call identity. */
  source: string;
  /** ISO timestamp of receipt. */
  ts: string;
  /** Intent summary (the prompt head — what this is about). */
  intent: string;
  status: SyncStatus;
  /** Chain stamp (set by the Atlas writer; absent on tampered entries). */
  chainHash?: string;
  seq?: number;
  /** Optional linkage meta (dispatch id, parent god, session…). */
  meta?: Record<string, unknown>;
  /** Last status transition time + reason. */
  updatedTs?: string;
  updatedReason?: string;
}

interface PersistedSyncMap {
  entries: Record<string, SyncMapEntry>;
  chainHead: string;
  lastUpdated: string;
}

// ─── The single-writer token (non-exported — outsiders cannot forge it) ────

const ATLAS_TOKEN: unique symbol = Symbol("atlas.sync-map.writer");

// ─── State I/O (atomic; only reachable through the guarded writer) ──────────

function loadState(): PersistedSyncMap {
  // ALWAYS read from disk — no in-process cache. The map file is the
  // truth (cross-process + tamper visibility: an out-of-band write must
  // be visible to the very next read, not hidden behind a stale cache).
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as PersistedSyncMap;
      if (raw && raw.entries && typeof raw.chainHead === "string") {
        return raw;
      }
    }
  } catch {
    // Corrupt/absent — start a fresh map (never throw on READ; the guard
    // governs WRITES).
  }
  return { entries: {}, chainHead: "genesis", lastUpdated: new Date().toISOString() };
}

function canonicalEntry(e: SyncMapEntry): string {
  const { chainHash, ...rest } = e;
  return JSON.stringify(rest);
}

/** Recompute the full hash chain over the entries (seq order). */
function recomputeChain(state: PersistedSyncMap): void {
  const entries = Object.values(state.entries)
    .filter(e => typeof e.seq === "number")
    .sort((a, b) => (a.seq as number) - (b.seq as number));
  let prev = "genesis";
  for (const e of entries) {
    e.chainHash = crypto.createHash("sha256")
      .update(prev + "|" + e.id + "|" + canonicalEntry(e))
      .digest("hex");
    prev = e.chainHash;
  }
  state.chainHead = prev;
}

function persist(state: PersistedSyncMap): void {
  if (!fs.existsSync(OLYMPUS_HOME)) fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  } catch { /* unix rename overwrites */ }
  fs.renameSync(tmp, STATE_FILE);
}

// ─── The guarded writer (Phase 3's hard guard) ─────────────────────────────

export interface SyncMapEntryInput {
  id: string;
  origin: SyncOrigin;
  source: string;
  ts: string;
  intent: string;
  status: SyncStatus;
  meta?: Record<string, unknown>;
  updatedTs?: string;
  updatedReason?: string;
}

/**
 * THE guarded write path. Only Atlas passes the internal token; every
 * other caller is refused LOUDLY, named, with the funnel to use instead.
 * (The token parameter is not exportable — `undefined` for outsiders.)
 */
export function writeSyncMapEntry(
  actor: string,
  entry: SyncMapEntryInput,
  token?: unknown,
): SyncMapEntry {
  if (token !== ATLAS_TOKEN) {
    throw new Error(
      `sync-map write REFUSED: actor "${actor}" is not Atlas. The sync-map ` +
      `has exactly ONE writer. Route through the Atlas funnel instead: ` +
      `atlasIngestProjectPrompt() (the chat.message hook) or ` +
      `atlasIngestDispatch() (the dispatch tool's entry) in ` +
      `.opencode/olympus/lib/atlas-sync.ts — never write the map directly.`,
    );
  }
  const state = loadState();
  const e: SyncMapEntry = { ...entry } as SyncMapEntry;
  const existing = state.entries[entry.id];
  if (existing) {
    // Transition/update of an existing entry (status lifecycle).
    e.seq = existing.seq;
    e.chainHash = existing.chainHash;
    state.entries[entry.id] = e;
  } else {
    const seqs = Object.values(state.entries)
      .map(x => typeof x.seq === "number" ? x.seq : 0);
    e.seq = seqs.length ? Math.max(...seqs) + 1 : 1;
    state.entries[entry.id] = e;
  }
  recomputeChain(state);
  state.lastUpdated = new Date().toISOString();
  persist(state);
  return e;
}

/** Internal: the only token-holder path for creating + transitioning. */
function atlasWrite(entry: SyncMapEntryInput): SyncMapEntry {
  return writeSyncMapEntry("atlas", entry, ATLAS_TOKEN);
}

// ─── The funnel (Phase 1): every prompt entry point lands here FIRST ────────

/**
 * Project-side ingest — called by the chat.message hook the moment a user
 * message arrives (before marker parsing, before the model runs).
 */
export function atlasIngestProjectPrompt(input: {
  sessionID: string;
  text: string;
  agent?: string;
}): { id: string } {
  const id = "sync-" + crypto.randomUUID();
  atlasWrite({
    id,
    origin: "project",
    source: `chat.message:${input.sessionID}${input.agent ? ":" + input.agent : ""}`,
    ts: new Date().toISOString(),
    intent: (input.text || "").slice(0, 160),
    status: "received",
    meta: { sessionID: input.sessionID, agent: input.agent ?? null },
  });
  return { id };
}

/**
 * Dispatch-side ingest — called at the VERY TOP of the olympus-dispatch
 * tool's execute (works in every process that loads the tool, managed or
 * not — the Part 1 tool-side spine doctrine).
 */
export function atlasIngestDispatch(input: {
  godId: string;
  demigod: string;
  task: string;
  sessionID?: string;
}): { id: string } {
  const id = "sync-" + crypto.randomUUID();
  atlasWrite({
    id,
    origin: "dispatch",
    source: `olympus-dispatch:${input.sessionID ?? "no-session"}`,
    ts: new Date().toISOString(),
    intent: (input.task || "").slice(0, 160),
    status: "received",
    meta: {
      godId: input.godId,
      demigod: input.demigod,
      sessionID: input.sessionID ?? null,
    },
  });
  return { id };
}

/** The dispatch tool returned ok — link the registry id + parent god. */
export function atlasMarkDispatchRouted(id: string, info: {
  dispatchId: string;
  parentGod: string;
  demigod: string;
}): void {
  const state = loadState();
  const e = state.entries[id];
  if (!e) return;
  atlasWrite({
    id: e.id,
    origin: e.origin,
    source: e.source,
    ts: e.ts,
    intent: e.intent,
    status: "routed",
    meta: { ...(e.meta || {}), ...info },
    updatedTs: new Date().toISOString(),
    updatedReason: "dispatch registered + directive emitted",
  } as SyncMapEntryInput);
}

/** The dispatch attempt failed (refused, unregistrable, or thrown). */
export function atlasMarkDispatchFailed(id: string, reason: string): void {
  const state = loadState();
  const e = state.entries[id];
  if (!e) return;
  atlasWrite({
    id: e.id,
    origin: e.origin,
    source: e.source,
    ts: e.ts,
    intent: e.intent,
    status: "failed",
    meta: { ...(e.meta || {}), error: reason.slice(0, 300) },
    updatedTs: new Date().toISOString(),
    updatedReason: "dispatch attempt failed",
  } as SyncMapEntryInput);
}

/**
 * An emit-shaped dispatch prompt (symphony-resonate) completed: the
 * signature was composed + broadcast. The emit IS the completion —
 * the target demigods' own work happens through their own entries.
 */
export function atlasMarkEmitComplete(id: string, info: {
  signatureId: string;
  vaultAnchor: string;
}): void {
  const state = loadState();
  const e = state.entries[id];
  if (!e) return;
  atlasWrite({
    id: e.id,
    origin: e.origin,
    source: e.source,
    ts: e.ts,
    intent: e.intent,
    status: "done",
    meta: { ...(e.meta || {}), ...info },
    updatedTs: new Date().toISOString(),
    updatedReason: "signature composed + broadcast (emit complete)",
  } as SyncMapEntryInput);
}

/** Mark every still-received PROJECT entry done (session.idle — the turn completed). */
export function atlasMarkProjectTurnsDone(): number {
  const state = loadState();
  let n = 0;
  for (const e of Object.values(state.entries)) {
    if (e.origin === "project" && e.status === "received") {
      atlasWrite({
        id: e.id, origin: e.origin, source: e.source, ts: e.ts,
        intent: e.intent, status: "done",
        meta: e.meta,
        updatedTs: new Date().toISOString(),
        updatedReason: "session.idle — the prompt's turn completed",
      } as SyncMapEntryInput);
      n++;
    }
  }
  return n;
}

/**
 * Pair finalized dispatches (from session.idle or the exit path) with
 * their sync-map entries: outcome success → done, anything else → failed.
 * Entries never vanish — a completed dispatch lands 'done', a failed or
 * mid-flight-dead one lands 'failed'.
 */
export function atlasMarkDispatchesFinalized(
  finalized: Array<{ dispatchId: string; outcome: string }>,
): number {
  const state = loadState();
  const outcomeById = new Map(finalized.map(f => [f.dispatchId, f.outcome]));
  let n = 0;
  for (const e of Object.values(state.entries)) {
    if (e.origin !== "dispatch" || e.status !== "routed") continue;
    const dispatchId = e.meta && typeof e.meta.dispatchId === "string" ? e.meta.dispatchId : null;
    if (!dispatchId || !outcomeById.has(dispatchId)) continue;
    const outcome = outcomeById.get(dispatchId) as string;
    const to = outcome === "success" ? "done" : "failed";
    atlasWrite({
      id: e.id, origin: e.origin, source: e.source, ts: e.ts,
      intent: e.intent, status: to,
      meta: { ...(e.meta || {}), trackerOutcome: outcome },
      updatedTs: new Date().toISOString(),
      updatedReason: `dispatch finalize — ${outcome}`,
    } as SyncMapEntryInput);
    n++;
  }
  return n;
}

// ─── E1: the exit-path finalize (pairs with D18) ────────────────────────────

export interface ExitFinalizeReport {
  dispatchesFinalized: Array<{ dispatchId: string; god: string; demigod: string; outcome: string }>;
  syncEntriesTransitioned: Array<{ id: string; from: string; to: string }>;
  failures: string[];
}

/**
 * Finalize at process exit: the dispatches THIS process opened get their
 * tracker outcome (mid-flight deaths land 'failed' — never dangle, the
 * D18 class), the sync-map transitions to match, and any failure of the
 * finalize itself is LOUD (throws — the plugin's exit handler logs it;
 * fixtures catch it to assert the loudness).
 */
export function finalizeAtlasOnProcessExit(): ExitFinalizeReport {
  const report: ExitFinalizeReport = { dispatchesFinalized: [], syncEntriesTransitioned: [], failures: [] };

  // #25 gate preservation: a process that never dispatched and holds no
  // sync-map entries writes NOTHING at exit (unmanaged foreign processes
  // stay untouched).
  if (!hasLocalDispatchRegistrations()) {
    const state = loadState();
    const live = Object.values(state.entries).filter(e =>
      e.origin === "dispatch" ? (e.status === "received" || e.status === "routed") : e.status === "received");
    if (live.length === 0) return report;
  }

  // 1. The tracker: finalize the dispatches this process registered.
  let trackerReport: ReturnType<typeof finalizeLocalDispatchesOnExit>;
  try {
    trackerReport = finalizeLocalDispatchesOnExit();
  } catch (e: any) {
    throw new Error(`dispatch finalize failed at process exit: ${e?.message || e}`);
  }
  report.dispatchesFinalized = trackerReport.finalized;
  report.failures.push(...trackerReport.failures);

  // 2. The sync-map: transition to match.
  const state = loadState();
  const outcomeById = new Map(trackerReport.finalized.map(f => [f.dispatchId, f.outcome]));
  for (const e of Object.values(state.entries)) {
    // A tampered entry (no valid chain stamp) is NOT Atlas's to mutate —
    // it stays exactly as the out-of-band writer left it, flagged by the
    // read path.
    if (typeof e.chainHash !== "string" || typeof e.seq !== "number") continue;
    if (e.origin === "dispatch") {
      if (e.status === "routed" && e.meta && typeof e.meta.dispatchId === "string") {
        const outcome = outcomeById.get(e.meta.dispatchId);
        if (outcome) {
          const to = outcome === "success" ? "done" : "failed";
          atlasWrite({
            id: e.id, origin: e.origin, source: e.source, ts: e.ts,
            intent: e.intent, status: to,
            meta: { ...(e.meta || {}), trackerOutcome: outcome },
            updatedTs: new Date().toISOString(),
            updatedReason: `process exit — dispatch ${outcome}`,
          } as SyncMapEntryInput);
          report.syncEntriesTransitioned.push({ id: e.id, from: "routed", to });
          continue;
        }
      }
      if (e.status === "received" || e.status === "routed") {
        // Died mid-flight: never routed back, or routed but the tracker has
        // no finalized record for it — failed, never vanished.
        atlasWrite({
          id: e.id, origin: e.origin, source: e.source, ts: e.ts,
          intent: e.intent, status: "failed",
          meta: e.meta,
          updatedTs: new Date().toISOString(),
          updatedReason: "process exit — died mid-flight",
        } as SyncMapEntryInput);
        report.syncEntriesTransitioned.push({ id: e.id, from: e.status, to: "failed" });
      }
    } else if (e.origin === "project" && e.status === "received") {
      atlasWrite({
        id: e.id, origin: e.origin, source: e.source, ts: e.ts,
        intent: e.intent, status: "failed",
        meta: e.meta,
        updatedTs: new Date().toISOString(),
        updatedReason: "process exit — prompt died mid-flight",
      } as SyncMapEntryInput);
      report.syncEntriesTransitioned.push({ id: e.id, from: "received", to: "failed" });
    }
  }

  if (report.failures.length > 0) {
    throw new Error(
      `dispatch finalize failed at process exit: ${report.failures.join("; ")}`,
    );
  }
  return report;
}

// ─── The read path (Phase 4) — any god, identical results ──────────────────

export interface PathStateQuery {
  reader?: string;
  origin?: SyncOrigin;
  status?: SyncStatus;
}

export interface PathStateResult {
  chainValid: boolean;
  tampered: string[];
  entries: SyncMapEntry[];
}

/**
 * Query current path state. The RESULT is reader-independent: the reader
 * tag is recorded for the audit log, never part of the state itself.
 */
export function atlasQueryPathState(query: PathStateQuery = {}): {
  reader: string;
  result: PathStateResult;
} {
  const state = loadState();
  // Verify the chain: recompute over the chained entries and detect any
  // entry that is not covered by a valid link (out-of-band writes).
  const entries = Object.values(state.entries);
  const chained = entries
    .filter(e => typeof e.seq === "number" && typeof e.chainHash === "string")
    .sort((a, b) => (a.seq as number) - (b.seq as number));
  let prev = "genesis";
  const tampered: string[] = [];
  let chainValid = true;
  for (const e of chained) {
    const expect = crypto.createHash("sha256")
      .update(prev + "|" + e.id + "|" + canonicalEntry(e))
      .digest("hex");
    if (expect !== e.chainHash) {
      chainValid = false;
      tampered.push(e.id);
      continue;
    }
    prev = e.chainHash;
  }
  if (prev !== state.chainHead) chainValid = false;
  for (const e of entries) {
    if (typeof e.seq !== "number" || typeof e.chainHash !== "string") {
      chainValid = false;
      tampered.push(e.id);
    }
  }
  let filtered = entries;
  if (query.origin) filtered = filtered.filter(e => e.origin === query.origin);
  if (query.status) filtered = filtered.filter(e => e.status === query.status);
  // Log the query to the feed (audit trail — best-effort, never throws).
  try {
    if (!fs.existsSync(path.dirname(LIVE_FEED))) fs.mkdirSync(path.dirname(LIVE_FEED), { recursive: true });
    fs.appendFileSync(LIVE_FEED, JSON.stringify({
      ts: new Date().toISOString(),
      god: query.reader || "unknown",
      action: "atlas_query",
      msg: `god ${query.reader || "unknown"} queried the sync-map (${filtered.length} entries, chain ${chainValid ? "valid" : "BROKEN"})`,
    }) + "\n", "utf-8");
  } catch { /* audit trail is best-effort */ }
  return {
    reader: query.reader || "unknown",
    result: { chainValid, tampered, entries: filtered },
  };
}

// Re-exported for the exit-handler wiring in olympus-hooks.ts.
export { getOpenDispatches };
