/**
 * process-group.ts — v0.0.98-11: the process tree is the unit of shutdown.
 *
 * `opencode serve` is spawned detached so it survives a terminal close. Its
 * MCP children inherit that process group — but `serverChild.kill()` signalled
 * only the server PID. The 2026-11-23 audit found five orphan
 * `uvx mcp-server-git` processes and a SIGTERM that waited 2,630 seconds on a
 * child. This module owns the group signal and the bounded orphan reaper.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { execSync } from 'node:child_process';

export interface ProcessRow {
  pid: number;
  ppid: number;
  etimes: number;
  args: string;
}

export function listProcesses(pattern: string, limit = 40): ProcessRow[] {
  const needle = String(pattern || '').trim();
  if (!needle) return [];
  let out = '';
  try {
    out = execSync('ps -eo pid=,ppid=,etimes=,args=', { encoding: 'utf-8', timeout: 3000 });
  } catch {
    return [];
  }
  const rows: ProcessRow[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const args = m[4];
    if (!args.includes(needle) || args.includes('ps -eo pid=')) continue;
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), etimes: Number(m[3]), args });
    if (rows.length >= limit) break;
  }
  return rows;
}

/**
 * Signal the whole process group when the PID is a group leader (the detached
 * serve case), with a direct-PID fallback for adopted/foreign processes.
 */
export function killProcessGroup(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return false;
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, signal);
      return true;
    } catch { /* not a group leader — fall through */ }
  }
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

/** SIGTERM → wait → SIGKILL, for async shutdown paths. */
export async function terminateProcessGroup(pid: number, graceMs = 4_000): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 1) return true;
  killProcessGroup(pid, 'SIGTERM');
  const deadline = Date.now() + Math.max(0, graceMs);
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { return true; }
    await new Promise((r) => setTimeout(r, 200));
  }
  killProcessGroup(pid, 'SIGKILL');
  return false;
}

/**
 * Reap MCP children of a PREVIOUS serve that have been orphaned to PID 1 for
 * longer than `olderThanSec`. Never touches a child whose parent is alive.
 */
export function reapOrphanProcesses(pattern = 'uvx mcp-server-git', olderThanSec = 1_800): ProcessRow[] {
  const killed: ProcessRow[] = [];
  for (const row of listProcesses(pattern)) {
    if (row.ppid !== 1 || row.etimes < olderThanSec) continue;
    if (killProcessGroup(row.pid, 'SIGTERM')) killed.push(row);
  }
  return killed;
}
