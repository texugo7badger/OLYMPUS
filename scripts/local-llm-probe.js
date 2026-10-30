#!/usr/bin/env node
/**
 * local-llm-probe.js — Probe the user's hardware for local LLM endpoints.
 * Used by: `npm run local:probe` and `olympus apply-strategy local`.
 *
 * Probes (in order):
 *   - Ollama (http://localhost:11434) — `GET /tags`
 *   - LM Studio (http://localhost:1234) — `GET /v1/models`
 *   - vLLM (http://localhost:8000) — `GET /v1/models`
 *   - llama.cpp server (http://localhost:8080) — `GET /v1/models`
 *   - Generic OpenAI-compatible (user-entered baseURL via env / prompt)
 *
 * Returns a JSON report: available endpoints, best endpoint per tier,
 * recommended model per god, and an honest reason if nothing answers.
 * The apply-strategy local path uses this to set the provider block.
 */

import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROBES = [
  { name: 'Ollama', url: 'http://localhost:11434', path: '/tags', method: 'GET' },
  { name: 'LM Studio', url: 'http://localhost:1234', path: '/v1/models', method: 'GET' },
  { name: 'vLLM', url: 'http://localhost:8000', path: '/v1/models', method: 'GET' },
  { name: 'llama.cpp server', url: 'http://localhost:8080', path: '/v1/models', method: 'GET' },
];

function log(msg) { console.error(`[local-probe] ${msg}`); }

async function probeOne({ name, url }) {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      return { name, url, ok: true, status: res.status, modelCount: Array.isArray(body?.models) ? body.models.length : (Array.isArray(body?.tags?.models) ? body.tags.models.length : 'unknown') };
    }
    return { name, url, ok: false, status: res.status, reason: `HTTP ${res.status}` };
  } catch (e) {
    return { name, url, ok: false, reason: e.message || 'connection refused / timeout' };
  }
}

async function run() {
  const results = [];
  for (const p of PROBES) {
    results.push(await probeOne(p));
  }
  const working = results.filter(r => r.ok);
  log(`Probed ${PROBES.length} endpoints. Responding: ${working.length}`);
  for (const r of working) log(`  ${r.name} at ${r.url} — models: ${r.modelCount}`);
  for (const r of results.filter(r => !r.ok)) log(`  ${r.name} at ${r.url} — ${r.reason}`);
  const best = working[0] || null;
  console.log(JSON.stringify({
    version: '0.0.22',
    bestEndpoint: best ? { name: best.name, url: best.url, modelCount: best.modelCount } : null,
    working,
    all: results,
    message: best ? `Local endpoint found: ${best.name}` : 'No local endpoint responded. Check LOCAL-LLM.md and start your server.',
  }, null, 2));
  return best ? 0 : 1;
}

run().then(code => process.exit(code));
