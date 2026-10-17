#!/usr/bin/env node
/**
 * pool-speed-probe.mjs — THE POOL SPEED PROBE (the 2026-10-16 lesson:
 * "measure before promising"). Run: node scripts/pool-speed-probe.mjs
 *
 * The 16:31 Lumina failure was invisible until the opencode DB was read:
 * the free glm-5.3 pool at peak served ~13 tok/s with multi-minute stalls
 * (a 20.6-minute reasoning turn, 67K reasoning chars, zero output). This
 * probe measures what each god-lane pool ACTUALLY serves RIGHT NOW —
 * TTFT, generation speed, liveness — so a campaign starts with evidence,
 * not hope (#105's law: a claim about live state carries probe evidence).
 *
 * Probes the five 2026-10-16 god-lane anchors on NVIDIA Build with the
 * user's key (auth.json). Exit 0 always — a diagnostic tool, never a
 * gate. The summary names the planner lane's verdict: at <10 tok/s the
 * interactive planning turn will crawl (the measured specimen class).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const LANES = [
  { id: 'nvidia-glm/z-ai/glm-5.3', model: 'z-ai/glm-5.3', role: 'PLANNER (apollo)' },
  { id: 'nvidia-step/stepfun-ai/step-5-preview', model: 'stepfun-ai/step-5-preview', role: 'frontend+build (athena/hephaestus)' },
  { id: 'nvidia-google/google/gemma-4-31b-it', model: 'google/gemma-4-31b-it', role: 'volume (atlas/callimachus/small)' },
  { id: 'nvidia-meta/meta/muse-glimmer-30b', model: 'meta/muse-glimmer-30b', role: 'alt fast (artemis/hermes)' },
  { id: 'nvidia-openai/openai/gpt-oss-20b', model: 'openai/gpt-oss-20b', role: 'devops (prometheus)' },
];

const PROMPT = 'Plan a small CRM landing page. Reply with ONLY a compact JSON object: {"pages":[4 names],"components":[6 names],"accent":"#hex"}. No prose.';

function findKey() {
  const authPath = join(homedir(), '.local', 'share', 'opencode', 'auth.json');
  if (!existsSync(authPath)) return null;
  try {
    const auth = JSON.parse(readFileSync(authPath, 'utf-8'));
    const nvidia = auth.nvidia;
    return (typeof nvidia === 'string' ? nvidia : nvidia?.key || nvidia?.apiKey) || null;
  } catch {
    return null;
  }
}

async function probeLane(model, key, timeoutMs = 120_000) {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: PROMPT }], max_tokens: 8192, stream: true }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      clearTimeout(timer);
      return { verdict: 'DEAD', detail: `HTTP ${res.status}` };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let firstGenAt = null;
    let lastAt = null;
    let genChars = 0;
    let reasonChars = 0;
    let content = '';
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') break outer;
        let d;
        try { d = JSON.parse(payload); } catch { continue; }
        const delta = d?.choices?.[0]?.delta || {};
        const rc = delta.reasoning_content || '';
        const cc = delta.content || '';
        if (rc || cc) {
          const now = Date.now() - t0;
          if (firstGenAt === null) firstGenAt = now;
          lastAt = now;
          reasonChars += rc.length;
          genChars += cc.length;
          content += cc;
        }
      }
    }
    clearTimeout(timer);
    const totalMs = Date.now() - t0;
    if (firstGenAt === null) return { verdict: 'DEAD', detail: `no tokens in ${(totalMs / 1000).toFixed(0)}s` };
    // ~4 chars per token; measure the generation window (first token → last token)
    const genWindowS = Math.max(0.5, (lastAt - firstGenAt) / 1000);
    const tokPerSec = Math.round(((reasonChars + genChars) / 4) / genWindowS);
    const ttftS = (firstGenAt / 1000).toFixed(1);
    const verdict = tokPerSec >= 15 ? 'FAST' : tokPerSec >= 10 ? 'SLOW' : 'CRAWL';
    return {
      verdict, ttftS, tokPerSec, totalS: (totalMs / 1000).toFixed(1),
      reasonChars, contentChars: genChars,
      detail: `ttft=${ttftS}s ~${tokPerSec} tok/s | reasoning=${reasonChars}ch content=${genChars}ch | ${content.slice(0, 40) || '(no content)'}…`,
    };
  } catch (e) {
    clearTimeout(timer);
    return { verdict: 'DEAD', detail: String(e?.message || e).slice(0, 90) };
  }
}

const key = findKey();
if (!key) {
  console.error('pool-speed-probe: no NVIDIA key in ~/.local/share/opencode/auth.json — nothing to probe.');
  process.exit(0);
}

console.log(`pool-speed-probe — ${new Date().toISOString()} — one small planning-shaped turn per god-lane pool:\n`);
const results = [];
for (const lane of LANES) {
  process.stdout.write(`  probing ${lane.id} (${lane.role})… `);
  const r = await probeLane(lane.model, key);
  results.push({ lane, ...r });
  console.log(`${r.verdict}  ${r.detail}`);
}

const planner = results.find((r) => r.lane.id === 'nvidia-glm/z-ai/glm-5.3');
console.log('');
console.log(results.filter((r) => r.verdict === 'DEAD').length > 0
  ? 'WARNING: one or more pools are DEAD — dispatches on those lanes will fail loudly (never silently swapped).'
  : 'All probed pools answered.');
if (planner && (planner.verdict === 'CRAWL' || planner.verdict === 'DEAD')) {
  console.log('WARNING: the PLANNER lane is crawling — interactive planning turns will stall or take many minutes (the 2026-10-16 specimen). The hop runtime absorbs this per-hop; an interactive planning turn does not.');
} else if (planner) {
  console.log(`Planner lane: ${planner.verdict} (~${planner.tokPerSec} tok/s) — a reasoning_effort=low planning turn should complete in minutes.`);
}
