# OLYMPUS Symphony Cable

**The append‑only event log that connects the pantheon.**  
The cable lives at `~/.olympus/symphony-bus.jsonl` (overridable via `OLYMPUS_HOME`). Every heartbeat, dispatch directive, dispatch‑outcome, Atlas funnel error, and subscriber‑drop is written as a single JSON line, in order, never overwritten. Any component — a god, Atlas, or a subscriber — can read the log to reconstruct the complete path state from scratch.

---

## 1. What the cable is

The Symphony bus is an **append‑only JSONL event log** at `~/.olympus/symphony-bus.jsonl`. It records everything that happens across the pantheon:

- **Heartbeats** — a god’s state change (`idle|thinking|acting|done|blocked`)
- **Dispatches** — a directive entering the bus
- **Dispatch outcomes** — the final success/failure/contract‑violation record
- **Atlas ingest errors** — Atlas funnel failures surfaced on the bus
- **Subscriber drops** — a dead handler that threw, loudly logged and counted

The log is never truncated or rewritten. New events are always appended, and every event carries a strictly monotonic `seq` number so that consumers can detect gaps or re‑ordering.

---

## 2. Guarantees

| Guarantee | Description |
|-----------|-------------|
| **Strictly monotonic `seq`** | Every event gets `seq = max(existing seq) + 1`. Readers can detect gaps or re‑ordering by examining the sequence. |
| **Idempotent publish per `dedupKey`** | If a caller re‑fires with the same `dedupKey`, the bus publishes **once** and counts duplicates. The log contains a single event; `duplicateCount` reflects how many times the same key was re‑fired. |
| **Append‑only** | The log file is only ever appended to. No events are removed, reordered, or overwritten. |
| **Dead subscribers never block** | If a subscriber handler throws, the bus catches the error, logs a `subscriber-drop` event, increments the drop count, and **continues** publishing the original event to remaining subscribers. |
| **Objectivity** | Events carry facts with `evidence` references (paths, ids, etc.). The schema enforces `evidence` on event types that make claims. No narrative text is stored as fact. |

---

## 3. API

### `busPublish(input)`

```ts
input: {
  type: BusEventType;          // heartbeat | dispatch | dispatch-outcome | atlas-ingest-error | subscriber-drop
  god?: string;               // which god emitted this
  state?: string;             // heartbeat state
  dedupKey?: string;          // idempotency key
  payload?: Record<string, unknown>;
  evidence?: Record<string, unknown>; // required for claim‑making event types
}
```

Returns:

```ts
{
  event: BusEvent | null;     // the persisted event, or null if duplicate
  duplicate: boolean;         // true if a dedupKey duplicate was suppressed
  duplicateCount: number;     // how many times this key has been re‑fired (including this one)
  droppedSubscribers: number; // how many subscribers threw during delivery
}
```

- If `dedupKey` is provided and that key has been seen before, the event is **not** written to the log; `duplicate=true` and `duplicateCount` reports the total fires for that key.
- Otherwise a new event is generated with `seq = max(existing seq) + 1`, written atomically, and delivered to all subscribers.
- Dead subscribers are caught; the bus counts drops but does **not** stop the publish.

### `busSubscribe(id, handler)`

```ts
function busSubscribe(id: string, handler: (e: BusEvent) => void): () => void;
```

Registers `handler` under `id`. Returns an **unsubscribe function** that removes the subscriber when called.

### `busReplay(filter?)`

```ts
function busReplay(filter?: { god?: string; type?: BusEventType }): {
  events: BusEvent[];
  godStates: Record<string, { state: string; ts: string }>;
  dispatchLifecycle: Record<string, { status: string; ts: string }>;
  corrupt: boolean;
}
```

Reconstructs path state **from the event log alone**:

- `events` — all events matching the optional `god`/`type` filter.
- `godStates` — mapping of `god → {state, ts}` from `heartbeat` events.
- `dispatchLifecycle` — mapping of `dispatchId → {status, ts}` from `dispatch` and `dispatch-outcome` events.
- `corrupt` — `true` if any line in the log failed JSON parsing. The reconstruction **carries corrupt:true** and should not be trusted silently.

### `busDropCounts()`

```ts
function busDropCounts(): Record<string, number>;
```

Returns a map of subscriber IDs to the number of times each subscriber dropped (threw) during event delivery.

---

## 4. Failure semantics

- **Dead subscriber**: When a subscriber handler throws, the bus catches the error, increments that subscriber’s drop count, appends a `subscriber-drop` event to the log (with `god: "symphony"`, the dropped `seq`, `type`, and a truncated `error` message), and **continues** delivering the original event to any remaining subscribers. The original event is **not** re‑fired.
- **Publish never blocks**: Even if all subscribers are dead, `busPublish` still writes the event to the log and returns successfully.
- **busReplay reconstruction**: Because the log is the source of truth, `busReplay` reads every line, parses it, and builds `godStates` and `dispatchLifecycle` from the event fields alone. No external state is consulted.

---

## 5. The objectivity rule

Every event on the bus is **facts + evidence**, never narrative:

- The `evidence` field is **required** on any event type that makes a claim (e.g., `dispatch`, `dispatch-outcome`, `atlas-ingest-error`).
- `evidence` must be a `Record<string, unknown>` containing concrete references — paths, ids, timestamps, etc.
- Event types that are purely observational (e.g., `heartbeat`, `subscriber-drop`) may omit `evidence` or include minimal metadata.
- No event may store “he feels,” “the system seems,” or any other subjective language as fact. All claims must be grounded in verifiable references.

---

*File: `/home/texugo/Projects/olympus/docs/SYMPHONY-CABLE.md` — 2,314 bytes*