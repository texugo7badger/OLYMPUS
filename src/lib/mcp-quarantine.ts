/**
 * mcp-quarantine.ts — v0.0.67 (#283/#284): a broken MCP is quarantined, not
 * retried forever.
 *
 * The health probe already classifies a server honestly. The missing piece
 * was memory: a server that failed twice was probed again on the next panel
 * load (12s timeouts, red badges, no action). This file is that memory — a
 * user file (`~/.olympus/mcp-quarantine.json`), never campaign state.
 *
 * Rules:
 *   - two consecutive `dead` probes → quarantined with the last error;
 *   - a quarantined server is SKIPPED by the probe (status 'quarantined');
 *   - only an explicit clear (the panel's button / the API) revives it.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface QuarantineEntry {
  name: string;
  reason: string;
  at: string;
  failures: number;
}

const HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const FILE = path.join(HOME, 'mcp-quarantine.json');

function readAll(): Record<string, QuarantineEntry> {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    return raw && typeof raw.servers === 'object' ? raw.servers : {};
  } catch { return {}; }
}

function writeAll(servers: Record<string, QuarantineEntry>): void {
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ version: 1, servers }, null, 2) + '\n', { mode: 0o600 });
  } catch { /* a quarantine write failure never blocks the panel */ }
}

export function listQuarantine(): QuarantineEntry[] {
  // A streak below the threshold is a warning, not a quarantine.
  return Object.values(readAll()).filter((e) => e.failures >= 2).sort((a, b) => a.name.localeCompare(b.name));
}

export function isQuarantined(name: string): QuarantineEntry | null {
  const e = readAll()[name];
  return e && e.failures >= 2 ? e : null;
}

export function quarantine(name: string, reason: string, failures = 2, now = Date.now()): QuarantineEntry {
  const all = readAll();
  const entry: QuarantineEntry = {
    name,
    reason: String(reason || 'probe failed').slice(0, 400),
    at: new Date(now).toISOString(),
    failures,
  };
  all[name] = entry;
  writeAll(all);
  return entry;
}

export function clearQuarantine(name: string): boolean {
  const all = readAll();
  if (!all[name]) return false;
  delete all[name];
  writeAll(all);
  return true;
}

/** Count consecutive failures; quarantine on the second. */
export function recordFailure(name: string, reason: string, threshold = 2, now = Date.now()): QuarantineEntry | null {
  const all = readAll();
  const prev = all[name];
  const failures = (prev?.failures ?? 0) + 1;
  if (failures >= threshold) {
    return quarantine(name, reason, failures, now);
  }
  all[name] = { name, reason: String(reason || 'probe failed').slice(0, 400), at: new Date(now).toISOString(), failures };
  writeAll(all);
  return null;
}

/** A live server clears its failure streak (but never its explicit quarantine). */
export function recordSuccess(name: string): void {
  const all = readAll();
  if (!all[name]) return;
  if (all[name].failures > 0) {
    delete all[name];
    writeAll(all);
  }
}
