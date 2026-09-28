# Contributing to OLYMPUS

Thanks for your interest in contributing to OLYMPUS! This guide covers the contribution workflow, code style, and how to add new demigods, skills, and MCPs.

## Before You Start

1. **Read [AGENTS.md](AGENTS.md)** — understand the 10-god / 118-demigod architecture and the Symphony dispatch protocol.
2. **Accept the [CLA](CLA.md)** — every contributor must sign the Contributor License Agreement. The first time you open a PR, [CLA Assistant 2.0](https://cla-assistant.io/) posts a one-click acceptance link. Your PR cannot be merged until the CLA is signed.
3. **Open an issue first** for non-trivial changes — it's faster for everyone to align on scope before you write code.

## Development Setup

```bash
git clone https://github.com/texugo7badger/olympus.git
cd olympus
npm install
python3 scripts/seed-vault.py
node scripts/build-skill-index.js
npm run dev
```

Verify the install:

```bash
node scripts/olympus-doctor.js
# Should report 0 failures
```

## Contribution Workflow

1. **Fork + branch** — `git checkout -b feat/<short-description>`.
2. **Implement** — follow the code style below.
3. **Test locally** — `npm run dev` and exercise the feature in the app.
4. **Open a PR** against `main` — describe what changed and why. Link the issue if applicable.
5. **CLA check** — CLA Assistant posts on your PR; click the link to accept.
6. **Review** — a maintainer reviews. Address feedback in-place (don't force-push mid-review).
7. **Merge** — squash-merge by default.

---

## Adding a new demigod

1. Create `.opencode/prompts/agents/demigods/<god>/<name>.txt`:

   ```markdown
   # <Display Name>

   ## Identity

   <One-line description of what this demigod does.>

   ## Mission

   <Detailed mission statement.>

   ## Critical Rules

   - <Rule 1>
   - <Rule 2>

   ## Deliverables

   - <Deliverable 1>

   ## Workflow

   1. <Step 1>
   2. <Step 2>

   ## God Review Protocol

   Report your result to your governing god using this format:

   \```
   ## Result
   <one-sentence outcome>

   ## Changes
   <bulleted list of files touched>

   ## Verification
   <what you ran to verify>

   ## Confidence
   <high / medium / low>

   ## Needs Review
   <what the god should double-check>
   \```
   ```

2. Register the demigod in `opencode.json` under the `agent` block:

   ```json
   "<name>": {
     "description": "<One-line description>",
     "mode": "subagent",
     "model": "opencode-go/<model>",
     "prompt": "{file:.opencode/prompts/agents/demigods/<god>/<name>.txt}",
     "tools": { "read": true, "write": true, "edit": true, "bash": true }
   }
   ```

3. The demigod appears in the God Detail panel + Cost Dashboard automatically (the dispatch-graph API reads from disk).
4. If the demigod should appear in the GOD_DISPATCH_CATALOG (for rich task descriptions), add it to `src/app/api/olympus/god/dispatch-graph/route.ts`.

---

## Adding a new skill

1. Create `.opencode/skills/<skill-name>/SKILL.md` with frontmatter:

   ```yaml
   ---
   name: <Skill Name>
   description: <One-line description>
   tags: [react, frontend, performance]
   ---

   # Skill body...
   ```

2. The skill appears in the brain atlas + vault summary once a god masters it (add it to `.opencode/vault-brain/mastered-skills/<god>.md`).
3. Rebuild the skill index: `node scripts/build-skill-index.js`

---

## Adding a new MCP

1. Add the server to `.mcp.json`:

   ```json
   {
     "mcpServers": {
       "<name>": {
         "command": "npx",
         "args": ["-y", "<package>"],
         "env": { "API_KEY": "${API_KEY}" }
       }
     }
   }
   ```

2. If the MCP requires an API key, add it to `MCP_API_REQUIREMENTS` in:
   - `.opencode/olympus/lib/mcp-gate.ts` (runtime gate)
   - `src/app/api/olympus/mcp/list/route.ts` (UI status)
   - `src/components/olympus/api-config-dialog.tsx` (UI entry form)
3. Register the MCP's tier (hot/warm/cold) in `.opencode/plugins/olympus-router/src/mcp-tiers.ts` — this is the single source of truth for per-god MCP tiers. The `selectMcpsForTask()` function uses this to decide which MCPs to equip for a given task.
4. Add the MCP to the appropriate god's mcps array in `src/app/api/olympus/god/dispatch-graph/route.ts` (the `GOD_DISPATCH_CATALOG`).
5. If the MCP replaces an existing one, update any god/demigod prompts that reference the old MCP. Search `.opencode/prompts/agents/` for the old MCP name.

---

## Code style

- **TypeScript**: strict mode, NodeNext module resolution, `.js` extensions in imports.
- **Comments**: concise, explain WHAT the code does (not WHY it was changed). No patch history, no version notes.
- **License header**: all OLYMPUS-original `.ts`/`.tsx`/`.js` files must include `License: AGPL-3.0-or-later (original OLYMPUS code).` in the docblock. Vendored upstream files retain their own MIT/Apache license.
- **No emojis** in prompts, rules, or vault files (OpenCode GO plan compatibility).

---

## Building

```bash
npm install
python3 scripts/seed-vault.py
node scripts/build-skill-index.js
npm run dev
```

Verify: `node scripts/olympus-doctor.js` — should report 0 failures.

---

## Reporting bugs

Open a [GitHub issue](https://github.com/texugo7badger/olympus/issues) with:

- OLYMPUS version (`cat VERSION`).
- OS + Node version.
- Steps to reproduce.
- Expected vs actual behavior.
- Relevant logs from `~/.olympus/logs/` (if any).

---

## Reporting security vulnerabilities

Do **not** open a public issue for security bugs. See [SECURITY.md](SECURITY.md) for the disclosure process.
