#!/usr/bin/env node
/**
 * mcp-vendor.mjs — v0.0.31 (R31-04).
 *
 * THE SPECIMEN (2026-11-01): every MCP server ran through `npx -y pkg@latest`
 * (and context7 through a second compressor wrapper). Each `npm exec` wrapper
 * holds a Node runtime (~115 MB) and re-resolves the package on every lane
 * spawn. Five curated servers × two processes = the memory floor of the app.
 *
 * This script installs the pinned MCP packages ONCE into
 * `~/.olympus/mcp-cache` and resolves a native entrypoint (`node <dist/...>`).
 * The registry then launches the entrypoint directly: one process, pinned
 * version, no network at spawn.
 *
 * Usage:
 *   node scripts/mcp-vendor.mjs            # install + manifest
 *   node scripts/mcp-vendor.mjs --dry-run  # print the plan
 *   node scripts/mcp-vendor.mjs --json
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CACHE = path.join(homedir(), '.olympus', 'mcp-cache');
const MANIFEST = path.join(CACHE, 'manifest.json');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const asJson = args.has('--json');

/** Pinned at 2026-11-01 (npm view <pkg> version). Bump deliberately. */
const PINNED = [
  // 0.6.x line: Node 18+/22 compatible. The 2.x line requires Node >= 24,
  // and the MCP `node` is the system Node (22 on this machine) — pin the
  // compatible line until the app ships its own Node 24 runtime.
  { name: 'filesystem', pkg: '@modelcontextprotocol/server-filesystem', version: '0.6.2', args: ['.'] },
  { name: 'memory', pkg: '@modelcontextprotocol/server-memory', version: '0.6.2', args: [] },
  { name: 'sequential-thinking', pkg: '@modelcontextprotocol/server-sequential-thinking', version: '0.6.2', args: [] },
  { name: 'context7', pkg: '@upstash/context7-mcp', version: '4.4.4', args: [] },
];

function pkgDir(pkg) {
  return path.join(CACHE, 'node_modules', pkg);
}

function installedVersion(pkg) {
  try {
    return JSON.parse(readFileSync(path.join(pkgDir(pkg), 'package.json'), 'utf-8')).version;
  } catch {
    return null;
  }
}

function resolveEntry(pkg) {
  try {
    const pj = JSON.parse(readFileSync(path.join(pkgDir(pkg), 'package.json'), 'utf-8'));
    let rel = null;
    if (typeof pj.bin === 'string') rel = pj.bin;
    else if (pj.bin && typeof pj.bin === 'object') rel = Object.values(pj.bin).find((v) => typeof v === 'string');
    else if (typeof pj.main === 'string') rel = pj.main;
    if (!rel) rel = 'dist/index.js';
    const abs = path.resolve(pkgDir(pkg), rel);
    return existsSync(abs) ? abs : null;
  } catch {
    return null;
  }
}

function install(specs) {
  // ONE npm call with EVERY pinned spec: npm prunes anything not named in
  // the request, so per-package installs silently delete the previous ones
  // (the 2026-11-01 vendor bug).
  execFileSync('npm', [
    'install', '--prefix', CACHE, '--no-save', '--ignore-scripts',
    '--no-audit', '--no-fund', ...specs,
  ], { stdio: dryRun ? 'ignore' : 'inherit', timeout: 300_000 });
}

if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

const servers = {};
let failed = 0;
const missing = PINNED.filter((item) => installedVersion(item.pkg) !== item.version);
if (!dryRun && missing.length > 0) {
  console.log(`[mcp-vendor] installing ${PINNED.length} pinned server(s) in one transaction…`);
  try {
    install(PINNED.map((item) => `${item.pkg}@${item.version}`));
  } catch (e) {
    console.error(`[mcp-vendor] install failed: ${e?.message || e}`);
    failed++;
  }
}
for (const item of PINNED) {
  const entry = dryRun ? null : resolveEntry(item.pkg);
  if (!dryRun && !entry) {
    console.error(`[mcp-vendor] FAILED ${item.pkg}: no entrypoint found under ${pkgDir(item.pkg)}`);
    failed++;
    continue;
  }
  const rel = entry ? path.relative(CACHE, entry).split(path.sep).join('/') : null;
  servers[item.name] = {
    package: item.pkg,
    version: item.version,
    entry,
    command: rel ? ['node', `{env:HOME}/.olympus/mcp-cache/${rel}`, ...item.args] : null,
  };
}

if (!dryRun) {
  writeFileSync(MANIFEST, JSON.stringify({
    generatedAt: new Date().toISOString(),
    cache: CACHE,
    servers,
  }, null, 2) + '\n', 'utf-8');
}

if (asJson) {
  console.log(JSON.stringify({ ok: failed === 0, cache: CACHE, servers }, null, 2));
} else {
  console.log(`\nmcp-vendor — ${CACHE}\n`);
  for (const [name, s] of Object.entries(servers)) {
    console.log(`${s.command ? 'OK  ' : 'FAIL'} ${name.padEnd(22)} ${s.package}@${s.version}`);
    if (s.command) console.log(`      ${s.command.join(' ')}`);
  }
  console.log(`\n${failed === 0 ? 'mcp-vendor GREEN' : `mcp-vendor FAILED (${failed})`} — manifest: ${MANIFEST}`);
}
process.exit(failed === 0 ? 0 : 1);
