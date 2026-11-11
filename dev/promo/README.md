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
src/hands.js               Articulated hands (palm, phalanges, thumb) and two-bone IK arms; poses blend
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

1. **ElevenLabs** — the voice in the committed film. Each scene is one take, saved in
   `assets/voice/` with its word timings, so a rebuild reuses the approved read and spends no
   credits. A new take is only requested (and `ELEVENLABS_API_KEY` only needed) when a line or
   the voice in `script/voiceover.json` changes. `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL`
   override the voice and model.
2. **`./voiceover.wav`** when that file exists — a finished 35 s voice track you recorded.
3. **edge-tts**, `el-GR-AthinaNeural`, `+8%`, `+2Hz`.
4. **gTTS** (Google's Greek voice over plain HTTPS) when edge-tts cannot be reached.

Force one with `--provider edge|gtts|elevenlabs|file`. Each scene's clip is placed on its scene
timestamp and time-fitted to the scene; the build fails with a clear message if a line is too
long for its window. A whole-scene take that runs long has its longest pauses shortened
before any speed-up is applied, so the words themselves stay close to natural pace. Word timings
for the captions come from the provider when it reports them, otherwise from the pauses found in
the audio plus a per-syllable estimate.

The voice then goes through the broadcast chain (85 Hz high-pass, presence at 3.5 kHz, air at
10 kHz, 3:1 compressor at −18 dB), the music is sidechain-ducked under it (the ratio is solved
so the measured drop is about −8 dB), and the mix is normalised to −14 LUFS / −1 dBTP.

The committed MP4 uses the ElevenLabs library voice "Christina - Calm, Warm and Sultry" on
`eleven_v4`. To audition another voice, change `voice.elevenLabs.voiceId` in
`script/voiceover.json` and run `npm run audio` with the key set; the seven takes cost roughly
a few hundred credits.

## Editing the copy

- Voice and captions: `script/voiceover.json` (`text` is shown, `say` is read; keep the word
  counts equal). `brief` keeps the full line from the creative brief for reference.
- On-screen headlines and badges: the scene files in `src/scenes/`.
- Timing of any beat: `src/cues.js` moves picture and sound together.
