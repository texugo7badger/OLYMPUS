/**
 * performance-mode.ts — v0.0.61: one switch for low-end phones and PCs.
 *
 * It does not change the app's logic; it changes the COST of looking at it:
 *   - `data-performance="low"` on <html> (CSS can drop decorative motion)
 *   - the brain atlas starts on `batterySaver`
 *   - the mobile ambient field renders nothing
 *   - stable motion is applied with it (spinners/status stay)
 *
 * Persisted in localStorage; the phone keeps its own preference.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export const PERFORMANCE_KEY = 'olympus:performance';

export function getPerformanceMode(): boolean {
  try { return localStorage.getItem(PERFORMANCE_KEY) === 'low'; } catch { return false; }
}

export function applyPerformanceMode(low: boolean): void {
  try {
    document.documentElement.dataset.performance = low ? 'low' : 'full';
  } catch { /* non-DOM */ }
}

export function setPerformanceMode(low: boolean): void {
  try { localStorage.setItem(PERFORMANCE_KEY, low ? 'low' : 'full'); } catch { /* private */ }
  applyPerformanceMode(low);
  try { window.dispatchEvent(new CustomEvent('olympus:performance', { detail: { low } })); } catch { /* no window */ }
}
