#!/usr/bin/env node
/**
 * olympus settings export/import — export/import the user's OLYMPUS config.
 *

 *
 * Exports ALL config files from ~/.olympus/ to a single JSON bundle that can
 * be imported on another machine (or after a clean reinstall). The bundle
 * includes:
 *   - llm-providers.json (strategy + free-tier keys)
 *   - editor-config.json (preferred editor + detected editors)
 *   - vault-policy.json (TTL/pruning config)
 *   - benchmark-config.json (recording toggle + session label)
 *   - custom-strategies.json (user-defined LLM strategies)
 *   - user-frames.json (custom URL frames for the Frames tab)
 *
 * Does NOT export:
 *   - The vault itself (~/OLYMPUS-VAULT/) — too large, use git push instead
 *   - The terminal-bridge-token (rotates on every restart)
 *   - OpenCode credentials (~/.config/opencode/) — OAuth tokens, must be
 *     re-authorized on the new machine
 *   - errors.log / native-terminal.log / other log files
 *
 * Usage:
 *   olympus settings export > olympus-config.json
 *   olympus settings export --output olympus-config.json
 *   olympus settings import olympus-config.json
 *   olympus settings import olympus-config.json --dry-run   # preview only
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const OLYMPUS_HOME = join(homedir(), '.olympus');

// Config files to export/import. Each entry: [filename, description, sensitive?]
const CONFIG_FILES = [
  ['llm-providers.json', 'LLM strategy + free-tier API keys', true],
  ['editor-config.json', 'Preferred external editor + detected editors', false],
  ['vault-policy.json', 'Vault TTL/pruning policy', false],
  ['benchmark-config.json', 'Benchmark recording toggle + session label', false],
  ['custom-strategies.json', 'User-defined LLM strategies (custom-*)', false],
  ['user-frames.json', 'Custom URL frames for the Frames tab', false],
];

function log(msg) { console.error(`[olympus:settings] ${msg}`); }
function ok(msg) { console.log(`[olympus:settings] ✓ ${msg}`); }
function warn(msg) { console.warn(`[olympus:settings] ! ${msg}`); }
function err(msg) { console.error(`[olympus:settings] X ${msg}`); }

function readJsonSafe(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return { _error: e.message };
  }
}

function exportSettings() {
  const bundle = {
    _meta: {
      exported_at: new Date().toISOString(),
      olympus_version: readOlympusVersion(),
      platform: process.platform,
      arch: process.arch,
    },
    configs: {},
  };

  for (const [filename, description, sensitive] of CONFIG_FILES) {
    const filePath = join(OLYMPUS_HOME, filename);
    const data = readJsonSafe(filePath);
    if (data !== null) {
      bundle.configs[filename] = {
        description,
        sensitive,
        data,
      };
      log(`  + ${filename} (${description})${sensitive ? ' [sensitive]' : ''}`);
    } else {
      log(`  - ${filename} (not present — skipping)`);
    }
  }

  return bundle;
}

function importSettings(bundle, dryRun) {
  if (!bundle || !bundle.configs || typeof bundle.configs !== 'object') {
    err('Invalid bundle format — expected { configs: { ... } }');
    process.exit(1);
  }

  const meta = bundle._meta || {};
  log(`Importing config bundle (exported ${meta.exported_at || 'unknown'} on ${meta.platform || 'unknown'}/${meta.arch || 'unknown'})`);
  if (dryRun) log('DRY-RUN — no files will be written.');
  log('');

  let imported = 0;
  let skipped = 0;

  for (const [filename, description, sensitive] of CONFIG_FILES) {
    const entry = bundle.configs[filename];
    if (!entry || !entry.data) {
      log(`  - ${filename} (not in bundle — skipping)`);
      skipped++;
      continue;
    }

    const filePath = join(OLYMPUS_HOME, filename);

    // Check for conflicts (existing file with different content).
    const existing = readJsonSafe(filePath);
    const existingStr = existing ? JSON.stringify(existing) : null;
    const newStr = JSON.stringify(entry.data);
    if (existingStr === newStr) {
      log(`  = ${filename} (unchanged)`);
      skipped++;
      continue;
    }

    if (dryRun) {
      log(`  ~ ${filename} WOULD BE WRITTEN (${description})${sensitive ? ' [sensitive]' : ''}`);
    } else {
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, JSON.stringify(entry.data, null, 2) + '\n', { mode: 0o600 });
        log(`  + ${filename} written (${description})${sensitive ? ' [sensitive]' : ''}`);
      } catch (e) {
        warn(`  X ${filename} write failed: ${e.message}`);
        skipped++;
        continue;
      }
    }
    imported++;
  }

  log('');
  if (dryRun) {
    ok(`Dry-run: ${imported} file(s) would be written, ${skipped} skipped.`);
  } else {
    ok(`Imported ${imported} file(s), ${skipped} skipped.`);
  }

  // Warn about sensitive files.
  for (const [filename, , sensitive] of CONFIG_FILES) {
    if (sensitive && bundle.configs[filename]) {
      warn(`${filename} contains sensitive data (API keys). Ensure this bundle is stored securely.`);
    }
  }

  // Warn about OpenCode auth (not exported).
  warn('OpenCode auth (GO plan + free-tier providers) is NOT exported. Run `olympus opencode` on the new machine to re-authorize.');
  warn('The vault (~/OLYMPUS-VAULT/) is NOT exported. Use `git push` from the old machine + `git clone` on the new one.');
}

function readOlympusVersion() {
  try {
    // Try to find the OLYMPUS root by walking up from cwd.
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
      const pkgPath = join(dir, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'olympus') return pkg.version || 'unknown';
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {}
  return 'unknown';
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const subcmd = args[0];

if (subcmd === 'export') {
  const outputFlagIdx = args.indexOf('--output');
  const outputFile = outputFlagIdx >= 0 ? args[outputFlagIdx + 1] : null;

  log('Exporting OLYMPUS config from ~/.olympus/...');
  const bundle = exportSettings();

  const json = JSON.stringify(bundle, null, 2);
  if (outputFile) {
    writeFileSync(outputFile, json, 'utf-8');
    ok(`Config exported to ${outputFile}`);
  } else {
    // stdout — user can redirect: `olympus settings export > config.json`
    process.stdout.write(json + '\n');
    ok('Config exported to stdout (redirect to a file with > olympus-config.json)');
  }

  warn('This bundle may contain API keys. Store it securely (e.g. 1Password, age-encrypted file).');
  process.exit(0);
}

if (subcmd === 'import') {
  const inputFile = args[1];
  const dryRun = args.includes('--dry-run');

  if (!inputFile) {
    err('Usage: olympus settings import <file.json> [--dry-run]');
    process.exit(1);
  }

  if (!existsSync(inputFile)) {
    err(`File not found: ${inputFile}`);
    process.exit(1);
  }

  let bundle;
  try {
    bundle = JSON.parse(readFileSync(inputFile, 'utf-8'));
  } catch (e) {
    err(`Failed to parse ${inputFile}: ${e.message}`);
    process.exit(1);
  }

  importSettings(bundle, dryRun);
  process.exit(0);
}

// No subcommand — print help.
console.log(`
Usage:
  olympus settings export [--output <file.json>]
  olympus settings import <file.json> [--dry-run]

Exports/imports ALL config files from ~/.olympus/:
  - llm-providers.json       (strategy + free-tier API keys)
  - editor-config.json       (preferred editor + detected editors)
  - vault-policy.json        (TTL/pruning config)
  - benchmark-config.json    (recording toggle + session label)
  - custom-strategies.json   (user-defined LLM strategies)
  - user-frames.json         (custom URL frames)

NOT exported:
  - The vault (~/OLYMPUS-VAULT/) — use git push/clone
  - OpenCode auth (GO plan + free-tier providers) — re-authorize with \`olympus opencode\`
  - Terminal Bridge token — rotates on every restart
  - Log files (errors.log, etc.)
`);
process.exit(0);
