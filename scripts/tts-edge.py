#!/usr/bin/env python3
"""
tts-edge.py — v0.0.34: the free neural voice lane (edge-tts).

Reads the text from stdin, writes MP3 audio to stdout. Voice/rate/pitch come
from argv. This is the open-source `rany2/edge-tts` project (GPL-3.0), using
Microsoft Edge's free neural voices — no API key.

Usage:
  python3 scripts/tts-edge.py <voice> <rate> <pitch> < text > out.mp3

License: AGPL-3.0-or-later (OLYMPUS wrapper); edge-tts is GPL-3.0.
"""
import asyncio
import sys

import edge_tts


async def main() -> None:
    voice = sys.argv[1] if len(sys.argv) > 1 else "en-US-AndrewNeural"
    rate = sys.argv[2] if len(sys.argv) > 2 else "-4%"
    pitch = sys.argv[3] if len(sys.argv) > 3 else "-1Hz"
    text = sys.stdin.read().strip()[:900]
    if not text:
        return
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    async for chunk in communicate.stream():
        if chunk.get("type") == "audio" and chunk.get("data"):
            sys.stdout.buffer.write(chunk["data"])
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    asyncio.run(main())
