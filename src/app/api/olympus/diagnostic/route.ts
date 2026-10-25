/**
 * GET /api/olympus/diagnostic — ONE-CLICK DIAGNOSTIC BUNDLE.
 *
 * Aggregates the last 5 minutes of every relevant source into one JSON
 * document, with secrets masked automatically.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');
const VAULT = path.join(os.homedir(), 'OLYMPUS-VAULT');
const FEED_PATH = path.join(VAULT, '06_Activity_Feed', 'live.jsonl');
const BUS_PATH = path.join(OLYMPUS_HOME, 'symphony-bus.jsonl');
const SERVER_LOG = path.join(OLYMPUS_HOME, 'opencode-server.log');
const ERRORS_LOG = path.join(OLYMPUS_HOME, 'errors.log');
const LANE_HEALTH = path.join(OLYMPUS_HOME, 'lane-health.json');
const RUN_STATE = path.join(OLYMPUS_HOME, 'active-strategy.json');
const PROVIDERS = path.join(OLYMPUS_HOME, 'llm-providers.json');

const WINDOW_MS = 5 * 60 * 1000;

function maskSecrets(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***REDACTED***')
    .replace(/(?:api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^"'\s,}]{8,}/gi, (m) => m.replace(/[:=]\s*["']?[^"'\s,}]{8,}/, ': ***REDACTED***'))
    .replace(/Bearer\s+[a-zA-Z0-9._-]{20,}/g, 'Bearer ***REDACTED***')
    .replace(/gho_[a-zA-Z0-9]{36}/g, 'gho_***REDACTED***')
    .replace(/ghp_[a-zA-Z0-9]{36}/g, 'ghp_***REDACTED***');
}

function readTail(file: string, maxBytes: number = 64 * 1024): string[] {
  try {
    const stat = fs.statSync(file);
    const start = Math.max(0, stat.size - maxBytes);
    const buf = Buffer.alloc(stat.size - start);
    const fh = fs.openSync(file, 'r');
    fs.readSync(fh, buf, 0, buf.length, start);
    fs.closeSync(fh);
    return buf.toString('utf-8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function recentLines(file: string, maxLines: number = 200): string[] {
  const lines = readTail(file);
  const cutoff = Date.now() - WINDOW_MS;
  const out: string[] = [];
  for (const line of lines) {
    let ts = 0;
    try {
      const m = line.match(/"ts"\s*:\s*"([^"]+)"/);
      if (m) ts = new Date(m[1]).getTime();
    } catch { /* no ts */ }
    if (ts === 0 || ts >= cutoff) out.push(line);
  }
  return out.slice(-maxLines);
}

export async function GET() {
  const now = Date.now();

  const feedLines = recentLines(FEED_PATH, 100);
  const feedEvents = feedLines.map((l) => {
    try { return JSON.parse(l); } catch { return { raw: l }; }
  });

  const busLines = recentLines(BUS_PATH, 50);
  const busEvents = busLines.map((l) => {
    try { return JSON.parse(l); } catch { return { raw: l }; }
  });

  const serverLog = readTail(SERVER_LOG, 32 * 1024).slice(-50);
  const errorsLog = readTail(ERRORS_LOG, 16 * 1024).slice(-20);

  let laneHealth: any = { version: 1, lanes: {}, updatedAt: '' };
  try { const parsed = JSON.parse(fs.readFileSync(LANE_HEALTH, 'utf-8')); if (parsed && parsed.lanes) laneHealth = parsed; } catch { /* absent — empty registry */ }
  // Ensure the file exists for future reads
  try { if (!fs.existsSync(LANE_HEALTH)) fs.writeFileSync(LANE_HEALTH, JSON.stringify(laneHealth, null, 2)); } catch { /* non-fatal */ }

  // #V0.0.17: reconcile llm-providers.json with active-strategy.json on
  // every diagnostic call so the panel and the config never disagree.
  try {
    const activePath = path.join(OLYMPUS_HOME, 'active-strategy.json');
    const providersPath = path.join(OLYMPUS_HOME, 'llm-providers.json');
    if (fs.existsSync(activePath)) {
      const active = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
      const cfg = fs.existsSync(providersPath) ? JSON.parse(fs.readFileSync(providersPath, 'utf-8')) : {};
      if (cfg.strategy !== active.strategy) {
        cfg.strategy = active.strategy;
        cfg.per_god_overrides = cfg.per_god_overrides || {};
        fs.writeFileSync(providersPath, JSON.stringify(cfg, null, 2));
      }
    }
  } catch { /* non-fatal */ }

  let activeStrategy: any = null;
  let providers: any = null;
  try { activeStrategy = JSON.parse(fs.readFileSync(RUN_STATE, 'utf-8')); } catch { /* absent */ }
  try { providers = JSON.parse(fs.readFileSync(PROVIDERS, 'utf-8')); } catch { /* absent */ }

  let hopState: any = null;
  try {
    const laneDir = path.join(os.homedir(), '.local', 'share', 'olympus', 'workspace', 'aime');
    const hopStatePath = path.join(laneDir, '.olympus-hop-state.json');
    hopState = JSON.parse(fs.readFileSync(hopStatePath, 'utf-8'));
  } catch { /* absent */ }

  let gpuFallback: any = null;
  try {
    const marker = path.join(OLYMPUS_HOME, 'gpu-fallback');
    if (fs.existsSync(marker)) {
      gpuFallback = { exists: true, content: fs.readFileSync(marker, 'utf-8').trim() };
    } else {
      gpuFallback = { exists: false };
    }
  } catch { /* ignore */ }

  const summary = {
    generatedAt: new Date(now).toISOString(),
    windowMs: WINDOW_MS,
    feedEvents: feedEvents.length,
    busEvents: busEvents.length,
    serverLogLines: serverLog.length,
    errorLogLines: errorsLog.length,
    deadLanes: laneHealth?.lanes ? Object.entries(laneHealth.lanes).filter(([, v]: [string, any]) => v.status !== 'alive').length : 0,
    activeStrategy: activeStrategy?.strategy ?? null,
    providersStrategy: providers?.strategy ?? null,
  };

  const bundle = {
    summary,
    laneHealth,
    activeStrategy,
    providers: providers ? { strategy: providers.strategy, default: providers.default } : null,
    hopState,
    gpuFallback,
    feed: feedEvents,
    bus: busEvents,
    serverLog: serverLog.map(maskSecrets),
    errorsLog: errorsLog.map(maskSecrets),
  };

  const masked = JSON.parse(maskSecrets(JSON.stringify(bundle)));

  return NextResponse.json(masked, { headers: NO_CACHE_HEADERS });
}
