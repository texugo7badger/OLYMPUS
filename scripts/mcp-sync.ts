#!/usr/bin/env node
/**
 * mcp-sync.ts — canonicalize .mcp.json → opencode.json (v0.0.24).
 *
 * Usage:
 *   npx tsx scripts/mcp-sync.ts --dry-run
 *   npx tsx scripts/mcp-sync.ts --apply
 *
 * The dry run prints exactly what would change; --apply writes (backup first,
 * idempotent). This is the same function the MCP panel's mount sync uses.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { listMcpServers, syncMcpConfig } from '../src/lib/mcp-registry.ts';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = args.includes('--dry-run') || !apply;

if (dryRun) {
  const { servers } = listMcpServers();
  console.log(`dry-run: ${servers.length} merged servers (${servers.filter((s) => s.enabled).length} enabled)`);
  for (const s of servers) {
    const issues = s.configIssues.length ? ` — FIX: ${s.configIssues.join('; ')}` : '';
    console.log(`${s.enabled ? 'ON ' : 'off'}  ${s.name.padEnd(20)} ${s.type.padEnd(7)} ${s.requires?.kind ?? 'optional'}${issues}`);
  }
  console.log('\nrun with --apply to write opencode.json (backup first)');
  process.exit(0);
}

const r = syncMcpConfig();
if (!r.ok) {
  console.error(`mcp-sync failed: ${r.error}`);
  process.exit(1);
}
console.log(`mcp-sync: ${r.changed ? 'changed' : 'no changes'} · ${r.added} added · ${r.normalized} repaired · ${r.total} total${r.backup ? ` · backup ${r.backup}` : ''}`);
for (const d of r.details.filter((x) => x.action !== 'unchanged')) {
  console.log(`  ${d.action.padEnd(10)} ${d.name}${d.issues.length ? ` — ${d.issues.join('; ')}` : ''}`);
}
