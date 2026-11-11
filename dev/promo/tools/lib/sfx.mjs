// Anime sound effects, all synthesised: heartbeat, vinyl scratch, katana slash + bass drop,
// megane shine, UI pops, power-up aura, turbo whoosh, sonic boom, keyboard taps, card whooshes,
// teleport warp, crystal ping, shield impacts, lock, finale impact, shimmer.
import {
  SR, TAU, Stem, Biquad, mulberry32, midi, clamp, lerp, secs,
  sawOsc, squareOsc, noiseBuf, render, ad, declick, filterBuf, pingPong, reverb,
} from "./dsp.mjs";

// ---- building blocks -----------------------------------------------------------------------

/** Filtered-noise whoosh whose centre frequency follows f(x), x = 0..1. */
function whoosh(len, seed, f, { q = 1.4, shape = (x) => Math.sin(Math.PI * x) ** 1.5 } = {}) {
  const n = noiseBuf(len, seed);
  const sw = filterBuf(n, "bp", (t) => f(t / len), q);
  return declick(render(len, (t, i) => sw[i] * shape(t / len)), 0.004, 0.02);
}

function blip(f0, f1, len = 0.07, type = "sine") {
  let ph = 0;
  return declick(
    render(len, (t) => {
      const f = lerp(f0, f1, Math.pow(t / len, 0.6));
      ph += (TAU * f) / SR;
      const v = type === "square" ? Math.sign(Math.sin(ph)) * 0.5 : Math.sin(ph);
      return v * ad(t, 0.002, len / 2.6);
    }),
    0.001,
    0.008,
  );
}

function bellTone(freq, len, partials = [[1, 1], [2.76, 0.3], [5.4, 0.12]]) {
  return declick(
    render(len, (t) => {
      let v = 0;
      for (const [m, a] of partials) v += Math.sin(TAU * freq * m * t) * a * Math.exp(-t / (len / (3.5 + m)));
      return v * Math.min(1, t / 0.0015);
    }),
    0.0005,
    0.04,
  );
}

function thump(f0, f1, len, drop = 0.05, drive = 1.6) {
  let ph = 0;
  return declick(
    render(len, (t) => {
      ph += (TAU * (f1 + (f0 - f1) * Math.exp(-t / drop))) / SR;
      return Math.tanh(Math.sin(ph) * drive) * Math.exp(-t / (len / 4));
    }),
    0.001,
    0.03,
  );
}

// ---- named effects -------------------------------------------------------------------------

function heartbeat() {
  const lub = thump(88, 46, 0.3, 0.035, 2.2);
  const dub = thump(74, 42, 0.26, 0.03, 1.8);
  const out = new Float32Array(secs(0.6));
  out.set(lub, 0);
  const off = secs(0.21);
  for (let i = 0; i < dub.length && off + i < out.length; i++) out[off + i] += dub[i] * 0.72;
  return out;
}

/** "Wikka-wik": resonant noise dragged back and forth, like a record yanked by hand. */
function vinylScratch(seed) {
  const len = 0.36;
  const n = noiseBuf(len, seed);
  const pos = (x) => (x < 0.36 ? x / 0.36 : x < 0.62 ? 1 - (x - 0.36) / 0.26 : (x - 0.62) / 0.38); // 0..1..0..1
  const sw = filterBuf(n, "bp", (t) => 500 + 3400 * pos(t / len), 5.5);
  const o = sawOsc(0.2);
  return declick(
    render(len, (t, i) => {
      const x = t / len;
      const speed = Math.abs(Math.cos(Math.PI * (x < 0.36 ? x / 0.36 : x < 0.62 ? (x - 0.36) / 0.26 : (x - 0.62) / 0.38) - Math.PI / 2));
      const tone = o(180 + 900 * pos(x)) * 0.25;
      return (sw[i] * 2.6 + tone) * (0.25 + 0.75 * speed);
    }),
    0.003,
    0.012,
  );
}

/** Blade through air, then steel ringing. */
function katana(seed) {
  const len = 1.5;
  const n = filterBuf(noiseBuf(len, seed), "hp", 4200, 0.7);
  const sw = filterBuf(noiseBuf(len, seed + 1), "bp", (t) => 9000 * Math.exp(-t / 0.07) + 1800, 2.2);
  const ring = [3140, 4710, 6283, 8911, 11200];
  return declick(
    render(len, (t, i) => {
      let m = 0;
      for (let k = 0; k < ring.length; k++) m += Math.sin(TAU * ring[k] * t + k * 1.3) * Math.exp(-t / (0.5 - k * 0.07)) * (0.2 - k * 0.025);
      const air = n[i] * Math.exp(-t / 0.05) * 0.9 + sw[i] * Math.exp(-t / 0.11) * 1.6;
      return air + m * (0.75 + 0.25 * Math.sin(TAU * 31 * t));
    }),
    0.0008,
    0.1,
  );
}

function bassDrop() {
  let ph = 0;
  return declick(
    render(2.2, (t) => {
      const f = 30 + 96 * Math.exp(-t / 0.2);
      ph += (TAU * f) / SR;
      return Math.tanh(Math.sin(ph) * 2.6) * Math.exp(-t / 0.62);
    }),
    0.001,
    0.25,
  );
}

function impact(seed, len = 1.2) {
  const n = filterBuf(noiseBuf(len, seed), "lp", (t) => 6000 * Math.exp(-t / 0.08) + 180, 0.8);
  const body = thump(140, 44, len, 0.05, 2.4);
  return declick(render(len, (t, i) => n[i] * Math.exp(-t / 0.14) * 1.2 + body[i] * 0.9), 0.0006, 0.1);
}

/** Megane glint: a fast upward zip into a bright, shimmering ping. */
function shine() {
  const len = 1.25;
  let ph = 0;
  const base = [5274, 6645, 7902, 10548];
  return declick(
    render(len, (t) => {
      let v = 0;
      if (t < 0.06) {
        ph += (TAU * lerp(1800, 7200, Math.pow(t / 0.06, 0.7))) / SR;
        v += Math.sin(ph) * 0.5 * (t / 0.06);
      }
      const tt = t - 0.05;
      if (tt > 0) {
        for (let k = 0; k < base.length; k++) {
          v += Math.sin(TAU * base[k] * tt + k) * Math.exp(-tt / (0.42 - k * 0.07)) * (0.34 - k * 0.06) * (0.72 + 0.28 * Math.sin(TAU * (17 + k * 5) * tt));
        }
      }
      return v;
    }),
    0.001,
    0.08,
  );
}

function sparkle(seed, len = 0.9, count = 14, lo = 84, hi = 108) {
  const r = mulberry32(seed);
  const out = new Float32Array(secs(len + 0.5));
  for (let k = 0; k < count; k++) {
    const b = bellTone(midi(lo + Math.floor(r() * (hi - lo))), 0.32, [[1, 1], [3.01, 0.2]]);
    const off = secs(r() * len);
    const g = 0.25 + 0.5 * r();
    for (let i = 0; i < b.length && off + i < out.length; i++) out[off + i] += b[i] * g;
  }
  return out;
}

function alarm() {
  const sq = squareOsc(0);
  const lp = new Biquad("lp", 3200, 0.9);
  return declick(render(0.17, (t) => lp.tick(sq(t < 0.085 ? 932 : 698)) * 0.6), 0.003, 0.012);
}

/** Aura charging: rising saw stack with fast tremolo and a growing noise bed. */
function powerUp(len, seed) {
  const a = sawOsc(0.1), b = sawOsc(0.5), c = sawOsc(0.8);
  const lp = new Biquad("lp", 1200, 1.6);
  const n = filterBuf(noiseBuf(len, seed), "bp", (t) => 700 + 5200 * Math.pow(t / len, 2), 0.9);
  return declick(
    render(len, (t, i) => {
      const x = t / len;
      const f = 82 * Math.pow(2, x * 2.3);
      if ((i & 31) === 0) lp.set("lp", 500 + 5200 * x * x, 1.8);
      const trem = 0.6 + 0.4 * Math.sin(TAU * (11 + 22 * x) * t);
      const v = a(f) * 0.5 + b(f * 1.5) * 0.3 + c(f * 2.01) * 0.25;
      return (lp.tick(v) * trem + n[i] * 0.7 * x) * Math.pow(x, 1.3);
    }),
    0.01,
    0.01,
  );
}

function sonicBoom(seed) {
  const len = 1.8;
  const crack = filterBuf(noiseBuf(len, seed), "hp", 1800, 0.7);
  const rumble = filterBuf(noiseBuf(len, seed + 3), "lp", (t) => 900 * Math.exp(-t / 0.3) + 90, 0.9);
  const body = thump(120, 30, len, 0.11, 3.0);
  return declick(
    render(len, (t, i) => crack[i] * Math.exp(-t / 0.018) * 1.5 + rumble[i] * Math.exp(-t / 0.45) * 1.8 + body[i] * 1.0),
    0.0005,
    0.2,
  );
}

function keyTap(seed) {
  const r = mulberry32(seed);
  const pitch = 150 + 90 * r();
  const n = filterBuf(noiseBuf(0.05, seed), "hp", 2400 + 1200 * r(), 0.8);
  return declick(
    render(0.05, (t, i) => n[i] * Math.exp(-t / 0.0035) * 0.9 + Math.sin(TAU * pitch * t) * Math.exp(-t / 0.012) * 0.8 + Math.sin(TAU * 3100 * t) * Math.exp(-t / 0.002) * 0.25),
    0.0002,
    0.004,
  );
}

function mouseClick() {
  const a = declick(render(0.02, (t) => Math.sin(TAU * 2400 * t) * Math.exp(-t / 0.0025)));
  const out = new Float32Array(secs(0.09));
  out.set(a, 0);
  const off = secs(0.055);
  for (let i = 0; i < a.length; i++) out[off + i] += a[i] * 0.7;
  return out;
}

/** Teleport: a phasing sweep that climbs, snaps, and lands. */
function warp(len, seed) {
  const a = sawOsc(0.2), b = sawOsc(0.7);
  const n = noiseBuf(len, seed);
  const bp = new Biquad("bp", 600, 4);
  const bp2 = new Biquad("bp", 900, 6);
  return declick(
    render(len, (t, i) => {
      const x = t / len;
      const up = Math.pow(x, 1.7);
      const f = 110 * Math.pow(2, up * 4.1) * (1 + 0.03 * Math.sin(TAU * (9 + 30 * x) * t));
      if ((i & 15) === 0) {
        bp.set("bp", 300 + 6400 * up + 400 * Math.sin(TAU * 7 * t), 3.5);
        bp2.set("bp", 600 + 9000 * up * up, 5);
      }
      const src = a(f) * 0.5 + b(f * 1.498) * 0.35 + n[i] * 0.5;
      return (bp.tick(src) * 1.4 + bp2.tick(n[i]) * 0.9) * Math.sin(Math.PI * Math.pow(x, 0.75)) ;
    }),
    0.01,
    0.02,
  );
}

/** Glassy two-note confirmation, in the spirit of a phone "sent" ping. */
function crystalPing() {
  const out = new Float32Array(secs(1.5));
  const n1 = bellTone(midi(88), 1.2, [[1, 1], [2, 0.35], [3.01, 0.12], [4.2, 0.05]]);
  const n2 = bellTone(midi(93), 1.3, [[1, 1], [2, 0.35], [3.01, 0.12], [4.2, 0.05]]);
  out.set(n1, 0);
  const off = secs(0.105);
  for (let i = 0; i < n2.length && off + i < out.length; i++) out[off + i] += n2[i] * 0.9;
  return out;
}

/** Energy shield: low thud, a resonant "bwoom" that bends down, and electric fizz. */
function shieldImpact(seed, size = 1) {
  const len = 1.1;
  const body = thump(105 * size, 48, len, 0.06, 2.2);
  const o1 = sawOsc(0.3), o2 = sawOsc(0.8);
  const bp = new Biquad("bp", 420, 7);
  const fizz = filterBuf(noiseBuf(len, seed), "hp", 3000, 0.7);
  const r = mulberry32(seed + 9);
  let gate = 1;
  return declick(
    render(len, (t, i) => {
      if ((i & 15) === 0) bp.set("bp", 240 + 520 * Math.exp(-t / 0.16) + 60 * Math.sin(TAU * 13 * t), 8);
      if ((i & 255) === 0) gate = r() > 0.35 ? 1 : 0.15;
      const f = 96 + 60 * Math.exp(-t / 0.2);
      const ring = bp.tick(o1(f) + o2(f * 1.503)) * Math.exp(-t / 0.36) * 1.5;
      return body[i] * 0.95 + ring + fizz[i] * gate * Math.exp(-t / 0.09) * 0.5;
    }),
    0.0006,
    0.08,
  );
}

function lockSound() {
  const out = new Float32Array(secs(0.75));
  const clack = (f, d) => declick(render(0.06, (t) => Math.sin(TAU * f * t) * Math.exp(-t / d)));
  const n = filterBuf(noiseBuf(0.03, 5), "hp", 3000, 0.7);
  const put = (b, at, g) => { const o = secs(at); for (let i = 0; i < b.length && o + i < out.length; i++) out[o + i] += b[i] * g; };
  put(clack(2600, 0.004), 0, 0.7);
  put(render(0.03, (t, i) => n[i] * Math.exp(-t / 0.004)), 0, 0.6);
  put(clack(820, 0.014), 0.075, 0.9); // bolt seats
  put(blip(1046, 1046, 0.09), 0.2, 0.42); // clean digital confirm
  put(blip(1568, 1568, 0.2), 0.3, 0.42);
  return out;
}

function chime(notes, gap = 0.055, len = 1.1) {
  const out = new Float32Array(secs(notes.length * gap + len));
  notes.forEach((nn, k) => {
    const b = bellTone(midi(nn), len);
    const o = secs(k * gap);
    for (let i = 0; i < b.length && o + i < out.length; i++) out[o + i] += b[i] * (0.8 - k * 0.05);
  });
  return out;
}

// ---- placement -----------------------------------------------------------------------------

export function renderSfx(cues) {
  const DUR = cues.duration;
  const dry = new Stem(DUR); // punchy, close
  const wet = new Stem(DUR); // gets delay + reverb

  // scene transition whooshes on every cut
  cues.scenes.slice(1, -1).forEach((t, k) => {
    const w = whoosh(0.5, 300 + k, (x) => 350 + 5200 * Math.sin(Math.PI * x) ** 2, { q: 1.1 });
    const dir = k % 2 ? 1 : -1;
    // pan across the cut
    const half = secs(0.25);
    for (let i = 0; i < w.length; i++) {
      const pan = dir * ((i - half) / half) * 0.7;
      const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
      const s = secs(t - 0.22) + i;
      if (s < dry.n) { dry.L[s] += w[i] * Math.cos(a) * 0.95; dry.R[s] += w[i] * Math.sin(a) * 0.95; }
    }
  });

  // ---- scene 1: manga panic -> slash ----
  const hb = heartbeat();
  cues.s1.heartbeats.forEach((t, k) => dry.add(hb, t, 1.25 + k * 0.1, 0));
  dry.add(vinylScratch(8), cues.s1.scratch, 0.5, -0.1);
  // air being cut just before the blade lands
  dry.add(whoosh(0.2, 9, (x) => 1200 + 9000 * x * x, { q: 1.2, shape: (x) => x ** 2.2 }), cues.s1.slash - 0.19, 0.5, 0.3);
  dry.add(katana(10), cues.s1.slash, 0.62, 0.1);
  wet.add(katana(12), cues.s1.slash, 0.3, -0.3);
  dry.add(impact(13), cues.s1.slash, 0.62, 0);
  dry.add(bassDrop(), cues.s1.slash, 0.82, 0);

  // ---- scene 2: megane shine, UI pop, resume chime ----
  dry.add(shine(), cues.s2.shine, 0.72, -0.35);
  wet.add(shine(), cues.s2.shine, 0.6, -0.35);
  wet.add(sparkle(21, 0.5, 9), cues.s2.shine + 0.06, 0.42, -0.3);
  dry.add(blip(480, 960, 0.08), cues.s2.uiPop, 0.75, 0.35);
  dry.add(whoosh(0.22, 22, (x) => 500 + 2500 * x, { q: 1.5 }), cues.s2.uiPop - 0.12, 0.5, 0.35);
  dry.add(blip(620, 1240, 0.07), cues.s2.uiPop + 0.22, 0.55, 0.45);
  // scrubber zips to the saved second
  dry.add(whoosh(cues.s2.scrubEnd - cues.s2.scrubStart + 0.05, 23, (x) => 400 + 7000 * x ** 1.6, { q: 2.2, shape: (x) => x ** 1.2 }), cues.s2.scrubStart, 1.25, 0.3);
  dry.add(blip(300, 2400, cues.s2.scrubEnd - cues.s2.scrubStart, "sine"), cues.s2.scrubStart, 0.26, 0.3);
  wet.add(chime([78, 81, 85, 90], 0.06, 1.3), cues.s2.scrubEnd, 0.42, 0.25);
  dry.add(blip(880, 1320, 0.06), cues.s2.scrubEnd, 0.5, 0.3);
  dry.add(mouseClick(), cues.s2.play, 0.85, 0.2);
  wet.add(chime([85, 90], 0.07, 0.8), cues.s2.play + 0.05, 0.42, 0.2);

  // ---- scene 3: filler alert, aura, turbo, sonic boom ----
  [0, 0.25, 0.5].forEach((d, k) => dry.add(alarm(), cues.s3.alert + d, 0.42 - k * 0.05, k % 2 ? 0.3 : -0.3));
  const auraLen = cues.s3.ignite - cues.s3.aura;
  dry.add(powerUp(auraLen, 31), cues.s3.aura, 0.7, -0.25);
  dry.add(impact(32, 0.9), cues.s3.ignite, 0.55, -0.2);
  wet.add(shine(), cues.s3.ignite, 0.35, -0.3);
  // turbo: a doppler pass, left to right
  {
    const w = whoosh(0.75, 33, (x) => 300 + 5200 * Math.sin(Math.PI * Math.pow(x, 0.7)), { q: 1.3, shape: (x) => Math.sin(Math.PI * x) ** 1.2 });
    const n = w.length;
    for (let i = 0; i < n; i++) {
      const pan = -0.9 + 1.8 * (i / n);
      const a = ((pan + 1) * Math.PI) / 4;
      const s = secs(cues.s3.ignite) + i;
      dry.L[s] += w[i] * Math.cos(a) * 1.7;
      dry.R[s] += w[i] * Math.sin(a) * 1.7;
    }
  }
  dry.add(blip(520, 1040, 0.09, "square"), cues.s3.gear15, 0.36, 0.4);
  dry.add(whoosh(0.3, 34, (x) => 800 + 5000 * x, { q: 1.6 }), cues.s3.gear15 - 0.12, 0.6, 0.4);
  dry.add(blip(780, 1560, 0.11, "square"), cues.s3.gear20, 0.42, 0.4);
  dry.add(whoosh(0.4, 35, (x) => 900 + 8000 * x, { q: 1.4 }), cues.s3.gear20 - 0.16, 0.75, 0.4);
  wet.add(chime([90, 97], 0.05, 0.7), cues.s3.gear20, 0.4, 0.4);
  dry.add(sonicBoom(36), cues.s3.boom, 0.72, 0);
  wet.add(sonicBoom(37), cues.s3.boom, 0.28, 0);
  wet.add(sparkle(38, 0.7, 10, 80, 100), cues.s3.boom + 0.1, 0.12, 0.2);

  // ---- scene 4: typing, card cascade, one click ----
  {
    const text = "One Piece";
    const r = mulberry32(404);
    const span = cues.s4.typeEnd - cues.s4.typeStart;
    for (let k = 0; k < text.length; k++) {
      const t = cues.s4.typeStart + (k / (text.length - 1)) * span + (r() - 0.5) * 0.018;
      dry.add(keyTap(410 + k), t, (text[k] === " " ? 0.8 : 0.6) + 0.1 * r(), r() * 0.5 - 0.1);
    }
    dry.add(blip(700, 1400, 0.06), cues.s4.typeEnd + 0.1, 0.45, 0.1);
    for (let k = 0; k < 5; k++) {
      const t = cues.s4.cards + k * cues.s4.cardGap;
      dry.add(whoosh(0.2, 420 + k, (x) => 500 + 2600 * x, { q: 1.6 }), t - 0.06, 0.65, 0.15);
      dry.add(blip(midi(78 + k * 2), midi(78 + k * 2) * 1.5, 0.06), t + 0.07, 0.42, 0.15);
    }
    dry.add(mouseClick(), cues.s4.click, 0.9, 0.2);
    wet.add(chime([81, 85, 90, 93], 0.05, 1.0), cues.s4.click + 0.06, 0.55, 0.2);
  }

  // ---- scene 5: teleport warp and landing ping ----
  {
    const len = cues.s5.land - cues.s5.warp;
    const w = warp(len, 51);
    const n = w.length;
    for (let i = 0; i < n; i++) {
      const pan = -0.75 + 1.5 * Math.pow(i / n, 1.4); // PC (left) -> iPhone (right)
      const a = ((pan + 1) * Math.PI) / 4;
      const s = secs(cues.s5.warp) + i;
      dry.L[s] += w[i] * Math.cos(a) * 1.5;
      dry.R[s] += w[i] * Math.sin(a) * 1.5;
      wet.L[s] += w[i] * Math.cos(a) * 0.3;
      wet.R[s] += w[i] * Math.sin(a) * 0.3;
    }
    dry.add(blip(260, 520, 0.08), cues.s5.warp, 0.28, -0.6);
    dry.add(impact(52, 0.5), cues.s5.land, 0.22, 0.55);
    dry.add(crystalPing(), cues.s5.land + 0.02, 0.36, 0.5);
    wet.add(crystalPing(), cues.s5.land + 0.02, 0.3, 0.5);
    wet.add(sparkle(53, 0.5, 8, 88, 105), cues.s5.land + 0.1, 0.12, 0.5);
  }

  // ---- scene 6: shield impacts and the lock ----
  cues.s6.impacts.forEach((t, k) => {
    const pan = [0.45, -0.5, 0.3][k % 3];
    dry.add(shieldImpact(60 + k, 1 - k * 0.08), t, k === 0 ? 0.72 : 0.5, pan);
    wet.add(shieldImpact(70 + k, 1 - k * 0.08), t, 0.2, -pan);
    dry.add(whoosh(0.16, 80 + k, (x) => 2500 - 1700 * x, { q: 1.3, shape: (x) => x ** 2 }), t - 0.15, 0.3, pan * 1.6);
  });
  dry.add(lockSound(), cues.s6.lock, 1.35, 0);
  wet.add(lockSound(), cues.s6.lock, 0.14, 0);

  // ---- scene 7: finale impact and shimmer ----
  dry.add(impact(90, 1.6), cues.s7.hit, 1.15, 0);
  wet.add(shine(), cues.s7.hit + 0.02, 0.2, 0.2);
  wet.add(sparkle(91, 3.2, 34, 85, 109), cues.s7.hit + 0.15, 0.3, 0);

  const out = new Stem(DUR);
  out.mix(dry, 1);
  out.mix(wet, 0.75);
  out.mix(pingPong(wet, 0.176, 0.38, 6000), 0.3);
  out.mix(reverb(wet, { room: 0.88, damp: 0.3 }), 0.5);
  const tailSend = new Stem(DUR);
  tailSend.mix(dry, 0.18);
  out.mix(reverb(tailSend, { room: 0.8, damp: 0.5 }), 0.5);
  out.envelope((t) => (t > DUR - 0.5 ? clamp((DUR - t) / 0.5) : 1));
  // gain staging: normalise first, then only a gentle saturation so transients keep their shape
  out.scale(0.9 / out.peak());
  out.saturate(0.9);
  out.scale(0.86 / out.peak());
  return out;
}
