/**
 * ttl-cache.ts — the in-process read cache (v0.0.25).
 *
 * THE SPECIMEN: every pane remount re-read the vault, reparsed JSONL feeds
 * and rescanned directories. On one Node process that is one blocking turn
 * per request, so three panes opened together queued behind each other.
 *
 * Semantics: fresh within `ttlMs`; between `ttlMs` and `staleMs` the cached
 * value is returned IMMEDIATELY and a background refresh runs (stale-while-
 * revalidate); past `staleMs` the caller waits for the new value. A failed
 * refresh keeps the last good value.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

interface Slot<T> {
  value: T;
  at: number;
  refreshing: boolean;
  error?: string;
}

const SLOTS = new Map<string, Slot<unknown>>();

export interface TtlOptions {
  /** Fresh window (ms). */
  ttlMs?: number;
  /** How long a stale value may still be served while refreshing (ms). */
  staleMs?: number;
}

/**
 * Return the cached/computed value for `key`.
 * The compute function must be side-effect free from the caller's view.
 */
export async function withTtl<T>(
  key: string,
  compute: () => Promise<T> | T,
  opts: TtlOptions = {},
): Promise<T> {
  const ttlMs = opts.ttlMs ?? 15_000;
  const staleMs = opts.staleMs ?? ttlMs * 4;
  const now = Date.now();
  const slot = SLOTS.get(key) as Slot<T> | undefined;

  if (slot) {
    const age = now - slot.at;
    if (age < ttlMs) return slot.value;
    if (age < staleMs) {
      if (!slot.refreshing) {
        slot.refreshing = true;
        Promise.resolve()
          .then(compute)
          .then((value) => { SLOTS.set(key, { value, at: Date.now(), refreshing: false }); })
          .catch((e) => { slot.refreshing = false; slot.error = e?.message || String(e); });
      }
      return slot.value;
    }
  }

  try {
    const value = await compute();
    SLOTS.set(key, { value, at: Date.now(), refreshing: false });
    return value;
  } catch (e: any) {
    if (slot) {
      slot.error = e?.message || String(e);
      return slot.value; // the last good answer beats an error page
    }
    throw e;
  }
}

/** Drop one key, a prefix, or everything (tests + "refresh" buttons). */
export function invalidateTtl(prefix?: string): void {
  if (!prefix) { SLOTS.clear(); return; }
  for (const key of [...SLOTS.keys()]) {
    if (key.startsWith(prefix)) SLOTS.delete(key);
  }
}

/** Diagnostics (the perf harness reads it). */
export function ttlStats(): Array<{ key: string; ageMs: number; refreshing: boolean }> {
  const now = Date.now();
  return [...SLOTS.entries()].map(([key, s]) => ({ key, ageMs: now - s.at, refreshing: s.refreshing }));
}
