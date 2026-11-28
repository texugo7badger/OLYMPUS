/**
 * hud-preload.ts — v0.0.96: the minimal bridge for the hibernation HUD.
 *
 * The HUD window loads the public /m/widget page (no node integration). This
 * bridge exposes exactly one capability: collapse/expand the always-on-top
 * window. No filesystem, no vault, no session token.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('olympusHud', {
  setCompact: (compact: boolean) => ipcRenderer.send('olympus:hud-compact', compact === true),
  /** v0.1.6 — wake the full window from the hibernation HUD. */
  restore: () => ipcRenderer.send('olympus:restore-from-hud'),
});
