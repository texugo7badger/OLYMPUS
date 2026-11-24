/**
 * mobile-fetch.ts — v0.0.81: a phone fetch that can never hang forever.
 *
 * The mobile home and studio poll several routes. A stalled request used to
 * leave the UI waiting on a promise with no ceiling; a flaky LAN or a slow
 * route could look like a frozen app. This wrapper aborts after a bounded
 * time and returns a rejected promise the caller's existing catch handles.
 *
 * Long-running actions (a god turn) must NOT use the default; pass a larger
 * timeout explicitly.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export async function mobileFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // v0.0.99 — an external signal (the phone's Stop button) must abort the
  // request too. The internal controller stays the one timeout owns.
  const external = init.signal;
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onAbort, { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    try { external?.removeEventListener('abort', onAbort); } catch { /* gone */ }
  }
}
