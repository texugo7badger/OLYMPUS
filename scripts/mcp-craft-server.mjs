#!/usr/bin/env node
/**
 * mcp-craft-server.mjs — W-M CRAFT-VENDOR (v0.0.8): the olympus-craft MCP —
 * the vendored Craft Apps lane for the gods. Upstream ships NO MCP server
 * (the org census 2026-10-21: 66 repos, none MCP; craft-ai-integrations is
 * the AI-provider layer) — per the user's directive we CREATE it. The apps
 * are agent-ready by upstream design (a CLI + a JSON control channel); this
 * server drives the VENDORED installs through the OLYMPUS route (one source
 * of truth — the manager lib + manifest behind /api/olympus/craft-apps).
 *
 *   Tools: craft_catalog, craft_status, craft_install, craft_update,
 *          craft_launch, craft_exec
 *
 *   Transport: stdio JSON-RPC 2.0 (newline-delimited — the MCP stdio shape).
 *   The app port: OLYMPUS_APP_PORT (default 3737 — the canonical OLYMPUS
 *   app server port; electron/main.ts).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import readline from 'node:readline';

const PORT = Number(process.env.OLYMPUS_APP_PORT || 3737);
const BASE = `http://localhost:${PORT}/api/olympus/craft-apps`;
const SERVER_INFO = { name: 'olympus-craft', version: '0.0.11' };
const PROTOCOL_VERSION = '2025-06-18';

async function api(path, init) {
  const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(600000), ...init });
  return r.json().catch(() => ({}));
}

const getCatalog = () => api('');
const postAction = (body) => api('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Poll an install job to completion (the honest progress, bounded). */
async function awaitJob(jobId, maxMs = 300000) {
  const start = Date.now();
  for (;;) {
    const d = await api(`?action=job&id=${encodeURIComponent(jobId)}`);
    const job = d?.job;
    if (!job) return { phase: 'error', error: 'job lost' };
    if (job.phase === 'done') return job;
    if (job.phase === 'error') return job;
    if (Date.now() - start > maxMs) return { phase: 'timeout', error: `still ${job.phase} after ${Math.round(maxMs / 1000)}s — check the pane` };
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

const TOOLS = [
  {
    name: 'craft_catalog',
    description: 'The 13 vendored Craft Apps (ArtCraft suite — image/video/vector/PDF/word/audio/CAD/spreadsheets). Lists what is vendored, the installed + latest versions, the native lane state, and the serve URL each embedded app runs on. No login anywhere — the web builds are self-hosted inside OLYMPUS.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'craft_status',
    description: 'The vendored truth per app: installed version, latest release, update availability, native install/running state. Lighter than craft_catalog when you only need versions.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'craft_install',
    description: 'Download + SHA-256-verify + vendor one app INSIDE OLYMPUS. lane "web" (default): the self-hosted WebAssembly build (7-14 MB) — embedded in the Craft apps pane, no login. lane "native": the per-OS portable build (~80 MB) — its own OS window + the agent CLI. Auto-update keeps both on the latest release.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'The app id — e.g. photocraft, vectorcraft, filmcraft' },
        lane: { type: 'string', enum: ['web', 'native'], description: 'web (embedded pane) or native (OS window + CLI). Default web.' },
      },
      required: ['app'],
    },
  },
  {
    name: 'craft_update',
    description: 'Run the update sweep: every vendored app with a newer GitHub release re-downloads (a running native app is never replaced). No args = all apps; app = one app.',
    inputSchema: { type: 'object', properties: { app: { type: 'string', description: 'Optional — sweep just this app' } } },
  },
  {
    name: 'craft_launch',
    description: 'Launch one vendored native app (its own OS window). Requires the native lane installed (craft_install lane=native). file: optional — a vault asset path the app opens directly.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        file: { type: 'string', description: 'Optional file path to open in the app' },
      },
      required: ['app'],
    },
  },
  {
    name: 'craft_exec',
    description: 'Run one vendored native app headless on its agent-ready CLI (the upstream JSON control channel — e.g. conversion, export, headless ops). Requires the native lane installed. Returns stdout/stderr.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        args: { type: 'array', items: { type: 'string' }, description: 'The CLI arguments (start with --help to discover the surface)' },
      },
      required: ['app', 'args'],
    },
  },
];

function fmtCatalog(d) {
  const lines = [];
  for (const v of d.vendor || []) {
    const lanes = [];
    if (v.vendored) lanes.push(`web v${v.version}${v.updateAvailable ? ` (→ v${v.latestVersion} AVAILABLE)` : ' (up to date)'}`);
    else lanes.push(`web: not vendored${v.latestVersion ? ` (latest v${v.latestVersion})` : ''}`);
    if (v.nativeInstalled) lanes.push(`native v${v.nativeVersion}${v.nativeRunning ? ' RUNNING' : ''}${v.nativeUpdateAvailable ? ` (→ v${v.latestVersion})` : ''}`);
    lines.push(`- ${v.id}: ${lanes.join(' · ')}${v.serveUrl ? ` — embedded at ${v.serveUrl}` : ''}`);
  }
  lines.push(`(studio: the hosted ArtCraft Studio rides the pane's live lane — ${d.studio?.url ?? 'app.getartcraft.com/create-image'})`);
  return lines.join('\n');
}

async function callTool(name, args) {
  if (name === 'craft_catalog') {
    const d = await getCatalog();
    return `The Craft Apps inside OLYMPUS (vendored = downloaded, served from our origin, no login):\n${fmtCatalog(d)}`;
  }
  if (name === 'craft_status') {
    const d = await getCatalog();
    return (d.vendor || []).map((v) => `${v.id}: web=${v.vendored ? `v${v.version}` : '—'} latest=${v.latestVersion ?? '?'} native=${v.nativeInstalled ? `v${v.nativeVersion}${v.nativeRunning ? ' (running)' : ''}` : '—'}`).join('\n');
  }
  if (name === 'craft_install') {
    const app = String(args?.app || '');
    const lane = args?.lane === 'native' ? 'native' : 'web';
    const started = await postAction({ action: 'install', app, lane });
    if (!started?.ok) return `install failed: ${started?.error || 'unknown app — see craft_catalog'}`;
    const job = await awaitJob(started.jobId);
    if (job.phase === 'done') return `${app} ${lane} lane vendored v${job.version} — ${lane === 'web' ? 'embedded in the Craft apps pane (no login)' : 'native build ready (craft_launch / craft_exec)'}`;
    return `${app} ${lane} install: ${job.phase}${job.error ? ` — ${job.error}` : ''}`;
  }
  if (name === 'craft_update') {
    if (args?.app) {
      const started = await postAction({ action: 'install', app: String(args.app), lane: 'web' });
      if (!started?.ok) return `update failed: ${started?.error || 'unknown app'}`;
      const job = await awaitJob(started.jobId);
      return job.phase === 'done' ? `${args.app} updated to v${job.version}` : `${args.app}: ${job.phase}${job.error ? ` — ${job.error}` : ''}`;
    }
    await postAction({ action: 'update-all' });
    return 'Update sweep started — the vendored apps with newer releases re-download (running native apps are skipped; craft_status shows the result).';
  }
  if (name === 'craft_launch') {
    const r = await postAction({ action: 'launch', app: String(args?.app || ''), file: args?.file ? String(args.file) : undefined });
    return r?.ok ? `${args.app} launched (pid ${r.pid})` : `launch failed: ${r?.error || 'no vendored native build — craft_install lane=native first'}`;
  }
  if (name === 'craft_exec') {
    const app = String(args?.app || '');
    const execArgs = Array.isArray(args?.args) ? args.args.map(String) : [];
    const r = await postAction({ action: 'exec', app, args: execArgs });
    if (!r?.ok && !r?.stdout && r?.stderr) return `exec failed: ${r.stderr}`;
    return `stdout:\n${r.stdout || '(empty)'}\n${r.stderr ? `stderr:\n${r.stderr}` : ''}`.trim();
  }
  throw new Error(`unknown tool '${name}'`);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let msg = null;
  try { msg = JSON.parse(text); } catch { return; }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    writeJson({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO } });
    return;
  }
  if (method === 'ping') { writeJson({ jsonrpc: '2.0', id, result: {} }); return; }
  if (method === 'tools/list') {
    writeJson({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    callTool(name, args)
      .then((text) => writeJson({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } }))
      .catch((e) => writeJson({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `error: ${e?.message || String(e)}` }], isError: true } }));
    return;
  }
  // notifications + unknowns with an id get the honest empty; pure
  // notifications (no id) stay silent per the JSON-RPC law.
  if (id !== undefined && id !== null) writeJson({ jsonrpc: '2.0', id, result: {} });
});

function writeJson(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

rl.on('close', () => process.exit(0));
