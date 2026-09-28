/**
 * GET /api/olympus/context-usage
 *
 * Returns the current OpenCode session's context-window usage so the
 * Interactive Terminal can show a "ctx N%" indicator and offer to start
 * a new session before LLM quality degrades.
 *
 * OpenCode stores session state on disk as JSON files. The exact location
 * depends on the platform + how OLYMPUS was launched:
 *
 *   - ~/.olympus/sessions/                       (OLYMPUS override)
 *   - $XDG_CONFIG_HOME/opencode/sessions/        (Linux XDG)
 *   - ~/.config/opencode/sessions/               (Linux default)
 *   - ~/.local/share/opencode/sessions/          (some Linux distros)
 *   - ~/Library/Application Support/opencode/sessions/  (macOS)
 *
 * Inside the sessions directory the layout is date-hierarchical:
 *   sessions/YYYY/MM/DD/HH-MM-SS-<rand>.json
 * but flat layouts (sessions/<id>.json) are also supported — we just pick
 * the most-recently-modified .json file in the tree (depth-limited to 5).
 *
 * Session JSON shape varies across OpenCode versions. We defensively try
 * every known location for token usage + context-window limit:
 *
 *   - session.metadata.tokens.{input,output,total,cache.read}
 *   - session.tokens.{input,output,total,cache.read}
 *   - session.usage.{input_tokens,output_tokens,total_tokens}
 *   - session.metadata.contextWindow | context_window | model_info.context_window
 *   - session.contextWindow | contextLimit
 *   - per-message session.messages[].metadata.usage.{input_tokens,output_tokens,...}
 *
 * If anything is missing or no session file exists, we return zeros with
 * quality 'good' (per the task spec) so the indicator stays subtle until
 * real data is available.
 *
 * Quality thresholds (per task spec):
 *   < 70%  → good
 *   70-85% → warning
 *   > 85%  → critical
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Default context-window limit. Most GO-plan models (Claude Sonnet/Opus,
// GPT-4o, GLM-5.2) ship with 128k–200k context. 200k is a conservative
// default — the session file's metadata.contextWindow overrides this when
// available. If we overestimate the limit, the indicator just reads low;
// if we underestimate it, the indicator reads high. The former is the
// safer failure mode (we don't bother the user with a false alarm).
const DEFAULT_CONTEXT_LIMIT = 200_000;

/**
 * Resolve the context-window limit for a model from the live provider
 * lists (~/.olympus/free-models.json). The free strategies run models like
 * Nemotron Ultra (1M context), but OpenCode's session metadata carries no
 * contextWindow field — without this lookup the indicator would read 100%
 * at 200k tokens on a 1M-window model.
 *
 * Matches by `rawId` (or a substring of it, since the session model JSON
 * may carry provider prefixes like `nvidia/` or `openrouter/`).
 * Returns null when the model isn't found or the file is unavailable.
 */
function resolveFreeModelContext(modelId?: string): number | null {
  if (!modelId) return null;
  try {
    const file = path.join(os.homedir(), '.olympus', 'free-models.json');
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    for (const src of ['openrouter', 'nvidia']) {
      const list = data?.[src]?.top;
      if (!Array.isArray(list)) continue;
      for (const m of list) {
        const rawId = m?.rawId;
        if (typeof rawId !== 'string') continue;
        if (rawId === modelId || modelId.includes(rawId) || rawId.includes(modelId)) {
          const ctx = Number(m?.context);
          if (Number.isFinite(ctx) && ctx > 0) return ctx;
        }
      }
    }
  } catch {}
  return null;
}

// OpenCode ≥1.18 stores sessions in a SQLite DB (opencode.db) instead of
// JSON session files on disk. The warm opencode server (`opencode serve`)
// writes to the same DB, keyed by the session id that OLYMPUS maps from
// conversationId (~/.olympus/opencode-sessions.json). We read the DB
// read-only so the indicator never interferes with the server's writes.
const OPENCODE_DB_CANDIDATES = [
  process.env.OPENCODE_DATA_DIR
    ? path.join(process.env.OPENCODE_DATA_DIR, 'opencode.db')
    : null,
  path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db'),
  path.join(os.homedir(), '.config', 'opencode', 'opencode.db'),
].filter((p): p is string => Boolean(p));

function findOpencodeDb(): string | null {
  for (const p of OPENCODE_DB_CANDIDATES) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

/**
 * Read token usage for an opencode session from the SQLite DB.
 * Returns null when the DB is unavailable or the session has no rows.
 * The session table carries real provider-reported usage:
 *   tokens_input / tokens_output / tokens_reasoning / tokens_cache_read
 *   cost, model (JSON), metadata (JSON, may hold context_window).
 */
function readUsageFromDb(sessionId?: string): {
  used: number;
  limit: number;
  model?: string;
  sessionId?: string;
} | null {
  const dbPath = findOpencodeDb();
  if (!dbPath) return null;

  let Database: any = null;
  try {
    // better-sqlite3 is a dependency (used by the Electron main process);
    // lazy require so this route still works if the native module is
    // missing (falls back to the legacy JSON-file path below).
    Database = require('better-sqlite3');
  } catch {
    return null;
  }

  try {
    const db = new Database(dbPath, { readonly: true });
    try {
      let row: any = null;
      if (sessionId) {
        row = db.prepare('SELECT * FROM session WHERE id = ? LIMIT 1').get(sessionId);
      }
      if (!row) {
        // Fall back to the most recently-updated session (matches the old
        // "newest session file" behavior).
        row = db.prepare('SELECT * FROM session ORDER BY time_updated DESC LIMIT 1').get();
      }
      if (!row) return null;

      const used = (row.tokens_input || 0) + (row.tokens_output || 0)
        + (row.tokens_reasoning || 0) + (row.tokens_cache_read || 0);

      // Model: the session.model column is a JSON blob like
      // {"id":"openai/gpt-oss-120b","providerID":"groq",...} — surface the id.
      let model: string | undefined;
      try {
        if (typeof row.model === 'string') {
          const parsed = JSON.parse(row.model);
          model = typeof parsed?.id === 'string' ? parsed.id : row.model;
        } else if (row.model && typeof row.model === 'object') {
          model = row.model.id;
        }
      } catch { model = undefined; }

      // Limit: metadata.contextWindow if present, else the live free-model
      // list context, else the default.
      let limit = DEFAULT_CONTEXT_LIMIT;
      try {
        const md = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        if (md) {
          const ctx = md.contextWindow ?? md.context_window ?? md.modelInfo?.context_window ?? md.model_info?.context_window;
          if (Number.isFinite(Number(ctx)) && Number(ctx) > 0) limit = Number(ctx);
        }
      } catch {}
      if (limit === DEFAULT_CONTEXT_LIMIT) {
        const fmCtx = resolveFreeModelContext(model);
        if (fmCtx != null) limit = fmCtx;
      }

      return { used, limit, model, sessionId: row.id };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/**
 * Map a client conversationId to its warm opencode session id.
 * The mapping is persisted by src/lib/opencode-session.ts in
 * ~/.olympus/opencode-sessions.json.
 */
function sessionIdForConversation(conversationId?: string): string | null {
  if (!conversationId) return null;
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), '.olympus', 'opencode-sessions.json'), 'utf-8');
    const map = JSON.parse(raw);
    const rec = map[conversationId];
    return typeof rec?.sessionId === 'string' ? rec.sessionId : null;
  } catch {
    return null;
  }
}

// Quality thresholds (per task spec). Strictly greater-than for warning
// and critical so the boundaries fall in the lower bucket (e.g. exactly
// 70% is still 'good', 70.1% is 'warning').
const WARN_PCT = 0.70; // > 70% = warning
const CRIT_PCT = 0.85; // > 85% = critical

export interface ContextUsageResponse {
  used: number;
  limit: number;
  percentage: number;
  quality: 'good' | 'warning' | 'critical';
  sessionId?: string;
  model?: string;
  /** ISO mtime of the session file we read (for client-side freshness checks). */
  sessionMtime?: string;
}

/**
 * Build the list of candidate session directories. Filtered to those that
 * exist on disk. The OLYMPUS override (~/.olympus/sessions) is checked
 * first because it's the canonical location when OLYMPUS is running.
 */
function getSessionDirs(): string[] {
  const home = os.homedir();
  const candidates: string[] = [
    path.join(home, '.olympus', 'sessions'),
  ];
  if (process.env.XDG_CONFIG_HOME) {
    candidates.push(path.join(process.env.XDG_CONFIG_HOME, 'opencode', 'sessions'));
  }
  candidates.push(
    path.join(home, '.config', 'opencode', 'sessions'),
    path.join(home, '.local', 'share', 'opencode', 'sessions'),
    path.join(home, 'Library', 'Application Support', 'opencode', 'sessions'),
  );
  // De-dupe + filter to existing dirs.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    try { if (fs.existsSync(c)) out.push(c); } catch {}
  }
  return out;
}

/**
 * Recursively find the most-recently-modified .json file under `dir`.
 *
 * Depth is limited to 5 to prevent runaway traversal on weirdly-deep trees
 * (OpenCode's date hierarchy is 4 levels: sessions/YYYY/MM/DD/file.json).
 *
 * Returns `{ file, mtime }` or null if no .json files exist.
 *
 * This is synchronous because:
 *   1. The session directory tree is small (a few hundred files at most).
 *   2. Synchronous fs APIs are simpler + avoid promise overhead in the
 *      hot path (the indicator polls every 5s).
 */
function findMostRecentSession(dir: string): { file: string; mtime: number } | null {
  let best: { file: string; mtime: number } | null = null;
  const stack: Array<{ dir: string; depth: number }> = [{ dir, depth: 0 }];
  while (stack.length > 0) {
    const { dir: cur, depth } = stack.pop()!;
    if (depth > 5) continue;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push({ dir: full, depth: depth + 1 });
        continue;
      }
      if (!e.isFile()) continue;
      // Only consider .json files. OpenCode writes session state as JSON.
      if (!e.name.endsWith('.json')) continue;
      try {
        const st = fs.statSync(full);
        if (!best || st.mtimeMs > best.mtime) {
          best = { file: full, mtime: st.mtimeMs };
        }
      } catch {}
    }
  }
  return best;
}

/**
 * Defensive number coercion. Returns 0 for anything that isn't a finite
 * non-negative number.
 */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Extract `{ used, limit, model, sessionId }` from a parsed session JSON.
 *
 * Tries every known field location across OpenCode versions. For `used`,
 * prefers an explicit "total" aggregate; otherwise sums input + output
 * (+ cache reads). Falls back to summing per-message usage if the
 * aggregate is 0.
 */
function extractUsage(session: any): {
  used: number;
  limit: number;
  model?: string;
  sessionId?: string;
} {
  const sessionId = typeof session?.id === 'string' ? session.id : undefined;
  const model =
    typeof session?.model === 'string' ? session.model :
    typeof session?.metadata?.model === 'string' ? session.metadata.model :
    typeof session?.metadata?.modelInfo?.name === 'string' ? session.metadata.modelInfo.name :
    undefined;

  // ---- Limit (context window) ----
  // Try every known field name + nesting.
  const limitRaw =
    session?.metadata?.contextWindow ??
    session?.metadata?.context_window ??
    session?.metadata?.modelInfo?.context_window ??
    session?.metadata?.model_info?.context_window ??
    session?.contextWindow ??
    session?.context_window ??
    session?.contextLimit ??
    session?.limit;
  let limit = num(limitRaw);
  if (limit <= 0) {
    // No per-session context window — fall back to the live free-model list
    // (1M for Nemotron Ultra etc.) before the 200k default.
    const fmCtx = resolveFreeModelContext(model);
    limit = fmCtx != null ? fmCtx : DEFAULT_CONTEXT_LIMIT;
  }

  // ---- Used (token count) ----
  // 1. Explicit total aggregate
  const totalDirect = num(
    session?.metadata?.tokens?.total ??
    session?.tokens?.total ??
    session?.usage?.total_tokens
  );
  let used = totalDirect;

  // 2. Sum input + output (+ cache reads)
  if (used === 0) {
    const inputTokens = num(
      session?.metadata?.tokens?.input ??
      session?.tokens?.input ??
      session?.usage?.input_tokens
    );
    const outputTokens = num(
      session?.metadata?.tokens?.output ??
      session?.tokens?.output ??
      session?.usage?.output_tokens
    );
    const cacheRead = num(
      session?.metadata?.tokens?.cache?.read ??
      session?.tokens?.cache?.read ??
      session?.usage?.cache_read_input_tokens
    );
    used = inputTokens + outputTokens + cacheRead;
  }

  // 3. Fall back to summing per-message usage from messages[]
  if (used === 0 && Array.isArray(session?.messages)) {
    let msgTotal = 0;
    for (const m of session.messages) {
      const u = m?.metadata?.usage ?? m?.usage ?? {};
      msgTotal += num(u.input_tokens ?? u.input) +
                  num(u.output_tokens ?? u.output) +
                  num(u.cache_read_input_tokens ?? u.cache?.read);
    }
    used = msgTotal;
  }

  // Sanity bounds — cap `used` at limit*2 so a runaway session doesn't
  // produce a 250% reading (which would break the progress bar UI). The
  // cap is generous because compaction can briefly push usage past 100%
  // before the old messages are evicted.
  if (!Number.isFinite(used) || used < 0) used = 0;
  if (used > limit * 2) used = limit * 2;

  return { used, limit, model, sessionId };
}

/**
 * Empty / "no session" response. Per the task spec: "If the session file
 * can't be found, return zeros with quality 'good'."
 */
function emptyResponse(): ContextUsageResponse {
  return {
    used: 0,
    limit: DEFAULT_CONTEXT_LIMIT,
    percentage: 0,
    quality: 'good',
  };
}

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;

  // Prefer the SQLite DB (opencode ≥1.18 stores sessions there). When the
  // client passes its conversationId, we read that exact warm session;
  // otherwise we fall back to the most-recently-updated session.
  const conversationId = req.nextUrl.searchParams.get('conversationId') || undefined;

  // A conversationId with NO mapping means a fresh chat (terminal reset or
  // new session — the mapping file is deleted on strategy apply and rotated
  // on reset). Returning the newest session's usage here would show the
  // PREVIOUS conversation's stale context on a reset bar. Zero it instead.
  const mappedSessionId = conversationId ? sessionIdForConversation(conversationId) : null;
  if (conversationId && !mappedSessionId) {
    return NextResponse.json(emptyResponse(), { headers: NO_CACHE_HEADERS });
  }

  const dbResult = readUsageFromDb(mappedSessionId || undefined);
  if (dbResult) {
    const pct = dbResult.limit > 0 ? dbResult.used / dbResult.limit : 0;
    const percentage = Math.round(pct * 100);
    const quality: ContextUsageResponse['quality'] =
      pct > CRIT_PCT ? 'critical' :
      pct > WARN_PCT ? 'warning' :
      'good';
    return NextResponse.json({
      used: Math.min(dbResult.used, dbResult.limit * 2),
      limit: dbResult.limit,
      percentage,
      quality,
      sessionId: dbResult.sessionId,
      model: dbResult.model,
      sessionMtime: new Date().toISOString(),
    } satisfies ContextUsageResponse, { headers: NO_CACHE_HEADERS });
  }

  // The conversation maps to a session id, but the session row is gone from
  // the DB (e.g. the server was restarted and the session evicted). Don't
  // fall through to the newest-session JSON path — that would attribute the
  // previous conversation's usage to this fresh chat.
  if (conversationId && mappedSessionId) {
    return NextResponse.json(emptyResponse(), { headers: NO_CACHE_HEADERS });
  }

  const dirs = getSessionDirs();
  if (dirs.length === 0) {
    return NextResponse.json(emptyResponse(), { headers: NO_CACHE_HEADERS });
  }

  // Find the most-recently-modified session file across all candidate dirs.
  let best: { file: string; mtime: number } | null = null;
  for (const dir of dirs) {
    const r = findMostRecentSession(dir);
    if (r && (!best || r.mtime > best.mtime)) {
      best = r;
    }
  }
  if (!best) {
    return NextResponse.json(emptyResponse(), { headers: NO_CACHE_HEADERS });
  }

  // Read + parse the session file.
  let parsed: any = null;
  try {
    parsed = JSON.parse(fs.readFileSync(best.file, 'utf-8'));
  } catch {
    // Corrupt or partial JSON (OpenCode writes session files incrementally
    // and may be mid-write). Return zeros so the indicator doesn't error.
    return NextResponse.json(emptyResponse(), { headers: NO_CACHE_HEADERS });
  }

  const { used, limit, model, sessionId } = extractUsage(parsed);
  const pct = limit > 0 ? used / limit : 0;
  const percentage = Math.round(pct * 100);
  const quality: ContextUsageResponse['quality'] =
    pct > CRIT_PCT ? 'critical' :
    pct > WARN_PCT ? 'warning' :
    'good';

  const body: ContextUsageResponse = {
    used,
    limit,
    percentage,
    quality,
    sessionId,
    model,
    sessionMtime: new Date(best.mtime).toISOString(),
  };

  return NextResponse.json(body, { headers: NO_CACHE_HEADERS });
}
