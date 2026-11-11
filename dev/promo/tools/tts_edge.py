#!/usr/bin/env python3
"""Synthesize one sentence with edge-tts and print word boundaries as JSON.

usage: tts_edge.py <voice> <rate> <pitch> <out.mp3> <text>

Prints {"words": [{"text", "start", "end"}]} (seconds) on stdout. Exits non-zero when the
service returns no audio (for example on networks that do not relay binary WebSocket frames).
"""
import asyncio
import json
import os
import sys


def main() -> int:
    voice, rate, pitch, out, text = sys.argv[1:6]
    try:
        import certifi  # edge-tts pins certifi; honour a corporate/sandbox CA bundle if one is set

        ca = os.environ.get("SSL_CERT_FILE")
        if ca and os.path.exists(ca):
            certifi.where = lambda: ca
        import edge_tts
    except ImportError:
        print("edge-tts is not installed (pip install edge-tts)", file=sys.stderr)
        return 3

    async def run() -> dict:
        kwargs = dict(rate=rate, pitch=pitch)
        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
        if proxy:
            kwargs["proxy"] = proxy
        try:
            comm = edge_tts.Communicate(text, voice, boundary="WordBoundary", **kwargs)
        except TypeError:  # edge-tts < 7.1 has no `boundary` argument and emits words by default
            comm = edge_tts.Communicate(text, voice, **kwargs)
        words = []
        size = 0
        with open(out, "wb") as fh:
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    fh.write(chunk["data"])
                    size += len(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    start = chunk["offset"] / 1e7
                    words.append({"text": chunk["text"], "start": start, "end": start + chunk["duration"] / 1e7})
        if size == 0:
            raise RuntimeError("no audio received")
        return {"words": words}

    try:
        result = asyncio.run(asyncio.wait_for(run(), timeout=45))
    except Exception as exc:  # noqa: BLE001 - report and let the caller fall back
        print(f"edge-tts failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
