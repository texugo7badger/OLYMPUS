/**
 * olympus-skill-registry — v0.0.2 Lazy-Load Edition
 *
 * Auto-discovers skills created by gods and registers them in OpenCode's
 * config. This makes god-created skills immediately available without
 * manual opencode.json edits.
 *
 * UPDATE v0.0.2: Switched from "scan all skills at config-load time" to
 * "lazy scan on first chat.params hook". This prevents the 330-skill
 * directory scan from blocking OpenCode startup.
 *
 * Behavior:
 *   - On `config` hook: NO scan (just initializes the config.skills.paths
 *     array if missing). This is critical — scanning 330 skill files at
 *     startup adds 200-500ms to cold-start time, which combined with
 *     other plugin loads can push startup past the user's patience.
 *   - On first `chat.params` hook: lazy-scan .opencode/skills/<god>/
 *     for SKILL.md files. Add each god's skill directory to
 *     config.skills.paths (idempotent). The scan runs ONCE per session
 *     and is cached — subsequent chat.params calls skip it.
 *   - The skill-author tool touches a sentinel file
 *     (~/.olympus/skills-registry.reload) when it creates a new skill.
 *     The next chat.params call checks the sentinel and re-scans if
 *     the sentinel is newer than the last scan.
 *
 * Why a plugin (not just opencode.json):
 *   - The opencode.json `skills.paths` array is a fixed list at session start.
 *   - But gods can create new skills DURING a session (via skill-author).
 *   - This plugin re-scans on sentinel change, so newly-created skills
 *     are picked up within the same session.
 *
 * Quality constraints:
 *   - Cross-platform — Windows, macOS, Linux.
 *   - No emojis.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();
const SKILLS_ROOT = path.join(OLYMPUS_ROOT, ".opencode", "skills");
const RELOAD_SENTINEL = path.join(os.homedir(), ".olympus", "skills-registry.reload");

const plugin: Plugin = async (_input, _options) => {
  const log = (msg: string) => {
    if (process.env.OLYMPUS_DEBUG === "1") console.error(`[olympus-skill-registry] ${msg}`);
  };

  // Cache: the last time we scanned + the paths we discovered.
  // Persisted across hook calls within the same OpenCode session.
  let lastScanAt = 0;  // mtime of the reload sentinel at last scan (0 = never scanned)
  let cachedPaths: string[] | null = null;

  /**
   * Scan .opencode/skills/<god>/ for SKILL.md files.
   * Returns the list of god directories that contain at least one SKILL.md.
   */
  function scanSkills(): string[] {
    const discoveredPaths: string[] = [];

    if (!fs.existsSync(SKILLS_ROOT)) return discoveredPaths;

    try {
      const godDirs = fs.readdirSync(SKILLS_ROOT, { withFileTypes: true });
      for (const godDir of godDirs) {
        if (!godDir.isDirectory()) continue;
        // Skip the superpowers directory — it's already registered
        if (godDir.name === "superpowers") continue;
        // Skip hidden directories
        if (godDir.name.startsWith(".")) continue;

        const godSkillsPath = path.join(SKILLS_ROOT, godDir.name);
        try {
          const skillSubDirs = fs.readdirSync(godSkillsPath, { withFileTypes: true });
          const hasSkills = skillSubDirs.some(
            (sd) => sd.isDirectory() && fs.existsSync(path.join(godSkillsPath, sd.name, "SKILL.md"))
          );

          if (hasSkills) {
            discoveredPaths.push(godSkillsPath);
          }
        } catch {
          // Permission error or directory deleted mid-scan — skip
        }
      }
    } catch {
      // SKILLS_ROOT deleted mid-scan — return empty
    }

    return discoveredPaths;
  }

  /**
   * Check if the reload sentinel has been touched since our last scan.
   * Returns true if we should re-scan.
   */
  function shouldRescan(): boolean {
    try {
      if (!fs.existsSync(RELOAD_SENTINEL)) {
        return cachedPaths === null;
      }
      const stat = fs.statSync(RELOAD_SENTINEL);
      return stat.mtimeMs > lastScanAt;
    } catch {
      return false;
    }
  }

  /**
   * Run a scan (if needed) and return the discovered paths.
   * Cached after the first scan; re-scans only when the sentinel is touched.
   */
  function getSkillsPaths(): string[] {
    if (cachedPaths !== null && !shouldRescan()) {
      return cachedPaths;
    }

    log("Scanning for skills...");
    const paths = scanSkills();
    cachedPaths = paths;

    try {
      if (fs.existsSync(RELOAD_SENTINEL)) {
        lastScanAt = fs.statSync(RELOAD_SENTINEL).mtimeMs;
      } else {
        lastScanAt = Date.now();
      }
    } catch {
      lastScanAt = Date.now();
    }

    log(`Discovered ${paths.length} skill path(s).`);
    return paths;
  }

  return {
    // config hook: NO scan. Just initialize config.skills.paths if missing.
    // The actual scan happens lazily on the first chat.params hook.
    config: async (config: any) => {
      try {
        if (!config.skills) config.skills = { paths: [] };
        if (!Array.isArray(config.skills.paths)) config.skills.paths = [];

        // If the sentinel has paths from a previous session (written by
        // the chat.params hook below), preload them here so they're
        // available at session start. This is the bridge between sessions.
        try {
          if (fs.existsSync(RELOAD_SENTINEL)) {
            const raw = JSON.parse(fs.readFileSync(RELOAD_SENTINEL, "utf-8"));
            if (Array.isArray(raw.paths)) {
              for (const p of raw.paths) {
                if (typeof p === "string" && !config.skills.paths.includes(p)) {
                  config.skills.paths.push(p);
                }
              }
            }
          }
        } catch {}
      } catch (e: any) {
        log(`Error in config hook: ${e.message}`);
      }
      return config;
    },

    // chat.params hook: lazy scan on first call, then cache.
    // This defers the 330-skill directory scan until the user actually
    // sends a message, so OpenCode startup is fast.
    "chat.params": async (_hookInput, _output) => {
      try {
        const paths = getSkillsPaths();
        if (paths.length === 0) return;

        // Write the discovered paths to the sentinel so the config hook
        // picks them up on the NEXT session restart. For the CURRENT
        // session, the skill-index (olympus-router plugin) handles
        // semantic skill discovery — config.skills.paths is only needed
        // for OpenCode's built-in skill loading.
        try {
          const sentinelDir = path.dirname(RELOAD_SENTINEL);
          if (!fs.existsSync(sentinelDir)) fs.mkdirSync(sentinelDir, { recursive: true });

          let existingPaths: string[] = [];
          if (fs.existsSync(RELOAD_SENTINEL)) {
            try {
              const raw = JSON.parse(fs.readFileSync(RELOAD_SENTINEL, "utf-8"));
              if (Array.isArray(raw.paths)) existingPaths = raw.paths;
            } catch {}
          }

          const newPaths = paths.filter(p => !existingPaths.includes(p));
          if (newPaths.length > 0) {
            const updatedPaths = [...existingPaths, ...newPaths];
            fs.writeFileSync(
              RELOAD_SENTINEL,
              JSON.stringify({
                paths: updatedPaths,
                ts: new Date().toISOString(),
                source: "olympus-skill-registry",
              }),
              "utf-8",
            );
            log(`Wrote ${newPaths.length} new skill path(s) to sentinel.`);
          }
        } catch (e: any) {
          log(`Warning: could not write sentinel: ${e.message}`);
        }
      } catch (e: any) {
        log(`Error in chat.params hook: ${e.message}`);
      }
    },
  };
};

export default plugin;
