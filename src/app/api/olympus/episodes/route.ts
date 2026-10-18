/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
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
}

const VAULT = getVaultRoot();
const EPISODES_DIR = path.join(VAULT, '05_Auto_Learning', 'episodes');
const FEED_PATH = path.join(VAULT, '06_Activity_Feed', 'live.jsonl');

/** The live window the panel advertises (last 24h) + a payload cap. */
const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const LIVE_MAX_EVENTS = 400;
/** Safety cap for pathological feeds: parse at most the last 25k lines. */
const LIVE_MAX_LINES = 25_000;

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

/** Read the live activity feed tail and map real events to episodes.
 *  The 17:44 lesson: 2,026 real events in live.jsonl and the panel said
 *  "No activity yet" — the feed IS the Recent Activity; the old route
 *  only read episode .md files that the learning loop rarely writes. */
function readLiveEpisodes(): Episode[] {
  let raw = '';
  try {
    const st = fs.statSync(FEED_PATH);
    const size = st.size;
    if (size > 4 * 1024 * 1024) {
      // Large feed: read only the tail (a 25k-line window ≈ 2.5MB).
      const fh = fs.openSync(FEED_PATH, 'r');
      const buf = Buffer.alloc(Math.min(size, 4 * 1024 * 1024));
      fs.readSync(fh, buf, 0, buf.length, Math.max(0, size - buf.length));
      fs.closeSync(fh);
      raw = buf.toString('utf-8');
      raw = raw.slice(raw.indexOf('\n') + 1); // drop the partial first line
    } else {
      raw = fs.readFileSync(FEED_PATH, 'utf-8');
    }
  } catch {
    return [];
  }
  const lines = raw.trim().split('\n').filter(Boolean).slice(-LIVE_MAX_LINES);
  const cutoff = Date.now() - LIVE_WINDOW_MS;
  const out: Episode[] = [];
  for (const line of lines) {
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
    });
  }
  // Newest first, capped for payload sanity.
  out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return out.slice(0, LIVE_MAX_EVENTS);
}

/** The Symphony BUS tail (W2, v0.0.4): dispatch outcomes + god heartbeat
 *  transitions ride ~/.olympus/symphony-bus.jsonl — invisible to the
 *  panels until now (the "Atlas/Callimachus look dead" half: their work
 *  rides the bus, the feed only carried tool/dispatch/hop rows). */
function readBusEpisodes(): Episode[] {
  const os = require('node:os') as typeof import('node:os');
  const busPath = path.join(os.homedir(), '.olympus', 'symphony-bus.jsonl');
  let raw = '';
  try { raw = fs.readFileSync(busPath, 'utf-8'); } catch { return []; }
  const cutoff = Date.now() - LIVE_WINDOW_MS;
  const out: Episode[] = [];
  for (const line of raw.trim().split('\n').filter(Boolean).slice(-4000)) {
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
 *  flat dir while the vault nests episodes under <god>/ subdirs). */
function readVaultEpisodes(): { eps: Episode[]; count: number } {
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
  return { eps: out, count };
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
