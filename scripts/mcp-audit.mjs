#!/usr/bin/env node
/**
 * mcp-audit.mjs — PROBE EVERY MCP IN THE OLYMPUS ARSENAL (v0.0.23).
 *
 * The MCP Configuration panel only knew enabled/disabled; a dead server
 * silently broke every tool that depended on it. This audit spawns each
 * server, performs the JSON-RPC handshake (`initialize` + `tools/list`) and
 * reports: alive/dead, latency, tool count and the exact failure reason.
 *
 * Usage:
 *   node scripts/mcp-audit.mjs            # table for humans
 *   node scripts/mcp-audit.mjs --json     # machine report
 *   node scripts/mcp-audit.mjs --enable <name[,name]>   # enable a curated set
 *
 * Exit 0 = every ENABLED server answered. A disabled server never fails the
 * audit (it is reported as disabled, not dead).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPENCODE_JSON = path.join(ROOT, 'opencode.json');
const MCP_JSON = path.join(ROOT, '.mcp.json');
const TIMEOUT_MS = Number(process.env.MCP_AUDIT_TIMEOUT_MS || 6000);

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const enableIdx = args.indexOf('--enable');
const ENABLE = enableIdx >= 0 ? String(args[enableIdx + 1] || '').split(',').filter(Boolean) : null;
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? String(args[onlyIdx + 1] || '').split(',').filter(Boolean) : null;

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function loadServers() {
  const oc = readJson(OPENCODE_JSON) ?? {};
  const mcp = readJson(MCP_JSON) ?? {};
  const registry = mcp.mcpServers || mcp.servers || {};
  const out = new Map();
  for (const [name, cfg] of Object.entries(oc.mcp || {})) {
    out.set(name, { name, ...cfg, enabled: cfg.enabled === true, source: 'opencode.json' });
  }
  for (const [name, cfg] of Object.entries(registry)) {
    if (out.has(name)) continue;
    out.set(name, { name, ...cfg, enabled: false, source: '.mcp.json' });
  }
  return [...out.values()];
}

function probe(server) {
  return new Promise((resolve) => {
    const started = Date.now();
    const base = { name: server.name, enabled: server.enabled, source: server.source };

    if (server.url) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      fetch(server.url, { method: 'HEAD', signal: ctrl.signal })
        .then((r) => {
          clearTimeout(t);
          resolve({ ...base, status: r.ok || r.status < 500 ? 'alive' : 'dead', latencyMs: Date.now() - started, tools: null, error: r.ok ? null : `HTTP ${r.status}` });
        })
        .catch((e) => { clearTimeout(t); resolve({ ...base, status: 'dead', latencyMs: Date.now() - started, tools: null, error: e.message }); });
      return;
    }

    const expand = (v) => String(v).replace(/\$\{HOME\}/g, os.homedir()).replace(/\$\{PROJECT_ROOT\}/g, ROOT).replace(/\$\{([A-Z_]+)\}/g, (_, k) => process.env[k] ?? '');
    const baseCmd = Array.isArray(server.command) ? server.command : (server.command ? [server.command] : []);
    const cmd = [...baseCmd, ...(Array.isArray(server.args) ? server.args : [])].map(expand);
    if (!cmd.length) {
      resolve({ ...base, status: 'dead', latencyMs: 0, tools: null, error: 'no command' });
      return;
    }

    let child;
    try {
      child = spawn(cmd[0], cmd.slice(1), { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    } catch (e) {
      resolve({ ...base, status: 'dead', latencyMs: 0, tools: null, error: `spawn failed: ${e.message}` });
      return;
    }

    let buf = '';
    let tools = null;
    let settled = false;
    const finish = (status, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch { /* gone */ }
      resolve({ ...base, status, latencyMs: Date.now() - started, tools, error: error ?? null });
    };
    const timer = setTimeout(() => finish('dead', `timeout after ${TIMEOUT_MS}ms (no handshake)`), TIMEOUT_MS);

    child.on('error', (e) => finish('dead', e.message));
    child.on('exit', (code) => { if (!settled) finish('dead', `exited early (code ${code})`); });

    child.stdout.on('data', (d) => {
      buf += d.toString();
      for (const line of buf.split('\n')) {
        const s = line.trim();
        if (!s.startsWith('{')) continue;
        let msg;
        try { msg = JSON.parse(s); } catch { continue; }
        if (msg.id === 1 && msg.result) {
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
        }
        if (msg.id === 2) {
          tools = Array.isArray(msg.result?.tools) ? msg.result.tools.length : 0;
          finish('alive', null);
        }
      }
    });

    const send = () => {
      try {
        child.stdin.write(JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'initialize',
          params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'olympus-mcp-audit', version: '0.0.23' } },
        }) + '\n');
      } catch (e) { finish('dead', e.message); }
    };
    send();
  });
}

function applyEnable(names) {
  const oc = readJson(OPENCODE_JSON);
  if (!oc?.mcp) { console.error('opencode.json carries no mcp block'); process.exit(1); }
  for (const name of Object.keys(oc.mcp)) {
    oc.mcp[name].enabled = names.includes(name);
  }
  fs.writeFileSync(OPENCODE_JSON, JSON.stringify(oc, null, 2) + '\n', 'utf-8');
  console.log(`enabled: ${names.join(', ') || '(none)'} — ${Object.keys(oc.mcp).length - names.length} left disabled`);
}

async function main() {
  if (ENABLE) { applyEnable(ENABLE); return; }

  const servers = loadServers().filter((s) => !ONLY || ONLY.includes(s.name));
  const results = [];
  for (const server of servers) {
    const r = await probe(server);
    results.push(r);
    if (!JSON_MODE) {
      const badge = r.status === 'alive' ? 'ALIVE' : r.enabled ? 'DEAD ' : 'off  ';
      console.log(`${badge}  ${r.name.padEnd(20)} ${String(r.tools ?? '-').padStart(3)} tools  ${String(r.latencyMs).padStart(5)}ms  ${r.error ?? ''}`);
    }
  }

  const summary = {
    total: results.length,
    alive: results.filter((r) => r.status === 'alive').length,
    dead: results.filter((r) => r.status === 'dead' && r.enabled).length,
    disabled: results.filter((r) => !r.enabled).length,
    enabledAlive: results.filter((r) => r.status === 'alive' && r.enabled).length,
    totalTools: results.filter((r) => r.status === 'alive').reduce((a, r) => a + (r.tools || 0), 0),
  };

  if (JSON_MODE) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2));
  } else {
    console.log(`\nmcp-audit: ${summary.alive}/${summary.total} alive · ${summary.totalTools} tools · ${summary.dead} enabled-but-dead · ${summary.disabled} disabled`);
  }
  process.exit(summary.dead === 0 ? 0 : 1);
}

main();
