---
description: Create a new skill + seed instinct from a recurring pattern. Routes to Callimachus, the vault-curator god, who delegates to the owning god's domain.
agent: callimachus
---

# /skill-create <name-or-pattern>

Create a new skill for yourself or your demigods and crystallize it as a
seed instinct. Used when a recurring pattern is observed that no existing
skill covers and that an empirical instinct with confidence ≥ 0.85 has
already confirmed works (a "quick circuit").

## Usage

```
/skill-create <pattern-keywords>        # free-form — Callimachus will
                                         #   scaffold the frontmatter and
                                         #   propose a `god` + `skill_name`.
/skill-create --god <id> --name <kebab-name>   # explicit bindings
```

## Args

- `<pattern-keywords>` (optional, inline): a short description of the pattern.
  Used to seed the `trigger` + `action` fields and to scope the de-dup check.
- `--god <id>` (optional): the god whose domain the skill belongs to
  (e.g. `artemis`, `athena`, `hephaestus`). Defaults to the active god when
  Callimachus dispatches.
- `--name <kebab-name>` (optional): the skill directory / id (kebab-case).
  Callimachus proposes one from the trigger if omitted.

## When to use

Use this command — or have a god call the `olympus-skill-author` tool
autonomously — when **both** of the following hold:

1. You (or the god) have observed a recurring pattern that no existing skill
   covers. Confirm by searching `~/.opencode/skills/<god>/` and by running
   `/skill-search "<the pattern>"`.
2. An empirical instinct for the pattern has confidence ≥ 0.85 and
   ≥ 5 samples. Confirm via `/instinct-status <god>` (it lists each
   instinct's `confidence`, `samples`, `successes`, `failures`).

If the instinct has not crystallized yet, DO NOT call this command — run
`/callimachus-heartbeat` first (RECALIBRATE updates confidence from
`dispatch_outcome` events in `live.jsonl`) and wait for the next session.idle
tick.

## Workflow

1. Verify the pattern matches a quick circuit. Run `/instinct-show <god>`
   and confirm: confidence ≥ 0.85, samples ≥ 5, scope matches the task.
2. Equip `writing-skills` (it's in the active god's dynamic skill pool).
3. Call the `olympus-skill-author` tool with:
   - `god` — owning god ID (e.g., `artemis`, `athena`).
   - `skill_name` — kebab-case name (e.g., `secrets-detection-patterns`).
   - `domain` — owning domain (`security` / `frontend` / `backend` /
     `database` / `devops` / `vault`).
   - `trigger` — the task signature that activates the skill.
   - `action` — one sentence describing what the skill does.
   - `patterns` — the reusable patterns lifted from the instinct
     (array of strings).
   - `best_practices` — what worked in successful dispatches
     (array of strings).
   - `examples` — concrete code / payload examples (array of strings).
   - `for_demigod` — (optional) if the skill is for a specific demigod.
4. The `olympus-skill-author` tool creates:
   - `.opencode/skills/<god>/<skill_name>/SKILL.md`
   - `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/seed/<skill_name>.md`
   - Registers the skill in `opencode.json` (appends to the dynamic pool).
5. The `olympus-skill-registry` plugin auto-discovers the new skill on the
   next agent step — no restart needed.
6. Future dispatches auto-equip the skill via the instinct gate: when the
   trigger matches, the high-confidence instinct fires and the skill is
   loaded into the active god's hot/warm/cold pool.

## Autonomous use by gods

Gods do **not** need a user to type `/skill-create`. When a god's instinct
gate detects a high-confidence quick circuit (returned by the
`olympus-instinct-query` tool with `shortCircuitCandidate` set), the god
calls `olympus-skill-author` directly. The slash command in this file is
the user-facing entry point; the tool is the autonomous one. Both share the
same contract above.

## Output format

```
✓ Skill created: .opencode/skills/artemis/secrets-detection-patterns/SKILL.md
✓ Seed instinct:  ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/artemis/seed/secrets-detection-patterns.md
✓ Registered:     opencode.json (skills.paths appended)
                  Available on next agent step via olympus-skill-registry.

Next:
  The skill is immediately loadable. Run /skill-search "secrets-detection"
  to confirm scoring, or /instinct-show artemis to verify the seed appeared.

Quality gates:
  - skill_name is kebab-case (lowercase + hyphens).
  - patterns + best_practices + examples are concrete (not generic).
  - De-duplicated: no existing skill in .opencode/skills/ already covers
    the same trigger (checked before write).
```

## Example

Slash-invoked (user-driven):

```
/skill-create artemis · secrets-detection · AWS/GitHub token patterns in code review
```

Autonomous (god-driven) — a god calls the tool with the explicit args
without ever typing a slash command:

```
olympus-skill-author({
  god: "artemis",
  skill_name: "secrets-detection-patterns",
  domain: "security",
  trigger: "code review for hardcoded secrets",
  action: "Detect hardcoded API keys, tokens, passwords, and private keys in source code",
  patterns: [
    "Scan for AWS access key pattern (AKIA[0-9A-Z]{16})",
    "Scan for GitHub token pattern (gh[pousr]_[A-Za-z0-9]{36})",
    "Scan for private key headers (-----BEGIN)"
  ],
  best_practices: [
    "Always check .env files — even if gitignored, they may be in history.",
    "Verify each candidate is a real secret, not a placeholder or test fixture.",
    "Check rotation status for any real secret found."
  ],
  examples: [
    "AKIAIOSFODNN7EXAMPLE",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB",
    "-----BEGIN RSA PRIVATE KEY-----"
  ]
})
```

## Quality

- The `skill_name` must be kebab-case (lowercase + hyphens).
- `patterns` + `best_practices` + `examples` must be concrete, not generic.
- The skill must NOT duplicate an existing skill — Callimachus runs a
  case-insensitive `--name` collation check + a trigger-overlap check
  (Jaccard ≥ 0.7 against any existing skill's `trigger` frontmatter)
  before invoking `olympus-skill-author`. If overlap is detected, the
  command surfaces the conflicting skill instead and refuses the write.

$ARGUMENTS