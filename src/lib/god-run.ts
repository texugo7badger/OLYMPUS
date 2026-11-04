/**
 * god-run.ts — v0.0.80: one bounded turn with a god's own agent.
 *
 * Extracted from the god-chat route so the preview generator (and any future
 * lane) runs the same way: `opencode run --format json --agent <god>` in the
 * lane, a hard timeout, and a tolerant parser for the text parts. No Apollo in
 * the middle, no session reuse, no hidden retry.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { spawnOpencode } from './opencode-spawn';

export interface GodTurnResult {
  ok: boolean;
  text: string;
  error?: string;
  durationMs: number;
}

/** Tolerant parser for `opencode run --format json` text parts. */
export function extractText(stdout: string): string {
  const parts: string[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      const text = ev?.part?.text ?? ev?.text ?? (ev?.type === 'text' ? ev?.content : null);
      if (typeof text === 'string' && text.trim()) parts.push(text);
    } catch { /* not a JSON line */ }
  }
  return parts.join('').trim();
}

export function runGodTurn(god: string, message: string, lane: string, timeoutMs = 180_000): Promise<GodTurnResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let settled = false;
    const done = (r: { ok: boolean; text: string; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve({ ...r, durationMs: Date.now() - startedAt });
    };
    const child = spawnOpencode(['run', '--format', 'json', '--agent', god, message], {
      cwd: lane,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* gone */ }
      done({ ok: false, text: '', error: `the god did not answer within ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    child.stdout?.on('data', (d) => { out = (out + String(d)).slice(-600_000); });
    child.stderr?.on('data', (d) => { err = (err + String(d)).slice(-20_000); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = extractText(out);
      if (!text) done({ ok: false, text: '', error: code === 0 ? 'the god answered with no text' : `opencode exited ${code}: ${(err || out).slice(-300)}` });
      else done({ ok: true, text });
    });
    child.on('error', (e: any) => { clearTimeout(timer); done({ ok: false, text: '', error: String(e?.message || e) }); });
  });
}
