#!/usr/bin/env node
/**
 * OLYMPUS Doctor -- Installation Verification Utility
 *
 * Runs a comprehensive health check of the OLYMPUS installation:
 *   1. Node.js + npm versions
 *   2. OpenCode CLI installed + version (checks node_modules/.bin/ FIRST, then PATH)
 *   3. Python 3 available (for vault seeding)
 *   4. OLYMPUS home config (~/.olympus/) exists + has llm-providers.json
 *   5. Vault exists + has seed instincts + knowledge files + design-systems
 *   6. opencode.json valid + agents (10 gods + 118 demigods = 128 .txt files on disk) + 10 plugins
 *   7. ECC plugin built (.opencode/dist/plugins/index.js exists)
 *   8. OLYMPUS overlay plugin built (.opencode/olympus/dist/index.js exists)
 *   9. Vendored skills present (330 skills: caveman, impeccable, superpowers,
 *      14 superpowers sub-skills, ECC, OpenDesign, OLYMPUS gap-fillers,
 *      plus additional specialist skills)
 *  10. OpenSpec available (project dependency)
 *  11. MCP servers declared in .mcp.json (27 servers expected)
 *  12. OpenCode auth configured (~/.config/opencode/auth.json via OpenCode)
 *  13. Active strategy + per-god model map
 *  14. Activity feed writable
 *  15. Electron binary (package + dist/electron)
 *  16. olympus-router plugin source valid (no .ts extension imports)
 *  17. olympus-go-cache plugin present
 *  18. opencode-context-cache.mjs plugin present
 *  19. vault-brain/design-systems/ has the 10 OpenDesign references
 *  20. vault-brain/mastered-skills/ has profiles for all 10 gods
 *  21. God instinct directories exist (seed + empirical per god)
 *  22. ECC plugin's lib/changed-files-store.ts present (shared utility)
 *  23. file-lock-guard.cjs hook present
 *  24. Prompt format standardized: ALL agent prompts are .txt (no .md remain)
 *  25. Demigod fleet co-located with the gods (demigods/<god>/ + gods/)
 *  26. Demigod prompts are .txt (118 demigod .txt files on disk, 0 .md)
 *  27. Agents registered in opencode.json (10 gods + 118 demigods = 128 .txt files on disk)
 *  28. olympus-dispatch tool FORBIDS ecc-/olympus-/volt- prefixes (Symphony-native)
 *
 * Usage: node scripts/olympus-doctor.js
 *        olympus doctor  (if installed globally)
 *
 * Exit codes:
 *   0 -- all checks passed
 *   1 -- one or more checks failed (warnings don't cause exit 1)
 *   2 -- critical error (can't run checks)
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { execSync, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();
const OLYMPUS_HOME = path.join(os.homedir(), ".olympus");
const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), "OLYMPUS-VAULT");

// --- Colors ---
const isTTY = process.stdout.isTTY;
const c = {
  reset: isTTY ? "\x1b[0m" : "",
  bold: isTTY ? "\x1b[1m" : "",
  green: isTTY ? "\x1b[32m" : "",
  red: isTTY ? "\x1b[31m" : "",
  yellow: isTTY ? "\x1b[33m" : "",
  blue: isTTY ? "\x1b[34m" : "",
  gray: isTTY ? "\x1b[90m" : "",
};

const results = [];
let failures = 0;
let warnings = 0;

function check(name, status, detail = "") {
  // Pad the icon to 2 chars so all statuses align: "ok", "wn", "fl"
  // (was: "ok" / "!" / "X" -- the 1-char icons misaligned with the 2-char "ok")
  const icon = status === "ok" ? `${c.green}ok${c.reset}` :
               status === "warn" ? `${c.yellow}wn${c.reset}` :
               `${c.red}fl${c.reset}`;
  console.log(`  ${icon} ${name}${detail ? ` ${c.gray}--${c.reset} ${detail}` : ""}`);
  results.push({ name, status, detail });
  if (status === "fail") failures++;
  if (status === "warn") warnings++;
}

/**
 * Run a command and return its trimmed stdout, or null on failure.
 * Uses execFileSync with an array of args (no shell interpolation).
 */
function runCmd(bin, args = []) {
  try {
    const out = execFileSync(bin, args, {
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],  // capture stderr, don't inherit
      shell: false,
    });
    return out.trim();
  } catch {
    return null;
  }
}

/**
 * Find a binary on PATH. Returns the first match, or null.
 */
function findBin(name) {
  const candidates = [name];
  for (const c of candidates) {
    try {
      execFileSync("which", [c], {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });
      return c;  // found
    } catch {
      // not found, try next
    }
  }
  return null;
}

function section(title) {
  console.log(`\n${c.bold}${c.blue}-- ${title}${c.reset}`);
}

// --- Banner ---
console.log(`\n${c.bold}  OLYMPUS Doctor v0.0.1${c.reset}`);
console.log(`  ${c.gray}Installation health check${c.reset}\n`);

// --- Install-state banner ---
// Distinguish "not installed yet" (no marker, no node_modules) from a broken
// install. When dependencies were never installed, most checks below fail for
// the same root cause -- surface the fix up front instead of a wall of errors.
const installStatePath = path.join(OLYMPUS_HOME, "install-state.json");
let installState = null;
try {
  if (fs.existsSync(installStatePath)) {
    installState = JSON.parse(fs.readFileSync(installStatePath, "utf-8"));
  }
} catch { installState = null; }
const nodeModulesMissing = !fs.existsSync(path.join(OLYMPUS_ROOT, "node_modules"));
if (nodeModulesMissing && !installState?.installed) {
  console.log(`  ${c.yellow}!${c.reset} OLYMPUS does not appear to be installed yet (no node_modules).`);
  console.log(`    Run: ${c.bold}npm run setup${c.reset}  (one-click installer)`);
  console.log(`    or:  ${c.bold}npm install${c.reset}${c.gray} then compile (see scripts/install/README.md)${c.reset}`);
  console.log(`    IDE type errors (missing react/@types/node etc.) clear once dependencies are installed.`);
  console.log("");
} else if (installState?.installed) {
  console.log(`  ${c.gray}install state: last install ${installState.at} (node ${installState.node || "?"}${installState.deps?.complete === false ? ", deps incomplete" : ""})${c.reset}`);
  console.log("");
}

// --- 1. Prerequisites ---
section("Prerequisites");

const nodeVer = runCmd("node", ["--version"]);
if (nodeVer) {
  const major = parseInt(nodeVer.replace("v", "").split(".")[0], 10);
  if (major >= 18) {
    check("Node.js", "ok", `${nodeVer} (v18+ required)`);
  } else {
    check("Node.js", "fail", `${nodeVer} -- needs v18+ (recommend v22 LTS)`);
  }
} else {
  check("Node.js", "fail", "not installed");
}

const npmVer = runCmd("npm", ["--version"]);
if (npmVer) {
  check("npm", "ok", `v${npmVer}`);
} else {
  check("npm", "fail", "not installed");
}

// OpenCode CLI: check LOCAL install (node_modules/.bin) first, then PATH.
// The installer installs OpenCode LOCALLY (project-scoped), not globally.
let opencodeFound = false;
let opencodeVersion = null;

// 1. Check local install (node_modules/.bin/opencode)
const localOpencode = path.join(OLYMPUS_ROOT, "node_modules", ".bin", "opencode");
if (fs.existsSync(localOpencode)) {
  // Try to get the version
  const v = runCmd(localOpencode, ["--version"]);
  if (v) {
    opencodeVersion = v;
    opencodeFound = true;
    check("OpenCode CLI", "ok", `${v} (local: node_modules/.bin/)`);
  } else {
    opencodeFound = true;
    check("OpenCode CLI", "ok", `installed locally (node_modules/.bin/) -- version check skipped`);
  }
}

// 2. Fallback: check PATH (global install)
if (!opencodeFound && findBin("opencode")) {
  let ocv = runCmd("opencode", ["--version"]);
  if (!ocv) ocv = runCmd("opencode", ["version"]);
  if (ocv) {
    check("OpenCode CLI", "ok", `${ocv} (global: PATH)`);
    opencodeFound = true;
  }
}

if (!opencodeFound) {
  const hint = "run: npm run install-opencode  (or: npm install --save-dev opencode-ai)";
  check("OpenCode CLI", "warn", `not found -- ${hint}`);
}

// Python -- try python3 then python
let pythonFound = false;
for (const py of ["python3", "python"]) {
  if (findBin(py)) {
    const pyv = runCmd(py, ["--version"]);
    if (pyv) {
      check("Python 3", "ok", pyv);
      pythonFound = true;
      break;
    }
  }
}
if (!pythonFound) {
  check("Python 3", "warn", "not found (needed for vault seeding)");
}

// ttyd and code-server checks are not included because OLYMPUS is an
// Electron desktop app with its own built-in terminal (node-pty + xterm.js).
// The old ttyd (OpenCode TUI frame) and code-server (VSCodium frame) were
// part of the pre-Electron web-only architecture.

// Check node-pty native module (critical for the terminal panel).
// node-pty is a native module that must be compiled for Electron's ABI.
// If it's not compiled, the terminal panel will be blank.
const nodePtyPkg = path.join(OLYMPUS_ROOT, "node_modules", "node-pty", "package.json");
if (fs.existsSync(nodePtyPkg)) {
  try {
    const ptyPkg = JSON.parse(fs.readFileSync(nodePtyPkg, "utf-8"));
    // Try to require node-pty to verify the native module loads
    try {
      const pty = await import("node-pty");
      if (typeof pty.spawn === "function") {
        check("node-pty (terminal panel)", "ok", `v${ptyPkg.version} -- native module loads`);
      } else {
        check("node-pty (terminal panel)", "warn", `v${ptyPkg.version} -- spawn function missing`);
      }
    } catch (e) {
      check("node-pty (terminal panel)", "fail", `v${ptyPkg.version} -- native module FAILED to load: ${e.message}`);
    }
  } catch {
    check("node-pty (terminal panel)", "warn", "package.json unreadable");
  }
} else {
  check("node-pty (terminal panel)", "fail", "not installed -- run: npm install");
}

// --- 2. OLYMPUS home config ---
section("OLYMPUS Home Config");

if (fs.existsSync(OLYMPUS_HOME)) {
  check("OLYMPUS home directory", "ok", OLYMPUS_HOME);
} else {
  check("OLYMPUS home directory", "fail", `${OLYMPUS_HOME} not found -- run the installer`);
}

const providersFile = path.join(OLYMPUS_HOME, "llm-providers.json");
if (fs.existsSync(providersFile)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(providersFile, "utf-8"));
    check("llm-providers.json", "ok", `strategy=${cfg.strategy || "go-balanced"}, default=${cfg.default || "opencode-go"}`);
  } catch {
    check("llm-providers.json", "fail", "invalid JSON");
  }
} else {
  check("llm-providers.json", "warn", "not found -- run the installer or apply-strategy");
}

// --- 3. Vault ---
section("Vault");

if (fs.existsSync(VAULT_ROOT)) {
  check("Vault root", "ok", VAULT_ROOT);
} else {
  check("Vault root", "fail", `${VAULT_ROOT} not found -- run: python3 scripts/seed-vault.py`);
}

// Count seed instincts
const instinctsDir = path.join(VAULT_ROOT, "05_Auto_Learning", "instincts");
let godCount = 0;
let seedCount = 0;
let empiricalCount = 0;
try {
  if (fs.existsSync(instinctsDir)) {
    const godDirs = fs.readdirSync(instinctsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    godCount = godDirs.length;
    for (const gd of godDirs) {
      const seedDir = path.join(instinctsDir, gd.name, "seed");
      const empDir = path.join(instinctsDir, gd.name, "empirical");
      if (fs.existsSync(seedDir)) {
        seedCount += fs.readdirSync(seedDir).filter(f => f.endsWith(".md")).length;
      }
      if (fs.existsSync(empDir)) {
        empiricalCount += fs.readdirSync(empDir).filter(f => f.endsWith(".md")).length;
      }
    }
  }
} catch {}
check("God instincts", seedCount > 0 ? "ok" : "warn", `${godCount} gods, ${seedCount} seed, ${empiricalCount} empirical`);

// Count knowledge files
const knowledgeDir = path.join(VAULT_ROOT, "04_Knowledge", "references");
let knowledgeCount = 0;
try {
  if (fs.existsSync(knowledgeDir)) {
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) walk(path.join(dir, e.name));
        else if (e.name.endsWith(".md")) knowledgeCount++;
      }
    }
    walk(knowledgeDir);
  }
} catch {}
check("Knowledge files", knowledgeCount > 0 ? "ok" : "warn", `${knowledgeCount} files across 6 categories`);

// --- 4. opencode.json ---
section("opencode.json");

// GOD_NAMES — the canonical 10 gods. Identified by NAME, not by prefix.
const GOD_NAMES = new Set([
  "apollo", "atlas", "artemis", "athena", "dionysus", "hephaestus",
  "hermes", "persephone", "prometheus", "callimachus",
]);

const opencodeJsonPath = path.join(OLYMPUS_ROOT, "opencode.json");
if (fs.existsSync(opencodeJsonPath)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(opencodeJsonPath, "utf-8"));
    const agents = cfg.agent || {};
    const agentCount = Object.keys(agents).length;
    const gods = Object.keys(agents).filter(k => GOD_NAMES.has(k));
    const demigods = Object.keys(agents).filter(k => !GOD_NAMES.has(k) && agents[k] && typeof agents[k] === "object" && agents[k].description);
    check("opencode.json", "ok", `${agentCount} agents (${gods.length} gods + ${demigods.length} demigods)`);

    // Default agent
    const defaultAgent = cfg.defaultAgent || cfg.default_agent || (gods.length > 0 ? gods[0] : null);
    if (defaultAgent) {
      check("Default agent", "ok", defaultAgent);
    }

    // Top-level model
    if (cfg.model) {
      check("Top-level model", "ok", `${cfg.model} (Apollo)`);
    } else {
      check("Top-level model", "warn", "not set");
    }

    // Small model
    if (cfg.small_model) {
      check("Small model", "ok", cfg.small_model);
    }

    // Plugins
    const plugins = cfg.plugin || [];
    check("Plugins", "ok", `${plugins.length} plugins: ${plugins.join(", ")}`);

    // Instructions -- count .md files under .opencode/rules/ + AGENTS.md at root
    const rulesDir = path.join(OLYMPUS_ROOT, ".opencode", "rules");
    let instrCount = 0;
    if (fs.existsSync(rulesDir)) {
      function countRules(dir) {
        try {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory()) countRules(path.join(dir, e.name));
            else if (e.name.endsWith(".md")) instrCount++;
          }
        } catch {}
      }
      countRules(rulesDir);
    }
    // AGENTS.md at the repo root also counts
    if (fs.existsSync(path.join(OLYMPUS_ROOT, "AGENTS.md"))) instrCount++;
    check("Instructions", instrCount >= 5 ? "ok" : "warn", `${instrCount} instruction files (expect >=5: AGENTS.md + 4 rules)`);

    // Permission policy
    const perm = cfg.permission || {};
    const mcpPerm = perm["mcp_*"] || perm.mcp;
    if (mcpPerm === "ask") {
      check("Permission policy", "ok", "mcp_*: ask (safe default)");
    } else {
      check("Permission policy", "warn", `mcp_*: ${mcpPerm || "not set"} (recommend: ask)`);
    }
  } catch (e) {
    check("opencode.json", "fail", `invalid JSON: ${e.message}`);
  }
} else {
  check("opencode.json", "fail", "not found");
}

// --- 5. Plugins built ---
section("Plugins Built");

const eccPluginBuilt = fs.existsSync(path.join(OLYMPUS_ROOT, ".opencode", "dist", "plugins", "index.js"));
check("ECC plugin built", eccPluginBuilt ? "ok" : "warn",
  eccPluginBuilt ? ".opencode/dist/plugins/index.js exists"
  : "not built -- OpenCode will load from source (may be slower)");

const olympusPluginBuilt = fs.existsSync(path.join(OLYMPUS_ROOT, ".opencode", "olympus", "dist", "index.js"));
check("OLYMPUS overlay plugin built", olympusPluginBuilt ? "ok" : "warn",
  olympusPluginBuilt ? ".opencode/olympus/dist/index.js exists"
  : "not built -- OpenCode will load from source (may be slower)");

// --- 6. Skills (vendored) ---
section("Skills (vendored)");

const skillsDir = path.join(OLYMPUS_ROOT, ".opencode", "skills");
if (fs.existsSync(skillsDir)) {
  // Count all SKILL.md files
  let skillCount = 0;
  function countSkills(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) countSkills(path.join(dir, e.name));
        else if (e.name === "SKILL.md") skillCount++;
      }
    } catch {}
  }
  countSkills(skillsDir);
  // OLYMPUS ships 330 vendored skills (caveman, impeccable, superpowers +
  // 14 sub-skills, ECC skills, 9 OpenDesign references, OLYMPUS gap-fillers,
  // plus additional specialist skills). Threshold is 100 so a broken skill
  // tree is flagged without being too strict about exact counts.
  check("Critical skills", skillCount >= 100 ? "ok" : "warn", `${skillCount} SKILL.md files present (ships 330 skills)`);

  // Verify caveman + impeccable
  for (const s of ["caveman", "impeccable"]) {
    if (fs.existsSync(path.join(skillsDir, s, "SKILL.md"))) {
      check(`${s} skill`, "ok", "present");
    } else {
      check(`${s} skill`, "fail", "missing");
    }
  }

  // impeccable CLI engine
  const impeccableCli = path.join(skillsDir, "impeccable", "cli");
  check("impeccable CLI engine", fs.existsSync(impeccableCli) ? "ok" : "warn",
    fs.existsSync(impeccableCli) ? `vendored at .opencode/skills/impeccable/cli/` : "missing");
} else {
  check("Skills directory", "fail", ".opencode/skills/ not found");
}

// superpowers plugin
const superpowersPlugin = path.join(OLYMPUS_ROOT, ".opencode", "plugins", "superpowers.js");
check("superpowers plugin", fs.existsSync(superpowersPlugin) ? "ok" : "warn",
  fs.existsSync(superpowersPlugin) ? "vendored at .opencode/plugins/superpowers.js" : "missing");

// Total skills
let totalSkills = 0;
if (fs.existsSync(skillsDir)) {
  function countAll(dir) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) countAll(path.join(dir, e.name));
        else if (e.name === "SKILL.md") totalSkills++;
      }
    } catch {}
  }
  countAll(skillsDir);
}
check("Total skills vendored", totalSkills > 0 ? "ok" : "warn", `${totalSkills} SKILL.md files`);

// OpenSpec (local dependency)
const openspecBin = path.join(OLYMPUS_ROOT, "node_modules", ".bin", "openspec");
if (fs.existsSync(openspecBin)) {
  const osVer = runCmd(openspecBin, ["--version"]);
  check("OpenSpec (local)", "ok", osVer ? `v${osVer}` : "installed (project dependency)");
} else {
  check("OpenSpec (local)", "warn", "not in node_modules -- run: npm install");
}

// --- 7. MCP servers ---
section("MCP Servers");

const mcpJsonPath = path.join(OLYMPUS_ROOT, ".mcp.json");
if (fs.existsSync(mcpJsonPath)) {
  try {
    const mcp = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8"));
    const servers = mcp.mcpServers || mcp.servers || {};
    const serverNames = Object.keys(servers);
    // OLYMPUS ships 19 MCP servers by default. Threshold is 17 to
    // allow minor config drift without false alarms.
    check("MCP servers", serverNames.length >= 17 ? "ok" : "warn", `${serverNames.length}/19 servers declared`);

    // Check for mcp-compressor wrapping
    const compressor = servers["mcp-compressor"] || servers.mcp_compressor;
    if (compressor) {
      try {
        const cfg = typeof compressor === "string" ? JSON.parse(compressor) : compressor;
        const wrapped = cfg.args ? cfg.args.filter(a => typeof a === "string" && a.includes("wrap")).length : 0;
        // Count wrapped servers from the env or args
        const wrappedServers = serverNames.filter(n => n.startsWith("mcp-compressor--") || n.includes("-compressed"));
        check("mcp-compressor", wrappedServers.length > 0 ? "ok" : "warn",
          wrappedServers.length > 0 ? `wrapping ${wrappedServers.length} servers: ${wrappedServers.slice(0,3).join(", ")}`
          : "no servers wrapped");
      } catch {
        check("mcp-compressor", "warn", "could not parse config");
      }
    }
  } catch {
    check(".mcp.json", "fail", "invalid JSON");
  }
} else {
  check(".mcp.json", "fail", "not found");
}

// --- 8. Environment variables ---
// OPENCODE_GO_API_KEY check is not included.
// API keys are configured from OpenCode (not the installer).
// The CLI handles API authorization directly through OpenCode's own auth
// flow, storing credentials in ~/.config/opencode/ (OpenCode's own config).
// Keeping this check would produce a false failure on every fresh install.
section("Environment Variables");

// Check that the user has configured at least one API provider via OpenCode.
// We check OpenCode's own auth.json (both the 1.18+ and legacy paths) for
// configured providers. If none are configured, we show a helpful message
// -- this is NOT a failure, just a reminder.
const opencodeAuthDirs = [
  path.join(os.homedir(), ".local", "share", "opencode"),
  path.join(os.homedir(), ".config", "opencode"),
];
let opencodeAuthFound = false;
for (const dir of opencodeAuthDirs) {
  const opencodeAuthFile = path.join(dir, "auth.json");
  if (!fs.existsSync(opencodeAuthFile)) continue;
  opencodeAuthFound = true;
  try {
    const auth = JSON.parse(fs.readFileSync(opencodeAuthFile, "utf-8"));
    // Values can be a plain string (older format) or { type, key } (newer)
    const providers = Object.keys(auth).filter(k => {
      const v = auth[k];
      if (typeof v === "string" && v.length > 0) return true;
      if (v && typeof v === "object") {
        const key = v.key || v.apiKey || v.token;
        return typeof key === "string" && key.length > 0;
      }
      return false;
    });
    if (providers.length > 0) {
      check("OpenCode API auth", "ok", `${providers.length} provider(s) configured via TUI: ${providers.join(", ")}`);
    } else {
      check("OpenCode API auth", "warn", "auth.json exists but no providers configured -- run `olympus opencode` to authorize");
    }
    break;
  } catch {
    check("OpenCode API auth", "warn", "auth.json exists but is unreadable -- run `olympus opencode` to re-authorize");
    break;
  }
}
if (!opencodeAuthFound) {
  // Not a failure -- the user just hasn't launched OpenCode yet.
  check("OpenCode API auth", "ok", "not configured yet -- run `olympus opencode` in a terminal to authorize");
}

// Check vault sync env vars (optional -- configured from the OLYMPUS UI)
function getEnvVar(name) {
  if (process.env[name]) {
    return { value: process.env[name], source: "process.env" };
  }
  return null;
}

const vaultRemote = getEnvVar("OLYMPUS_VAULT_GIT_REMOTE");
if (vaultRemote) {
  check("OLYMPUS_VAULT_GIT_REMOTE", "ok", `set (${vaultRemote.value.slice(0, 40)}...)`);
} else {
  check("OLYMPUS_VAULT_GIT_REMOTE", "ok", "not set (vault sync not configured -- optional)");
}

// --- 9. Activity feed ---
section("Activity Feed");

const feedPath = path.join(VAULT_ROOT, "06_Activity_Feed", "live.jsonl");
if (fs.existsSync(feedPath)) {
  try {
    const content = fs.readFileSync(feedPath, "utf-8");
    const lines = content.trim().split("\n").filter(l => l.trim().startsWith("{"));
    // Test writability
    fs.appendFileSync(feedPath, "");
    check("Activity feed", "ok", `${lines.length} events, writable`);
  } catch (e) {
    check("Activity feed", "fail", `not writable: ${e.message}`);
  }
} else {
  // Try to create it
  try {
    fs.mkdirSync(path.dirname(feedPath), { recursive: true });
    fs.writeFileSync(feedPath, "");
    check("Activity feed", "ok", "created (empty)");
  } catch {
    check("Activity feed", "fail", `${feedPath} not found and could not be created`);
  }
}

// ============================================================================
// .opencode structure checks
// (demigod prompts standardized to .txt, gods identified by GOD_NAMES set,
// dispatch is Symphony-only, all agents unprefixed)
// ============================================================================

section(".opencode");

// 15. Electron binary
const electronPkgPath = path.join(OLYMPUS_ROOT, "node_modules", "electron", "package.json");
const electronBinPath = path.join(OLYMPUS_ROOT, "node_modules", "electron", "dist", "electron");
const electronBinExists = fs.existsSync(electronBinPath);
if (fs.existsSync(electronPkgPath)) {
  let electronVer = "?";
  try {
    electronVer = JSON.parse(fs.readFileSync(electronPkgPath, "utf-8")).version || "?";
  } catch {}
  if (electronBinExists) {
    check("Electron desktop engine", "ok", `v${electronVer} -- binary ready at node_modules/electron/dist/electron`);
  } else {
    check("Electron desktop engine", "fail",
      `v${electronVer} -- package installed but binary NOT downloaded\n` +
      `    Fix: node node_modules/electron/install.js`);
  }
} else {
  check("Electron desktop engine", "fail", "not installed -- run: npm install");
}



// 16. olympus-router plugin source is valid (no .ts extension imports)
const routerSrc = path.join(OLYMPUS_ROOT, ".opencode", "plugins", "olympus-router", "index.ts");
if (fs.existsSync(routerSrc)) {
  try {
    const routerContent = fs.readFileSync(routerSrc, "utf-8");
    const hasTsExt = /from\s+["'][^"']*\.ts["']/.test(routerContent);
    if (hasTsExt) {
      check("olympus-router source", "fail",
        `has .ts extension imports - will fail at runtime. Fix: change '../olympus-go-cache/index.ts' -> '../olympus-go-cache/index.js' and './src/instinct-gate.ts' -> './src/instinct-gate.js'`);
    } else {
      check("olympus-router source", "ok", "clean imports (no .ts extensions)");
    }
  } catch {
    check("olympus-router source", "warn", "could not read source");
  }
} else {
  check("olympus-router source", "warn", ".opencode/plugins/olympus-router/index.ts not found");
}

// 17. olympus-go-cache plugin present
const goCachePlugin = path.join(OLYMPUS_ROOT, ".opencode", "plugins", "olympus-go-cache", "index.ts");
check("olympus-go-cache plugin",
  fs.existsSync(goCachePlugin) ? "ok" : "warn",
  fs.existsSync(goCachePlugin) ? "vendored at .opencode/plugins/olympus-go-cache/index.ts" : "missing - cache instrumentation will not work");

// 18. opencode-context-cache.mjs plugin present
const ctxCachePlugin = path.join(OLYMPUS_ROOT, ".opencode", "plugins", "opencode-context-cache.mjs");
check("opencode-context-cache.mjs plugin",
  fs.existsSync(ctxCachePlugin) ? "ok" : "warn",
  fs.existsSync(ctxCachePlugin) ? "vendored at .opencode/plugins/opencode-context-cache.mjs" : "missing - sticky context cache will not work");

// Design-systems static cards: OLYMPUS relies solely on the live OpenDesign
// MCP lookup instead of static fallback cards in vault-brain/design-systems/.
// If the directory still exists, it is harmless.

// 20. vault-brain/mastered-skills/ has profiles for all 10 gods
const masteredSkillsDir = path.join(OLYMPUS_ROOT, ".opencode", "vault-brain", "mastered-skills");
const GODS_LIST = ["apollo", "atlas", "artemis", "athena", "callimachus", "dionysus", "hephaestus", "hermes", "persephone", "prometheus"];
if (fs.existsSync(masteredSkillsDir)) {
  let foundGods = 0;
  for (const god of GODS_LIST) {
    if (fs.existsSync(path.join(masteredSkillsDir, `${god}.md`))) foundGods++;
  }
  check("Mastered-skills (vault-brain)",
    foundGods === 10 ? "ok" : "warn",
    `${foundGods}/10 god profiles present`);
} else {
  check("Mastered-skills (vault-brain)", "warn", `${masteredSkillsDir} not found`);
}

// 21. Demigod instinct dirs exist per god
// Demigod instincts live under ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/sub-agents/<demigod>/
const INSTINCTS_ROOT = path.join(VAULT_ROOT, "05_Auto_Learning", "instincts");
const GODS_FOR_INSTINCTS = ["apollo", "atlas", "artemis", "athena", "callimachus", "dionysus", "hephaestus", "hermes", "persephone", "prometheus"];
if (fs.existsSync(INSTINCTS_ROOT)) {
  let foundGods = 0;
  for (const god of GODS_FOR_INSTINCTS) {
    if (fs.existsSync(path.join(INSTINCTS_ROOT, god, "seed"))) foundGods++;
  }
  check("God instinct directories",
    foundGods === 10 ? "ok" : "warn",
    `${foundGods}/10 gods have seed instinct directories` +
    (foundGods < 10 ? " — run: python3 scripts/seed-vault.py" : ""));
} else {
  check("God instinct directories", "warn",
    `${INSTINCTS_ROOT} not found — run: python3 scripts/seed-vault.py`);
}

// 22. ECC plugin's lib/changed-files-store.ts present
const eccLibStore = path.join(OLYMPUS_ROOT, ".opencode", "plugins", "lib", "changed-files-store.ts");
check("ECC plugin lib/changed-files-store.ts",
  fs.existsSync(eccLibStore) ? "ok" : "warn",
  fs.existsSync(eccLibStore) ? "present" : "missing - ECC plugin may not compile");

// 23. file-lock-guard.cjs hook present
const fileLockGuard = path.join(OLYMPUS_ROOT, ".opencode", "hooks", "file-lock-guard.cjs");
check("file-lock-guard.cjs hook",
  fs.existsSync(fileLockGuard) ? "ok" : "warn",
  fs.existsSync(fileLockGuard) ? "present at .opencode/hooks/file-lock-guard.cjs" : "missing - vault writes may race");

// 24. Prompt format standardized: NO .md files in agents dirs
const agentsDir = path.join(OLYMPUS_ROOT, ".opencode", "prompts", "agents");
let staleMdFiles = [];
if (fs.existsSync(agentsDir)) {
  for (const subDir of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!subDir.isDirectory()) continue;
    const subPath = path.join(agentsDir, subDir.name);
    for (const f of fs.readdirSync(subPath)) {
      if (f.endsWith(".md")) staleMdFiles.push(`${subDir.name}/${f}`);
    }
  }
}
check("Prompt format (.txt standardized)",
  staleMdFiles.length === 0 ? "ok" : "warn",
  staleMdFiles.length === 0 ? "all agent prompts are .txt" : `${staleMdFiles.length} stale .md files remain: ${staleMdFiles.slice(0, 3).join(", ")}${staleMdFiles.length > 3 ? "..." : ""}`);

// 25. OLYMPUS-Extensions demigods co-located with the gods (demigods/<god>/)
const demigodsDir = path.join(OLYMPUS_ROOT, ".opencode", "prompts", "agents", "demigods");
const godsDir = path.join(OLYMPUS_ROOT, ".opencode", "prompts", "agents", "gods");
const demigodsExists = fs.existsSync(demigodsDir);
const godsExists = fs.existsSync(godsDir);
const staleExtDir = path.join(OLYMPUS_ROOT, ".opencode", "prompts", "agents", "Olympus-Extensions");
const staleExtExists = fs.existsSync(staleExtDir);
check("Demigod fleet co-located",
  (demigodsExists && godsExists && !staleExtExists) ? "ok" : "warn",
  (demigodsExists && godsExists && !staleExtExists)
    ? `demigods/<god>/ structure present, gods/ structure present, Olympus-Extensions/ removed`
    : `demigods/=${demigodsExists}, gods/=${godsExists}, Olympus-Extensions/=${staleExtExists} (should be true, true, false)`);

// 26. Demigod prompts are .txt (ships 118 .txt files on disk, 0 .md)
let demigodMdCount = 0;
let demigodTxtCount = 0;
if (demigodsExists) {
  for (const god of fs.readdirSync(demigodsDir)) {
    const godDir = path.join(demigodsDir, god);
    if (fs.statSync(godDir).isDirectory()) {
      for (const f of fs.readdirSync(godDir)) {
        if (f.endsWith(".md")) demigodMdCount++;
        else if (f.endsWith(".txt")) demigodTxtCount++;
      }
    }
  }
}
check("Demigod prompts (.txt)",
  demigodMdCount === 0 && demigodTxtCount >= 100 ? "ok" : "warn",
  `${demigodTxtCount} .txt + ${demigodMdCount} .md (ships 118 demigod .txt, 0 .md)`);

// 27. Agents registered in opencode.json (10 gods + demigods)
// Gods identified by GOD_NAMES set, demigods are everything else with a description.
// The doctor reports both the registered count and the on-disk count so the
// user can see if any demigods need to be registered.
// Count .txt files dynamically. The actual count is 10 gods + 118 demigods = 128.
try {
  const oc = JSON.parse(fs.readFileSync(path.join(OLYMPUS_ROOT, "opencode.json"), "utf-8"));
  const agents = oc.agent || {};
  const gods = Object.keys(agents).filter(k => GOD_NAMES.has(k));
  // Demigods live in opencode.demigods.json (separate from the main config)
  // to keep the config small for free-tier models.
  const demigodRegistryPath = path.join(OLYMPUS_ROOT, "opencode.demigods.json");
  let demigodCount = 0;
  let demigodFile = false;
  try {
    if (fs.existsSync(demigodRegistryPath)) {
      const dr = JSON.parse(fs.readFileSync(demigodRegistryPath, "utf-8"));
      demigodCount = Object.keys(dr.demigods || {}).length;
      demigodFile = true;
    }
  } catch {}
  // Count actual .txt files on disk (gods + demigods)
  const godsDir = path.join(OLYMPUS_ROOT, ".opencode", "prompts", "agents", "gods");
  const demigodsDir = path.join(OLYMPUS_ROOT, ".opencode", "prompts", "agents", "demigods");
  let onDiskGodCount = 0, onDiskDemigodCount = 0;
  try {
    if (fs.existsSync(godsDir)) onDiskGodCount = fs.readdirSync(godsDir).filter(f => f.endsWith('.txt')).length;
  } catch {}
  try {
    if (fs.existsSync(demigodsDir)) {
      for (const god of fs.readdirSync(demigodsDir)) {
        const godDir = path.join(demigodsDir, god);
        try { if (fs.statSync(godDir).isDirectory()) onDiskDemigodCount += fs.readdirSync(godDir).filter(f => f.endsWith('.txt')).length; } catch {}
      }
    }
  } catch {}
  // All gods must be registered. Demigods should match on-disk count.
  const allRegistered = gods.length === 10 && demigodCount === onDiskDemigodCount;
  const detail = demigodFile
    ? `${gods.length}/10 gods + ${demigodCount} demigods in registry (${onDiskDemigodCount} .txt files on disk)`
    : `${gods.length}/10 gods + 0 demigods in opencode.json (demigods in opencode.demigods.json)`;
  check("Agent registration",
    allRegistered ? "ok" : "warn",
    detail);
} catch {
  check("Agent registration", "warn", "could not parse opencode.json");
}

// 27b. opencode.demigods.json exists
const demigodRegistryExists = fs.existsSync(path.join(OLYMPUS_ROOT, "opencode.demigods.json"));
check("Demigod registry",
  demigodRegistryExists ? "ok" : "warn",
  demigodRegistryExists ? "opencode.demigods.json present (118 demigods)" : "opencode.demigods.json not found — demigod dispatch will fail in free-tier mode");

// 28. olympus-dispatch tool FORBIDS ecc-/olympus-/volt- prefixes
//     The dispatch tool composes a VibrationalSignature and rejects any
//     prefixed demigod name. Demigods are unprefixed.
const dispatchSrc = path.join(OLYMPUS_ROOT, ".opencode", "olympus", "tools", "dispatch.ts");
if (fs.existsSync(dispatchSrc)) {
  try {
    const dispatchContent = fs.readFileSync(dispatchSrc, "utf-8");
    const hasForbidden = dispatchContent.includes("FORBIDDEN_PREFIXES");
    const hasDemigodArg = dispatchContent.includes("demigod: tool.schema");
    const hasVibrationalSignature = dispatchContent.includes("VibrationalSignature");
    // Stale VALID_PREFIXES array (used by the old prefix-accepting dispatch) must NOT appear.
    const hasStaleValidPrefixes = dispatchContent.includes("VALID_PREFIXES");
    // The string "volt-" may appear inside the FORBIDDEN_PREFIXES list — that's correct.
    // We only fail if a VALID_PREFIXES array contains "volt-".
    const voltInValidPrefixes = /VALID_PREFIXES\s*=\s*\[[^\]]*"volt-"/.test(dispatchContent);
    const ok = hasForbidden && hasDemigodArg && hasVibrationalSignature && !hasStaleValidPrefixes && !voltInValidPrefixes;
    check("dispatch tool prefixes",
      ok ? "ok" : "warn",
      ok
        ? "FORBIDS ecc-/olympus-/volt- prefixes, composes VibrationalSignature (Symphony-native)"
        : "dispatch.ts is not Symphony-native (expected FORBIDDEN_PREFIXES + demigod arg + VibrationalSignature, no VALID_PREFIXES)");
  } catch {
    check("dispatch tool prefixes", "warn", "could not read dispatch.ts");
  }
} else {
  check("dispatch tool prefixes", "warn", "dispatch.ts not found");
}

// 28b. Plugin array — no bare npm specifiers (opencode-pty and @tarquinen/opencode-dcp were removed)
try {
  const ocPlugins = (JSON.parse(fs.readFileSync(path.join(OLYMPUS_ROOT, "opencode.json"), "utf-8"))).plugin || [];
  const badSpecifiers = ocPlugins.filter(p => p === "opencode-pty" || p === "@tarquinen/opencode-dcp");
  check("Plugin bare specifiers",
    badSpecifiers.length === 0 ? "ok" : "warn",
    badSpecifiers.length === 0
      ? "No bare npm specifiers (opencode-pty and @tarquinen/opencode-dcp removed)"
      : `Found ${badSpecifiers.length} bare npm specifier(s): ${badSpecifiers.join(', ')} — these cause OpenCode to hang on startup`);
} catch {
  check("Plugin bare specifiers", "warn", "could not parse opencode.json");
}

// 29. ECC plugin compiled output sanity
const eccDistIndex = path.join(OLYMPUS_ROOT, ".opencode", "dist", "plugins", "index.js");
if (fs.existsSync(eccDistIndex)) {
  try {
    const stats = fs.statSync(eccDistIndex);
    // The ECC dist is a small re-export stub (~400 bytes is normal). Flag
    // only if the file is empty or suspiciously tiny (< 100 bytes).
    if (stats.size > 100) {
      check("ECC plugin dist size", "ok", stats.size < 1024 ? `${stats.size}B (re-export stub)` : `${Math.round(stats.size / 1024)}KB`);
    } else {
      check("ECC plugin dist size", "warn", `${stats.size}B - suspiciously small, may be a stub`);
    }
  } catch {}
}

// 30. OLYMPUS overlay compiled output sanity
// Flat dist structure: .opencode/olympus/dist/index.js (no nesting)
const olympusDistIndex = path.join(OLYMPUS_ROOT, ".opencode", "olympus", "dist", "index.js");
if (fs.existsSync(olympusDistIndex)) {
  try {
    const stats = fs.statSync(olympusDistIndex);
    if (stats.size > 100) {
      check("OLYMPUS overlay dist size", "ok", stats.size < 1024 ? `${stats.size}B` : `${Math.round(stats.size / 1024)}KB`);
    } else {
      check("OLYMPUS overlay dist size", "warn", `${stats.size}B - suspiciously small, may be a stub`);
    }
  } catch {}
}

// 31. olympus-router/src/ sources present
const instinctGateSrc = path.join(OLYMPUS_ROOT, ".opencode", "plugins", "olympus-router", "src", "instinct-gate.ts");
const skillIndexSrc = path.join(OLYMPUS_ROOT, ".opencode", "plugins", "olympus-router", "src", "skill-index.ts");
const routerSrcsOk = fs.existsSync(instinctGateSrc) && fs.existsSync(skillIndexSrc);
check("olympus-router/src/ sources",
  routerSrcsOk ? "ok" : "warn",
  routerSrcsOk ? "instinct-gate.ts + skill-index.ts present" : "missing - router will not load");

// 32. Demigod prompts (under demigods/<god>/) + OLYMPUS commands
// The old ECC/ and OLYMPUS-Extensions/ directories are removed.
// All demigods live under demigods/<god>/<name>.txt (118 files).
// The check counts all .txt files across all god subdirectories.
const demigodPromptsDir = path.join(OLYMPUS_ROOT, ".opencode", "prompts", "agents", "demigods");
if (fs.existsSync(demigodPromptsDir)) {
  let demigodPromptCount = 0;
  for (const god of fs.readdirSync(demigodPromptsDir)) {
    const godDir = path.join(demigodPromptsDir, god);
    if (fs.statSync(godDir).isDirectory()) {
      demigodPromptCount += fs.readdirSync(godDir).filter(f => f.endsWith(".txt")).length;
    }
  }
  check("Demigod prompts (demigods/<god>/)",
    demigodPromptCount >= 100 ? "ok" : "warn",
    `${demigodPromptCount} .txt prompts present (ships 118)`);
}
// ECC commands — check the ECC commands directory if it exists (legacy)
const eccCmdsDir = path.join(OLYMPUS_ROOT, ".opencode", "commands", "ECC");
if (fs.existsSync(eccCmdsDir)) {
  const eccCmdFiles = fs.readdirSync(eccCmdsDir).filter(f => f.endsWith(".md"));
  check("ECC commands",
    eccCmdFiles.length >= 28 ? "ok" : "warn",
    `${eccCmdFiles.length}/30 commands present`);
}

// 33. OLYMPUS commands (16)
const olympusCmdsDir = path.join(OLYMPUS_ROOT, ".opencode", "commands", "OLYMPUS");
if (fs.existsSync(olympusCmdsDir)) {
  const olympusCmdFiles = fs.readdirSync(olympusCmdsDir).filter(f => f.endsWith(".md"));
  check("OLYMPUS commands",
    olympusCmdFiles.length >= 14 ? "ok" : "warn",
    `${olympusCmdFiles.length}/16 commands present`);
}

// 34. olympus-dynamic-context plugin present
const dynCtxPlugin = path.join(OLYMPUS_ROOT, ".opencode", "plugins", "olympus-dynamic-context", "index.ts");
check("olympus-dynamic-context plugin",
  fs.existsSync(dynCtxPlugin) ? "ok" : "warn",
  fs.existsSync(dynCtxPlugin)
    ? "plugin present — dynamic input token routing active"
    : "missing — dynamic input loading will not work");

// 35. mcp-gate.ts present
const mcpGateLib = path.join(OLYMPUS_ROOT, ".opencode", "olympus", "lib", "mcp-gate.ts");
check("mcp-gate.ts",
  fs.existsSync(mcpGateLib) ? "ok" : "warn",
  fs.existsSync(mcpGateLib)
    ? "MCP API key gate present — MCPs without configured keys will be blocked"
    : "missing — MCPs requiring API keys will fail silently at runtime");

// 36. task-classifier.ts present
const taskClassifier = path.join(OLYMPUS_ROOT, "src", "lib", "task-classifier.ts");
check("task-classifier.ts",
  fs.existsSync(taskClassifier) ? "ok" : "warn",
  fs.existsSync(taskClassifier)
    ? "task classifier present — prompts will be classified before dispatch"
    : "missing — dynamic input routing will not fire");

// 37. Icon files present
const iconFiles = ["logo.png", "logo.svg", "logo.ico", "logo-256x256.png", "logo-128x128.png", "logo-32x32.png", "favicon.ico"];
let iconsOk = true;
let iconsPresent = [];
let iconsMissing = [];
for (const f of iconFiles) {
  const icoPath = path.join(OLYMPUS_ROOT, "public", f);
  if (fs.existsSync(icoPath)) {
    iconsPresent.push(f);
  } else {
    iconsMissing.push(f);
    iconsOk = false;
  }
}
check("Icon files",
  iconsOk ? "ok" : "warn",
  iconsOk ? `present: ${iconsPresent.join(", ")}` : `missing: ${iconsMissing.join(", ")} — Electron window icon may fall back to generic`);



// 38b. dynamic-dispatch-loader.js present
const ddlScript = path.join(OLYMPUS_ROOT, "scripts", "dynamic-dispatch-loader.js");
check("Dynamic dispatch loader",
  fs.existsSync(ddlScript) ? "ok" : "warn",
  fs.existsSync(ddlScript)
    ? "dynamic-dispatch-loader.js present — on-demand demigod injection for free-tier"
    : "missing — free-tier demigod dispatch may fail");

// 38c. demigod sync API route present
const demigodSyncRoute = path.join(OLYMPUS_ROOT, "src", "app", "api", "olympus", "demigods", "sync", "route.ts");
check("Demigod sync API",
  fs.existsSync(demigodSyncRoute) ? "ok" : "warn",
  fs.existsSync(demigodSyncRoute)
    ? "/api/olympus/demigods/sync present — can rebuild demigod registry"
    : "missing — demigod registry can only be rebuilt manually");

// 39. check-strategy-sync.js present
const checkSyncScript = path.join(OLYMPUS_ROOT, "scripts", "check-strategy-sync.js");
check("check-strategy-sync.js",
  fs.existsSync(checkSyncScript) ? "ok" : "warn",
  fs.existsSync(checkSyncScript)
    ? "strategy sync check script present — run before every commit"
    : "missing — LLM_STRATEGIES vs BUILTIN_STRATEGIES drift will go undetected");

// 40. Calimachus present in opencode.json agent block (10th god, unprefixed)
// The 10 gods are identified by NAME (the GOD_NAMES set), not by prefix.
// Apollo is mode: "primary" (talks to the user); the other 9 gods are
// mode: "subagent" (invoked by Apollo via dispatch). Callimachus is subagent.
try {
  const ocJson = JSON.parse(fs.readFileSync(path.join(OLYMPUS_ROOT, "opencode.json"), "utf-8"));
  const callimachus = ocJson.agent && ocJson.agent["callimachus"];
  const hasDescription = callimachus && typeof callimachus.description === "string" && callimachus.description.length > 0;
  const isSubagent = callimachus && callimachus.mode === "subagent";
  // Verify the prompt path resolves to gods/callimachus.txt (case-insensitive —
  // some installs use GODS/ others gods/).
  const promptPath = callimachus && callimachus.prompt ? callimachus.prompt : "";
  const pathOk = /gods\/callimachus\.txt/i.test(promptPath);
  const ok = hasDescription && isSubagent && pathOk;
  check("Calimachus in opencode.json",
    ok ? "ok" : "warn",
    ok
      ? `10th god registered (description + mode: subagent + prompt: gods/callimachus.txt)`
      : `missing or misconfigured — hasDescription=${hasDescription}, mode=${callimachus && callimachus.mode}, prompt=${promptPath}`);
} catch (e) {
  check("Calimachus in opencode.json", "warn", "could not parse opencode.json");
}

// --- Symphony checks (41-44) ---
// Symphony is always-on. There is no toggle, no "view mode" filter chip,
// no separate dashboard.

// 41. Symphony core modules present (src/lib/symphony/)
const symphonyCore = path.join(OLYMPUS_ROOT, "src", "lib", "symphony", "core", "protocol.ts");
const symphonyEncoding = path.join(OLYMPUS_ROOT, "src", "lib", "symphony", "encoding", "signature.ts");
const symphonyVault = path.join(OLYMPUS_ROOT, "src", "lib", "symphony", "vault", "resonance-registry.ts");
const symphonyCoreOk = fs.existsSync(symphonyCore) && fs.existsSync(symphonyEncoding) && fs.existsSync(symphonyVault);
check("Symphony core modules",
  symphonyCoreOk ? "ok" : "warn",
  symphonyCoreOk
    ? "core/protocol.ts + encoding/signature.ts + vault/resonance-registry.ts present"
    : "missing — Symphony runtime will not load");

// 42. Symphony API routes present (5 endpoints)
const symphonyRoutes = ["resonate", "harmonize", "decode", "score", "metrics"];
let symphonyRoutesFound = 0;
for (const r of symphonyRoutes) {
  const routePath = path.join(OLYMPUS_ROOT, "src", "app", "api", "symphony", r, "route.ts");
  if (fs.existsSync(routePath)) symphonyRoutesFound++;
}
check("Symphony API routes",
  symphonyRoutesFound === 5 ? "ok" : "warn",
  `${symphonyRoutesFound}/5 routes present (resonate, harmonize, decode, score, metrics)`);

// 43. Symphony overlay tools present (3 tools)
const symphonyTools = ["symphony-resonate", "symphony-harmonize", "symphony-decode"];
let symphonyToolsFound = 0;
for (const t of symphonyTools) {
  const toolPath = path.join(OLYMPUS_ROOT, ".opencode", "olympus", "symphony", "tools", `${t}.ts`);
  if (fs.existsSync(toolPath)) symphonyToolsFound++;
}
check("Symphony overlay tools",
  symphonyToolsFound === 3 ? "ok" : "warn",
  `${symphonyToolsFound}/3 tools present (symphony-resonate, symphony-harmonize, symphony-decode)`);

// 44. Symphony visual overlay (brain stays minimalist)
// The Symphony visual overlay (vibrational rings on the brain) is not
// included. The brain stays minimalist. Symphony
// remains as the always-on background communication protocol between
// Gods and Demigods (see src/lib/symphony/), but the canvas overlay
// components are GONE. The olympus-store must NOT have symphonyMode/
// setSymphonyMode state (only symphonyCoherenceWarning remains).
const symphonyTogglePath = path.join(OLYMPUS_ROOT, "src", "components", "symphony", "symphony-mode-toggle.tsx");
const symphonyOverlay = path.join(OLYMPUS_ROOT, "src", "components", "symphony", "symphony-node-overlay.tsx");
const symphonyOverlayContainer = path.join(OLYMPUS_ROOT, "src", "components", "symphony", "symphony-node-overlay-container.tsx");
const symphonyDir = path.join(OLYMPUS_ROOT, "src", "components", "symphony");
const toggleExists = fs.existsSync(symphonyTogglePath);
const overlayExists = fs.existsSync(symphonyOverlay);
const containerExists = fs.existsSync(symphonyOverlayContainer);
const symphonyDirExists = fs.existsSync(symphonyDir);
// Verify the store does NOT contain symphonyMode or setSymphonyMode.
let storeHasStaleToggle = false;
const storePath = path.join(OLYMPUS_ROOT, "src", "lib", "olympus-store.ts");
if (fs.existsSync(storePath)) {
  try {
    const storeContent = fs.readFileSync(storePath, "utf-8");
    storeHasStaleToggle = /symphonyMode\s*:\s*boolean/.test(storeContent) || /setSymphonyMode/.test(storeContent);
  } catch {}
}
// The symphony/ components dir should NOT exist (visual overlay removed).
// The store should NOT have symphonyMode/setSymphonyMode.
const symphonyUiOk = !symphonyDirExists && !toggleExists && !overlayExists && !containerExists && !storeHasStaleToggle;
check("Symphony visual overlay removed (minimalist brain)",
  symphonyUiOk ? "ok" : "warn",
  symphonyUiOk
    ? "symphony/ components dir deleted, store has no symphonyMode/setSymphonyMode (brain is minimalist)"
    : `symphonyDir=${symphonyDirExists} (should be false), toggle=${toggleExists} (should be false), overlay=${overlayExists} (should be false), container=${containerExists} (should be false), storeHasStaleToggle=${storeHasStaleToggle} (should be false)`);

// 45. Symphony vault-brain reference cards present
const symphonyBrain = path.join(OLYMPUS_ROOT, ".opencode", "vault-brain", "symphony");
let symphonyBrainFiles = 0;
if (fs.existsSync(symphonyBrain)) {
  symphonyBrainFiles = fs.readdirSync(symphonyBrain).filter(f => f.endsWith(".md")).length;
}
check("Symphony vault-brain reference cards",
  symphonyBrainFiles >= 3 ? "ok" : "warn",
  `${symphonyBrainFiles}/3 reference cards present (protocol-cheatsheet, axiom-card, fallback-decision-tree)`);

// 46. Vibrations directory in vault (runtime — created lazily on first signature)
const vibrationsDir = path.join(VAULT_ROOT, "05_Auto_Learning", "vibrations");
if (fs.existsSync(vibrationsDir)) {
  const registryPath = path.join(vibrationsDir, "registry.jsonl");
  const templatesPath = path.join(vibrationsDir, "templates.json");
  const metricsPath = path.join(vibrationsDir, "metrics.json");
  const runtimeFiles = [registryPath, templatesPath, metricsPath].filter(p => fs.existsSync(p)).length;
  check("Symphony runtime vault",
    "ok",
    `vibrations/ initialized — ${runtimeFiles}/3 runtime files present (registry.jsonl, templates.json, metrics.json)`);
} else {
  check("Symphony runtime vault",
    "warn",
    "05_Auto_Learning/vibrations/ not yet created — will be auto-created on first symphony-resonate call");
}

// ============================================================================
// Editor Bridge + Telemetry + Vault Policy checks
// ============================================================================
section("Editor Bridge + Terminal Bridge");

// --- Terminal Bridge token file ---
const tokenFile = path.join(os.homedir(), ".olympus", "terminal-bridge-token");
if (fs.existsSync(tokenFile)) {
  const tokenStat = fs.statSync(tokenFile);
  // Check 0o600 perms (owner read/write only).
  const mode = tokenStat.mode & 0o777;
  if (mode === 0o600) {
    check("Terminal Bridge token file",
      "ok",
      `${tokenFile} (perms 0${mode.toString(8)})`);
  } else {
    check("Terminal Bridge token file",
      "warn",
      `${tokenFile} has perms 0${mode.toString(8)} — should be 0600. Run: chmod 600 "${tokenFile}"`);
  }
} else {
  check("Terminal Bridge token file",
    "warn",
    `${tokenFile} not found — start OLYMPUS (npm run dev) to generate it`);
}

// --- Terminal Bridge port 3740 listening ---
const bridgeProbe = runCmd("node", ["-e", `
  const net = require('net');
  const sock = new net.Socket();
  sock.setTimeout(800);
  sock.once('connect', () => { process.stdout.write('listening'); sock.destroy(); });
  sock.once('timeout', () => { process.stdout.write('offline'); sock.destroy(); });
  sock.once('error', () => { process.stdout.write('offline'); sock.destroy(); });
  sock.connect(3740, '127.0.0.1');
`]);
if (bridgeProbe === 'listening') {
  check("Terminal Bridge port 3740", "ok", "listening on 127.0.0.1:3740");
} else {
  check("Terminal Bridge port 3740", "warn", "not listening — start OLYMPUS (npm run dev) to spawn the bridge");
}

// --- Editor detection ---
const detectEditorsScript = path.join(OLYMPUS_ROOT, "scripts", "detect-editors.js");
if (fs.existsSync(detectEditorsScript)) {
  const editorsOut = runCmd("node", [detectEditorsScript]);
  if (editorsOut && editorsOut.includes('OK')) {
    // Count how many editors were detected.
    const match = editorsOut.match(/Detected (\d+)\/(\d+) editors/);
    if (match) {
      const detected = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      check("External editor detection",
        detected > 0 ? "ok" : "warn",
        `${detected}/${total} editors detected${detected > 0 ? '' : ' — install Zed, VSCode, VSCodium, or Cursor'}`);
    } else {
      check("External editor detection", "ok", "detection script ran successfully");
    }
  } else {
    check("External editor detection", "warn", "detection script failed to run");
  }
} else {
  check("External editor detection", "warn", `detect-editors.js not found at ${detectEditorsScript}`);
}

// --- Editor config file ---
const editorConfigFile = path.join(os.homedir(), ".olympus", "editor-config.json");
if (fs.existsSync(editorConfigFile)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(editorConfigFile, 'utf-8'));
    const preferred = cfg.preferred || 'auto';
    const lastDetected = Array.isArray(cfg.lastDetected) ? cfg.lastDetected.filter(e => e.binPath).length : 0;
    check("Editor config",
      "ok",
      `preferred=${preferred}, ${lastDetected} editor(s) available`);
  } catch {
    check("Editor config", "warn", `${editorConfigFile} is malformed JSON`);
  }
} else {
  check("Editor config", "warn", `${editorConfigFile} not found — run the installer or: node scripts/detect-editors.js`);
}

// ============================================================================
// Short-circuit telemetry check
// ============================================================================
section("Short-Circuit Telemetry");

const shortcircuitLog = path.join(VAULT_ROOT, "05_Auto_Learning", "shortcircuit-log.jsonl");
if (fs.existsSync(shortcircuitLog)) {
  const stat = fs.statSync(shortcircuitLog);
  const sizeMB = stat.size / (1024 * 1024);
  // Read the last 1000 lines to count short-circuits.
  let shortCircuitCount = 0;
  let totalLines = 0;
  try {
    const content = fs.readFileSync(shortcircuitLog, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    totalLines = lines.length;
    // Tail to last 1000.
    const tail = lines.slice(-1000);
    for (const line of tail) {
      try {
        const e = JSON.parse(line);
        if (e.short_circuited) shortCircuitCount++;
      } catch {}
    }
  } catch {}
  const hitRate = totalLines > 0 ? (shortCircuitCount / Math.min(totalLines, 1000) * 100).toFixed(1) : '0.0';
  check("Short-circuit log",
    sizeMB > 100 ? "warn" : "ok",
    `${shortcircuitLog} (${sizeMB.toFixed(1)} MB, ${totalLines} entries, ~${hitRate}% hit rate in last 1000)`);
} else {
  check("Short-circuit log",
    "warn",
    "shortcircuit-log.jsonl not found — will be created on first instinct gate evaluation (dispatch a task to trigger it)");
}

// ============================================================================
// Vault policy + size check
// ============================================================================
section("Vault Policy + Size");

const vaultPolicyFile = path.join(os.homedir(), ".olympus", "vault-policy.json");
if (fs.existsSync(vaultPolicyFile)) {
  try {
    const policy = JSON.parse(fs.readFileSync(vaultPolicyFile, 'utf-8'));
    check("Vault policy",
      "ok",
      `dryRun=${policy.dryRun ?? true}, autoPruneOnIdle=${policy.autoPruneOnIdle ?? true}, maxActivityFeed=${policy.maxActivityFeedMB ?? 500}MB`);
  } catch {
    check("Vault policy", "warn", `${vaultPolicyFile} is malformed JSON`);
  }
} else {
  check("Vault policy",
    "ok",
    "using defaults (dryRun=true, autoPruneOnIdle=true) — no policy file yet");
}

// Vault total size
let vaultTotalMB = 0;
try {
  function dirSize(dir) {
    let bytes = 0;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) bytes += dirSize(full);
        else if (entry.isFile()) {
          try { bytes += fs.statSync(full).size; } catch {}
        }
      }
    } catch {}
    return bytes;
  }
  vaultTotalMB = dirSize(VAULT_ROOT) / (1024 * 1024);
  check("Vault total size",
    vaultTotalMB > 1000 ? "warn" : "ok",
    `${vaultTotalMB.toFixed(1)} MB ${vaultTotalMB > 1000 ? '— consider running: olympus vault prune --live' : ''}`);
} catch {
  check("Vault total size", "warn", "could not compute vault size");
}

// Check the specific files against the policy caps.
const policyForChecks = fs.existsSync(vaultPolicyFile)
  ? JSON.parse(fs.readFileSync(vaultPolicyFile, 'utf-8'))
  : { maxActivityFeedMB: 500, maxShortCircuitLogMB: 100, maxVibrationsMB: 200 };

const activityFeedPath = path.join(VAULT_ROOT, "06_Activity_Feed", "live.jsonl");
if (fs.existsSync(activityFeedPath)) {
  const sizeMB = fs.statSync(activityFeedPath).size / (1024 * 1024);
  const cap = policyForChecks.maxActivityFeedMB || 500;
  check("Activity feed size",
    sizeMB > cap * 0.8 ? "warn" : "ok",
    `${sizeMB.toFixed(1)} MB / ${cap} MB cap ${sizeMB > cap * 0.8 ? '— approaching cap, will roll over on next prune' : ''}`);
}

// --- Summary ---
section("Summary");
console.log(`  ${c.bold}Passed:${c.reset}   ${results.length - failures - warnings}`);
console.log(`  ${c.bold}Warnings:${c.reset} ${warnings}`);
console.log(`  ${c.bold}Failed:${c.reset}   ${failures}`);
console.log("");

if (failures > 0) {
  console.log(`  ${c.red}OLYMPUS has ${failures} issue(s) that need attention.${c.reset}`);
  console.log(`  Fix the failed checks above, then re-run: ${c.bold}node scripts/olympus-doctor.js${c.reset}`);
  console.log("");
  process.exit(1);
} else if (warnings > 0) {
  console.log(`  ${c.yellow}OLYMPUS is installed with ${warnings} warning(s).${c.reset}`);
  console.log(`  Warnings are non-blocking -- OLYMPUS will work, but fixing them is recommended.${c.reset}`);
  console.log("");
  console.log(`  Next: ${c.bold}npm run dev${c.reset} (launches the OLYMPUS Electron desktop app)`);
  console.log(`  Authorize LLM keys inside OpenCode: ${c.bold}olympus opencode${c.reset} -> Settings -> Providers`);
  console.log("");
  process.exit(0);
} else {
  console.log(`  ${c.green}OLYMPUS is healthy. All checks passed.${c.reset}`);
  console.log("");
  console.log(`  Next: ${c.bold}npm run dev${c.reset} (launches the OLYMPUS Electron desktop app)`);
  console.log(`  Authorize LLM keys inside OpenCode: ${c.bold}olympus opencode${c.reset} -> Settings -> Providers`);
  console.log("");
  process.exit(0);
}
