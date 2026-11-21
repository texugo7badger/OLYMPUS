/**
 * GET /api/olympus/learning/recent — v0.0.98: the live learning ledger.
 *
 * The old feed listed files (an MCP, a skill, a knowledge doc) with a static
 * summary. The user could not see HOW CLOSE a pattern is to the 0.85
 * short-circuit gate. This route joins the arsenal-resonance outcomes and the
 * instinct frontmatter, so every item carries:
 *
 *   confidence / rate · samples · successes · lastUsed / lastOutcome
 *   threshold 0.85 · gap · the last 5 outcomes
 *
 * The notification center and the Pattern Studio poll it; a click opens the
 * learning detail box.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getVaultRoot } from '@/lib/vault-root';
import { withTtl } from '@/lib/ttl-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const SHORT_CIRCUIT_THRESHOLD = 0.85;

interface Learning {
  id: string;
  type: 'instinct' | 'knowledge' | 'skill' | 'mcp';
  name: string;
  god: string;
  ts: string;
  summary: string;
  confidence?: number;
  samples?: number;
  successes?: number;
  rate?: number;
  threshold: number;
  gap: number;
  lastUsed?: string | null;
  lastOutcome?: string | null;
  history?: Array<{ ts: string; outcome: string; hop: string | null; god: string | null }>;
  recommendation?: string;
  path?: string;
}

const IGNORE = new Set(['node_modules', '.git', '.next', '.obsidian', '.trash']);
const MAX = 600;

function walk(root: string, accept: (file: string) => boolean, depth = 0, out: string[] = []): string[] {
  if (depth > 5 || out.length > MAX) return out;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (out.length > MAX) break;
    if (IGNORE.has(e.name)) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) walk(full, accept, depth + 1, out);
    else if (e.isFile() && accept(full)) out.push(full);
  }
  return out;
}

function firstHeading(file: string): string | null {
  try {
    const text = fs.readFileSync(file, 'utf-8').slice(0, 4000);
    const fm = text.match(/^---[\s\S]*?---/);
    const title = text.match(/^#\s+(.+)$/m)?.[1];
    const name = fm?.[0].match(/^name:\s*(.+)$/m)?.[1];
    return (name || title || '').trim() || null;
  } catch { return null; }
}

function frontmatterField(file: string, field: string): string | null {
  try {
    const text = fs.readFileSync(file, 'utf-8').slice(0, 3000);
    const fm = text.match(/^---[\s\S]*?---/)?.[0] ?? '';
    const v = fm.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))?.[1];
    return v ? v.replace(/^["']|["']$/g, '').trim() : null;
  } catch { return null; }
}

function godFromPath(file: string): string {
  const m = file.match(/(?:instincts|gods|knowledge)[/\\]([a-z]+)/i);
  return (m?.[1] || '').toLowerCase();
}

interface Resonance {
  ts?: string;
  god?: string;
  hop?: string | null;
  skill?: string | null;
  mcp?: string | null;
  demigod?: string | null;
  build?: string | null;
  outcome?: string;
}

function readResonance(): Resonance[] {
  try {
    const file = path.join(getVaultRoot(), '03_Index', 'arsenal-resonance.jsonl');
    return fs.readFileSync(file, 'utf-8').trim().split('\n').slice(-12_000)
      .map((l) => { try { return JSON.parse(l) as Resonance; } catch { return null; } })
      .filter((r): r is Resonance => Boolean(r));
  } catch { return []; }
}

function outcomesFor(rows: Resonance[], field: 'skill' | 'mcp' | 'demigod' | 'build', name: string) {
  const key = name.toLowerCase();
  const hits = rows.filter((r) => String((r as any)[field] ?? '').toLowerCase() === key);
  const success = hits.filter((r) => r.outcome === 'completed');
  const last = hits.length ? hits[hits.length - 1] : null;
  return {
    samples: hits.length,
    successes: success.length,
    rate: hits.length ? success.length / hits.length : null,
    lastUsed: last?.ts ?? null,
    lastOutcome: last?.outcome ?? null,
    history: hits.slice(-5).map((r) => ({ ts: String(r.ts ?? ''), outcome: String(r.outcome ?? ''), hop: r.hop ?? null, god: r.god ?? null })),
  };
}

function shortCircuitLastUse(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const file = path.join(getVaultRoot(), '05_Auto_Learning', 'shortcircuit-log.jsonl');
    for (const line of fs.readFileSync(file, 'utf-8').trim().split('\n').slice(-4000)) {
      try {
        const r = JSON.parse(line);
        const id = String(r?.instinct_id ?? '');
        if (id && typeof r?.ts === 'string') map.set(id, r.ts);
      } catch { /* skip */ }
    }
  } catch { /* no log */ }
  return map;
}

function buildLearnings(limit: number): { learnings: Learning[]; scanned: number; vault: string } {
  const vault = getVaultRoot();
  const resonance = readResonance();
  const lastUse = shortCircuitLastUse();
  const items: Learning[] = [];

  // Instincts — the real .md files (the old feed only scanned .json and
  // missed every instinct the brain-stats endpoint shows).
  for (const file of walk(path.join(vault, '05_Auto_Learning', 'instincts'), (f) => f.endsWith('.md'))) {
    try {
      const st = fs.statSync(file);
      const name = (frontmatterField(file, 'name') || firstHeading(file) || path.basename(file, '.md')).slice(0, 110);
      const god = (frontmatterField(file, 'god') || godFromPath(file) || 'callimachus').toLowerCase();
      const rawConf = Number(frontmatterField(file, 'confidence'));
      const confidence = Number.isFinite(rawConf) ? Math.max(0, Math.min(1, rawConf)) : undefined;
      const id = path.basename(file, '.md');
      const lastUsed = lastUse.get(id) ?? lastUse.get(name) ?? null;
      items.push({
        id: `instinct:${file}`,
        type: 'instinct',
        name,
        god,
        ts: lastUsed ?? st.mtime.toISOString(),
        summary: confidence != null
          ? `confiança ${(confidence * 100).toFixed(0)}% — entra no gate de curto-circuito quando cruza 85%`
          : 'um novo instinto no cofre',
        confidence,
        samples: undefined,
        successes: undefined,
        rate: confidence,
        threshold: SHORT_CIRCUIT_THRESHOLD,
        gap: Math.max(0, SHORT_CIRCUIT_THRESHOLD - (confidence ?? 0)),
        lastUsed,
        lastOutcome: null,
        recommendation: confidence != null && confidence >= SHORT_CIRCUIT_THRESHOLD
          ? 'pronto: o gate já pode curto-circuitar este padrão'
          : `faltam ${Math.round((SHORT_CIRCUIT_THRESHOLD - (confidence ?? 0)) * 100)} pontos de confiança — use o padrão em dispatches reais`,
        path: file,
      });
    } catch { /* skip malformed */ }
  }

  // Knowledge — a reference, with the god from frontmatter or path.
  for (const file of walk(path.join(vault, '04_Knowledge'), (f) => f.endsWith('.md'))) {
    try {
      const st = fs.statSync(file);
      items.push({
        id: `knowledge:${file}`,
        type: 'knowledge',
        name: (firstHeading(file) || path.basename(file, '.md')).slice(0, 110),
        god: (frontmatterField(file, 'god') || godFromPath(file) || 'callimachus').toLowerCase(),
        ts: st.mtime.toISOString(),
        summary: 'uma referência no cofre — recuperada quando este domínio entra em jogo',
        threshold: SHORT_CIRCUIT_THRESHOLD,
        gap: SHORT_CIRCUIT_THRESHOLD,
        recommendation: 'referência não curto-circuita sozinha; ela alimenta o prompt do god',
        path: file,
      });
    } catch { /* skip */ }
  }

  // Skills — join the resonance outcomes (samples + success rate).
  const skillsRoot = path.join(process.cwd(), '.opencode', 'skills');
  const skillFiles = walk(skillsRoot, (f) => f.endsWith('SKILL.md'));
  for (const file of skillFiles) {
    try {
      const name = path.basename(path.dirname(file));
      const st = fs.statSync(file);
      const o = outcomesFor(resonance, 'skill', name);
      const rate = o.rate;
      items.push({
        id: `skill:${file}`,
        type: 'skill',
        name: (firstHeading(file) || name).slice(0, 110),
        god: 'athena',
        ts: o.lastUsed ?? st.mtime.toISOString(),
        summary: o.samples > 0
          ? `${o.successes}/${o.samples} conclusões (${Math.round((rate ?? 0) * 100)}%) — a confiança que alimenta as builds`
          : 'skill no arsenal — ainda sem outcomes medidos',
        samples: o.samples,
        successes: o.successes,
        rate: rate ?? undefined,
        confidence: rate ?? undefined,
        threshold: SHORT_CIRCUIT_THRESHOLD,
        gap: Math.max(0, SHORT_CIRCUIT_THRESHOLD - (rate ?? 0)),
        lastUsed: o.lastUsed,
        lastOutcome: o.lastOutcome,
        history: o.history,
        recommendation: o.samples === 0
          ? 'ainda não foi usada em um dispatch; a próxima build pode medir'
          : rate != null && rate >= SHORT_CIRCUIT_THRESHOLD
            ? 'confiança acima de 85% — pode entrar no arsenal de curto-circuito'
            : `faltam ${Math.round((SHORT_CIRCUIT_THRESHOLD - (rate ?? 0)) * 100)} pontos; mais ${Math.max(1, Math.ceil((SHORT_CIRCUIT_THRESHOLD * Math.max(1, o.samples) - o.successes) / Math.max(0.15, 1 - SHORT_CIRCUIT_THRESHOLD)))} sucesso(s) ajudam`,
        path: file,
      });
    } catch { /* skip */ }
  }

  // MCPs — the same resonance join.
  try {
    const cfgPath = path.join(process.cwd(), 'opencode.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    const st = fs.statSync(cfgPath);
    for (const [name, entry] of Object.entries(cfg?.mcp || {})) {
      if ((entry as any)?.enabled === false) continue;
      const o = outcomesFor(resonance, 'mcp', name);
      const rate = o.rate;
      items.push({
        id: `mcp:${name}`,
        type: 'mcp',
        name,
        god: /design|originkit|figma|shadcn|opendesign/.test(name) ? 'athena' : /postgres|docker|kubernetes|rea/.test(name) ? 'persephone' : 'hermes',
        ts: o.lastUsed ?? st.mtime.toISOString(),
        summary: o.samples > 0
          ? `${o.successes}/${o.samples} conclusões (${Math.round((rate ?? 0) * 100)}%) — lane viva equipada por dispatch`
          : 'lane MCP viva — ainda sem outcomes medidos',
        samples: o.samples,
        successes: o.successes,
        rate: rate ?? undefined,
        confidence: rate ?? undefined,
        threshold: SHORT_CIRCUIT_THRESHOLD,
        gap: Math.max(0, SHORT_CIRCUIT_THRESHOLD - (rate ?? 0)),
        lastUsed: o.lastUsed,
        lastOutcome: o.lastOutcome,
        history: o.history,
        recommendation: o.samples === 0
          ? 'a lane está pronta; o próximo dispatch que a usar mede a confiança'
          : rate != null && rate >= SHORT_CIRCUIT_THRESHOLD
            ? 'confiança acima de 85% — o arsenal pode curto-circuitar'
            : 'use em dispatches do domínio para subir a confiança',
      });
    }
  } catch { /* no config */ }

  const seen = new Set<string>();
  const recent = items
    .filter((i) => {
      const key = `${i.type}:${i.name}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, limit);

  return { learnings: recent, scanned: items.length, vault };
}

export async function GET(req: NextRequest) {
  const limit = Math.min(24, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 12)));
  const body = await withTtl(`learning-recent:${limit}`, () => buildLearnings(limit), { ttlMs: 10_000 });
  return NextResponse.json({ ok: true, ...body }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
