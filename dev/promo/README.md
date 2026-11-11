# An1me Tracker — Greek promo commercial

A 35.0 s, 1920×1080, 45 fps (1575 frames) commercial for the extension, built as a
[HyperFrames](https://hyperframes.heygen.com) composition with a generated soundtrack.
The finished file is [`an1me_tracker_promo_gr.mp4`](an1me_tracker_promo_gr.mp4).

Nothing here is loaded by the extension; the packager only copies its own allowlist.

## Build

Needs Node 22+, FFmpeg, Python 3 and a Chrome/Chromium for HyperFrames.

```sh
cd dev/promo
npm install
pip install edge-tts gTTS      # voice providers (see below)
npm run build                  # assets → audio → lint → render → mux → verify
```

| Command | What it does |
| :--- | :--- |
| `npm run build` | Everything, ending with the ffprobe verification and one still per scene in `.work/verify/` |
| `npm run audio` | Voiceover, music, SFX, mastering and caption timings only |
| `npm run render` | Re-render and re-mux with the existing audio |
| `npm run check` | HyperFrames lint + runtime + layout + contrast checks |
| `npm run preview` | Open the composition in HyperFrames Studio |

## How it is put together

```text
index.html                 Root composition: 7 scene compositions, overlays, <audio>
src/cues.js                The cue sheet shared by picture and sound
src/lib.js                 Seeded PRNG (mulberry32), easing, canvas painters, scene registration
src/characters.js          Kai and Rei — original SVG anime characters posed from the clock
src/ui.js                  The tracker popup and player, rebuilt from dev/screenshots + the real tokens/fonts
src/scenes/s1…s7.js        One file per scene
src/overlays.js            Cut wipes, flashes and the word-by-word Greek captions
src/*.generated.js         Written by the tools: inlined brand SVGs, caption timings
script/voiceover.json      The voiceover: caption text and the spelling the TTS voice reads
tools/build-promo.mjs      The one-command pipeline
tools/build-promo-audio.mjs + tools/lib/   Voice, music (128 BPM, F# minor), SFX, mastering, ducking
tools/sync-brand-assets.mjs                Pulls the SVGs from .github/assets and the fonts/icon from src/
```

**Timing is deterministic.** There are no CSS `@keyframes`, no `transition`, no timers and no
free-running `requestAnimationFrame`. Each scene registers a paused GSAP timeline and a
HyperFrames frame source, so every frame is a pure function of the frame number; randomness
comes from a seeded `mulberry32`. The README SVGs animate with CSS on GitHub, so
`sync-brand-assets.mjs` strips those rules and `src/lib.js` re-drives the same motions from the
clock. The soundtrack is synthesised the same way: a rebuild is sample-identical.

## Voiceover

`build-promo-audio.mjs` picks the first provider that works:

1. **ElevenLabs** when `ELEVENLABS_API_KEY` is set (`ELEVENLABS_VOICE_ID` optional).
2. **`./voiceover.wav`** when that file exists — a finished 35 s voice track you recorded.
3. **edge-tts**, `el-GR-AthinaNeural`, `+8%`, `+2Hz` — the intended default voice.
4. **gTTS** (Google's Greek voice over plain HTTPS) when edge-tts cannot be reached.

Force one with `--provider edge|gtts|elevenlabs|file`. Each scene's clip is placed on its scene
timestamp and time-fitted to the scene; the build fails with a clear message if a line is too
long for its window. Word timings for the captions come from the provider when it reports them,
otherwise from the pauses found in the audio plus a per-syllable estimate.

The voice then goes through the broadcast chain (85 Hz high-pass, presence at 3.5 kHz, air at
10 kHz, 3:1 compressor at −18 dB), the music is sidechain-ducked under it (the ratio is solved
so the measured drop is about −8 dB), and the mix is normalised to −14 LUFS / −1 dBTP.

The committed MP4 was built with provider 4: the build environment's proxy did not relay the
WebSocket audio frames edge-tts needs. Run `npm run build` on a normal connection to get the
Athina neural voice, or drop in `voiceover.wav` for a human read.

## Editing the copy

- Voice and captions: `script/voiceover.json` (`text` is shown, `say` is read; keep the word
  counts equal). `brief` keeps the full line from the creative brief for reference.
- On-screen headlines and badges: the scene files in `src/scenes/`.
- Timing of any beat: `src/cues.js` moves picture and sound together.
