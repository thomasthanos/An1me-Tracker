#!/usr/bin/env node
// Builds the promo soundtrack: Greek female voiceover (7 clips on the scene timestamps),
// broadcast mastering, a synthesised 128 BPM F# minor backing track, anime SFX, sidechain
// ducking, and the final mastered stereo mix. Also writes the word timings the captions use.
//
//   node tools/build-promo-audio.mjs [--provider auto|elevenlabs|file|edge|gtts] [--no-cache]
//
// Voice provider order (auto): ELEVENLABS_API_KEY -> ./voiceover.wav -> edge-tts
// (el-GR-AthinaNeural, +8%, +2Hz) -> gTTS. Outputs:
//   .work/audio/promo_mix.wav          mastered stereo mix, 48 kHz / 24-bit (muxed into the MP4)
//   assets/audio/promo_mix.m4a         the same mix for the composition's <audio> (preview)
//   src/captions.generated.js          per-word caption timings
//   .work/audio/report.json            what was built, measured loudness and ducking depth
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "../src/cues.js";
import { SR, Stem, clamp, secs, writeWav } from "./lib/dsp.mjs";
import { BPM, renderMusic } from "./lib/music.mjs";
import { renderSfx } from "./lib/sfx.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = join(ROOT, ".work", "audio");
const CACHE = join(WORK, "tts-cache");
// ElevenLabs takes are committed, so a rebuild reuses the exact approved read and spends no credits.
const VOICE_DIR = join(ROOT, "assets", "voice");
const CUES = globalThis.PROMO_CUES;
const script = JSON.parse(readFileSync(join(ROOT, "script", "voiceover.json"), "utf8"));
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true) : def;
};
const NO_CACHE = flag("no-cache", false);
const DUCK_DB = -8; // how far the music drops under the voice
mkdirSync(CACHE, { recursive: true });
mkdirSync(join(ROOT, "assets", "audio"), { recursive: true });

const log = (...a) => console.log("[audio]", ...a);

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
  if (r.error) throw r.error;
  return r;
}
function ffmpeg(argv, { allowFail = false } = {}) {
  const r = run("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...argv]);
  if (r.status !== 0 && !allowFail) throw new Error("ffmpeg failed:\n" + r.stderr.slice(-2000));
  return r;
}
/** Decode any audio file to mono float samples at 48 kHz. */
function decodeMono(file, af) {
  const argv = ["-hide_banner", "-nostdin", "-v", "error", "-i", file];
  if (af) argv.push("-af", af);
  argv.push("-ac", "1", "-ar", String(SR), "-f", "f32le", "-");
  const r = spawnSync("ffmpeg", argv, { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error("decode failed for " + file + ": " + r.stderr.toString().slice(-500));
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.byteLength / 4)).slice();
}
function decodeStereo(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-i", file, "-ac", "2", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error("decode failed for " + file);
  const all = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.byteLength / 4));
  const st = new Stem(all.length / 2 / SR);
  for (let i = 0; i < st.n; i++) { st.L[i] = all[2 * i]; st.R[i] = all[2 * i + 1]; }
  return st;
}

// ---------------------------------------------------------------------------------------------
// Voice providers. Each returns { file, words? } for one sentence; `words` are provider word
// boundaries in seconds when the service reports them.
// ---------------------------------------------------------------------------------------------

const providers = {
  async elevenlabs(sentence, file) {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set and this line has no saved take in assets/voice/");
    const { id, model, seed, settings } = elevenVoice();
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ text: sentence.say, model_id: model, language_code: "el", seed, voice_settings: settings }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    writeFileSync(file, Buffer.from(body.audio_base64, "base64"));
    const al = body.alignment || body.normalized_alignment;
    let words;
    if (al?.characters) {
      words = [];
      let cur = null;
      al.characters.forEach((ch, i) => {
        if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } return; }
        if (!cur) cur = { text: "", start: al.character_start_times_seconds[i], end: 0 };
        cur.text += ch;
        cur.end = al.character_end_times_seconds[i];
      });
      if (cur) words.push(cur);
    }
    return { words };
  },
  async edge(sentence, file) {
    const { voice, rate, pitch } = script.voice.edgeTts;
    const r = run("python3", [join(ROOT, "tools", "tts_edge.py"), voice, rate, pitch, file, sentence.say]);
    if (r.status !== 0) throw new Error((r.stderr || "edge-tts failed").trim().split("\n").pop());
    let words;
    try { words = JSON.parse(r.stdout).words; } catch { /* timings are optional */ }
    return { words };
  },
  async gtts(sentence, file) {
    const r = run("python3", [join(ROOT, "tools", "tts_gtts.py"), script.voice.gtts.lang, file, sentence.say]);
    if (r.status !== 0) throw new Error((r.stderr || "gTTS failed").trim().split("\n").pop());
    return {};
  },
};
// Fastest read each provider needs before it stops sounding natural, and its natural floor.
const TEMPO = { elevenlabs: [1.0, 1.25], edge: [1.0, 1.35], gtts: [1.28, 1.5] };
// ElevenLabs reads a whole scene in one take, so the phrasing carries across sentences.
const SCENE_TAKES = { elevenlabs: true };

function elevenVoice() {
  const v = script.voice.elevenLabs;
  return {
    id: process.env.ELEVENLABS_VOICE_ID || v.voiceId,
    model: process.env.ELEVENLABS_MODEL || v.model,
    seed: v.seed ?? 1337,
    settings: v.settings || { stability: 0.45, similarity_boost: 0.8 },
  };
}
function takePath(provider, sentence) {
  const tag = provider === "elevenlabs" ? JSON.stringify(elevenVoice()) : JSON.stringify(script.voice[provider === "edge" ? "edgeTts" : provider] || {});
  const key = provider + "-" + createHash("sha1").update(tag + sentence.say).digest("hex").slice(0, 16);
  const dir = provider === "elevenlabs" ? VOICE_DIR : CACHE;
  return { file: join(dir, key + ".mp3"), meta: join(dir, key + ".json") };
}
/** The lines a provider is asked for: one per sentence, or one per scene. */
function takesFor(provider, sc) {
  if (!SCENE_TAKES[provider]) return sc.sentences;
  return [{ text: sc.sentences.map((x) => x.text).join(" "), say: sc.sentences.map((x) => x.say).join(" "), counts: sc.sentences.map((x) => x.text.trim().split(/\s+/).length) }];
}
async function synth(provider, sentence) {
  const { file, meta } = takePath(provider, sentence);
  if (!NO_CACHE && existsSync(meta) && existsSync(file)) return { file, ...JSON.parse(readFileSync(meta, "utf8")) };
  mkdirSync(dirname(file), { recursive: true });
  const out = await providers[provider](sentence, file);
  writeFileSync(meta, JSON.stringify({ say: sentence.say, ...out }));
  return { file, ...out };
}
const elevenSaved = () => script.scenes.every((sc) => takesFor("elevenlabs", sc).every((t) => existsSync(takePath("elevenlabs", t).file)));

function pickProviders() {
  const want = flag("provider", process.env.PROMO_TTS || "auto");
  if (want !== "auto") return [want];
  const list = [];
  if (process.env.ELEVENLABS_API_KEY || elevenSaved()) list.push("elevenlabs");
  if (existsSync(join(ROOT, "voiceover.wav"))) list.push("file");
  list.push("edge", "gtts");
  return list;
}

// ---------------------------------------------------------------------------------------------
// Word timing
// ---------------------------------------------------------------------------------------------

const plain = (w) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Greek syllable estimate: vowel nuclei, with the common digraphs counted once. */
function syllables(word) {
  const m = plain(word).match(/ου|αι|ει|οι|υι|αυ|ευ|[αεηιουω]|[aeiouy]+/g);
  return Math.max(1, m ? m.length : 1);
}
const PAUSE_AFTER = /(\.\.\.|…|[,;:·])$/;

function silences(file) {
  const r = run("ffmpeg", ["-hide_banner", "-nostdin", "-i", file, "-af", "silencedetect=noise=-38dB:d=0.05", "-f", "null", "-"]);
  const out = [];
  let start = null;
  for (const line of r.stderr.split("\n")) {
    let m = line.match(/silence_start: (-?[\d.]+)/);
    if (m) start = Math.max(0, parseFloat(m[1]));
    m = line.match(/silence_end: ([\d.]+)/);
    if (m && start !== null) { out.push([start, parseFloat(m[1])]); start = null; }
  }
  const dur = parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).stdout);
  if (start !== null) out.push([start, dur]);
  return { list: out, dur };
}

/**
 * Word timings (seconds, relative to the trimmed sentence, before tempo) for one sentence.
 * Uses provider boundaries when they line up with the script; otherwise spreads the words by
 * syllable weight, anchored on the pauses actually present in the audio at punctuation.
 */
function timeWords(sentence, tts, lead, speechEnd, inner) {
  const disp = sentence.text.trim().split(/\s+/);
  const say = sentence.say.trim().split(/\s+/);
  if (disp.length !== say.length) throw new Error(`text/say word counts differ: "${sentence.text}"`);
  const len = speechEnd - lead;
  if (tts.words && tts.words.length === say.length) {
    return disp.map((w, i) => ({ w, s: clamp(tts.words[i].start - lead, 0, len), e: clamp(tts.words[i].end - lead, 0, len) }));
  }
  // split into phrases at punctuation pauses
  const phrases = [[]];
  say.forEach((w, i) => { phrases[phrases.length - 1].push(i); if (PAUSE_AFTER.test(w) && i < say.length - 1) phrases.push([]); });
  const gaps = inner.filter(([a, b]) => b - a >= 0.1).sort((x, y) => y[1] - y[0] - (x[1] - x[0])).slice(0, phrases.length - 1).sort((x, y) => x[0] - y[0]);
  const spans = [];
  if (gaps.length === phrases.length - 1) {
    let a = 0;
    gaps.forEach(([gs, ge]) => { spans.push([a, gs - lead]); a = ge - lead; });
    spans.push([a, len]);
  } else {
    // no usable pauses: one span, pauses become extra weight
    spans.push([0, len]);
    phrases.splice(0, phrases.length, say.map((_, i) => i));
  }
  const out = new Array(say.length);
  phrases.forEach((idx, p) => {
    const [a, b] = spans[p];
    const weights = idx.map((i) => syllables(say[i]) + 0.35);
    const pauses = idx.map((i, k) => (k < idx.length - 1 && PAUSE_AFTER.test(say[i]) ? (/\.\.\.|…/.test(say[i]) ? 2.4 : 1.1) : 0));
    const total = weights.reduce((x, y) => x + y, 0) + pauses.reduce((x, y) => x + y, 0);
    let acc = 0;
    idx.forEach((i, k) => {
      const s = a + ((b - a) * acc) / total;
      acc += weights[k];
      const e = a + ((b - a) * acc) / total;
      acc += pauses[k];
      out[i] = { w: disp[i], s, e };
    });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Voiceover: synthesize, trim, fit each scene window, place on the scene timestamps
// ---------------------------------------------------------------------------------------------

async function buildVoice() {
  const vo = new Stem(CUES.duration);
  const captions = [];
  let used = null;
  let lastErr = null;

  for (const provider of pickProviders()) {
    try {
      if (provider === "file") {
        log("voice: using ./voiceover.wav as the finished voice track");
        const buf = decodeMono(join(ROOT, "voiceover.wav"));
        vo.add(buf.subarray(0, vo.n), 0, Math.SQRT1_2);
        for (const sc of script.scenes) {
          const words = sc.sentences.flatMap((s, si) => s.text.trim().split(/\s+/).map((w) => ({ w, si })));
          const weights = words.map((x) => syllables(x.w) + 0.35);
          const total = weights.reduce((a, b) => a + b, 0);
          const a = sc.start + 0.08, b = sc.end - 0.3;
          let acc = 0;
          captions.push({
            id: sc.id, start: sc.start, end: sc.end, voStart: a, voEnd: b, tempo: 1,
            words: words.map((x, i) => { const s = a + ((b - a) * acc) / total; acc += weights[i]; return { w: x.w, si: x.si, s, e: a + ((b - a) * acc) / total }; }),
          });
        }
        used = provider;
        break;
      }
      const [minTempo, maxTempo] = TEMPO[provider];
      const built = [];
      for (const sc of script.scenes) {
        const parts = [];
        for (const sentence of takesFor(provider, sc)) {
          const tts = await synth(provider, sentence);
          const { list, dur } = silences(tts.file);
          const lead = list.length && list[0][0] < 0.02 ? list[0][1] : 0;
          const last = list[list.length - 1];
          const speechEnd = last && last[1] > dur - 0.02 && last[0] > lead ? last[0] + 0.03 : dur;
          const inner = list.filter(([a, b]) => a > lead + 0.01 && b < speechEnd - 0.01);
          parts.push({ sentence, tts, lead, speechEnd, inner, len: speechEnd - lead, cuts: [], words: timeWords(sentence, tts, lead, speechEnd, inner) });
        }
        const PRE = 0.05; // breath before the first word
        // keep clear of the next scene's first word; the last line may ring closer to the end card
        const window = sc.end - sc.start - (sc === script.scenes[script.scenes.length - 1] ? 0.1 : 0.2);
        const minGap = 0.12;
        const fullLen = parts.reduce((a, p) => a + p.len, 0);
        let raw = fullLen;
        let need = raw / (window - PRE - minGap * (parts.length - 1));
        if (SCENE_TAKES[provider]) {
          // a presenter take breathes between sentences; when a scene is tight, shorten the long
          // pauses first and only then speed the words up
          for (const maxPause of [0.4, 0.3, 0.22, 0.16]) {
            if (need <= 1.06) break;
            for (const p of parts) {
              p.cuts = p.inner.filter(([a, b]) => b - a > maxPause).map(([a, b]) => [a + maxPause / 2 - p.lead, b - maxPause / 2 - p.lead]);
            }
            raw = fullLen - parts.reduce((a, p) => a + p.cuts.reduce((x, [c0, c1]) => x + (c1 - c0), 0), 0);
            need = raw / (window - PRE - minGap * (parts.length - 1));
          }
        }
        if (need > maxTempo) {
          throw new Error(`scene ${sc.id}: the read is ${raw.toFixed(2)}s for a ${(sc.end - sc.start).toFixed(1)}s scene (needs ${need.toFixed(2)}x, limit ${maxTempo}x). Shorten script/voiceover.json.`);
        }
        const tempo = Math.max(minTempo, need);
        const spoken = raw / tempo;
        const slack = window - PRE - spoken;
        const gap = parts.length > 1 ? clamp(slack / (parts.length - 1), minGap, 0.3) : 0;
        let cursor = PRE;
        const words = [];
        parts.forEach((p, si) => {
          const removed = p.cuts.reduce((x, [c0, c1]) => x + (c1 - c0), 0);
          const len = p.len - removed;
          const drop = p.cuts.length ? `,aselect='not(${p.cuts.map(([c0, c1]) => `between(t\\,${c0.toFixed(4)}\\,${c1.toFixed(4)})`).join("+")})',asetpts=N/SR/TB` : "";
          const af = `atrim=start=${p.lead.toFixed(4)}:end=${p.speechEnd.toFixed(4)},asetpts=PTS-STARTPTS${drop},afade=t=in:d=0.008,afade=t=out:st=${(len - 0.03).toFixed(4)}:d=0.03${Math.abs(tempo - 1) > 0.005 ? `,atempo=${tempo.toFixed(4)}` : ""}`;
          const buf = decodeMono(p.tts.file, af);
          // word times move earlier by whatever pause was removed before them
          const shift = (t) => t - p.cuts.reduce((x, [c0, c1]) => x + (t >= c1 ? c1 - c0 : t > c0 ? t - c0 : 0), 0);
          vo.add(buf, sc.start + cursor, Math.SQRT1_2);
          p.words.forEach((w, wi) => {
            // a whole-scene take still knows which sentence each word belongs to
            let sentenceIndex = si;
            if (p.sentence.counts) {
              let acc = 0;
              sentenceIndex = p.sentence.counts.findIndex((c) => (acc += c) > wi);
            }
            words.push({ w: w.w, si: sentenceIndex, s: sc.start + cursor + shift(w.s) / tempo, e: sc.start + cursor + shift(w.e) / tempo });
          });
          cursor += len / tempo + gap;
        });
        const voEnd = sc.start + cursor - gap;
        built.push({ id: sc.id, start: sc.start, end: sc.end, voStart: sc.start + PRE, voEnd, tempo: +tempo.toFixed(3), words });
        log(`voice ${sc.id}: ${parts.length} take(s), raw ${raw.toFixed(2)}s -> ${spoken.toFixed(2)}s at ${tempo.toFixed(2)}x, clip on ${sc.start.toFixed(1)}s, ends ${voEnd.toFixed(2)}s`);
      }
      captions.push(...built);
      used = provider;
      if (provider === "elevenlabs") {
        // drop saved takes the current script no longer uses
        const keep = new Set(script.scenes.flatMap((sc) => takesFor(provider, sc).flatMap((t) => Object.values(takePath(provider, t)))));
        for (const f of readdirSync(VOICE_DIR)) if (!keep.has(join(VOICE_DIR, f))) rmSync(join(VOICE_DIR, f));
      }
      break;
    } catch (err) {
      lastErr = err;
      log(`voice provider "${provider}" unavailable: ${err.message}`);
      vo.L.fill(0);
      vo.R.fill(0);
      captions.length = 0;
    }
  }
  if (!used) throw new Error("no voice provider worked: " + (lastErr?.message || "unknown"));
  for (const sc of captions) for (const w of sc.words) { w.s = +w.s.toFixed(3); w.e = +w.e.toFixed(3); }
  // level the raw voice so the mastering chain's -18 dB threshold means the same for any provider
  const p = vo.peak();
  if (p > 0) vo.scale(0.6 / p);
  return { vo, captions, provider: used };
}

// ---------------------------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------------------------

function rmsDb(stem, ranges) {
  let sum = 0, n = 0;
  for (const [a, b] of ranges) {
    for (let i = secs(a); i < Math.min(stem.n, secs(b)); i++) { sum += stem.L[i] ** 2 + stem.R[i] ** 2; n += 2; }
  }
  return 10 * Math.log10(sum / Math.max(1, n) + 1e-12);
}
function loudness(file) {
  const r = ffmpeg(["-i", file, "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"]);
  const m = r.stderr.match(/\{[\s\S]*"input_i"[\s\S]*?\}/);
  return JSON.parse(m[0]);
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

const { vo, captions, provider } = await buildVoice();
const voRaw = join(WORK, "vo_raw.wav");
writeWav(voRaw, vo);

// 1. Broadcast commercial mastering on the voice.
const voMaster = join(WORK, "vo_master.wav");
const VO_CHAIN = [
  "highpass=f=85",
  "equalizer=f=210:t=q:w=0.9:g=1.5", // a little chest for warmth
  "equalizer=f=3500:t=q:w=1.1:g=3", // presence
  "equalizer=f=10000:t=q:w=0.8:g=2.5", // air
  "acompressor=threshold=-18dB:ratio=3:attack=5:release=80:makeup=4dB",
  "alimiter=limit=0.94:attack=3:release=40:level=disabled",
].join(",");
ffmpeg(["-i", voRaw, "-af", VO_CHAIN, "-ar", String(SR), "-c:a", "pcm_s24le", voMaster]);
log("voice mastered:", VO_CHAIN);

// 2. Music and SFX.
log(`synthesising music (${BPM} BPM, F# minor) and SFX…`);
const musicFile = join(WORK, "music.wav");
const sfxFile = join(WORK, "sfx.wav");
writeWav(musicFile, renderMusic(CUES));
writeWav(sfxFile, renderSfx(CUES));

// 3. Sidechain ducking: music keyed by the voice. The ratio is solved so the measured drop
//    under speech is DUCK_DB.
const voRanges = captions.map((c) => [c.voStart + 0.15, c.voEnd - 0.1]);
const musicDry = decodeStereo(musicFile);
const dryDb = rmsDb(musicDry, voRanges);
const duckFile = join(WORK, "music_ducked.wav");
const duck = (ratio) => {
  ffmpeg([
    "-i", musicFile, "-i", voMaster, "-filter_complex",
    `[1:a]asplit=1[sc];[0:a][sc]sidechaincompress=threshold=0.02:ratio=${ratio.toFixed(3)}:attack=12:release=320:knee=4:makeup=1:level_sc=1[out]`,
    "-map", "[out]", "-ar", String(SR), "-c:a", "pcm_s24le", duckFile,
  ]);
  return rmsDb(decodeStereo(duckFile), voRanges) - dryDb;
};
let lo = 1.05, hi = 12, ratio = 2.5, measured = 0;
for (let k = 0; k < 9; k++) {
  ratio = Math.sqrt(lo * hi);
  measured = duck(ratio);
  if (Math.abs(measured - DUCK_DB) < 0.25) break;
  if (measured > DUCK_DB) lo = ratio; else hi = ratio;
}
log(`sidechain ducking: ratio ${ratio.toFixed(2)}:1 -> music ${measured.toFixed(1)} dB under the voice (target ${DUCK_DB} dB)`);

// 4. Mix, limit, and normalise to -14 LUFS / -1 dBTP.
const premix = join(WORK, "premix.wav");
ffmpeg([
  "-i", voMaster, "-i", duckFile, "-i", sfxFile, "-filter_complex",
  "[0:a]volume=1.0[v];[1:a]volume=0.5[m];[2:a]volume=0.58[s];[v][m][s]amix=inputs=3:normalize=0:duration=longest,alimiter=limit=0.9:attack=4:release=60:level=disabled[out]",
  "-map", "[out]", "-ar", String(SR), "-c:a", "pcm_s24le", premix,
]);
const m1 = loudness(premix);
const mixFile = join(WORK, "promo_mix.wav");
ffmpeg([
  "-i", premix, "-af",
  `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m1.input_i}:measured_TP=${m1.input_tp}:measured_LRA=${m1.input_lra}:measured_thresh=${m1.input_thresh}:offset=${m1.target_offset}:linear=true,` +
    `apad=whole_dur=${CUES.duration},atrim=end=${CUES.duration}`,
  "-ar", String(SR), "-ac", "2", "-c:a", "pcm_s24le", mixFile,
]);
const m2 = loudness(mixFile);
const previewFile = join(ROOT, "assets", "audio", "promo_mix.m4a");
ffmpeg(["-i", mixFile, "-c:a", "aac", "-b:a", "256k", previewFile]);

// 5. Caption timings for the composition.
const capOut = {
  provider,
  generatedFrom: "script/voiceover.json",
  scenes: captions,
};
writeFileSync(
  join(ROOT, "src", "captions.generated.js"),
  "// Generated by tools/build-promo-audio.mjs — word timings for the Greek sales captions.\n" +
    "window.PROMO_CAPTIONS = " + JSON.stringify(capOut, null, 1) + ";\n",
);

const report = {
  provider,
  bpm: BPM,
  key: "F# minor",
  voiceChain: VO_CHAIN,
  ducking: { targetDb: DUCK_DB, measuredDb: +measured.toFixed(2), ratio: +ratio.toFixed(2) },
  loudness: { integratedLufs: +m2.input_i, truePeakDb: +m2.input_tp, lra: +m2.input_lra },
  voice: captions.map((c) => ({ id: c.id, clipStart: c.start, speechEnd: +c.voEnd.toFixed(2), tempo: c.tempo, words: c.words.length })),
  files: { mix: mixFile, preview: previewFile },
};
writeFileSync(join(WORK, "report.json"), JSON.stringify(report, null, 2));
log(`mix: ${m2.input_i} LUFS, true peak ${m2.input_tp} dBTP -> ${mixFile}`);
log("voice provider:", provider);
