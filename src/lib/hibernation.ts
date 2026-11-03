/**
 * hibernation.ts — v0.0.52: the unattended contract when the window is gone.
 *
 * The Electron main writes `~/.olympus/hibernation.json` before it destroys
 * the renderer. The walker reads the same marker: a campaign that parks while
 * the user is away must auto-resume (bounded) even if it was started in the
 * attended UI. Without this, "hibernate" kept the current hop alive but a
 * park waited for a morning click.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function hibernationMarkerPath(home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus')): string {
  return path.join(home, 'hibernation.json');
}

export function isHibernating(home?: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(hibernationMarkerPath(home), 'utf-8'));
    return raw?.active === true;
  } catch {
    return false;
  }
}
