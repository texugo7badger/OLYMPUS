---
name: art-vlm
description: Describe, tag, and analyze any image via the Argos VLM cascade (OpenRouter free vision — Gemma 4 31B/26B, dots-3-note). Use when a vault asset needs its Argos pass, when the user asks what an image shows, or to batch-tag assets.
license: MIT
opencode/slash: "true"
opencode/autoinvoke: "false"
---

# Art VLM (Argos)

Feed an image to the vision cascade and write the structured result into the vault entry.

## Method
1. Read the asset (the vault path from the Media Vault: `~/OLYMPUS-VAULT/10_Media_Vault/images/`).
2. Call the describe route: `POST /api/olympus/atelier/describe {id}` — the cascade runs Gemma 4 31B :free → 26B → dots-3-note :free (first green wins).
3. The entry's frontmatter gets description, tags, dominant_colors, suggested_use.

## Rules
- NEVER invent what you cannot see — the cascade's own words land verbatim.
- The tags feed the search: prefer terms an artist would search by.
- NO Nemotron lanes (the user's ban, forever).
