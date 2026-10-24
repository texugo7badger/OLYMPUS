/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import os from 'node:os';
import path from 'path';
// Shared no-cache headers for live API routes.
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Episode {
  id: string;
  god: string;
  /** Lucide icon key (matches GOD_ICONS in olympus-store.ts). */
  icon?: string;
  ts: string;
  impact: string;
  confidence: number;
  summary: string;
  outcome: string;
  tools: string[];
  source: 'vault' | 'simulated' | 'live';
  /** LIVE events: the feed action (tool_call / dispatch / hop / …). */
  action?: string;
  /** LIVE dispatch events: the demigod that received the delegation. */
  demigod?: string | null;
  /** 'delegation' on dispatch-shaped events (the panel's counter key). */
  type?: string;
  /** #183: the full dispatch DNA — the row's labeled chips. */
  dispatchId?: string | null;
  skill?: string | null;
  mcp?: string | null;
  instinct?: string | null;
  shortCircuited?: boolean;
  tokens?: { input: number; output: number } | null;
  durationMs?: number | null;
  toolCalls?: number | null;
  findings?: string | null;
  /** #MINITASK (2026-10-24): the demigod roster the god commands for this
   *  hop (available arsenal). Populated on `hop` events only. */
  arsenal?: string[] | null;
}

const VAULT = getVaultRoot();
const EPISODES_DIR = path.join(VAULT, '05_Auto_Learning', 'episodes');
const FEED_PATH = path.join(VAULT, '06_Activity_Feed', 'live.jsonl');

/** The live window the panel advertises (last 24h) + a payload cap. */
const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const LIVE_MAX_EVENTS = 400;
/** Safety cap for pathological feeds: parse at most the last 25k lines. */
const LIVE_MAX_LINES = 25_000;
/** #196 — incremental tail windows: the seed/catch-up cap for the live
 *  feed (unchanged from the old tail bound) and the trimmed bus window. */
const FEED_TAIL_BYTES = 4 * 1024 * 1024;
const BUS_TAIL_BYTES = 200 * 1024;
const BUS_MAX_LINES = 4000;

const GOD_ICONS: Record<string, string> = {
  apollo: 'apollo', atlas: 'atlas', hephaestus: 'hephaestus', athena: 'athena',
  hermes: 'hermes', artemis: 'artemis', dionysus: 'dionysus',
  persephone: 'persephone', prometheus: 'prometheus', callimachus: 'callimachus',
};

/**
 * The LIVE actions that carry consequence — the panel's "high impact"
 * lane. Tool calls are the workhorse (low); the actions below change
 * state, delegate authority, or surface failure.
 */
const HIGH_IMPACT_ACTIONS = new Set([
  'dispatch', 'symphony-dispatch', 'dispatch_outcome', 'shortcircuit',
  'error', 'milestone', 'unattended_mode', 'delegation',
]);

function parseFrontmatter(raw: string): Record<string, any> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm: Record<string, any> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) {
      const v = kv[2].trim();
      fm[kv[1]] = isNaN(parseFloat(v)) ? v.replace(/["']/g, '') : parseFloat(v);
    }
  }
  return fm;
}

/**
 * #196 — byte-offset incremental tail for the live feed: module state
 * tracks the last seen size and only NEW bytes are read per call (the old
 * path re-read a 4MB tail on every poll, 3 surfaces x 10-15s). The ring
 * keeps the last LIVE_MAX_LINES raw lines in memory; the mapping + 24h
 * filter below run over the ring with a fresh cutoff, so repeated IO is
 * gone and event aging stays exact. Reseed on first read and on shrink
 * (rotation/truncation).
 */
const feedTail = { started: false, size: 0, partial: '', lines: [] as string[] };

interface TailState {
  started: boolean;
  size: number;
  partial: string;
  lines: string[];
}

function ingestTail(t: TailState, filePath: string, capBytes: number, maxLines: number): void {
  let st: fs.Stats;
  try { st = fs.statSync(filePath); } catch {
    t.started = false; t.size = 0; t.partial = ''; t.lines = [];
    return;
  }
  // Reseed on first read or shrink (rotation/truncation): restart from a
  // capped tail window. Otherwise continue from the last seen size.
  const reseed = !t.started || st.size < t.size;
  const from = reseed ? Math.max(0, st.size - capBytes) : t.size;
  if (reseed) {
    t.started = true;
    t.partial = '';
    t.lines = [];
  }
  if (st.size <= from) return;
  // Read only the NEW bytes; if growth exceeds the cap, jump the window.
  const jumped = st.size - from > capBytes;
  const readFrom = jumped ? st.size - capBytes : from;
  try {
    const fh = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(st.size - readFrom);
      fs.readSync(fh, buf, 0, buf.length, readFrom);
      t.size = st.size;
      let chunk = t.partial + buf.toString('utf-8');
      // A reseeded/jumped window starts at an arbitrary byte — its first
      // line is partial and must be dropped. A boundary-continuing read
      // (partial === '', from === last size) keeps every new line.
      const midLine = (reseed || jumped) && readFrom > 0;
      if (midLine && t.partial === '' && chunk.indexOf('\n') !== -1) {
        chunk = chunk.slice(chunk.indexOf('\n') + 1);
      }
      const parts = chunk.split('\n');
      t.partial = parts.pop() || '';
      for (const l of parts) {
        if (!l.trim()) continue;
        t.lines.push(l);
        if (t.lines.length > maxLines) t.lines.shift();
      }
    } finally {
      fs.closeSync(fh);
    }
  } catch { /* keep whatever we already have */ }
}

/** Read the live activity feed tail and map real events to episodes.
 *  The 17:44 lesson: 2,026 real events in live.jsonl and the panel said
 *  "No activity yet" — the feed IS the Recent Activity; the old route
 *  only read episode .md files that the learning loop rarely writes. */
function readLiveEpisodes(): Episode[] {
  ingestTail(feedTail, FEED_PATH, FEED_TAIL_BYTES, LIVE_MAX_LINES);
  const cutoff = Date.now() - LIVE_WINDOW_MS;
  const out: Episode[] = [];
  for (const line of feedTail.lines) {
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    const ts = typeof ev?.ts === 'string' ? ev.ts : '';
    if (!ts) continue;
    let t = 0;
    try { t = new Date(ts).getTime(); } catch { continue; }
    if (!Number.isFinite(t) || t < cutoff) continue;
    const action = String(ev.action || 'event');
    const god = String(ev.god || 'global').toLowerCase();
    const meta = (ev.meta && typeof ev.meta === 'object') ? ev.meta : {};
    const demigod = ev.demigod ?? meta.demigod ?? meta.agent ?? null;
    const msg = String(ev.msg || ev.task_signature || action);
    // #183: carry the DNA the old mapping dropped. The dispatch event has
    // the equipment; the outcome event has the cost + verdict.
    const tokensUsed = ev.tokens_used ?? (ev.tokens && typeof ev.tokens === 'object' ? ev.tokens : null);
    const dna = {
      dispatchId: ev.dispatch_id ?? ev.signature_id ?? meta.signatureId ?? null,
      skill: ev.skill_equipped ?? meta.skill ?? null,
      mcp: ev.mcp_enabled ?? meta.mcp ?? null,
      instinct: ev.instinct_id ?? meta.instinct_id ?? null,
      shortCircuited: Boolean(ev.short_circuited ?? meta.short_circuit),
      tokens: tokensUsed
        ? { input: Number(tokensUsed.input) || 0, output: Number(tokensUsed.output) || 0 }
        : null,
      durationMs: typeof ev.duration_ms === 'number' ? ev.duration_ms : null,
      toolCalls: typeof ev.tool_call_count === 'number' ? ev.tool_call_count : null,
      findings: typeof ev.findings_summary === 'string' ? ev.findings_summary.slice(0, 240) : null,
      arsenal: Array.isArray(ev.arsenal ?? meta.arsenal) ? (ev.arsenal ?? meta.arsenal) : null,
    };
    // W0-D: the hop runtime replaced dispatch-as-tool — each hop IS a
    // delegated task. The panel's TASKS counter and the drill-down agree
    // on these semantics.
    const isDispatch = action === 'dispatch' || action === 'symphony-dispatch' || action === 'delegation'
      || action === 'hop';
    out.push({
      id: `live-${t}-${out.length}`,
      god,
      icon: GOD_ICONS[god] || 'apollo',
      ts,
      impact: HIGH_IMPACT_ACTIONS.has(action) ? 'high' : (action === 'hop' || action === 'classification' ? 'medium' : 'low'),
      confidence: 1,
      summary: isDispatch && demigod ? `${msg} → ${demigod}` : msg,
      outcome: action === 'dispatch_outcome' ? msg : '',
      tools: [action],
      source: 'live',
      action,
      demigod: demigod ? String(demigod) : null,
      type: isDispatch ? 'delegation' : undefined,
      ...dna,
    });
  }
  // Newest first, capped for payload sanity.
  out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return out.slice(0, LIVE_MAX_EVENTS);
}

/** The Symphony BUS tail (W2, v0.0.4): dispatch outcomes + god heartbeat
 *  transitions ride ~/.olympus/symphony-bus.jsonl — invisible to the
 *  panels until now (the "Atlas/Callimachus look dead" half: their work
 *  rides the bus, the feed only carried tool/dispatch/hop rows).
 *  #196 — same incremental byte-offset tail as the feed, trimmed to the
 *  last 200KB (was: a full-file readFileSync per call). */
const busTail = { started: false, size: 0, partial: '', lines: [] as string[] };

function readBusEpisodes(): Episode[] {
  // OLYMPUS_HOME is the canonical home (fixtures + lanes); ~/.olympus default.
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  const busPath = path.join(home, 'symphony-bus.jsonl');
  ingestTail(busTail, busPath, BUS_TAIL_BYTES, BUS_MAX_LINES);
  const cutoff = Date.now() - LIVE_WINDOW_MS;
  const out: Episode[] = [];
  for (const line of busTail.lines) {
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    const ts = typeof ev?.ts === 'string' ? ev.ts : '';
    if (!ts) continue;
    let t = 0;
    try { t = new Date(ts).getTime(); } catch { continue; }
    if (!Number.isFinite(t) || t < cutoff) continue;
    const type = String(ev.type || '');
    if (type === 'dispatch-outcome') {
      const god = String(ev.god || 'global').toLowerCase();
      out.push({
        id: `bus-${t}-${out.length}`,
        god, ts,
        impact: 'medium',
        confidence: 1,
        summary: `Dispatch outcome — ${ev.evidence?.dispatchId || ev.dispatchId || 'dispatch'}${ev.outcome ? ` (${ev.outcome})` : ''}`,
        outcome: String(ev.outcome || ''),
        tools: ['dispatch_outcome'],
        source: 'live',
        action: 'dispatch_outcome',
        demigod: ev.demigod ? String(ev.demigod) : null,
        dispatchId: ev.payload?.dispatchId ?? ev.dispatchId ?? null,
        skill: ev.payload?.skill ?? null,
        mcp: ev.payload?.mcp ?? null,
        instinct: ev.payload?.instinctId ?? null,
        shortCircuited: Boolean(ev.payload?.shortCircuited),
        tokens: ev.payload?.tokens
          ? { input: Number(ev.payload.tokens.input) || 0, output: Number(ev.payload.tokens.output) || 0 }
          : null,
        durationMs: typeof ev.payload?.durationMs === 'number' ? ev.payload.durationMs : null,
        toolCalls: typeof ev.payload?.toolCallCount === 'number' ? ev.payload.toolCallCount : null,
        findings: typeof ev.payload?.findings === 'string' ? ev.payload.findings.slice(0, 240) : null,
      });
    } else if (type === 'heartbeat') {
      const god = String(ev.god || 'global').toLowerCase();
      out.push({
        id: `hb-${t}-${out.length}`,
        god, ts,
        impact: 'low',
        confidence: 1,
        summary: `${god} ${ev.state || 'alive'} — heartbeat transition`,
        outcome: '',
        tools: ['heartbeat'],
        source: 'live',
        action: 'heartbeat',
        demigod: null,
      });
    }
  }
  return out;
}

/** Vault episodes — RECURSIVE (the 17:44 bug: the route read only the
 *  flat dir while the vault nests episodes under <god>/ subdirs).
 *  #196 — the recursive walk + frontmatter parse is cached for 60s: the
 *  learning loop writes episodes rarely and three surfaces poll this
 *  route every 10-15s. */
const VAULT_CACHE_MS = 60_000;
let vaultWalkCache: { at: number; eps: Episode[]; count: number } | null = null;

function readVaultEpisodes(): { eps: Episode[]; count: number } {
  if (vaultWalkCache && Date.now() - vaultWalkCache.at < VAULT_CACHE_MS) return vaultWalkCache;
  const out: Episode[] = [];
  let count = 0;
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.md')) continue;
      count++;
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const fm = parseFrontmatter(raw);
        const body = raw.replace(/^---[\s\S]*?---/, '').trim();
        const god = String(fm.agent || 'unknown').toLowerCase();
        out.push({
          id: e.name.replace(/\.md$/, ''),
          god,
          icon: GOD_ICONS[god] || 'apollo',
          ts: fm.ts || new Date().toISOString(),
          impact: String(fm.impact || 'medium'),
          confidence: Number(fm.confidence) || 0.5,
          summary: body.split('\n').find(l => l.includes('Summary'))?.replace(/^.*Summary\]?\s*/, '') || e.name,
          outcome: body.split('\n').find(l => l.includes('Outcome'))?.replace(/^.*Outcome\]?\s*/, '') || '',
          tools: [],
          source: 'vault',
        });
      } catch {}
    }
  };
  walk(EPISODES_DIR);
  vaultWalkCache = { at: Date.now(), eps: out, count };
  return vaultWalkCache;
}

export async function GET() {
  // The LIVE feed first — Recent Activity is what the gods are doing NOW.
  const live = readLiveEpisodes();
  // The Symphony BUS (W2): outcomes + heartbeat transitions.
  const bus = readBusEpisodes();
  // Then the vault's curated episodes (the learning loop's digests).
  const vault = readVaultEpisodes();
  const out = [...live, ...bus, ...vault.eps].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  );
  return NextResponse.json({
    episodes: out,
    total: out.length,
    vaultCount: vault.count,
    liveCount: live.length,
  }, {
    headers: NO_CACHE_HEADERS,
  });
}
