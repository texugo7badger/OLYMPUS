/**
 * failure-class.ts — v0.0.86 (#334): the one dispatch-failure vocabulary.
 *
 * Extracted from the walker so the Atlas patrol can classify a park without
 * importing the walker (which imports the patrol — a cycle).
 *
 * v0.0.98 — THE PAIN VOCABULARY. The Go provider reports its 5-hour/weekly
 * limit as `provider.go-limit`; the old regex knew `provider.quota` but not
 * `go-limit`, so the overnight AIME walk classified a temporary quota as
 * `unknown` and STOPPED instead of waiting for the reset. The classifier now
 * separates the causes that need different actions:
 *
 *   provider-quota  → WAIT for the console reset, then resume the same hop
 *   provider-auth   → STOP; the key/route needs the user
 *   provider-route  → STOP; the model is not routable
 *   blocked-deps    → a derived state, never a user decision
 *
 * Every declared class is canonicalized (never returned verbatim), so a park
 * written as `provider.go-limit` is read back as `provider-quota`.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type DispatchFailureClass =
  | 'transport'
  | 'tool-budget'
  | 'campaign-budget'
  | 'provider'
  | 'provider-quota'
  | 'provider-auth'
  | 'provider-route'
  | 'blocked-dependencies'
  | 'lane-exhausted'
  | 'agent-missing'
  | 'model-missing'
  | 'timeout'
  | 'script'
  | 'verify-failed'
  | 'retry-exhausted'
  | 'destructive-backup-failed'
  | 'design-evidence-missing'
  | 'user-decision'
  | 'unknown';

/** Map any historical/verbose class to the canonical one. */
export function canonicalFailureClass(value: string | null | undefined): DispatchFailureClass | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'provider-quota' || /^provider\.(go-limit|quota|free-limit|rate-limit|usage-limit|limit|capacity)$/.test(v)) return 'provider-quota';
  if (v === 'provider-auth' || /^provider\.auth/.test(v)) return 'provider-auth';
  if (v === 'provider-route' || /^provider\.(no-route|model-missing)/.test(v)) return 'provider-route';
  if (v === 'blocked-dependencies' || v === 'blocked' || v === 'blocked-deps') return 'blocked-dependencies';
  if (v === 'provider') return 'provider';
  if (v === 'tool-budget' || v === 'verify-failed' || v === 'retry-exhausted') return v as DispatchFailureClass;
  if (v === 'destructive-backup-failed' || v === 'design-evidence-missing' || v === 'user-decision') return v as DispatchFailureClass;
  if (v === 'campaign-budget' || v === 'lane-exhausted' || v === 'agent-missing' || v === 'model-missing' || v === 'transport' || v === 'timeout' || v === 'script') return v as DispatchFailureClass;
  return null;
}

/**
 * Classify a PARK (not just a dispatch error). The dispatch classifier
 * returns `unknown` when the provider sent no text — the AIME design-review
 * specimen parked 26 times with an empty error. The park reason is still
 * evidence, so use it before falling back to `unknown`.
 */
export function classifyParkReason(reason: string, error?: string | null, declared?: string | null): string {
  // v0.0.98 — CANONICALIZE THE DECLARED CLASS. The old code returned
  // `declared` verbatim, so `provider.go-limit` survived and the patrol's
  // classifyDispatchFailure read it as unknown.
  const fromDeclared = canonicalFailureClass(declared);
  if (fromDeclared && fromDeclared !== 'unknown') return fromDeclared;
  const base = classifyDispatchFailure({ error, errorClass: declared });
  if (base !== 'unknown') return base;
  const r = String(reason ?? '').toLowerCase();
  if (r.includes('blocked') || r.includes('dependenc')) return 'blocked-dependencies';
  if (r.includes('verify')) return 'verify-failed';
  if (r.includes('retry')) return 'retry-exhausted';
  if (r.includes('destructive')) return 'destructive-backup-failed';
  if (r.includes('design')) return 'design-evidence-missing';
  if (r.includes('user')) return 'user-decision';
  if (r.includes('script')) return 'script';
  if (r.includes('quota') || r.includes('limit')) return 'provider-quota';
  return base;
}

export function classifyDispatchFailure(input: { error?: string | null; errorClass?: string | null } | string | null | undefined): DispatchFailureClass {
  const text = typeof input === 'string' ? input : String(input?.error ?? '');
  const declared = typeof input === 'object' && input ? String(input.errorClass ?? '') : '';
  const hay = `${declared} ${text}`;
  const declaredCanonical = canonicalFailureClass(declared);
  if (declaredCanonical && declaredCanonical !== 'provider') return declaredCanonical;
  // A whole-chain exhaustion is transient: the lanes may recover after a
  // backoff, so it is distinct from a missing key/route.
  if (/all-lanes-dead|all lanes dead|todas as lanes/i.test(hay)) return 'lane-exhausted';
  // The 60-min campaign window is a DELIBERATE stop, not a provider issue: a
  // resume opens a fresh window, so an opted-in campaign continues.
  if (/campaign-budget|campaign-deadline|campaign window/i.test(hay)) return 'campaign-budget';
  // v0.0.98 — auth/route are terminal, quota is a WAIT. Order matters:
  // `provider.auth` must not be swallowed by the generic quota regex.
  if (/provider\.auth|\b401\b|\b403\b|invalid api key|requires an api key|unauthori[sz]ed/i.test(hay)) return 'provider-auth';
  // v0.0.98 — a MODEL that does not exist is `model-missing` (the recovery
  // stops); only an explicit unroutable provider is `provider-route`.
  if (/model not found|unknown model|no such model/i.test(hay)) return 'model-missing';
  if (/provider\.no-route/i.test(hay)) return 'provider-route';
  if (/provider\.(go-limit|quota|free-limit|rate-limit|usage-limit|limit|capacity)|go limit|usage limit|5[- ]hour|quota|rate.?limit|\b402\b|payment required/i.test(hay)) return 'provider-quota';
  if (/agent not found|unknown agent|no agent named/i.test(hay)) return 'agent-missing';
  if (/hop-tool-budget|tool.?budget|too many tool/i.test(hay)) return 'tool-budget';
  if (/econnrefused|econnreset|socket hang up|warm turn stalled|warm-transport|connect timeout|fetch failed|network error/i.test(hay)) return 'transport';
  if (/ceiling-kill|timed out|timeout|silent|stall/i.test(hay)) return 'timeout';
  if (/script exit|script-timeout|script spawn failed/i.test(hay)) return 'script';
  return 'unknown';
}
