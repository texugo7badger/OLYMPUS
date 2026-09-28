#!/usr/bin/env node
/**
 * apply-olympus-hooks-patch.js
 *
 * Patches .opencode/olympus/olympus-hooks.ts to register the new
 * demigod-author tool. Idempotent — running twice is a no-op.
 *
 * Changes:
 *   1. Adds `import demigodAuthorTool from "./tools/demigod-author.js";`
 *      after the existing dispatchTool import.
 *   2. Adds `"olympus-demigod-author": demigodAuthorTool,` to the tool
 *      registry.
 *
 * Also patches opencode.json to add the permission for the new tool.
 *
 * Usage:
 *   node scripts/apply-olympus-hooks-patch.js
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();
const HOOKS_FILE = path.join(OLYMPUS_ROOT, '.opencode', 'olympus', 'olympus-hooks.ts');
const OPENCODE_JSON = path.join(OLYMPUS_ROOT, 'opencode.json');

function log(msg) { console.error(`[apply-olympus-hooks-patch] ${msg}`); }

function patchHooksFile() {
  if (!fs.existsSync(HOOKS_FILE)) {
    log(`ERROR: ${HOOKS_FILE} not found`);
    return false;
  }

  let content = fs.readFileSync(HOOKS_FILE, 'utf-8');
  let changed = false;

  // 1. Add the import (if not already present)
  const importLine = 'import demigodAuthorTool from "./tools/demigod-author.js";';
  if (!content.includes(importLine)) {
    // Find the dispatchTool import line and add our import after it
    const dispatchImportRegex = /(import\s+dispatchTool\s+from\s+["']\.\/tools\/dispatch\.js[""];?\s*\n)/;
    const match = content.match(dispatchImportRegex);
    if (match) {
      content = content.replace(match[0], match[0] + importLine + '\n');
      changed = true;
      log('Added demigodAuthorTool import');
    } else {
      // Fallback: add after the last tool import
      const lastToolImportRegex = /(import\s+\w+Tool\s+from\s+["']\.\/tools\/\w+\.js[""];?\s*\n)(?!.*import\s+\w+Tool\s+from\s+["']\.\/tools)/;
      const m = content.match(lastToolImportRegex);
      if (m) {
        content = content.replace(m[0], m[0] + importLine + '\n');
        changed = true;
        log('Added demigodAuthorTool import (fallback position)');
      } else {
        log('WARNING: could not find a tool import to anchor the new import. Skipping import.');
      }
    }
  } else {
    log('Import already present — skipping');
  }

  // 2. Add to the tool registry (if not already present)
  const registryLine = '"olympus-demigod-author": demigodAuthorTool,';
  if (!content.includes(registryLine)) {
    // Find the dispatch registry line and add ours after it
    const dispatchRegistryRegex = /(["']olympus-dispatch["']:\s*dispatchTool,?\s*\n)/;
    const match = content.match(dispatchRegistryRegex);
    if (match) {
      content = content.replace(match[0], match[0] + '      ' + registryLine + '\n');
      changed = true;
      log('Added demigodAuthorTool to tool registry');
    } else {
      log('WARNING: could not find the olympus-dispatch registry line. Skipping registry add.');
    }
  } else {
    log('Registry entry already present — skipping');
  }

  if (changed) {
    fs.writeFileSync(HOOKS_FILE, content, 'utf-8');
    log(`OK: patched ${HOOKS_FILE}`);
  } else {
    log('No changes needed — already patched');
  }
  return true;
}

function patchOpencodeJson() {
  if (!fs.existsSync(OPENCODE_JSON)) {
    log(`ERROR: ${OPENCODE_JSON} not found`);
    return false;
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(OPENCODE_JSON, 'utf-8'));
  } catch (e) {
    log(`ERROR: could not parse opencode.json: ${e.message}`);
    return false;
  }

  if (!config.permission) config.permission = {};
  if (config.permission['olympus-demigod-author'] === 'allow') {
    log('Permission already set — skipping');
    return true;
  }

  config.permission['olympus-demigod-author'] = 'allow';

  // Insert after olympus-dispatch if present, otherwise append
  const permKeys = Object.keys(config.permission);
  const newPerm = {};
  for (const k of permKeys) {
    newPerm[k] = config.permission[k];
    if (k === 'olympus-dispatch') {
      newPerm['olympus-demigod-author'] = 'allow';
    }
  }
  // If olympus-dispatch wasn't in the list, make sure we added it
  if (!permKeys.includes('olympus-dispatch') && !permKeys.includes('olympus-demigod-author')) {
    newPerm['olympus-demigod-author'] = 'allow';
  }
  config.permission = newPerm;

  fs.writeFileSync(OPENCODE_JSON, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  log(`OK: added olympus-demigod-author permission to opencode.json`);
  return true;
}

function main() {
  log(`Olympus root: ${OLYMPUS_ROOT}`);
  log(`Hooks file:   ${HOOKS_FILE}`);
  log(`opencode.json: ${OPENCODE_JSON}`);
  log('');

  const hooksOk = patchHooksFile();
  const jsonOk = patchOpencodeJson();

  if (hooksOk && jsonOk) {
    log('');
    log('Patch complete. Rebuild the overlay with:');
    log('  npm run overlay:compile');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
