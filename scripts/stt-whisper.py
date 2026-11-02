#!/usr/bin/env python3
"""
stt-whisper.py — v0.0.34: the free local speech-to-text lane.

Decodes any MediaRecorder/audio file with ffmpeg to 16 kHz mono PCM, then
transcribes it with faster-whisper (MIT, local, no API key). Bypasses
faster-whisper's PyAV decoder (the `metadata_errors` incompatibility) by
passing a numpy array.

Usage:
  python3 scripts/stt-whisper.py <audio-file> <language>

Prints one JSON line: {"text": "...", "language": "pt", "probability": 1.0}
License: AGPL-3.0-or-later (OLYMPUS wrapper); faster-whisper is MIT.
"""
import json
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel


def main() -> None:
    file = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "en"
    lang = lang.split("-")[0].lower()
    raw = subprocess.check_output(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", file,
            "-f", "s16le", "-ac", "1", "-ar", "16000", "-",
        ]
    )
    audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
    model = WhisperModel("base", device="cpu", compute_type="int8")
    prompt = (
        "OLYMPUS, Apollo, Athena, Hephaestus, Hermes, Artemis, Dionysus, "
        "Persephone, Prometheus, Callimachus, Atlas, AIME, walk, hop, design."
    )
    segments, info = model.transcribe(
        audio,
        language=lang if lang in {"en", "pt", "es", "fr", "de", "ja", "zh"} else None,
        beam_size=1,
        initial_prompt=prompt,
    )
    text = " ".join(s.text.strip() for s in segments).strip()
    print(json.dumps({"text": text, "language": info.language, "probability": round(info.language_probability, 3)}))


if __name__ == "__main__":
    main()
