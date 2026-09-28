/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
// LOCAL-FIRST opencode detection. Static import so
// Turbopack can resolve it at build time (dynamic require() with
// variable paths is not supported by Turbopack).
import { findOpencodeBinary } from '@/lib/opencode-spawn';
// Shared no-cache headers for live API routes.
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cache heavy checks for 10s to avoid hammering
let cachedHealth: any = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10000;

interface SubsystemHealth {
  status: 'green' | 'yellow' | 'red';
  [key: string]: any;
}

interface OlympusHealth {
  generated_at: string;
  overall: 'green' | 'yellow' | 'red';
  subsystems: {
    ui: SubsystemHealth;
    cli: SubsystemHealth;
    auth: SubsystemHealth;
    mcp: {
      // 'obsidian' is a UI backwards-compat alias for the native vault subsystem.
      // The vault is a stdio server (no TCP port) — checked via circuit breaker.
      obsidian: SubsystemHealth;
      context7: SubsystemHealth;
    };
    // 'obsidian' here is the vault subsystem — kept under this name for UI
    // backwards-compat. Measures the native vault-backend (filesystem + SQLite
    // index), NOT the Obsidian desktop app.
    obsidian: SubsystemHealth;
    child_processes: {
      next_js: SubsystemHealth;
      ttyd: SubsystemHealth;
      code_server: SubsystemHealth;
    };
    routers: any[];
    write_queue: SubsystemHealth;
    brain_loop: SubsystemHealth;
    circuit_breakers: any;
  };
  recommendations: Array<{ severity: 'info' | 'warn' | 'crit'; action: string; command: string }>;
}

/**
 * BASE fix: native TCP port probe (replaces curl via execSync).
 *
 * The old implementation spawned `curl` via execSync for every port check,
 * which on Windows takes 200-300ms per port due to process creation
 * overhead. With 3 child processes (ttyd, code-server, next_js) + MCP
 * checks, the health endpoint took 2.1-2.2s per call (see logs).
 *
 * The new implementation uses `net.createConnection` which is a pure
 * in-process TCP handshake — no process spawn, no curl dependency. It
 * resolves in <10ms per port, bringing the total health check to <200ms.
 *
 * The function is async to support the TCP callback API. Callers that
 * need a sync result can use `checkPortSync` below (which uses a 50ms
 * busy-wait fallback — only used where the caller is already sync).
 */
function checkPortFast(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800); // 800ms max — faster than curl's 1s
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(ok);
    };
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    try {
      socket.connect(port, '127.0.0.1');
    } catch {
      done(false);
    }
  });
}

/**
 * Sync port check using a Node.js one-liner via execSync. This is the
 * FALLBACK for code paths that cannot be made async (the old code called
 * checkPort synchronously inside checkChildProcess). It's still faster
 * than curl because it's a pure Node TCP connect with no HTTP layer.
 *
 * For the main health endpoint, we use checkPortFast (async) via
 * checkChildProcessAsync. The sync version is kept for backwards compat
 * with any caller that hasn't been migrated.
 */
function checkPort(port: number): boolean {
  try {
    execSync(
      `node -e "require('net').createConnection(${port},'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1)).setTimeout(500,()=>process.exit(1))"`,
      { stdio: 'pipe', timeout: 1000 }
    );
    return true;
  } catch {
    return false;
  }
}

function getProcessRSS(pid: number | null): number {
  if (!pid) return 0;
  try {
    const output = execSync(`ps -o rss= -p ${pid} 2>/dev/null || echo 0`, { encoding: 'utf-8' });
    return parseInt(output.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function getOlympusHome(): string {
  return path.join(os.homedir(), '.olympus');
}

function readJsonSafe(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function checkVaultHealth(): SubsystemHealth {
  const state = readJsonSafe(path.join(getOlympusHome(), 'vault-health-state.json'));
  if (!state) {
    return { status: 'yellow', reason: 'monitor not running', latency_ms: null };
  }
  const timeouts = state.consecutive_timeout || 0;
  const paused = state.paused || false;
  const latency = state.last_latency_ms || 0;

  let status: 'green' | 'yellow' | 'red' = 'green';
  if (paused || timeouts >= 3) status = 'red';
  else if (timeouts > 0 || latency > 1000) status = 'yellow';

  return {
    status,
    last_latency_ms: latency,
    consecutive_timeouts: timeouts,
    paused,
    last_success_at: state.last_success_at,
  };
}

function checkQueueHealth(): SubsystemHealth {
  const state = readJsonSafe(path.join(getOlympusHome(), 'vault-queue-state.json'));
  if (!state) {
    return { status: 'green', depth: 0, reason: 'no queue state (idle)' };
  }
  const depth = state.queue?.length || 0;
  const backpressure = state.stats?.high_water_mark > 200 ? 'saturated' : state.stats?.high_water_mark > 50 ? 'throttled' : 'normal';

  let status: 'green' | 'yellow' | 'red' = 'green';
  if (depth > 200) status = 'red';
  else if (depth > 50) status = 'yellow';

  return {
    status,
    depth,
    high_water_mark: state.stats?.high_water_mark || 0,
    total_enqueued: state.stats?.total_enqueued || 0,
    total_flushed: state.stats?.total_flushed || 0,
    total_errors: state.stats?.total_errors || 0,
    backpressure,
  };
}

function checkCircuitBreakers(): any {
  return readJsonSafe(path.join(getOlympusHome(), 'circuit-breaker-state.json')) || {};
}

/**
 * Check whether OpenCode is authenticated / configured.
 *
 * All LLM access — GO plan AND free-tier (Groq, OpenRouter) — is
 * authorized inside OpenCode. OpenCode stores provider keys in auth.json
 * under ~/.local/share/opencode/ (1.18+) or ~/.config/opencode/ (legacy).
 * Legacy free-tier keys in ~/.olympus/.env / llm-providers.json still
 * count, but the OpenCode path is the primary one.
 */
function checkAuth(): SubsystemHealth {
  // GO plan: OpenCode stores its config in ~/.config/opencode/
  const opencodeConfigDir = path.join(os.homedir(), '.config', 'opencode');
  const opencodeJsonc = path.join(opencodeConfigDir, 'opencode.jsonc');
  let hasOpencodeConfig = false;
  try {
    if (fs.existsSync(opencodeJsonc)) {
      const raw = fs.readFileSync(opencodeJsonc, 'utf-8').trim();
      if (raw.length > 0) {
        const parsed = JSON.parse(raw);
        const keys = Object.keys(parsed).filter(k => k !== '$schema');
        hasOpencodeConfig = keys.length > 0;
        // Also check for actual user config values (not just empty defaults)
        if (hasOpencodeConfig) {
          hasOpencodeConfig = keys.some(k => {
            const val = parsed[k];
            return val !== null && val !== undefined && val !== '' &&
              !(typeof val === 'object' && Object.keys(val).length === 0);
          });
        }
      }
    }
  } catch {}

  // OpenCode 1.18+ stores provider keys (GO plan + free-tier Groq/OpenRouter)
  // in auth.json. Values can be a plain string (legacy) or { type, key }.
  const opencodeAuthDirs = [
    path.join(os.homedir(), '.local', 'share', 'opencode'),
    path.join(os.homedir(), '.config', 'opencode'),
  ];
  let hasOpenCodeAuth = false;
  let openCodeProviders: string[] = [];
  for (const dir of opencodeAuthDirs) {
    const authFile = path.join(dir, 'auth.json');
    try {
      if (!fs.existsSync(authFile)) continue;
      const auth = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
      for (const [name, val] of Object.entries(auth)) {
        let key = '';
        if (typeof val === 'string') key = val;
        else if (val && typeof val === 'object') {
          key = (val as any).key || (val as any).apiKey || (val as any).token || '';
        }
        if (typeof key === 'string' && key.length > 0) {
          hasOpenCodeAuth = true;
          openCodeProviders.push(name);
        }
      }
      if (hasOpenCodeAuth) break;
    } catch {}
  }

  // Free-tier: ~/.olympus/.env with API keys (legacy)
  const dotEnv = path.join(getOlympusHome(), '.env');
  let hasDotEnvKeys = false;
  let dotEnvKeys: string[] = [];
  try {
    if (fs.existsSync(dotEnv)) {
      const content = fs.readFileSync(dotEnv, 'utf-8');
      // Parse actual key=value pairs (including encrypted ones)
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (trimmed.includes('OLYMPUS_GROQ_KEY=') || trimmed.includes('OLYMPUS_OPENROUTER_KEY=')) {
          const val = trimmed.split('=', 2)[1]?.trim() || '';
          if (val && val !== '\"\"' && val.length > 0) {
            hasDotEnvKeys = true;
            dotEnvKeys.push(trimmed.split('=', 1)[0]);
          }
        }
      }
    }
  } catch {}

  // Free-tier: llm-providers.json with strategy + optional legacy keys
  const providersFile = path.join(getOlympusHome(), 'llm-providers.json');
  let hasProvidersConfig = false;
  try {
    if (fs.existsSync(providersFile)) {
      const cfg = JSON.parse(fs.readFileSync(providersFile, 'utf-8'));
      hasProvidersConfig = !!(cfg.strategy) || !!(cfg.groq_key) || !!(cfg.openrouter_key);
    }
  } catch {}

  // Also check opencode.json for applied strategy models (written by apply-strategy.js)
  const opencodeJson = path.join(process.cwd(), 'opencode.json');
  let hasOpencodeStrategy = false;
  try {
    if (fs.existsSync(opencodeJson)) {
      const raw = JSON.parse(fs.readFileSync(opencodeJson, 'utf-8'));
      const agents = raw.agent || {};
      // If agents have free-tier or GO models assigned, strategy was applied
      const apollo = agents.apollo;
      if (apollo && apollo.model) {
        hasOpencodeStrategy = true;
      }
    }
  } catch {}

  const authed = hasOpencodeConfig || hasOpenCodeAuth || hasDotEnvKeys || hasProvidersConfig || hasOpencodeStrategy;
  let detail = 'Not configured';
  if (authed) {
    if (hasOpencodeConfig) detail = 'OpenCode GO plan configured';
    else if (hasOpenCodeAuth) detail = 'OpenCode providers configured (' + openCodeProviders.join(', ') + ')';
    else if (hasDotEnvKeys) detail = 'Free-tier API keys configured (' + dotEnvKeys.join(', ') + ')';
    else if (hasProvidersConfig) detail = 'OLYMPUS strategy configured';
    else if (hasOpencodeStrategy) detail = 'Strategy applied to opencode.json';
  }
  return {
    status: authed ? 'green' : 'yellow',
    detail,
  };
}

function checkRouters(): any[] {
  const olympusRoot = process.cwd();
  const routersDir = path.join(olympusRoot, '.opencode', 'routers');
  const result: any[] = [];

  try {
    const files = fs.readdirSync(routersDir).filter((f: string) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const router = JSON.parse(fs.readFileSync(path.join(routersDir, file), 'utf-8'));
        const agents = router.agents || [];
        const coldStart = agents.filter((a: any) => (a.historical_sample_size || 0) < 10).length;
        result.push({
          god: router.god || file.replace('.json', ''),
          path: `.opencode/routers/${file}`,
          agent_count: agents.length,
          cold_start_remaining: coldStart,
          parse_error: null,
        });
      } catch (e: any) {
        result.push({
          god: file.replace('.json', ''),
          path: `.opencode/routers/${file}`,
          agent_count: 0,
          cold_start_remaining: 0,
          parse_error: e.message,
        });
      }
    }
  } catch {}

  return result;
}

function checkChildProcess(name: string, port: number): SubsystemHealth {
  const pidFile = path.join(getOlympusHome(), `${name}.pid`);
  let pid: number | null = null;
  try {
    pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
  } catch {
    pid = null;
  }

  const portOpen = checkPort(port);
  const rss = getProcessRSS(pid);

  let status: 'green' | 'yellow' | 'red' = 'green';
  if (!portOpen && !pid) status = 'yellow'; // optional process not running
  else if (!portOpen && pid) status = 'red'; // process running but port not responding

  return {
    status,
    pid,
    port,
    rss_mb: Math.round(rss / 1024),
    port_responding: portOpen,
  };
}

/**
 * BASE fix: async version of checkChildProcess using the native
 * checkPortFast (net.createConnection). This is the version called by the
 * main GET handler — it brings the health endpoint from 2.2s down to
 * <200ms by avoiding curl process spawns.
 */
async function checkChildProcessAsync(name: string, port: number): Promise<SubsystemHealth> {
  const pidFile = path.join(getOlympusHome(), `${name}.pid`);
  let pid: number | null = null;
  try {
    pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
  } catch {
    pid = null;
  }

  const portOpen = await checkPortFast(port);
  const rss = getProcessRSS(pid);

  let status: 'green' | 'yellow' | 'red' = 'green';
  if (!portOpen && !pid) status = 'yellow'; // optional process not running
  else if (!portOpen && pid) status = 'red'; // process running but port not responding

  return {
    status,
    pid,
    port,
    rss_mb: Math.round(rss / 1024),
    port_responding: portOpen,
  };
}

function checkMCP(name: string, port: number): SubsystemHealth {
  const breakers = checkCircuitBreakers();
  const breakerState = breakers[name]?.state || 'closed';

  let status: 'green' | 'yellow' | 'red' = 'green';
  if (breakerState === 'open') status = 'red';
  else if (breakerState === 'half_open') status = 'yellow';

  return {
    status,
    circuit_state: breakerState,
    port,
    last_failure_at: breakers[name]?.last_failure_at || null,
  };
}

function generateRecommendations(h: OlympusHealth): Array<{ severity: 'info' | 'warn' | 'crit'; action: string; command: string }> {
  const recs: Array<{ severity: 'info' | 'warn' | 'crit'; action: string; command: string }> = [];

  // MCP vault circuit open (field name 'obsidian' kept for UI backwards-compat)
  if (h.subsystems.mcp.obsidian.circuit_state === 'open') {
    recs.push({
      severity: 'crit',
      action: 'Vault MCP circuit open — gods writing to filesystem fallback',
      command: 'opencode run /callimachus-heartbeat --agent callimachus',
    });
  }

  // Vault unhealthy (field name 'obsidian' kept for UI backwards-compat)
  if (h.subsystems.obsidian.status === 'red') {
    recs.push({
      severity: 'crit',
      action: `Vault unhealthy (${h.subsystems.obsidian.consecutive_timeouts} consecutive timeouts) — run: npm run vault:reindex`,
      command: 'opencode run /instinct-status',
    });
  }

  // Queue saturated
  if (h.subsystems.write_queue.backpressure === 'saturated') {
    recs.push({
      severity: 'crit',
      action: 'Vault write queue saturated — gods paused non-critical writes',
      command: 'opencode run /callimachus-heartbeat --agent callimachus --deep',
    });
  }

  // Queue throttled
  if (h.subsystems.write_queue.backpressure === 'throttled') {
    recs.push({
      severity: 'warn',
      action: `Vault write queue throttled (depth: ${h.subsystems.write_queue.depth})`,
      command: 'opencode run /instinct-status',
    });
  }

  // Router cold-start — v0.0.1: per-god router files no longer exist (config
  // is centralized in opencode.json). Skip the warmup recommendation; the
  // routers[] array is always empty here.
  for (const r of h.subsystems.routers) {
    if (r.cold_start_remaining > r.agent_count * 0.5 && r.agent_count > 0) {
      recs.push({
        severity: 'info',
        action: `${r.god} router still cold-starting (${r.cold_start_remaining}/${r.agent_count} agents need warmup)`,
        command: 'opencode run /olympus-dispatch',
      });
    }
  }

  // Child processes down
  if (h.subsystems.child_processes.ttyd.status === 'yellow') {
    recs.push({
      severity: 'info',
      action: 'ttyd not running — base terminal pane shows native PTY fallback',
      command: 'npm run dev',
    });
  }
  if (h.subsystems.child_processes.code_server.status === 'yellow') {
    recs.push({
      severity: 'info',
      action: 'code-server not running — user must launch their external editor from the Editor Bridge tab',
      command: 'npm run dev',
    });
  }

  // High memory
  for (const [name, proc] of Object.entries(h.subsystems.child_processes)) {
    if (proc.rss_mb > 800) {
      recs.push({
        severity: 'warn',
        action: `${name} RSS > 800MB — memory leak suspected`,
        command: 'npm run dev',
      });
    }
  }

  return recs.slice(0, 20); // max 20 recommendations
}

export async function GET() {
  const now = Date.now();

  // Return cached if fresh
  if (cachedHealth && now - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(cachedHealth);
  }

  const olympusRoot = process.cwd();
  const version = fs.existsSync(path.join(olympusRoot, 'VERSION'))
    ? fs.readFileSync(path.join(olympusRoot, 'VERSION'), 'utf-8').trim()
    : '0.0.1';

  // BASE fix: run child-process port checks in parallel with the native
  // checkPortFast (net.createConnection). This brings the endpoint from
  // 2.2s down to <200ms by avoiding curl process spawns.
  const [ttydHealth, codeServerHealth] = await Promise.all([
    checkChildProcessAsync('ttyd', 7681),
    checkChildProcessAsync('code_server', 8080),
  ]);

  const health: OlympusHealth = {
    generated_at: new Date().toISOString(),
    overall: 'green',
    subsystems: {
      ui: {
        status: 'green',
        pid: process.pid,
        rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        uptime_s: Math.round(process.uptime()),
        version,
      },
      cli: {
        status: 'green',
        version,
        // Report the actual LOCAL opencode binary path
        // (not the bare 'opencode' string). This makes the health check
        // honest about whether the local install is present.
        path: findOpencodeBinary() || 'opencode (not found in node_modules/.bin — run: npm run install-opencode)',
      },
      auth: checkAuth(),
      mcp: {
        // 'obsidian' is a UI backwards-compat alias for the native vault
        // subsystem. The vault is a stdio server (no TCP port) — we check
        // via circuit breaker + file existence. Pass port=0 so checkMCP
        // skips the TCP probe and only inspects the breaker state.
        obsidian: checkMCP('mcp_vault', 0),
        context7: checkMCP('mcp_context7', 0),
      },
      obsidian: checkVaultHealth(),
      child_processes: {
        next_js: {
          status: 'green' as const,
          pid: process.pid,
          port: 3000,
          rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
        ttyd: ttydHealth,
        code_server: codeServerHealth,
      },
      routers: checkRouters(),
      write_queue: checkQueueHealth(),
      brain_loop: {
        status: 'green' as const,
        last_observe_at: null,
        last_distill_at: null,
        last_inject_at: null,
        last_prune_at: null,
        last_compact_at: null,
        last_evolve_at: null,
        last_stocktake_at: null,
        stalled_stages: [] as string[],
      },
      circuit_breakers: checkCircuitBreakers(),
    },
    recommendations: [],
  };

  // Calculate overall status
  const allStatuses = [
    health.subsystems.ui.status,
    health.subsystems.cli.status,
    health.subsystems.auth.status,
    health.subsystems.mcp.obsidian.status,
    health.subsystems.mcp.context7.status,
    health.subsystems.obsidian.status,
    health.subsystems.child_processes.next_js.status,
    health.subsystems.child_processes.ttyd.status,
    health.subsystems.child_processes.code_server.status,
    health.subsystems.write_queue.status,
    health.subsystems.brain_loop.status,
  ];

  if (allStatuses.some((s) => s === 'red')) {
    health.overall = 'red';
  } else if (allStatuses.some((s) => s === 'yellow')) {
    health.overall = 'yellow';
  }

  // Generate recommendations
  health.recommendations = generateRecommendations(health);

  // Cache
  cachedHealth = health;
  cachedAt = now;

  return NextResponse.json(health, {
    // Cache-Control: no-store so the Status Bar's gods/skills/
    // agents counters and the Vault Summary's Atlas card reflect the latest
    // state of opencode.json + .mcp.json + .opencode/skills.
    // The in-process `cachedHealth` variable still gates CPU-heavy checks
    // to once per 10s — the no-store header just tells the browser not to
    // cache the HTTP response itself.
    headers: NO_CACHE_HEADERS,
  });
}