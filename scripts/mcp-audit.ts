#!/usr/bin/env node
/**
 * mcp-audit.ts — PROBE EVERY MCP IN THE OLYMPUS ARSENAL (v0.0.24).
 *
 * The panel and this audit now share ONE probe (`src/lib/mcp-probe.ts`):
 *   - the FULL canonical command array (never `command[0]`);
 *   - the entry's `environment` + `cwd`;
 *   - a real JSON-RPC POST for remote servers.
 *
 * Usage:
 *   npx tsx scripts/mcp-audit.ts            # table for humans
 *   npx tsx scripts/mcp-audit.ts --json     # machine report
 *   npx tsx scripts/mcp-audit.ts --enable <name[,name]>   # enable a curated set
 *   npx tsx scripts/mcp-audit.ts --only <name[,name]>
 *
 * Exit 0 = every ENABLED server answered. A disabled server never fails the
 * audit (it is reported as disabled, not dead).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { listMcpServers, setMcpEnabled, syncMcpConfig } from '../src/lib/mcp-registry.ts';
import { probeMcpBatch } from '../src/lib/mcp-probe.ts';

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const enableIdx = args.indexOf('--enable');
const ENABLE = enableIdx >= 0 ? String(args[enableIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : null;
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? String(args[onlyIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : null;
const TIMEOUT_MS = Number(process.env.MCP_AUDIT_TIMEOUT_MS || 12_000);

async function main() {
  // Always canonicalize first — an untyped entry is invisible to OpenCode.
  const sync = syncMcpConfig();
  if (!JSON_MODE && sync.changed) {
    console.log(`mcp-audit: canonicalized opencode.json (${sync.added} added, ${sync.normalized} repaired) — backup ${sync.backup ?? 'n/a'}`);
  }

  if (ENABLE) {
    for (const name of ENABLE) {
      const r = setMcpEnabled(name, true);
      if (!r.ok) console.error(`enable ${name}: ${r.error}`);
    }
    const all = listMcpServers().servers;
    for (const s of all) {
      if (!ENABLE.includes(s.name) && s.enabled) setMcpEnabled(s.name, false);
    }
    console.log(`enabled: ${ENABLE.join(', ') || '(none)'} — ${all.length - ENABLE.length} left disabled`);
    return;
  }

  const servers = listMcpServers().servers.filter((s) => !ONLY || ONLY.includes(s.name));
  const results = await probeMcpBatch(servers, { timeoutMs: TIMEOUT_MS, concurrency: 4 });

  if (!JSON_MODE) {
    for (const r of results) {
      const server = servers.find((s) => s.name === r.name);
      const tools = r.tools == null ? '  -' : String(r.tools).padStart(3);
      const badge = r.status === 'alive' ? 'ALIVE' : r.status === 'disabled' ? 'off  ' : r.status === 'needs-auth' ? 'AUTH ' : 'DEAD ';
      console.log(`${badge}  ${r.name.padEnd(20)} ${tools} tools  ${String(r.latencyMs).padStart(5)}ms  ${r.error ?? (server?.requires?.kind === 'optional' ? server.requires.label : '')}`);
    }
  }

  const summary = {
    total: results.length,
    alive: results.filter((r) => r.status === 'alive').length,
    dead: results.filter((r) => r.status === 'dead' && r.status !== 'disabled').length,
    enabledDead: results.filter((r) => r.status === 'dead').length,
    disabled: results.filter((r) => r.status === 'disabled').length,
    needsAuth: results.filter((r) => r.status === 'needs-auth').length,
    totalTools: results.filter((r) => r.status === 'alive').reduce((a, r) => a + (r.tools ?? 0), 0),
  };

  if (JSON_MODE) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2));
  } else {
    console.log(`\nmcp-audit: ${summary.alive}/${summary.total} alive · ${summary.totalTools} tools · ${summary.enabledDead} enabled-but-dead · ${summary.disabled} disabled · ${summary.needsAuth} locked`);
  }
  process.exit(summary.enabledDead === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`mcp-audit failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
