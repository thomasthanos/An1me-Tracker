#!/usr/bin/env python3
"""Fallback voice: Google Translate TTS (plain HTTPS, female Greek voice).

usage: tts_gtts.py <lang> <out.mp3> <text>
"""
import sys


def main() -> int:
    lang, out, text = sys.argv[1:4]
    try:
        from gtts import gTTS
    except ImportError:
        print("gTTS is not installed (pip install gTTS)", file=sys.stderr)
        return 3
    try:
        gTTS(text, lang=lang).save(out)
    except Exception as exc:  # noqa: BLE001
        print(f"gTTS failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
