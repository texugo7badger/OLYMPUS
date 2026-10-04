/**
 * olympus-skill-author Tool — v0.0.2 Lazy-Load Edition
 *
 * Automates the creation of new SKILL.md files by gods. When a god discovers
 * a "quick circuit" (an empirical instinct with confidence >= 0.85 and
 * samples >= 5), it can call this tool to crystallize the pattern into a
 * permanent skill.
 *
 * UPDATE v0.0.2: Now touches a sentinel file (~/.olympus/skills-registry.reload)
 * after creating a new skill. The olympus-skill-registry plugin checks this
 * sentinel on every chat.params hook and re-scans if it's newer than the
 * last scan. This makes newly-created skills available in the current
 * session without restarting OpenCode.
 *
 * Behavior:
 *   1. Creates `.opencode/skills/<god>/<skill_name>/SKILL.md` with proper
 *      frontmatter + body structure.
 *   2. Creates a seed instinct at
 *      `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/seed/<skill_name>.md`
 *      linking the trigger -> skill -> action.
 *   3. Appends the skill name to the god's dynamic skill pool in opencode.json.
 *   4. Touches the skills-registry.reload sentinel so the skill-registry
 *      plugin re-scans on the next chat.params hook.
 *   5. Returns the skill path + instinct path + registration status.
 *
 * The new skill is immediately available on the next chat.params hook
 * (no restart needed) because the skill-registry plugin re-scans when it
 * sees the sentinel has been touched.
 *
 * Quality constraints (see CHANGES.md):
 *   - All `.on('error', (err) => ...)` use `(err: any)`.
 *   - Cross-platform — Windows, macOS, Linux.
 *   - No emojis.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getVaultRoot } from "../../../src/lib/vault-root.js";

const VAULT_ROOT = getVaultRoot(); // D21: the single canonical resolver
const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();
const RELOAD_SENTINEL = path.join(os.homedir(), ".olympus", "skills-registry.reload");

const skillAuthorTool: ToolDefinition = tool({
  description:
    "Create a new skill for yourself or your demigods. Use this when you discover a recurring pattern that no existing skill covers AND an empirical instinct with confidence >= 0.85 confirms the pattern works (a 'quick circuit'). The tool creates the SKILL.md + a seed instinct + registers the skill in opencode.json + touches the skills-registry reload sentinel so the skill is available in the current session without a restart.",
  args: {
    god: tool.schema
      .string()
      .describe("Your god ID (e.g., 'apollo', 'artemis'). The skill will be created at .opencode/skills/<god>/<skill_name>/SKILL.md."),
    skill_name: tool.schema
      .string()
      .describe("The skill name in kebab-case (e.g., 'rust-build-error-patterns'). Will be used as the directory name + the skill ID."),
    domain: tool.schema
      .string()
      .describe("The skill's domain (e.g., 'security', 'frontend', 'backend', 'database', 'devops', 'vault'). Used for organization + indexing."),
    trigger: tool.schema
      .string()
      .describe("What task type triggers this skill. Used by clv2 to match the skill to future dispatches."),
    action: tool.schema
      .string()
      .describe("What the skill does (one sentence). Used in the seed instinct's action field."),
    patterns: tool.schema
      .array(tool.schema.string())
      .describe("The reusable patterns extracted from the instinct. Each pattern is a string (1-3 sentences)."),
    best_practices: tool.schema
      .array(tool.schema.string())
      .describe("Best practices from successful dispatches. Each is a string (1-3 sentences)."),
    examples: tool.schema
      .array(tool.schema.string())
      .describe("Code examples (as strings). Each example should be self-contained."),
    for_demigod: tool.schema
      .string()
      .optional()
      .describe("If this skill is for a specific demigod, the demigod's name (e.g., 'systems-reviewer'). Optional."),
  },
  execute: async (args, _context): Promise<any> => {
    const { god, skill_name, domain, trigger, action, patterns, best_practices, examples, for_demigod } = args;

    // --- Validate inputs -------------------------------------------------
    if (!god || !skill_name || !domain || !trigger || !action) {
      return {
        ok: false,
        error: "Missing required field. Required: god, skill_name, domain, trigger, action.",
      };
    }
    if (!/^[a-z][a-z0-9-]*$/.test(skill_name)) {
      return {
        ok: false,
        error: `skill_name must be kebab-case (lowercase + hyphens). Got: ${skill_name}`,
      };
    }

    // --- 1. Create the SKILL.md -----------------------------------------
    const skillDir = path.join(OLYMPUS_ROOT, ".opencode", "skills", god, skill_name);
    const skillPath = path.join(skillDir, "SKILL.md");

    try {
      fs.mkdirSync(skillDir, { recursive: true });
    } catch (e: any) {
      return { ok: false, error: `Failed to create skill directory: ${e.message}` };
    }

    const skillContent = renderSkillMd({
      god, skill_name, domain, trigger, action,
      patterns, best_practices, examples, for_demigod,
    });

    try {
      fs.writeFileSync(skillPath, skillContent, "utf-8");
    } catch (e: any) {
      return { ok: false, error: `Failed to write SKILL.md: ${e.message}` };
    }

    // --- 2. Create the seed instinct ------------------------------------
    const instinctDir = path.join(VAULT_ROOT, "05_Auto_Learning", "instincts", god, "seed");
    const instinctPath = path.join(instinctDir, `${skill_name}.md`);

    try {
      fs.mkdirSync(instinctDir, { recursive: true });
    } catch (e: any) {
      return { ok: false, error: `Failed to create instinct directory: ${e.message}` };
    }

    const instinctContent = renderSeedInstinct({
      god, skill_name, domain, trigger, action, for_demigod,
    });

    try {
      fs.writeFileSync(instinctPath, instinctContent, "utf-8");
    } catch (e: any) {
      return { ok: false, error: `Failed to write seed instinct: ${e.message}` };
    }

    // --- 3. Register in opencode.json -----------------------------------
    let registered = false;
    const opencodeJsonPath = path.join(OLYMPUS_ROOT, "opencode.json");
    try {
      const raw = fs.readFileSync(opencodeJsonPath, "utf-8");
      const config = JSON.parse(raw);
      if (config.agent && config.agent[god] && Array.isArray(config.agent[god].skills)) {
        const skills = config.agent[god].skills;
        if (!skills.includes(skill_name)) {
          skills.push(skill_name);
          config.agent[god].skills = skills;
          fs.writeFileSync(opencodeJsonPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
          registered = true;
        } else {
          registered = true;
        }
      }
    } catch (e: any) {
      registered = false;
    }

    // --- 4. Touch the skills-registry reload sentinel -------------------
    // This tells the olympus-skill-registry plugin to re-scan on the next
    // chat.params hook. The new skill will be discoverable in the current
    // session without restarting OpenCode.
    let sentinelTouched = false;
    try {
      const sentinelDir = path.dirname(RELOAD_SENTINEL);
      if (!fs.existsSync(sentinelDir)) fs.mkdirSync(sentinelDir, { recursive: true });

      // Read existing sentinel (if any) and preserve the paths array
      let existingPaths: string[] = [];
      try {
        if (fs.existsSync(RELOAD_SENTINEL)) {
          const raw = JSON.parse(fs.readFileSync(RELOAD_SENTINEL, "utf-8"));
          if (Array.isArray(raw.paths)) existingPaths = raw.paths;
        }
      } catch {}

      const newSkillPath = path.join(OLYMPUS_ROOT, ".opencode", "skills", god);
      if (!existingPaths.includes(newSkillPath)) {
        existingPaths.push(newSkillPath);
      }

      fs.writeFileSync(
        RELOAD_SENTINEL,
        JSON.stringify({
          paths: existingPaths,
          ts: new Date().toISOString(),
          source: "skill-author-tool",
          last_skill_created: skill_name,
        }),
        "utf-8",
      );
      sentinelTouched = true;
    } catch (e: any) {
      // Non-fatal — the skill is still created, just won't be auto-discovered
      // until the next session restart.
    }

    return {
      ok: true,
      god,
      skill_name,
      domain,
      skill_path: skillPath,
      instinct_path: instinctPath,
      registered,
      sentinel_touched: sentinelTouched,
      for_demigod: for_demigod || null,
      message: `Skill created at ${skillPath}. Seed instinct at ${instinctPath}.${registered ? " Registered in opencode.json." : " NOT registered in opencode.json (manual registration required)."}${sentinelTouched ? " Skills-registry reload sentinel touched — skill discoverable in current session." : " Sentinel not touched — skill will be discovered on next session restart."}`,
    };
  },
});

function renderSkillMd(params: {
  god: string;
  skill_name: string;
  domain: string;
  trigger: string;
  action: string;
  patterns: string[];
  best_practices: string[];
  examples: string[];
  for_demigod?: string;
}): string {
  const { god, skill_name, domain, trigger, action, patterns, best_practices, examples, for_demigod } = params;
  const now = new Date().toISOString();

  const patternsMd = patterns.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const bestPracticesMd = best_practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const examplesMd = examples.map((e, i) => `### Example ${i + 1}\n\n\`\`\`\n${e}\n\`\`\``).join("\n\n");

  return `---
name: ${skill_name}
god: ${god}
domain: ${domain}
trigger: ${trigger}
action: ${action}
for_demigod: ${for_demigod || "null"}
created: ${now}
source: quick-circuit
confidence: 0.85
---

# ${skill_name}

## Overview

${action}

This skill was crystallized from a quick circuit (an empirical instinct that reached confidence >= 0.85). It captures the recurring pattern so future dispatches can auto-equip it via clv2 matching.

**Trigger:** ${trigger}

**God:** ${god}

${for_demigod ? `**For demigod:** ${for_demigod}` : ""}

## Patterns

${patternsMd}

## Best Practices

${bestPracticesMd}

## Examples

${examplesMd || "(no examples yet — add them as the skill evolves)"}

## clv2 Integration

This skill is linked to a seed instinct at
\`~/OLYMPUS-VAULT/05_Auto_Learning/instincts/${god}/seed/${skill_name}.md\`.

When a dispatch matches the trigger, the instinct fires and the god equips
this skill. Future dispatches with the same trigger will short-circuit
(confidence >= 0.85) and auto-equip this skill.
`;
}

function renderSeedInstinct(params: {
  god: string;
  skill_name: string;
  domain: string;
  trigger: string;
  action: string;
  for_demigod?: string;
}): string {
  const { god, skill_name, domain, trigger, action, for_demigod } = params;
  const now = new Date().toISOString();

  return `---
god: ${god}
confidence: 0.85
scope: global
stacks: []
projects: []
last_used: ${now}
samples: 5
successes: 5
failures: 0
source: seed
immutable: true
trigger: "${trigger}"
action: "${action}"
skill: ${skill_name}
mcp: null
demigod: ${for_demigod || "null"}
id: ${skill_name}
---

# Instinct: ${skill_name}

This is a seed instinct crystallized from a quick circuit. It links the
trigger \`${trigger}\` to the skill \`${skill_name}\` and the action
\`${action}\`.

When a future dispatch matches the trigger, this instinct fires. If
confidence stays >= 0.85, the dispatch short-circuits and the skill is
auto-equipped.

## Origin

- **Domain:** ${domain}
- **God:** ${god}
${for_demigod ? `- **For demigod:** ${for_demigod}` : ""}
- **Crystallized:** ${now}
- **Source:** quick-circuit (empirical instinct reached confidence >= 0.85 with >= 5 samples)

## Lifecycle

- This is a SEED instinct — immutable baseline.
- Callimachus can promote it to a higher scope if cross-stack evidence emerges.
- Confidence is updated by the tool.execute.after hook based on dispatch outcomes.
- If confidence drops below 0.3, Callimachus archives it.
`;
}

export default skillAuthorTool;
