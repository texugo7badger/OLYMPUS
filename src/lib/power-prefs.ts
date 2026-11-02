/**
 * power-prefs.ts — v0.0.32: the sleep/logout contract.
 *
 * The maintainer needs OLYMPUS to keep working when the screen locks or the
 * session logs out — with the window gone and the campaign alive. The
 * preference lives in ~/.olympus/power-prefs.json; the Electron main reads the
 * file on lock-screen (no IPC needed) and hibernates when enabled.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface PowerPrefs {
  /** Hibernate the window when the OS locks/logs out; the campaign stays. */
  autoHibernateOnLock: boolean;
}

export const DEFAULT_POWER_PREFS: PowerPrefs = { autoHibernateOnLock: true };

export function powerPrefsPath(home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus')): string {
  return path.join(home, 'power-prefs.json');
}

export function normalizePowerPrefs(input: unknown): PowerPrefs {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<PowerPrefs>;
  return {
    autoHibernateOnLock: typeof raw.autoHibernateOnLock === 'boolean'
      ? raw.autoHibernateOnLock
      : DEFAULT_POWER_PREFS.autoHibernateOnLock,
  };
}

export function readPowerPrefs(opts: { home?: string } = {}): PowerPrefs {
  try {
    return normalizePowerPrefs(JSON.parse(fs.readFileSync(powerPrefsPath(opts.home), 'utf-8')));
  } catch {
    return { ...DEFAULT_POWER_PREFS };
  }
}

export function writePowerPrefs(prefs: PowerPrefs, opts: { home?: string } = {}): boolean {
  try {
    const file = powerPrefsPath(opts.home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(normalizePowerPrefs(prefs), null, 2) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}
