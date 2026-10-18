---
name: art-generate
description: Generate images via Pygmalion — the free Pollinations lane first, the BYOK price ladder for finals (SDXL-turbo drafts, FLUX, Nano Banana finals). Use when the user asks to create/forge/generate an image.
license: MIT
opencode/slash: "true"
---

# Art Generate (Pygmalion)

## Method
1. Enrich the prompt: add art direction (light, composition, palette, camera) WITHOUT changing the user's intent.
2. Call `POST /api/olympus/atelier/generate {prompt, width, height}` — the free lane (Pollinations/flux, $0, ~1 img/15s).
3. The asset lands in the Media Vault; give it the Argos pass (art-vlm) so it stays searchable.

## Price ladder (when the user asks for finals)
- Drafts: the free lane or SDXL-turbo (~$0.0002/img BYOK).
- Finals: FLUX schnell → Nano Banana / Imagen 4 Fast (~$0.02/img) — state the lane + the cost every time (honest counting).
