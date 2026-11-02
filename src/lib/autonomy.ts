/**
 * autonomy.ts — v0.0.47 (R47): the unattended contract, one switch.
 *
 * When the user leaves, a prompt can run without a human at the keyboard:
 * the plan-walk gate auto-approves, choices follow the recommended option and
 * a park auto-resumes within the bounded overnight budget. The switch is
 * explicit, persisted and read at SEND time (never a stale closure).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

const LS_KEY = 'olympus:unattended';
export const UNATTENDED_EVENT = 'olympus:unattended-changed';

export function unattendedEnabled(): boolean {
  try { return window.localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
}

export function setUnattendedEnabled(on: boolean): void {
  try { window.localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* private */ }
  try { window.dispatchEvent(new CustomEvent(UNATTENDED_EVENT)); } catch { /* no window */ }
}
