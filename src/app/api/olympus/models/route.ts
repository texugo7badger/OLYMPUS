/**
 * GET /api/olympus/models — the model catalogue REGISTERED IN OPENCODE.
 *
 * v0.0.24 (the Builder's free search):
 *   - every model carries `registered` — the provider is authorized in
 *     OpenCode's auth.json / config, so the Builder defaults to a list that
 *     can actually route;
 *   - `free: true` is the zero-price flag, not a provider-name guess;
 *   - providers are summarized with counts + free counts, so the Builder can
 *     render chips and a `free` filter honestly.
 *
 * Source of truth: OpenCode's catalogue cache
 * (~/.cache/opencode/models.json). When the cache is missing we fall back to
 * `opencode models` (the CLI list) and return ids without metadata.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { registeredProviders } from '@/lib/opencode-providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_FILE = path.join(os.homedir(), '.cache', 'opencode', 'models.json');

interface ModelEntry {
  id: string;
  provider: string;
  name: string;
  context: number | null;
  output: number | null;
  inputCost: number | null;
  outputCost: number | null;
  toolCall: boolean;
  reasoning: boolean;
  free: boolean;
  registered: boolean;
}

interface ProviderSummary {
  id: string;
  count: number;
  freeCount: number;
  registered: boolean;
}

/** Which god best fits this model — a hint for the picker, never a lock. */
function fitHint(m: ModelEntry): string[] {
  const id = m.id.toLowerCase();
  const fits: string[] = [];
  if (/sol|opus|glm-5\.3$|qwen3\.8-max|kimi-k3/.test(id)) fits.push('planner', 'security');
  if (/code|sonnet|deepseek|qwen3\.7|kimi-k2/.test(id)) fits.push('code', 'frontend');
  if (/luna|haiku|flash|mimo|minimax/.test(id)) fits.push('volume', 'qa', 'vault');
  if (/hy3|hy4|sol|gpt-6/.test(id)) fits.push('orchestration');
  if (/pro$|opus|max/.test(id)) fits.push('reasoning');
  return fits.length ? [...new Set(fits)] : ['general'];
}

function readJson(p: string): any | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function readCache(registered: Set<string>): ModelEntry[] | null {
  const raw = readJson(CACHE_FILE);
  if (!raw) return null;
  const out: ModelEntry[] = [];
  for (const [provider, entry] of Object.entries<any>(raw)) {
    const models = entry?.models;
    if (!models || typeof models !== 'object') continue;
    for (const [mid, m] of Object.entries<any>(models)) {
      const id = `${provider}/${mid}`;
      const input = typeof m?.cost?.input === 'number' ? m.cost.input : null;
      const output = typeof m?.cost?.output === 'number' ? m.cost.output : null;
      // A plan model reports $0 because the subscription covers it — that is
      // `included`, not `free endpoint`. Only an id marked `:free`/`-free`
      // (or a non-plan provider with zero price) is a free endpoint.
      const planProvider = provider === 'opencode-go' || provider === 'opencode';
      const idFree = /(:free|-free)$/i.test(id);
      out.push({
        id,
        provider,
        name: typeof m?.name === 'string' ? m.name : mid,
        context: typeof m?.limit?.context === 'number' ? m.limit.context : null,
        output: typeof m?.limit?.output === 'number' ? m.limit.output : null,
        inputCost: input,
        outputCost: output,
        toolCall: m?.tool_call !== false,
        reasoning: m?.reasoning === true,
        free: input === 0 && output === 0 && (!planProvider || idFree),
        registered: registered.has(provider) || (provider.startsWith('nvidia-') && registered.has('nvidia')),
      });
    }
  }
  return out.length ? out.sort((a, b) => a.id.localeCompare(b.id)) : null;
}

function readCli(registered: Set<string>): ModelEntry[] {
  try {
    const out = execSync('npx --no-install opencode models', {
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(out)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('/'))
      .map((id) => {
        const provider = id.split('/')[0];
        return {
          id,
          provider,
          name: id.split('/').slice(1).join('/'),
          context: null, output: null, inputCost: null, outputCost: null,
          toolCall: true, reasoning: false,
          free: /:free$|-free$/.test(id),
          registered: registered.has(provider),
        };
      });
  } catch { return []; }
}

let CACHE: { at: number; models: ModelEntry[]; providers: ProviderSummary[] } | null = null;
const TTL_MS = 5 * 60_000;

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  if (!fresh && CACHE && Date.now() - CACHE.at < TTL_MS) {
    return NextResponse.json({
      ok: true,
      count: CACHE.models.length,
      registeredCount: CACHE.models.filter((m) => m.registered).length,
      freeCount: CACHE.models.filter((m) => m.free).length,
      providers: CACHE.providers,
      models: CACHE.models.map((m) => ({ ...m, fits: fitHint(m) })),
      cached: true,
    }, { headers: NO_CACHE_HEADERS });
  }

  const registered = registeredProviders();
  const models = readCache(registered) ?? readCli(registered);

  const byProvider = new Map<string, ProviderSummary>();
  for (const m of models) {
    const p = byProvider.get(m.provider) ?? { id: m.provider, count: 0, freeCount: 0, registered: m.registered };
    p.count++;
    if (m.free) p.freeCount++;
    if (m.registered) p.registered = true;
    byProvider.set(m.provider, p);
  }
  const providers = [...byProvider.values()].sort((a, b) => {
    if (a.registered !== b.registered) return a.registered ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  CACHE = { at: Date.now(), models, providers };

  return NextResponse.json({
    ok: true,
    count: models.length,
    registeredCount: models.filter((m) => m.registered).length,
    freeCount: models.filter((m) => m.free).length,
    registeredProviders: [...registered].sort(),
    providers,
    models: models.map((m) => ({ ...m, fits: fitHint(m) })),
    cached: false,
  }, { headers: NO_CACHE_HEADERS });
}
