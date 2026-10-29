/**
 * GET /api/olympus/models — the model catalogue REGISTERED IN OPENCODE.
 *
 * v0.0.23 (Strategy Builder). The interactive strategy screen searches THIS
 * list: every model OpenCode knows about, grouped by provider, with the
 * metadata that matters for a per-god choice (context, output, price).
 *
 * Source of truth: OpenCode's own catalogue cache
 * (~/.cache/opencode/models.json). When the cache is missing we fall back to
 * `opencode models` (the CLI list) and return ids without metadata — the
 * screen still works, it just shows fewer columns.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

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

function readCache(): ModelEntry[] | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    const out: ModelEntry[] = [];
    for (const [provider, entry] of Object.entries<any>(raw)) {
      const models = entry?.models;
      if (!models || typeof models !== 'object') continue;
      for (const [mid, m] of Object.entries<any>(models)) {
        const id = `${provider}/${mid}`;
        const input = typeof m?.cost?.input === 'number' ? m.cost.input : null;
        const output = typeof m?.cost?.output === 'number' ? m.cost.output : null;
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
          free: input === 0 && output === 0,
        });
      }
    }
    return out.length ? out.sort((a, b) => a.id.localeCompare(b.id)) : null;
  } catch { return null; }
}

function readCli(): ModelEntry[] {
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
      .map((id) => ({
        id,
        provider: id.split('/')[0],
        name: id.split('/').slice(1).join('/'),
        context: null, output: null, inputCost: null, outputCost: null,
        toolCall: true, reasoning: false, free: false,
      }));
  } catch { return []; }
}

export async function GET() {
  const models = readCache() ?? readCli();
  const providers = [...new Set(models.map((m) => m.provider))].sort();
  return NextResponse.json({
    ok: true,
    count: models.length,
    providers,
    models: models.map((m) => ({ ...m, fits: fitHint(m) })),
  }, { headers: NO_CACHE_HEADERS });
}
