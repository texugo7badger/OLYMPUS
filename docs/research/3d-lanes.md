# The 3D Lanes — the honest state (v0.0.6, W-C FORGE-2D/3D)

> The t2-3D lane, declared with its requirements and its current status on
> THIS box. No fake "coming soon" — every lane below says what it needs and
> where it stands. The plan doc (2026-10-19) ships the vault's GLB input
> channel (upload + serving + the FORGE-3D viewer) NOW; the generation lanes
> ride the states below.

## What ships NOW (probe-verified code, no key, no GPU)

- **GLB ingestion** — the Media Vault accepts `model/gltf-binary` +
  `model/gltf+json` (the `.glb` filename sniff covers browser octet-stream
  mimes); the assets route serves the right content-type; FORGE-3D renders
  GLB via @google/model-viewer (Apache-2.0) with orbit/zoom/auto-rotate; 2D
  assets get the honest labeled 2D look in the same viewport.
- **Blender (the heavy editor)** — registered as an opencode.json MCP
  (`mcp-for-blender`, GPL Blender stays a separate process; DISABLED by
  default — the W-E panel toggles it). Blender itself must be installed
  (PATH or flatpak) for the MCP to find it.

## The LOCAL generation lane — TRELLIS (PARKED on this box)

[microsoft/TRELLIS](https://github.com/microsoft/TRELLIS) (MIT, CVPR'25
Spotlight, 14k stars): text/image -> 3D as GLB — the exact pygmalion
"Daedalus pipeline" fit.

**Requirements (the official install):** Linux + an **NVIDIA GPU with at
least 16GB VRAM** (verified on A100/A6000), CUDA Toolkit 11.8/12.2, conda,
plus the submodule build (diffoctreerast/spconv/kaolin/nvdiffrast — the
`setup.sh --new-env` campaign) and the pretrained models from Hugging Face
(TRELLIS-image-large 1.2B / TRELLIS-text-large 1.1B).

**This box: NO NVIDIA GPU** (no `nvidia-smi`) — the lane is **PARKED
HONEST**. The install campaign when a GPU exists: CUDA toolkit + the
`setup.sh` build (~30-60 min) + the HF model downloads (~2-5GB). No code
wiring is done until the lane can be probed green on real hardware —
probe-first, committed only on green.

## The HOSTED BYOK candidate — Meshy (DECLARED, wiring deferred)

[Meshy](https://meshy.ai) (REST API, free credits + pay-as-you-go):
text-to-3D + image-to-3D with GLB export — the no-GPU path to generated 3D.

**Status: declared candidate only.** The wiring lands BEHIND a key
(`MESHY_API_KEY` in the API Keys dialog, the image-gen W-B pattern: locked
rungs named honestly, the free lanes always first). Nothing is wired until
the user opts in — no new paid dependency ships by default.

## The demigods that own the lanes

- `daedalus` (hephaestus) — the 3D specialist: GLB/mesh pipelines, Blender
  via the MCP, the TRELLIS local lane operator (when the GPU exists), the
  hosted-candidate evaluator.
- `apelles` (hephaestus) — the 2D specialist: vector/raster/SVG, the
  Excalidraw forge lane, Krita/Inkscape deep-links.

Both carry the honest-lane doctrine: a lane that cannot run here says so,
never a narrated success (#105).

*License: AGPL-3.0-or-later (original OLYMPUS code).*
