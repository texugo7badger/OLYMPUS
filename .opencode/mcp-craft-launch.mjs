#!/usr/bin/env node
/**
 * mcp-craft-launch.mjs — the portable olympus-craft entry point (v0.0.24).
 *
 * The repo config used to say `node scripts/mcp-craft-server.mjs`. That works
 * only when the MCP cwd is the OLYMPUS repo — in a project lane the `scripts/`
 * directory does not exist, so the launcher would be a red dot in the panel.
 *
 * This file lives in `.opencode/`, which is symlinked into every project lane.
 * Node resolves the REAL path of this module, so `repoRoot` is always the
 * OLYMPUS install — independent of cwd. It then imports the real server.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)); // <repo>/.opencode
const repoRoot = path.resolve(here, '..');

if (!process.env.OLYMPUS_ROOT) process.env.OLYMPUS_ROOT = repoRoot;

const server = path.join(repoRoot, 'scripts', 'mcp-craft-server.mjs');
await import(pathToFileURL(server).href);
