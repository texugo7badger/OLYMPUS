---
name: ffmpeg-asset
description: Process vault assets with FFmpeg — thumbnails, format converts, spritesheet slicing, audio extraction. Use when an asset needs media processing.
license: MIT
opencode/autoinvoke: "false"
---

# FFmpeg Asset

The deterministic media lane (no LLM tokens on the transform itself).

## Shapes
- Thumbnail: `ffmpeg -i <in> -vf scale=320:-1 <out>`
- Convert: `ffmpeg -i <in> -vf format=rgba <out.png>`
- Slice a spritesheet: `ffmpeg -i sheet.png -vf crop=64:64:x:y out.png` (per-cell, scripted)
- Audio from video: `ffmpeg -i <in> -vn -acodec copy <out>`

## Rules
- Work ONLY inside `~/OLYMPUS-VAULT/10_Media_Vault/` — outputs land in the vault (never the repo).
- Every output gets the Argos pass when it's an image (art-vlm).
