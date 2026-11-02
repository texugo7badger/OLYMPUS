/**
 * panel-loading-bus.ts — v0.0.32: one honest counter for the boot overlay.
 *
 * The global loader must stay until every dynamic panel's chunk has mounted,
 * or the user sees a stack of fallbacks ("STATUSBAR", "SSESTREAMPANEL", …)
 * while Turbopack compiles. A window event loses the first increments (child
 * effects run before the parent listener attaches); a module counter does not.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
let count = 0;
const subscribers = new Set<(n: number) => void>();

export function panelLoadingBump(delta: number): void {
  count = Math.max(0, count + delta);
  for (const fn of subscribers) fn(count);
}

export function getPanelLoadingCount(): number {
  return count;
}

export function subscribePanelLoading(fn: (n: number) => void): () => void {
  subscribers.add(fn);
  fn(count);
  return () => { subscribers.delete(fn); };
}
