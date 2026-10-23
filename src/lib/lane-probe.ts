/**
 * lane-probe.ts — W-N LANE-PROBE (v0.0.8): the pre-flight health check for
 * the ACTIVE model lane. The 2026-10-21 13:21 specimen: an architectural
 * planning turn posted to a dead free endpoint (the #129 free-anchor stall
 * class) burned the FULL 15-minute runtime ceiling in total silence — zero
 * stream bytes, zero diagnosis. The probe asks the lane for ONE token
 * before the real turn posts: a dead lane surfaces in ~15 seconds with
 * the model named, instead of 15 minutes of nothing.
 *
 * The lane truth: the applied strategy lives in the workspace opencode.json
 * (agent.<god>.model = "<providerId>/<modelId>"); the provider base URL
 * lives in provider[providerId].options.baseURL (the @ai-sdk/openai-compatible
 * shape) or the builtin map (openrouter); the key lives in the opencode
 * auth store. Every path is overridable — fixture-friendly (the
 * authLaneCensus precedent).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

export interface LaneProbeResult {
  /** The probe answered — the lane is alive. */
  ok: boolean;
  /** The full opencode model id (provider/model). */
  model: string;
  provider: string;
  /** The model id the raw API takes (the provider prefix stripped). */
  apiModel: string;
  latencyMs: number;
  httpStatus?: number;
  error?: string;
  /** #193: the refusal is a harness-only class (alive through opencode) —
   *  the caller must stay quiet, never warn about a stall. */
  aliveForUs?: boolean;
  /** #193: how the verdict was reached (disabled lanes show it in logs). */
  note?: string;
}

/** The builtin provider base URLs (native providers carry no options.baseURL). */
const BUILTIN_BASE_URLS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  // #193: the OpenCode harness-only lanes — the same endpoints the CLI
  // reads from its live catalogue (~/.cache/opencode/models.json).
  opencode: 'https://opencode.ai/inference/openai/v1',
  'opencode-go': 'https://opencode.ai/inference/go/openai/v1',
};

/** #193: providers that only serve the OpenCode harness (raw probes get a
 *  class refusal — MissingSessionID / FreeTierError / an expired mirror key
 *  — while the CLI serves the same lane fine). */
const HARNESS_ONLY_PROVIDERS = new Set(['opencode-go', 'opencode']);

export function workspaceConfigPath(override?: string): string {
  return override ?? path.join(os.homedir(), '.local', 'share', 'olympus', 'workspace', 'opencode.json');
}

export function authStorePath(override?: string): string {
  return override ?? path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
}

/**
 * Resolve the ACTIVE model for one agent (apollo by default) from the
 * workspace config — "nvidia-glm/z-ai/glm-5.3" splits into the provider
 * lane + the API model.
 */
export function activeModelFor(
  agent = 'apollo',
  opts: { workspacePath?: string } = {},
): { providerId: string; modelId: string; full: string } | null {
  try {
    const cfg = JSON.parse(fs.readFileSync(workspaceConfigPath(opts.workspacePath), 'utf-8'));
    const full = String(cfg?.agent?.[agent]?.model || '');
    const idx = full.indexOf('/');
    if (!full || idx < 1) return null;
    return { providerId: full.slice(0, idx), modelId: full.slice(idx + 1), full };
  } catch {
    return null;
  }
}

/** The raw API base URL for a provider lane (options.baseURL or builtin). */
export function laneBaseUrl(
  providerId: string,
  opts: { workspacePath?: string } = {},
): string | null {
  try {
    const cfg = JSON.parse(fs.readFileSync(workspaceConfigPath(opts.workspacePath), 'utf-8'));
    const fromCfg = cfg?.provider?.[providerId]?.options?.baseURL;
    if (typeof fromCfg === 'string' && fromCfg) return fromCfg;
  } catch { /* fall through to the builtins */ }
  return BUILTIN_BASE_URLS[providerId] ?? null;
}

/**
 * Ask the lane for ONE token — the cheapest live-question a provider can
 * answer. Returns null when the lane is unresolvable (no model, no base
 * URL, no key): the probe never guesses, and the caller stays silent.
 */
export async function probeLane(
  opts: {
    agent?: string;
    timeoutMs?: number;
    workspacePath?: string;
    authPath?: string;
  } = {},
): Promise<LaneProbeResult | null> {
  const agent = opts.agent ?? 'apollo';
  const model = activeModelFor(agent, opts);
  if (!model) return null;
  const base = laneBaseUrl(model.providerId, opts);
  if (!base) return null;
  let key = '';
  try {
    const auth = JSON.parse(fs.readFileSync(authStorePath(opts.authPath), 'utf-8'));
    key = String(auth?.[model.providerId]?.key || '');
  } catch { /* no key — the probe reports the refusal */ }
  // #193: GO/Zen lanes can be probed WITHOUT the auth-store key — their
  // refusals are class signals, not verdicts (the CLI owns the real auth).
  const harnessOnly = HARNESS_ONLY_PROVIDERS.has(model.providerId);
  if (!key && !harnessOnly) return null;

  const t0 = Date.now();
  const harnessHeaders: Record<string, string> = harnessOnly
    ? {
        // The GO endpoint refuses a bare request with 400 MissingSessionID;
        // the session id makes the probe a harness-class caller.
        'x-opencode-session': `olympus-probe-${Math.random().toString(36).slice(2)}`,
      }
    : {};
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        // W-X: OpenRouter's attribution headers — a bare probe 403s on
        // lanes that serve fine through opencode (the 15:38 specimen: the
        // inkling lane answered every hop all day; the raw probe 403'd and
        // the pre-flight warned over a HEALTHY lane).
        'User-Agent': 'OLYMPUS',
        'HTTP-Referer': 'https://olympus.local',
        'X-Title': 'OLYMPUS lane probe',
        ...harnessHeaders,
      },
      body: JSON.stringify({
        model: model.modelId,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    const latencyMs = Date.now() - t0;
    // W-X AGENTIC-ONLY (the 15:38 specimen): OpenRouter serves some :free
    // lanes (the inkling family) ONLY to agentic harnesses — the raw probe
    // 403s with that exact message while opencode (a harness) serves the
    // lane fine. The 403-harness class means ALIVE-FOR-US, not dead: the
    // pre-flight must stay quiet (opencode is the real verifier).
    const bodyText = await r.clone().text().catch(() => '');
    if (r.status === 403 && bodyText.includes('agentic harness')) {
      return {
        ok: true,
        model: model.full,
        provider: model.providerId,
        apiModel: model.modelId,
        latencyMs,
        httpStatus: r.status,
        error: undefined,
        aliveForUs: true,
        note: 'harness-only lane (agentic clients) — alive through opencode',
      };
    }
    // #193 — the GO/Zen harness-only classes. A raw probe can never own
    // their auth: the CLI injects the session + its own account credential.
    // These refusals mean ALIVE-FOR-US, never a stall warning.
    if (harnessOnly) {
      if (r.status === 400 && /MissingSessionID/i.test(bodyText)) {
        return {
          ok: true, model: model.full, provider: model.providerId,
          apiModel: model.modelId, latencyMs, httpStatus: r.status,
          aliveForUs: true,
          note: 'harness-only lane (MissingSessionID) — opencode injects the session',
        };
      }
      if (r.status === 403 && /FreeTierError|within OpenCode|only be used from within/i.test(bodyText)) {
        return {
          ok: true, model: model.full, provider: model.providerId,
          apiModel: model.modelId, latencyMs, httpStatus: r.status,
          aliveForUs: true,
          note: 'harness-only lane (FreeTierError) — opencode is the real verifier',
        };
      }
      if (r.status === 401 && /api_key_expired|expired/i.test(bodyText)) {
        return {
          ok: true, model: model.full, provider: model.providerId,
          apiModel: model.modelId, latencyMs, httpStatus: r.status,
          aliveForUs: true,
          note: 'unverifiable raw — opencode owns auth (the auth-store key is stale)',
        };
      }
    }
    return {
      ok: r.ok,
      model: model.full,
      provider: model.providerId,
      apiModel: model.modelId,
      latencyMs,
      httpStatus: r.status,
      error: r.ok ? undefined : `HTTP ${r.status}`,
    };
  } catch (e: any) {
    return {
      ok: false,
      model: model.full,
      provider: model.providerId,
      apiModel: model.modelId,
      latencyMs: Date.now() - t0,
      error: e?.name === 'TimeoutError' ? 'no answer in the timeout window' : (e?.message || 'unreachable'),
    };
  }
}
