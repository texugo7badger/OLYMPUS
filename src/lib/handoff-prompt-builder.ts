/**
 * Handoff Prompt Builder — composes the initial prompt that the Olympus
 * terminal sends to the TUI (opencode) when launching a work session.
 *
 * The handoff prompt is the "baton pass" from the intake wizard to the TUI.
 * It tells the TUI:
 *   1. What the user asked for
 *   2. Where the project lives in the vault
 *   3. What tech stack was detected
 *   4. What documentation was found + summarized
 *   5. Which gods are active and what their roles are
 *   6. The instinct to append progress to the activity feed
 *
 * DESIGN: The prompt is markdown-formatted, self-contained, and under 2000
 * tokens. It's designed to be the FIRST message the TUI receives, setting
 * the context for the entire session.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { type ProjectNote, VAULT as PROJECT_VAULT } from './project-context';
import { type StackDetection } from './stack-detector';

const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');

export interface HandoffContext {
  /** The user's original request (what they typed in the terminal) */
  userRequest: string;
  /** The project slug (folder name in 02_Projects/) */
  projectSlug: string;
  /** The project name (human-readable) */
  projectName: string;
  /** The project's source code path on disk (if known) */
  projectPath?: string;
  /** Detected tech stacks */
  stacks: string[];
  /** Path to the doc summary file (relative to vault) */
  summaryPath?: string;
  /** The doc summary text (optional — if omitted, TUI reads the file) */
  summaryText?: string;
  /** Which TUI this prompt is for (affects instruction phrasing). v0.0.1: only 'opencode' and 'generic'. */
  targetTui: 'opencode' | 'generic';
  /** Additional context lines (e.g., "User prefers TypeScript over JavaScript") */
  additionalContext?: string[];
}

/**
 * God registry — maps god IDs to their roles and expertise.
 * This matches the vault-template/01_Gods/ structure.
 */
const GOD_REGISTRY = [
    { id: 'apollo', name: 'Apollo', role: 'Master Planner', expertise: 'Planning, architecture, spec interview, DAG design' },
  { id: 'artemis', name: 'Artemis', role: 'Security / Auditing', expertise: 'Vulnerability hunting, OWASP Top 10, SAST/DAST, secrets' },
  { id: 'athena', name: 'Athena', role: 'Frontend / Design', expertise: 'Accessible, performant, beautiful interfaces (Impeccable)' },
  { id: 'dionysus', name: 'Dionysus', role: 'QA / Testing', expertise: 'Unit, integration, E2E tests, edge cases, coverage' },
  { id: 'hephaestus', name: 'Hephaestus', role: 'Backend / Infrastructure', expertise: 'Production backend code, schemas, infra-as-code, APIs' },
  { id: 'hermes', name: 'Hermes', role: 'Integrations / APIs / MCPs', expertise: 'Third-party services, MCP servers, webhooks, external API contracts' },
  { id: 'persephone', name: 'Persephone', role: 'Database / Persistence', expertise: 'Schema design, migrations, query optimization, backup/restore' },
  { id: 'prometheus', name: 'Prometheus', role: 'DevOps / CI-CD / Deploy', expertise: 'Deployment pipelines, Docker, Kubernetes, monitoring, SRE' },
  { id: 'atlas', name: 'Atlas', role: 'Orchestrator & Dispatch Executor', expertise: 'Dispatch, execution tracking, progress reporting, failure detection' },
  { id: 'callimachus', name: 'Callimachus', role: 'Vault Curation', expertise: 'Instinct lifecycle, brain maintenance, docs verification' },
];

/**
 * Build the handoff prompt for a TUI session.
 *
 * Returns a markdown string that the TUI receives as its first message.
 */
export function buildHandoffPrompt(ctx: HandoffContext): string {
  const projectDir = path.join(VAULT, '02_Projects', ctx.projectSlug);
  const projectRel = `02_Projects/${ctx.projectSlug}`;

  // Build the vault map section
  const vaultMap = [
    `📁 **${projectRel}/**`,
    `   ├── project.md          ← project metadata + frontmatter`,
    `   ├── _summary.md         ← auto-generated doc summary`,
    `   ├── _delegations/       ← god delegation queue`,
    `   │   ├── inbox/          ← pending delegations`,
    `   │   ├── processing/     ← in-progress delegations`,
    `   │   ├── done/           ← completed delegations`,
    `   │   └── escalated/      ← blocked/escalated items`,
    `   ├── uploads/            ← original uploaded files`,
    `   ├── references/         ← organized doc files`,
    `   ├── snippets/           ← organized code snippets`,
    `   └── plan.md             ← execution plan (create this)`,
  ].join('\n');

  // Build the active gods section — only include gods relevant to the stack
  const activeGods = selectActiveGods(ctx.stacks);
  const godsSection = activeGods.map(g =>
    `- **${g.name}** (${g.role}): ${g.expertise}`
  ).join('\n');

  // Build the stack section
  const stackSection = ctx.stacks.length > 0
    ? ctx.stacks.map(s => `- ${s}`).join('\n')
    : '- (auto-detect from project files)';

  // Build the activity feed instruction — this is the KEY part that makes
  // the "work in progress" display work. The TUI's agents must append to
  // the activity feed so the Olympus terminal can show what's happening.
  const activityInstruction = [
    `## ⚡ Activity Feed — CRITICAL INSTRUCTION`,
    ``,
    `You MUST append your progress to the activity feed file so the Olympus terminal can display it.`,
    ``,
    `**Feed file:** \`~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl\``,
    ``,
    `**Format:** Append one JSON line per event:`,
    '```jsonl',
    `{"ts":"2026-07-10T22:00:00.000Z","god":"apollo","action":"session_start","msg":"Started work on user auth","project":"${ctx.projectSlug}"}`,
    `{"ts":"2026-07-10T22:01:00.000Z","god":"athena","action":"tool_call","msg":"Reading src/auth.ts","project":"${ctx.projectSlug}"}`,
    `{"ts":"2026-07-10T22:05:00.000Z","god":"athena","action":"todo","msg":"Implement JWT token generation","project":"${ctx.projectSlug}","meta":{"status":"in_progress"}}`,
    `{"ts":"2026-07-10T22:10:00.000Z","god":"athena","action":"milestone","msg":"JWT auth complete","project":"${ctx.projectSlug}"}`,
    '```',
    ``,
    `**Action types:** \`session_start\`, \`session_end\`, \`delegation\`, \`tool_call\`, \`todo\`, \`response\`, \`error\`, \`milestone\``,
    ``,
    `Append events as you work. This is how the user sees your progress in the Olympus terminal.`,
  ].join('\n');

  // Build the doc summary section
  let docSection = '';
  if (ctx.summaryText) {
    docSection = `## 📄 Documentation Summary\n\n${ctx.summaryText}\n`;
  } else if (ctx.summaryPath) {
    docSection = `## 📄 Documentation Summary\n\n> Read the full summary at: \`${ctx.summaryPath}\`\n`;
  } else {
    docSection = `## 📄 Documentation\n\nNo documentation was provided. Explore the project files to understand the codebase.\n`;
  }

  // Build additional context
  const additionalSection = ctx.additionalContext && ctx.additionalContext.length > 0
    ? `\n## 📌 Additional Context\n\n${ctx.additionalContext.map(c => `- ${c}`).join('\n')}\n`
    : '';

  // TUI-specific instruction
  const tuiInstruction = buildTuiInstruction(ctx.targetTui);

  // Assemble the full prompt
  const prompt = `# 🏛️ Olympus Handoff — ${ctx.projectName}

You are now in control of a project in the Olympus vault. The user has started this session from the Olympus terminal, and you are the designated "workshop" tool. Here is everything you need to know.

## 👤 User's Request

> ${ctx.userRequest}

## 📁 Project Location

${vaultMap}

**Project source path:** ${ctx.projectPath || '(see uploads/ in the vault)'}

**Vault root:** ${VAULT}

## 🛠️ Tech Stack

${stackSection}

## 🧬 Active Gods

The following gods are available for delegation. You are Apollo (master planner) by default — design the task DAG and hand execution to Atlas for dispatch.

${godsSection}

${docSection}
${additionalSection}
${activityInstruction}

${tuiInstruction}

---

**You are now in control.** The vault is your workspace. Follow your instincts. Append progress to the activity feed. When you're done, summarize what you accomplished in a final \`milestone\` event.

Good luck. The gods are watching. ⚡
`;

  return prompt;
}

/**
 * Select which gods are active based on the detected tech stack.
 * Apollo is always active. Others are activated based on stack relevance.
 */
function selectActiveGods(stacks: string[]): typeof GOD_REGISTRY {
  const active = new Set<string>(['apollo']); // Apollo is always active (master planner)

  const stackLower = stacks.map(s => s.toLowerCase());

  // Activate gods based on stack — roles aligned with canonical Olympus spec
  // Frontend stacks → Athena (Frontend / Design)
  if (stackLower.some(s => ['next.js', 'react', 'vue', 'angular', 'svelte', 'tailwind', 'css', 'scss', 'figma', 'radix', 'shadcn'].includes(s))) {
    active.add('athena');
  }
  // Backend stacks → Hephaestus (Backend / Infrastructure)
  if (stackLower.some(s => ['express', 'fastify', 'nest.js', 'django', 'flask', 'fastapi', 'spring', 'rails', 'gin', 'fiber', 'echo', 'node', 'bun', 'python', 'rust', 'go', 'java'].includes(s))) {
    active.add('hephaestus');
  }
  // Database stacks → Persephone (Database / Persistence)
  if (stackLower.some(s => ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'prisma', 'drizzle', 'typeorm', 'sequelize', 'sqlalchemy', 'gorm'].includes(s))) {
    active.add('persephone');
  }
  // Integration stacks → Hermes (Integrations / APIs / MCPs)
  if (stackLower.some(s => s.includes('api') || s.includes('integration') || s.includes('webhook') || s.includes('graphql') || s.includes('rest'))) {
    active.add('hermes');
  }
  // Testing stacks → Dionysus (QA / Testing)
  if (stackLower.some(s => ['jest', 'vitest', 'pytest', 'cargo-test', 'go-test', 'cypress', 'playwright', 'mocha'].includes(s))) {
    active.add('dionysus');
  }
  // Always add security and devops gods for production projects
  active.add('artemis');   // Security — always relevant
  active.add('prometheus'); // DevOps — always relevant

  return GOD_REGISTRY.filter(g => active.has(g.id));
}

/**
 * Build TUI-specific instructions.
 * v0.0.1 — OpenCode-only. The 'generic' branch covers any external TUI
 * that can read markdown (kept for handoff prompts that may be piped to
 * non-OpenCode tools for ad-hoc use).
 */
function buildTuiInstruction(tui: HandoffContext['targetTui']): string {
  switch (tui) {
    case 'opencode':
      return `## 🔧 OpenCode Instructions

You are running in OpenCode. The Olympus config (\`opencode.json\`) is already set up with:
- 10 gods as sub-agents (Apollo primary + 8 specialists + Callimachus + Atlas). Use /olympus-dispatch <god> to manually dispatch.
- MCP servers for vault access and library docs (context7, serena, github — all wrapped with mcp-compressor for 70-97% schema reduction)
- Instincts that enforce vault conventions

Write to the vault via the standard filesystem tools (read/write/edit). MCP output compression is handled by tamp (lossless, configured in opencode.json).`;

    default:
      return `## 🔧 Instructions

You are running in an external TUI. Follow the Olympus vault conventions. Append progress to the activity feed as described above.`;
  }
}

/**
 * Save the handoff prompt to the project directory.
 * Returns the absolute path to the saved file.
 */
export function saveHandoffPrompt(prompt: string, projectSlug: string): string {
  const projectDir = path.join(VAULT, '02_Projects', projectSlug);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  const handoffPath = path.join(projectDir, '_handoff.md');
  fs.writeFileSync(handoffPath, prompt, 'utf-8');
  return handoffPath;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SYMPHONY — Optional Vibrational Handoff
// ─────────────────────────────────────────────────────────────────────────────
//
//  The functions below are the Symphony-aware extensions to the handoff
//  prompt builder. They allow the intake orchestrator to optionally emit
//  a VibrationalSignature INSTEAD of (or alongside) a textual handoff
//  prompt. The textual prompt remains available as the Decoding Choir's
//  fallback path — Axiom A4 of the Symphony protocol.
//
//  See: src/lib/symphony/ for the full protocol implementation.
//  See: ARCHITECTURE.md § "Symphony" for the architectural vision.

import {
  composeSignature,
  type VibrationalSignature,
} from './symphony';
import { signatureToLegacyPrompt as _signatureToLegacyPrompt } from './symphony-bridge';

/**
 * Compose a VibrationalSignature from a HandoffContext.
 *
 *  The handoff context is converted into a free-text payload (using the
 *  existing buildHandoffPrompt function), then wrapped into a signature.
 *  The original textual prompt is preserved in the Vault's Resonance
 *  Registry — zero-loss.
 *
 *  Returns:
 *    - signature : the VibrationalSignature ready for broadcast
 *    - legacyPrompt : the original textual prompt (for fallback / legacy
 *                     sub-agents that haven't been Symphony-enabled yet)
 */
export function composeSymphonicHandoff(
  ctx: HandoffContext,
  targetOrchestra: string[],
): {
  signature: VibrationalSignature;
  legacyPrompt: string;
} {
  const legacyPrompt = buildHandoffPrompt(ctx);
  const signature = composeSignature({
    composer: 'apollo', // Apollo is the master planner that owns the handoff
    payload: legacyPrompt,
    targetOrchestra,
    broadcastMode: 'parallel',
  });
  return { signature, legacyPrompt };
}

/**
 * Reconstruct a textual handoff prompt from a VibrationalSignature.
 *
 *  This is the Decoding Choir's fallback path: if the Choir detects
 *  coherence below the safe threshold, it can re-materialize the original
 *  prompt from the signature's Vault anchor and dispatch it textually.
 *
 *  In Symphony mode (coherence ≥ 0.90), this function is NOT called —
 *  the Choir synthesizes a fresh, polished response directly from the
 *  consensus.
 */
export function reconstructHandoffFromSignature(
  signature: VibrationalSignature,
): string {
  return _signatureToLegacyPrompt(signature);
}
