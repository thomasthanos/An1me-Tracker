#!/usr/bin/env python3
"""Synthesize one sentence with ElevenLabs API and print word boundaries as JSON.

usage: tts_elevenlabs.py <voice_id> <model> <seed> <out.mp3> <text>

Prints {"words": [{"text", "start", "end"}]} on stdout.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    if len(sys.argv) < 6:
        print("Usage: tts_elevenlabs.py <voice_id> <model> <seed> <out.mp3> <text>", file=sys.stderr)
        return 1

    voice_id, model, seed_str, out_file, text = sys.argv[1:6]
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        print("ELEVENLABS_API_KEY is not set", file=sys.stderr)
        return 2

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128"
    payload = {
        "text": text,
        "model_id": model,
        "language_code": "el",
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.8},
    }
    try:
        seed = int(seed_str)
        payload["seed"] = seed
    except (ValueError, TypeError):
        pass

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "xi-api-key": api_key,
            "content-type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")
        print(f"ElevenLabs {e.code}: {err_msg[:300]}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"ElevenLabs request error: {e}", file=sys.stderr)
        return 1

    audio_b64 = body.get("audio_base64", "")
    if not audio_b64:
        print("No audio received from ElevenLabs", file=sys.stderr)
        return 1

    with open(out_file, "wb") as f:
        f.write(base64.b64decode(audio_b64))

    al = body.get("alignment") or body.get("normalized_alignment") or {}
    chars = al.get("characters", [])
    starts = al.get("character_start_times_seconds", [])
    ends = al.get("character_end_times_seconds", [])

    words = []
    cur = None
    for i, ch in enumerate(chars):
        if ch.isspace():
            if cur:
                words.append(cur)
                cur = None
            continue
        if not cur:
            cur = {"text": "", "start": starts[i] if i < len(starts) else 0.0, "end": 0.0}
        cur["text"] += ch
        if i < len(ends):
            cur["end"] = ends[i]
    if cur:
        words.append(cur)

    print(json.dumps({"words": words}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
