---
name: asset-inject
description: Inject vault assets into a generated project — apps/sites get repo files (public/), games get Godot sprites/scenes via the pipeline. Use when a project needs its visuals wired in.
license: MIT
opencode/autoinvoke: "false"
---

# Asset Inject

The pipeline that makes the Atelier serve the builder.

## Method
1. Search the vault for the fit: `GET /api/olympus/atelier/assets?q=<style|subject>`.
2. For web apps: copy the asset into `<project>/public/assets/` and reference it (`/assets/<name>` — root-relative, so the exit gate's check 9 passes).
3. For games: spritesheets via ffmpeg-asset, then the Godot MCP (when enabled) loads them into Sprite2D nodes.
4. The exit gate check 9 verifies every referenced asset EXISTS — an injected asset that does not ship fails the gate.

## Rules
- The reference must be root-relative (`/assets/x.png`) — check 9's contract.
- Keep names kebab-case; never overwrite an existing project file silently.
