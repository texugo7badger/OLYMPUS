# Image generation — the background lane

> The Atelier is **not a left-menu surface** (v0.0.32). It is an API behind the
> app: the gods and the project design use it when a generated image is the
> right answer, never as decoration.

## What it is

A provider ladder with honest availability — the keys in hand decide, and a
locked rung is refused by name (never a silent downgrade):

| Lane | Provider | Key | Price hint | Use |
|---|---|---|---|---|
| `pollinations/flux` | Pollinations | none | **$0** | always-on drafts |
| `byok/sdxl-turbo` | fal | `FAL_KEY` | ~$0.0002/img | fast drafts |
| `byok/flux-schnell` | fal | `FAL_KEY` | ~$0.003/img | drafts |
| `byok/nano-banana-edit` | fal | `FAL_KEY` | ~$0.02/img | edits |
| `byok/nano-banana` | Google | `GOOGLE_AI_KEY` | ~$0.02/img | finals |

Add keys in **API Keys** (`~/.olympus/api-configs.json`); the MCP lane and this
lane read the same store. `GET /api/olympus/atelier/models` returns the catalog
with `available` + `needsKey` (never the key value).

## The API

```http
POST /api/olympus/atelier/generate
{ "prompt": "...", "model": "pollinations/flux", "width": 1024, "height": 1024, "seed": 42 }
→ { "ok": true, "asset": { "id": "...", "path": "..." }, "model": "...", "tier": "free", "priceHint": "$0" }
```

```http
POST /api/olympus/atelier/inject
{ "assetId": "...", "projectPath": "/abs/project", "name": "hero" }
→ { "ok": true, "ref": "/assets/hero.png" }
```

Other routes: `edit` (image-to-image), `describe` (the vision-describer pass),
`models`, `assets`, `upload`, `deeplink`.

## The agent tool

Gods call **`olympus-image`**:

- `prompt` (required), `model`, `width`, `height`, `seed`
- `projectPath` + `name` → generate **and** inject into
  `<project>/public/assets/`, returning the root-relative reference
- a missing key returns `needsKey` with the fix; the app being down returns an
  honest "start OLYMPUS (`olympus dev`)" message

The registry: `.opencode/olympus/tools/image-generate.ts`, registered in
`olympus-hooks.ts` as `olympus-image`.

## When it makes sense

Use a generated image when the design calls for a **visual artifact**: a hero,
an icon set, a texture, an empty-state illustration, a social card. Do not
generate what type, spacing and color already solve. Every asset lands in the
Media Vault and gets the vision-describer pass (describe + tags), so it stays
searchable and reusable.

## Notes

- The free lane is rate-limited (~1 img/15 s); a 429 says so and suggests a
  retry, never a fake success.
- The default output size is 1024×1024; pass `width`/`height` for banners.
- Reference images from the web are **links with provenance**, never copied
  assets without a license (ArtCraft rule).
