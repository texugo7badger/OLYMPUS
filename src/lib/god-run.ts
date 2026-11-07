/**
 * god-run.ts — v0.0.80: one bounded turn with a god's own agent.
 *
 * Extracted from the god-chat route so the preview generator (and any future
 * lane) runs the same way: `opencode run --format json --agent <god>` in the
 * lane, a hard timeout, and a tolerant parser for the text parts. No Apollo in
 * the middle, no session reuse, no hidden retry.
 *
 * v0.0.90 — THE GO CREDENTIAL FALLBACK. The account's `opencode-go` credential
 * admitted `deepseek-v4.1-flash` but answered `401 Go requires a credential`
 * for `qwen3.7-plus`; the Athena mark turn failed at the provider before it
 * could plan. A single, named retry on a verified GO model keeps the god
 * conversational; the reply carries `fallbackModel` so the UI can say which
 * model answered. This is NOT a silent downgrade: one retry, only on an auth
 * failure, and the reason is visible.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { spawnOpencode } from './opencode-spawn';

export const GO_FALLBACK_MODEL = 'opencode-go/deepseek-v4.1-flash';

export interface GodTurnResult {
  ok: boolean;
  text: string;
  error?: string;
  durationMs: number;
  /** Set only when the first model failed auth and the verified GO model answered. */
  fallbackModel?: string;
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

/** A provider/auth rejection is retryable on another GO model; anything else is not. */
export function isAuthFailure(text: string): boolean {
  return /provider\.auth|Go requires a credential|authentication_error|"status"\s*:\s*401|\b401\b/i.test(String(text || ''));
}

interface Attempt { ok: boolean; text: string; error?: string }

function runOnce(god: string, message: string, lane: string, timeoutMs: number, model?: string): Promise<Attempt> {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let settled = false;
    const done = (r: Attempt) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const args = ['run', '--format', 'json', '--agent', god, ...(model ? ['--model', model] : []), message];
    const child = spawnOpencode(args, {
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

export async function runGodTurn(god: string, message: string, lane: string, timeoutMs = 180_000): Promise<GodTurnResult> {
  const startedAt = Date.now();
  const first = await runOnce(god, message, lane, timeoutMs);
  if (first.ok || !isAuthFailure(first.error || '')) {
    return { ...first, durationMs: Date.now() - startedAt };
  }
  // One named retry on a verified GO lane; the first attempt got a 401.
  const fallback = await runOnce(god, message, lane, Math.min(timeoutMs, 180_000), GO_FALLBACK_MODEL);
  if (fallback.ok) {
    return { ...fallback, fallbackModel: GO_FALLBACK_MODEL, durationMs: Date.now() - startedAt };
  }
  return {
    ...first,
    error: `${first.error} · fallback ${GO_FALLBACK_MODEL} failed: ${fallback.error}`,
    durationMs: Date.now() - startedAt,
  };
}
