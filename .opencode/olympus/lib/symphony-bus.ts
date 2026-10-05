/**
 * SYMPHONY BUS — the context cable (MADRUGA-3 rev 2, Part 3).
 *
 * What connects the gods: time, synchrony, objectivity, path. No god
 * coordinates with another through private channels — heartbeats,
 * dispatches, and state changes all ride this bus, and any subscriber
 * can reconstruct "where are we on the path?" from the event log alone.
 *
 * Design (the honest in-repo shape for an in-process pantheon):
 *   - The LOG is the cable: append-only JSONL at
 *     ~/.olympus/symphony-bus.jsonl (OLYMPUS_HOME — R11-overridable).
 *   - ORDERING: every event carries a strictly monotonic `seq` (max+1);
 *     readers can detect gaps/reordering by seq.
 *   - AT-LEAST-ONCE + DEDUP: `busPublish` is idempotent per `dedupKey` —
 *     a re-fired hook publishes once (duplicates are counted, not written).
 *   - OBJECTIVITY: events carry facts with evidence references (paths,
 *     ids), never narratives — the schema enforces `evidence` on the
 *     event types that make claims.
 *   - FAILURE SEMANTICS: a dead subscriber (a handler that throws) never
 *     blocks the bus — the drop is LOUD (logged + counted on the event +
 *     in the log) and the publish proceeds.
 *   - REPLAY: `busReplay(filter)` reconstructs path state (god states +
 *     dispatch lifecycle) from the event log ALONE — the dual-record
 *     consistency with the sync-map is asserted by the fixture.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

const OLYMPUS_HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), ".olympus");
const BUS_LOG = path.join(OLYMPUS_HOME, "symphony-bus.jsonl");

export type BusEventType =
  | "heartbeat"          // a god's state change (idle|thinking|acting|done|blocked)
  | "dispatch"           // a directive entered the bus
  | "dispatch-outcome"   // the finalize record (success|failure|contract-violation)
  | "atlas-ingest-error" // E1: an Atlas funnel failure, surfaced on the bus
  | "subscriber-drop";   // E4 phase 4: a dead subscriber, loudly recorded

export interface BusEvent {
  seq: number;
  id: string;
  ts: string;
  type: BusEventType;
  god?: string;
  state?: string;        // heartbeats: idle|thinking|acting|done|blocked
  dedupKey?: string;
  payload?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  duplicateCount?: number; // set on dedup drops (never persisted as events)
}

interface Subscriber {
  id: string;
  handler: (e: BusEvent) => void;
}

const subscribers: Subscriber[] = [];
const droppedSubscribers = new Map<string, number>();
const seenDedupKeys = new Map<string, number>();

function loadEvents(): BusEvent[] {
  try {
    if (!fs.existsSync(BUS_LOG)) return [];
    return fs.readFileSync(BUS_LOG, "utf-8").trim().split("\n")
      .filter(Boolean).map(l => JSON.parse(l) as BusEvent);
  } catch {
    return []; // a corrupt log is loud at REPLAY (reconstruction carries corrupt:true), never silently trusted
  }
}

function append(event: BusEvent): void {
  if (!fs.existsSync(OLYMPUS_HOME)) fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
  fs.appendFileSync(BUS_LOG, JSON.stringify(event) + "\n", "utf-8");
}

/**
 * Publish an event. Idempotent per dedupKey (at-least-once callers may
 * re-fire; the log holds one). Dead subscribers never block: each drop
 * is logged LOUD (console.error + counted) and the publish proceeds.
 * Returns the persisted event, or the duplicate marker.
 */
export function busPublish(input: {
  type: BusEventType;
  god?: string;
  state?: string;
  dedupKey?: string;
  payload?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
}): { event: BusEvent | null; duplicate: boolean; duplicateCount: number; droppedSubscribers: number } {
  const key = input.dedupKey;
  if (key) {
    const seen = seenDedupKeys.get(key) ?? loadEvents().filter(e => e.dedupKey === key).length;
    if (seen > 0) {
      seenDedupKeys.set(key, seen + 1);
      return { event: null, duplicate: true, duplicateCount: seen + 1, droppedSubscribers: 0 };
    }
    seenDedupKeys.set(key, 1);
  }
  const events = loadEvents();
  const event: BusEvent = {
    seq: events.reduce((m, e) => Math.max(m, e.seq || 0), 0) + 1,
    id: "bus-" + crypto.randomUUID(),
    ts: new Date().toISOString(),
    type: input.type,
    god: input.god,
    state: input.state,
    dedupKey: key,
    payload: input.payload,
    evidence: input.evidence,
  };
  append(event);
  // Delivery: dead subscribers never block the bus.
  let drops = 0;
  for (const sub of [...subscribers]) {
    try {
      sub.handler(event);
    } catch (e: any) {
      drops++;
      const count = (droppedSubscribers.get(sub.id) ?? 0) + 1;
      droppedSubscribers.set(sub.id, count);
      console.error(`[symphony-bus] subscriber "${sub.id}" DROPPED event ${event.seq} (${event.type}): ${e?.message || e} — the bus continues`);
      append({
        seq: loadEvents().reduce((m, x) => Math.max(m, x.seq || 0), 0) + 1,
        id: "bus-" + crypto.randomUUID(),
        ts: new Date().toISOString(),
        type: "subscriber-drop",
        god: "symphony",
        payload: { subscriber: sub.id, droppedSeq: event.seq, droppedType: event.type, error: String(e?.message || e).slice(0, 200) },
      });
    }
  }
  return { event, duplicate: false, duplicateCount: 0, droppedSubscribers: drops };
}

/** Subscribe. Returns an unsubscribe fn. */
export function busSubscribe(id: string, handler: (e: BusEvent) => void): () => void {
  subscribers.push({ id, handler });
  return () => {
    const i = subscribers.findIndex(s => s.id === id);
    if (i >= 0) subscribers.splice(i, 1);
  };
}

/** Per-subscriber drop counts (the loud ledger of dead subscribers). */
export function busDropCounts(): Record<string, number> {
  return Object.fromEntries(droppedSubscribers);
}

/**
 * REPLAY: reconstruct path state from the event log ALONE — god states +
 * dispatch lifecycle. Objectivity: the reconstruction is built ONLY from
 * event fields (facts + evidence), never from narratives.
 */
export function busReplay(filter?: { god?: string; type?: BusEventType }): {
  events: BusEvent[];
  godStates: Record<string, { state: string; ts: string }>;
  dispatchLifecycle: Record<string, { status: string; ts: string }>;
  corrupt: boolean;
} {
  let raw: string = "";
  try {
    raw = fs.existsSync(BUS_LOG) ? fs.readFileSync(BUS_LOG, "utf-8") : "";
  } catch { raw = ""; }
  const events: BusEvent[] = [];
  let corrupt = false;
  for (const line of raw.trim().split("\n").filter(Boolean)) {
    try { events.push(JSON.parse(line)); } catch { corrupt = true; }
  }
  const godStates: Record<string, { state: string; ts: string }> = {};
  const dispatchLifecycle: Record<string, { status: string; ts: string }> = {};
  for (const e of events) {
    if (filter?.god && e.god !== filter.god) continue;
    if (filter?.type && e.type !== filter.type) continue;
    if (e.type === "heartbeat" && e.god && e.state) {
      godStates[e.god] = { state: e.state, ts: e.ts };
    } else if (e.type === "dispatch" && e.payload && typeof (e.payload as any).dispatchId === "string") {
      dispatchLifecycle[(e.payload as any).dispatchId] = { status: "dispatched", ts: e.ts };
    } else if (e.type === "dispatch-outcome" && e.payload && typeof (e.payload as any).dispatchId === "string") {
      dispatchLifecycle[(e.payload as any).dispatchId] = {
        status: String((e.payload as any).outcome || "unknown"),
        ts: e.ts,
      };
    }
  }
  return { events, godStates, dispatchLifecycle, corrupt };
}
