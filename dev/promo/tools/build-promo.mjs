#!/usr/bin/env node
// One command to produce the finished commercial:
//   1. sync the brand artwork from the repo        (tools/sync-brand-assets.mjs)
//   2. build voiceover + music + SFX + captions    (tools/build-promo-audio.mjs)
//   3. lint the composition                        (hyperframes lint)
//   4. render 1920x1080 @ 45 fps, 1575 frames      (hyperframes render)
//   5. mux picture + mastered stereo mix           (ffmpeg: libx264 / yuv420p / aac 256k)
//   6. verify with ffprobe and pull one still per scene for a visual check
//
//   node tools/build-promo.mjs [--skip-audio] [--skip-render] [--provider edge|gtts|elevenlabs|file]
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "../src/cues.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CUES = globalThis.PROMO_CUES;
const args = process.argv.slice(2);
const has = (f) => args.includes("--" + f);
const WORK = join(ROOT, ".work");
const SILENT = join(WORK, "render", "promo_video.mp4");
const MIX = join(WORK, "audio", "promo_mix.wav");
const OUT = join(ROOT, "an1me_tracker_promo_gr.mp4");
const HF = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "hyperframes.cmd" : "hyperframes");

function step(title, cmd, argv, opts = {}) {
  console.log(`\n▶ ${title}`);
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`✗ ${title} failed (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}
const capture = (cmd, argv) => spawnSync(cmd, argv, { cwd: ROOT, encoding: "utf8" });

mkdirSync(join(WORK, "render"), { recursive: true });
step("Brand assets", "node", ["tools/sync-brand-assets.mjs"]);
if (!has("skip-audio")) {
  const passthrough = args.includes("--provider") ? ["--provider", args[args.indexOf("--provider") + 1]] : [];
  step("Voiceover, music, SFX, captions", "node", ["tools/build-promo-audio.mjs", ...passthrough]);
}
if (!existsSync(MIX)) {
  console.error("✗ no audio mix at " + MIX + " — run without --skip-audio");
  process.exit(1);
}
if (!has("skip-render")) {
  step("Lint", HF, ["lint", "."]);
  step(`Render ${CUES.frames} frames @ ${CUES.fps} fps`, HF, [
    "render", ".", "--fps", String(CUES.fps), "--quality", "high", "--crf", "12", "--output", SILENT, "--strict", "--no-best-effort",
  ]);
}

// picture from HyperFrames + the mastered WAV. -t pins the container to exactly 35.000 s.
step("Mux picture + mastered audio", "ffmpeg", [
  "-hide_banner", "-nostdin", "-y", "-i", SILENT, "-i", MIX,
  "-map", "0:v:0", "-map", "1:a:0",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(CUES.fps),
  "-profile:v", "high", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
  "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
  "-t", CUES.duration.toFixed(3), "-movflags", "+faststart", OUT,
]);

// ---- verification ----
console.log("\n▶ Verify");
const probe = JSON.parse(
  capture("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,pix_fmt,channels,sample_rate,bit_rate", "-of", "json", OUT]).stdout,
);
const v = probe.streams.find((s) => s.codec_type === "video");
const a = probe.streams.find((s) => s.codec_type === "audio");
const vol = capture("ffmpeg", ["-hide_banner", "-nostdin", "-i", OUT, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"]).stderr;
const meanDb = parseFloat((vol.match(/mean_volume: (-?[\d.]+) dB/) || [])[1]);
const checks = [
  ["resolution 1920x1080", v && v.width === 1920 && v.height === 1080, v && `${v.width}x${v.height}`],
  ["frame rate 45 fps", v && v.r_frame_rate === "45/1" && v.avg_frame_rate === "45/1", v && v.avg_frame_rate],
  [`frame count ${CUES.frames}`, v && +v.nb_read_frames === CUES.frames, v && v.nb_read_frames],
  ["duration 35.0 s", Math.abs(+probe.format.duration - CUES.duration) < 0.03, (+probe.format.duration).toFixed(3) + " s"],
  ["video h264 / yuv420p", v && v.codec_name === "h264" && v.pix_fmt === "yuv420p", v && `${v.codec_name} / ${v.pix_fmt}`],
  ["audio aac stereo 48 kHz", a && a.codec_name === "aac" && a.channels === 2 && +a.sample_rate === 48000, a && `${a.codec_name} ${a.channels}ch ${a.sample_rate} Hz ${Math.round(a.bit_rate / 1000)}k`],
  ["audio channel is live (not silent)", Number.isFinite(meanDb) && meanDb > -40, meanDb + " dB mean"],
];
let ok = true;
for (const [name, pass, got] of checks) {
  console.log(`  ${pass ? "✓" : "✗"} ${name}  [${got}]`);
  ok = ok && !!pass;
}
// one still from the middle of every scene, straight from the final file
const stills = join(WORK, "verify");
rmSync(stills, { recursive: true, force: true });
mkdirSync(stills, { recursive: true });
CUES.scenes.slice(0, -1).forEach((start, i) => {
  const mid = (start + CUES.scenes[i + 1]) / 2;
  capture("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-ss", mid.toFixed(3), "-i", OUT, "-frames:v", "1", join(stills, `scene${i + 1}_${mid.toFixed(2)}s.png`)]);
});
writeFileSync(join(WORK, "verify", "ffprobe.json"), JSON.stringify(probe, null, 2));
console.log(`  stills: ${stills}`);
console.log(`\n${ok ? "✓" : "✗"} ${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB)`);
process.exit(ok ? 0 : 1);
