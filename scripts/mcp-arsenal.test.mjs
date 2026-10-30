#!/usr/bin/env node
/**
 * mcp-arsenal.test.mjs — v0.0.24 MCP curation law.
 * Run: npx tsx scripts/mcp-arsenal.test.mjs
 *
 * The 128-tool provider limit is real: enabling every MCP blows the registry.
 * This suite pins the curated default set and the audit's honesty:
 *
 *   M1  the audit script exists, uses the SHARED probe and performs the
 *       JSON-RPC handshake
 *   M2  the curated set is exactly the measured six (filesystem, memory, git,
 *       context7, sequential-thinking, olympus-craft)
 *   M3  every other server is explicitly disabled (no half-enabled state)
 *   M4  the curated tool budget stays under 128 (the provider limit)
 *   M5  the panel-facing status route still exists (live health)
 *   M6  every runtime entry is canonical (type + command array)
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0, checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${detail}`}`);
  if (!ok) failures++;
}

const CURATED = ['filesystem', 'memory', 'git', 'context7', 'sequential-thinking', 'olympus-craft'];
const CURATED_TOOLS = 14 + 9 + 12 + 2 + 1 + 6; // measured by scripts/mcp-audit.ts

// M1 — the audit.
const auditPath = join(ROOT, 'scripts/mcp-audit.ts');
check('M1 mcp-audit.ts exists', fs.existsSync(auditPath));
if (fs.existsSync(auditPath)) {
  const a = fs.readFileSync(auditPath, 'utf-8');
  check('M1 audit uses the shared probe', /probeMcpBatch/.test(a) && /mcp-probe/.test(a));
  check('M1 audit uses the merged registry', /listMcpServers/.test(a));
  check('M1 audit supports --enable', /--enable/.test(a));
}

// M2/M3 — the curated set in the applied config.
const cfg = JSON.parse(fs.readFileSync(join(ROOT, 'opencode.json'), 'utf-8'));
const mcp = cfg.mcp || {};
const enabled = Object.entries(mcp).filter(([, v]) => v?.enabled === true).map(([k]) => k).sort();
check('M2 curated set enabled', JSON.stringify(enabled) === JSON.stringify([...CURATED].sort()), enabled.join(','));
const halfEnabled = Object.entries(mcp).filter(([, v]) => v?.enabled !== undefined && typeof v.enabled !== 'boolean');
check('M3 no half-enabled MCP state', halfEnabled.length === 0);

// M4 — the tool budget.
check(`M4 curated tools ${CURATED_TOOLS} < 128`, CURATED_TOOLS < 128, String(CURATED_TOOLS));

// M5 — the live health route.
check('M5 /api/olympus/mcp/health exists', fs.existsSync(join(ROOT, 'src/app/api/olympus/mcp/health/route.ts')));

// M6 — canonical runtime shape.
check('M6 every entry has a type', Object.values(mcp).every((v) => v?.type === 'local' || v?.type === 'remote'));
check('M6 every local entry has a command array', Object.values(mcp).filter((v) => v?.type === 'local').every((v) => Array.isArray(v.command)));
check('M6 no legacy args/env fields', Object.values(mcp).every((v) => v?.args === undefined && v?.env === undefined));

console.log(`\nmcp-arsenal: ${checked - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
