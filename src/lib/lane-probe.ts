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
}

/** The builtin provider base URLs (native providers carry no options.baseURL). */
const BUILTIN_BASE_URLS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
};

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
  if (!key) return null;

  const t0 = Date.now();
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
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
