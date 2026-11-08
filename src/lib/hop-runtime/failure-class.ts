/**
 * failure-class.ts — v0.0.86 (#334): the one dispatch-failure vocabulary.
 *
 * Extracted from the walker so the Atlas patrol can classify a park without
 * importing the walker (which imports the patrol — a cycle).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type DispatchFailureClass = 'transport' | 'tool-budget' | 'campaign-budget' | 'provider' | 'lane-exhausted' | 'agent-missing' | 'model-missing' | 'timeout' | 'script' | 'unknown';

/**
 * Classify a PARK (not just a dispatch error). The dispatch classifier
 * returns `unknown` when the provider sent no text — the AIME design-review
 * specimen parked 26 times with an empty error. The park reason is still
 * evidence, so use it before falling back to `unknown`.
 */
export function classifyParkReason(reason: string, error?: string | null, declared?: string | null): string {
  const base = declared || classifyDispatchFailure({ error, errorClass: declared });
  if (base !== 'unknown') return base;
  const r = String(reason ?? '').toLowerCase();
  if (r.includes('verify')) return 'verify-failed';
  if (r.includes('retry')) return 'retry-exhausted';
  if (r.includes('destructive')) return 'destructive-backup-failed';
  if (r.includes('design')) return 'design-evidence-missing';
  if (r.includes('user')) return 'user-decision';
  if (r.includes('script')) return 'script';
  return base;
}

export function classifyDispatchFailure(input: { error?: string | null; errorClass?: string | null } | string | null | undefined): DispatchFailureClass {
  const text = typeof input === 'string' ? input : String(input?.error ?? '');
  const declared = typeof input === 'object' && input ? String(input.errorClass ?? '') : '';
  const hay = `${declared} ${text}`;
  // A whole-chain exhaustion is transient: the lanes may recover after a
  // backoff, so it is distinct from a missing key/route.
  if (/all-lanes-dead|all lanes dead|todas as lanes/i.test(hay)) return 'lane-exhausted';
  // The 60-min campaign window is a DELIBERATE stop, not a provider issue: a
  // resume opens a fresh window, so an opted-in campaign continues.
  if (/campaign-budget|campaign-deadline|campaign window/i.test(hay)) return 'campaign-budget';
  if (/provider\.(quota|free-limit|no-route|auth|rate-limit)|quota|rate.?limit|\b401\b|\b402\b|\b403\b|no-route|auth/i.test(hay)) return 'provider';
  if (/agent not found|unknown agent|no agent named/i.test(hay)) return 'agent-missing';
  if (/model not found|unknown model|no such model/i.test(hay)) return 'model-missing';
  if (/hop-tool-budget|tool.?budget|too many tool/i.test(hay)) return 'tool-budget';
  if (/econnrefused|econnreset|socket hang up|warm turn stalled|warm-transport|connect timeout|fetch failed|network error/i.test(hay)) return 'transport';
  if (/ceiling-kill|timed out|timeout|silent|stall/i.test(hay)) return 'timeout';
  if (/script exit|script-timeout|script spawn failed/i.test(hay)) return 'script';
  return 'unknown';
}

