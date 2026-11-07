/**
 * failure-class.ts — v0.0.86 (#334): the one dispatch-failure vocabulary.
 *
 * Extracted from the walker so the Atlas patrol can classify a park without
 * importing the walker (which imports the patrol — a cycle).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type DispatchFailureClass = 'transport' | 'tool-budget' | 'provider' | 'agent-missing' | 'model-missing' | 'timeout' | 'script' | 'unknown';

export function classifyDispatchFailure(input: { error?: string | null; errorClass?: string | null } | string | null | undefined): DispatchFailureClass {
  const text = typeof input === 'string' ? input : String(input?.error ?? '');
  const declared = typeof input === 'object' && input ? String(input.errorClass ?? '') : '';
  const hay = `${declared} ${text}`;
  if (/all-lanes-dead|provider\.(quota|free-limit|no-route|auth|rate-limit)|quota|rate.?limit|\b401\b|\b402\b|\b403\b|no-route|auth/i.test(hay)) return 'provider';
  if (/agent not found|unknown agent|no agent named/i.test(hay)) return 'agent-missing';
  if (/model not found|unknown model|no such model/i.test(hay)) return 'model-missing';
  if (/hop-tool-budget|tool.?budget|too many tool/i.test(hay)) return 'tool-budget';
  if (/econnrefused|econnreset|socket hang up|warm turn stalled|warm-transport|connect timeout|fetch failed|network error/i.test(hay)) return 'transport';
  if (/ceiling-kill|timed out|timeout|silent|stall/i.test(hay)) return 'timeout';
  if (/script exit|script-timeout|script spawn failed/i.test(hay)) return 'script';
  return 'unknown';
}

