# olympus-skill-registry

Auto-discovers skills created by gods and registers them in OpenCode's config.

## What it does

When a god creates a new skill via the `skill-author` tool, the skill is
written to `.opencode/skills/<god>/<skill_name>/SKILL.md`. This plugin
re-scans the skills directory on every `config` hook and adds any
newly-discovered skill paths to `config.skills.paths`.

This means god-created skills are immediately available on the next agent
step (within the same session) — no restart needed, no manual opencode.json
edit required.

## Why a plugin (not just opencode.json)

The opencode.json `skills.paths` array is a fixed list at session start.
But gods can create new skills DURING a session (via `skill-author`).
This plugin re-scans on every config hook, so newly-created skills are
picked up on the next agent step.

## Behavior

- On `config` hook: scans `.opencode/skills/<god>/` for SKILL.md files.
- Adds each god's skills directory to `config.skills.paths` (if not already present).
- Skips the `superpowers` directory (already registered separately).
- Skips hidden directories.
- Idempotent — running multiple times is a no-op.
- Non-blocking — errors are logged but do not crash the session.

## Quality constraints

- All `.on('error', (err) => ...)` use `(err: any)`.
- All `child.stdout`/`child.stderr` use `?.`.
- Never uses `import.meta.url` (this is a `.opencode/` plugin file).
- Cross-platform — Windows, macOS, Linux.
- No emojis.
