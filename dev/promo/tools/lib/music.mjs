// Anime hype beat: synthwave / future bass, 128 BPM, F# minor (F#m – D – A – E).
// The grid is anchored on the katana drop (s1.slash) and re-anchored on the finale hit
// (s7.hit) after a riser, so both land on a downbeat without bending the tempo.
import {
  SR, TAU, Stem, Biquad, mulberry32, midi, clamp, lerp, secs,
  sawOsc, squareOsc, noiseBuf, render, ad, declick, filterBuf, pingPong, reverb,
} from "./dsp.mjs";

export const BPM = 128;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const S16 = BEAT / 4;

// Chords, one bar each. `pad` voicings sit around octave 4, `root` drives the bass.
const CHORDS = [
  { name: "F#m9", root: 30, pad: [66, 69, 73, 76, 80], arp: [66, 69, 73, 76, 78, 81] },
  { name: "Dmaj7", root: 38, pad: [62, 66, 69, 73, 78], arp: [62, 66, 69, 73, 78, 81] },
  { name: "A", root: 33, pad: [64, 69, 73, 76, 81], arp: [64, 69, 73, 76, 81, 85] },
  { name: "E", root: 28, pad: [64, 68, 71, 76, 80], arp: [64, 68, 71, 76, 80, 83] },
];

// ---- drum voices ---------------------------------------------------------------------------

function kick(punch = 1) {
  let ph = 0;
  const click = noiseBuf(0.004, 11);
  return declick(
    render(0.42, (t, i) => {
      const f = 46 + 128 * Math.exp(-t / 0.026) + 40 * Math.exp(-t / 0.006);
      ph += (TAU * f) / SR;
      const body = Math.sin(ph) * Math.exp(-t / 0.17);
      const c = i < click.length ? click[i] * 0.5 * (1 - i / click.length) : 0;
      return Math.tanh((body * 1.9 + c) * punch) * 0.92;
    }),
    0.0005,
    0.03,
  );
}

function clap(seed) {
  const n = filterBuf(noiseBuf(0.34, seed), "bp", 1700, 0.9);
  const hp = filterBuf(n, "hp", 700, 0.7);
  return declick(
    render(0.34, (t, i) => {
      // three quick flams, then the tail
      const flam = Math.max(ad(t, 0.001, 0.006), ad(t - 0.011, 0.001, 0.006) * (t > 0.011), ad(t - 0.022, 0.001, 0.007) * (t > 0.022));
      const tail = t > 0.03 ? Math.exp(-(t - 0.03) / 0.085) : 0;
      const tone = Math.sin(TAU * 196 * t) * Math.exp(-t / 0.05) * 0.35;
      return hp[i] * (flam * 0.9 + tail) * 1.6 + tone;
    }),
  );
}

function hat(seed, decay) {
  const n = filterBuf(noiseBuf(decay * 6 + 0.02, seed), "hp", 7600, 0.8);
  return declick(render(decay * 6 + 0.02, (t, i) => n[i] * ad(t, 0.0006, decay)), 0.0003, 0.004);
}

function crash(seed, len = 2.4) {
  const n = filterBuf(noiseBuf(len, seed), "hp", 3200, 0.6);
  const part = [5231, 6817, 8423, 10211];
  return declick(
    render(len, (t, i) => {
      let m = 0;
      for (let k = 0; k < part.length; k++) m += Math.sin(TAU * part[k] * t + k) * 0.05;
      return (n[i] * 0.8 + m) * ad(t, 0.002, len / 4.2);
    }),
    0.001,
    0.2,
  );
}

function snareRollHit(seed) {
  const n = filterBuf(noiseBuf(0.12, seed), "hp", 1400, 0.7);
  return declick(render(0.12, (t, i) => n[i] * ad(t, 0.001, 0.03) + Math.sin(TAU * 210 * t) * Math.exp(-t / 0.025) * 0.5));
}

// ---- pitched voices ------------------------------------------------------------------------

/** Detuned supersaw chord for one bar, returns [L, R]. */
function supersaw(notes, seconds, seed, { cutoff = 3200, cutoffEnd = cutoff, attack = 0.012, release = 0.12 } = {}) {
  const rnd = mulberry32(seed);
  const n = secs(seconds);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const SAWS = 7;
  for (const note of notes) {
    for (let s = 0; s < SAWS; s++) {
      const det = (s - (SAWS - 1) / 2) / ((SAWS - 1) / 2); // -1..1
      const f = midi(note) * Math.pow(2, (det * 17) / 1200);
      const osc = sawOsc(rnd());
      const pan = det * 0.85;
      const a = ((pan + 1) * Math.PI) / 4;
      const gl = Math.cos(a);
      const gr = Math.sin(a);
      const g = (s === 3 ? 1 : 0.62) / SAWS;
      for (let i = 0; i < n; i++) {
        const v = osc(f) * g;
        L[i] += v * gl;
        R[i] += v * gr;
      }
    }
  }
  const lpL = new Biquad("lp", cutoff, 0.8);
  const lpR = new Biquad("lp", cutoff, 0.8);
  const hpL = new Biquad("hp", 180, 0.7);
  const hpR = new Biquad("hp", 180, 0.7);
  const rel = secs(release);
  const att = secs(attack);
  for (let i = 0; i < n; i++) {
    if ((i & 63) === 0) {
      const c = lerp(cutoff, cutoffEnd, i / n);
      lpL.set("lp", c, 0.8);
      lpR.set("lp", c, 0.8);
    }
    let env = 1;
    if (i < att) env = i / att;
    if (i > n - rel) env *= (n - i) / rel;
    L[i] = hpL.tick(lpL.tick(L[i])) * env;
    R[i] = hpR.tick(lpR.tick(R[i])) * env;
  }
  return [L, R];
}

function bassNote(note, seconds, accent) {
  const saw = sawOsc(0.2);
  const sq = squareOsc(0.6);
  const f = midi(note);
  const lp = new Biquad("lp", 800, 1.4);
  return declick(
    render(seconds, (t, i) => {
      if ((i & 31) === 0) lp.set("lp", 190 + (accent ? 1500 : 950) * Math.exp(-t / 0.085), 1.5);
      const v = saw(f) * 0.7 + sq(f / 2) * 0.35;
      return lp.tick(v) * Math.min(1, t / 0.004) * (0.75 + 0.25 * Math.exp(-t / 0.2));
    }),
    0.002,
    0.02,
  );
}

function subNote(note, seconds) {
  const f = midi(note);
  return declick(render(seconds, (t) => Math.sin(TAU * f * t) + 0.18 * Math.sin(TAU * 2 * f * t)), 0.008, 0.03);
}

function pluck(note, seed, bright = 1) {
  const f = midi(note);
  const saw = sawOsc((seed % 97) / 97);
  const lp = new Biquad("lp", 3000, 1.1);
  return declick(
    render(0.34, (t, i) => {
      if ((i & 31) === 0) lp.set("lp", 700 + 5200 * bright * Math.exp(-t / 0.05), 1.1);
      const tri = (2 / Math.PI) * Math.asin(Math.sin(TAU * f * t));
      return lp.tick(saw(f) * 0.55 + tri * 0.6) * ad(t, 0.002, 0.085);
    }),
    0.001,
    0.02,
  );
}

function leadNote(note, seconds) {
  const f = midi(note);
  const a = sawOsc(0.1);
  const b = sawOsc(0.57);
  const lp = new Biquad("lp", 3400, 1.0);
  return declick(
    render(seconds + 0.12, (t) => {
      const vib = 1 + 0.004 * Math.sin(TAU * 5.6 * t) * clamp((t - 0.12) / 0.2);
      const v = a(f * vib) * 0.5 + b(f * vib * 1.006) * 0.5;
      const env = Math.min(1, t / 0.008) * (t < seconds ? 1 : Math.exp(-(t - seconds) / 0.05));
      return lp.tick(v) * env;
    }),
    0.002,
    0.03,
  );
}

function bell(note, len = 1.4) {
  const f = midi(note);
  return declick(
    render(len, (t) => {
      const e = ad(t, 0.002, len / 4.5);
      return (Math.sin(TAU * f * t) * 0.7 + Math.sin(TAU * f * 2.76 * t) * 0.22 * Math.exp(-t / 0.2) + Math.sin(TAU * f * 5.4 * t) * 0.08 * Math.exp(-t / 0.08)) * e;
    }),
    0.001,
    0.05,
  );
}

/** Sidechain-style pump keyed to the beat position (0..1 inside a beat). */
const pump = (x, depth = 0.78) => 1 - depth * Math.pow(1 - clamp(x / 0.72), 2.4);

// ---- arrangement ---------------------------------------------------------------------------

export function renderMusic(cues) {
  const DUR = cues.duration;
  const T0 = cues.s1.slash; // drop
  const HIT = cues.s7.hit; // finale downbeat
  const SCRATCH = cues.s1.scratch;

  const drums = new Stem(DUR);
  const bass = new Stem(DUR);
  const pads = new Stem(DUR);
  const melo = new Stem(DUR); // arps, lead, bells -> delay + reverb sends
  const fx = new Stem(DUR);

  const K = kick();
  const Ksoft = kick(0.7);
  const C1 = clap(21);
  const C2 = clap(22);
  const HC = hat(31, 0.018);
  const HC2 = hat(32, 0.011);
  const HO = hat(33, 0.075);
  const rnd = mulberry32(2026);

  // ---------- intro: tense drone under the manga panic (0 -> scratch) ----------
  {
    const len = SCRATCH + 0.3;
    const o1 = sawOsc(0.11), o2 = sawOsc(0.63), o3 = sawOsc(0.37);
    const lp = new Biquad("lp", 300, 1.2);
    const drone = render(len, (t, i) => {
      // tape-stop: pitch and level collapse when the record scratches
      const stop = t < SCRATCH ? 1 : Math.max(0, 1 - (t - SCRATCH) / 0.26);
      const p = Math.pow(stop, 1.6);
      if ((i & 63) === 0) lp.set("lp", (240 + 260 * (t / SCRATCH) + 90 * Math.sin(TAU * 0.5 * t)) * (0.3 + 0.7 * p), 1.3);
      const f = midi(30) * p; // F#1
      const v = o1(f) * 0.5 + o2(f * 2.003) * 0.35 + o3(f * 3.0 * 0.998) * 0.2;
      return lp.tick(v) * Math.min(1, t / 0.5) * stop * (0.82 + 0.18 * Math.sin(TAU * 2.1 * t));
    });
    bass.add(drone, 0, 0.5, 0);
    // eerie minor-second shimmer high above
    const hi = render(len, (t) => {
      const stop = t < SCRATCH ? 1 : Math.max(0, 1 - (t - SCRATCH) / 0.2);
      const a = Math.sin(TAU * midi(85) * t * (0.2 + 0.8 * stop)) + Math.sin(TAU * midi(86) * 1.003 * t * (0.2 + 0.8 * stop));
      return a * 0.5 * Math.min(1, t / 1.2) * stop * (0.6 + 0.4 * Math.sin(TAU * 0.31 * t + 1));
    });
    melo.add(hi, 0, 0.05, 0.25);
    // ticking clock: it is 03:00 and you are still awake
    for (let k = 0; k * 0.5 < SCRATCH - 0.1; k++) {
      const tick = declick(render(0.03, (t) => Math.sin(TAU * (k % 2 ? 2100 : 2600) * t) * Math.exp(-t / 0.006)));
      fx.add(tick, 0.06 + k * 0.5, 0.12, k % 2 ? 0.35 : -0.35);
    }
  }

  // ---------- main groove: bars from the drop until the finale riser ----------
  const mainBars = Math.floor((HIT - T0) / BAR); // 14 full bars
  const riserStart = HIT - 1.45;
  for (let b = 0; b < mainBars + 1; b++) {
    const t0 = T0 + b * BAR;
    if (t0 >= HIT - 0.05) break;
    const ch = CHORDS[b % 4];
    const barLen = Math.min(BAR, HIT - 0.06 - t0);
    const section = b < 4 ? 0 : b < 8 ? 1 : b < 12 ? 2 : 3; // 3 = breakdown / build
    const breakdown = section === 3;

    // drums
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * S16;
      if (t >= HIT - 0.08) break;
      const inRiser = t >= riserStart;
      const beat = s % 4 === 0;
      if (beat && !inRiser) {
        if (!breakdown) drums.add(K, t, 0.95, 0);
        else if (s === 0 || s === 10) drums.add(K, t, 0.9, 0);
      }
      if (!inRiser) {
        if (!breakdown && (s === 4 || s === 12)) drums.add(s === 4 ? C1 : C2, t, 0.5, s === 4 ? -0.08 : 0.08);
        if (breakdown && s === 8) drums.add(C1, t, 0.42, 0); // half-time backbeat
      }
      if (!inRiser) {
        // hats: offbeat 8ths always, 16th ghosts once the energy is up
        if (s % 4 === 2) drums.add(HC, t, section >= 1 ? 0.3 : 0.24, 0.3);
        else if (section >= 1 && !breakdown && s % 2 === 1) drums.add(HC2, t, 0.11 + 0.06 * rnd(), s % 4 === 1 ? -0.35 : 0.4);
        else if (section === 2 && s % 4 === 0) drums.add(HC2, t, 0.1, -0.2);
        if (s === 14 && !breakdown) drums.add(HO, t, 0.2, 0.25);
      }
    }
    if (b === 0 || b === 4 || b === 8) fx.add(crash(40 + b), t0, b === 0 ? 0.4 : 0.26, b === 4 ? -0.3 : 0.3);

    // bass: syncopated 16th pattern, octave pops on the off hits
    const pat = [0, 3, 6, 8, 11, 14];
    for (let k = 0; k < pat.length; k++) {
      const s = pat[k];
      const t = t0 + s * S16;
      if (t >= riserStart - 0.02) break;
      const len = ((pat[k + 1] ?? 16) - s) * S16 * 0.86;
      const oct = s === 6 || s === 14 ? 12 : 0;
      if (!breakdown || s === 0 || s === 8) {
        bass.add(bassNote(ch.root + 12 + oct, len, s === 0), t, breakdown ? 0.3 : 0.36, 0);
        const sub = subNote(ch.root + (ch.root < 31 ? 12 : 0), len);
        // pump the sub out of the kick's way
        for (let i = 0; i < sub.length; i++) sub[i] *= pump((((t + i / SR - T0) / BEAT) % 1 + 1) % 1, breakdown ? 0.3 : 0.7);
        bass.add(sub, t, 0.44, 0);
      }
    }

    // pads: pumped supersaw, filter opens section by section
    const cut = [1500, 2600, 3600, 2000][section];
    const cutEnd = breakdown ? 5200 : cut * 1.15;
    const [pl, pr] = supersaw(ch.pad, barLen, 100 + b, { cutoff: cut, cutoffEnd: cutEnd });
    for (let i = 0; i < pl.length; i++) {
      const tb = (((t0 + i / SR - T0) / BEAT) % 1 + 1) % 1;
      const g = breakdown ? pump(tb, 0.25) : pump(tb, 0.8);
      pl[i] *= g;
      pr[i] *= g;
    }
    pads.addStereo(pl, pr, t0, section === 0 ? 0.3 : 0.34);

    // arp: 16ths from the second section on
    if (section >= 1) {
      const order = [0, 2, 1, 3, 2, 4, 3, 5, 4, 3, 2, 4, 1, 3, 2, 0];
      for (let s = 0; s < 16; s++) {
        const t = t0 + s * S16;
        if (t >= riserStart) break;
        const note = ch.arp[order[s]] + (section === 2 ? 12 : 12);
        const g = (s % 4 === 0 ? 0.2 : 0.14) * (breakdown ? 0.75 : 1);
        melo.add(pluck(note, b * 16 + s, breakdown ? 0.6 : 1), t, g, s % 2 ? 0.45 : -0.45);
      }
    }

    // hook: a short call over the third section (kept sparse — the voice owns the mids)
    if (section === 2) {
      const hooks = [
        [[0, 85, 2], [3, 88, 1], [4, 90, 3], [8, 88, 2], [11, 85, 2], [14, 83, 2]],
        [[0, 81, 2], [3, 85, 1], [4, 86, 3], [8, 90, 2], [11, 88, 2], [14, 85, 2]],
        [[0, 88, 2], [3, 85, 1], [4, 88, 3], [8, 93, 2], [11, 92, 2], [14, 88, 2]],
        [[0, 92, 2], [3, 88, 1], [4, 83, 3], [8, 88, 2], [11, 90, 3]],
      ];
      for (const [s, note, len] of hooks[b % 4]) {
        melo.add(leadNote(note - 12, len * S16 * 0.9), t0 + s * S16, 0.11, 0.1);
      }
    }
  }

  // ---------- build into the finale ----------
  {
    const len = HIT - riserStart;
    // noise riser
    const n = noiseBuf(len, 77);
    const swept = filterBuf(n, "bp", (t) => 500 + 9000 * Math.pow(t / len, 2.2), 1.2);
    fx.add(render(len, (t, i) => swept[i] * Math.pow(t / len, 1.8) * (t > len - 0.05 ? (len - t) / 0.05 : 1)), riserStart, 0.34, 0);
    // pitch riser
    const o = sawOsc(0.3);
    const lp = new Biquad("lp", 2400, 1.0);
    fx.add(
      declick(render(len, (t) => lp.tick(o(midi(54) * Math.pow(2, (t / len) * 2))) * Math.pow(t / len, 1.4) * (t > len - 0.05 ? (len - t) / 0.05 : 1))),
      riserStart,
      0.16,
      0,
    );
    // snare roll: 16ths, then 32nds
    let t = riserStart;
    let k = 0;
    while (t < HIT - 0.07) {
      const p = (t - riserStart) / len;
      drums.add(snareRollHit(60 + k), t, 0.16 + 0.34 * p, k % 2 ? 0.2 : -0.2);
      t += p > 0.55 ? S16 / 2 : S16;
      k++;
    }
  }

  // ---------- finale: resonant hit and shimmering outro ----------
  {
    const tail = DUR - HIT;
    drums.add(K, HIT, 1.0, 0);
    fx.add(crash(90, 3.6), HIT, 0.5, 0);
    fx.add(crash(91, 3.0), HIT, 0.3, -0.5);
    // sub boom
    let ph = 0;
    bass.add(
      declick(render(2.6, (t) => { ph += (TAU * (38 + 70 * Math.exp(-t / 0.09))) / SR; return Math.tanh(Math.sin(ph) * 2.2) * Math.exp(-t / 0.75); }), 0.001, 0.2),
      HIT,
      0.8,
      0,
    );
    // big F#m9 chord, filter closing as it rings out
    const [pl, pr] = supersaw([54, 61, 66, 69, 73, 76, 80], tail, 500, { cutoff: 5200, cutoffEnd: 700, attack: 0.004, release: 0.9 });
    for (let i = 0; i < pl.length; i++) {
      const t = i / SR;
      const g = Math.exp(-t / 2.6) * (0.72 + 0.28 * pump((t / BEAT) % 1, 1));
      pl[i] *= g;
      pr[i] *= g;
    }
    pads.addStereo(pl, pr, HIT, 0.5);
    // half-time pulse under the call to action
    for (let s = 0; s < 8; s++) {
      const t = HIT + s * BEAT;
      if (t > DUR - 0.9) break;
      const fade = clamp(1 - s / 9);
      if (s > 0) drums.add(Ksoft, t, 0.62 * fade, 0);
      if (s % 2 === 1) drums.add(C2, t, 0.3 * fade, 0);
      drums.add(HC, t + BEAT / 2, 0.16 * fade, 0.3);
    }
    bass.add(subNote(42, 1.6), HIT + 0.02, 0.26, 0);
    // shimmer: rising bell arpeggio, then a seeded sprinkle
    const up = [78, 81, 85, 88, 90, 93, 97, 100];
    up.forEach((note, k) => melo.add(bell(note, 1.8), HIT + 0.06 + k * S16, 0.11 - k * 0.006, k % 2 ? 0.55 : -0.55));
    const scale = [78, 81, 83, 85, 88, 90, 93, 95, 97];
    const r2 = mulberry32(4242);
    for (let k = 0; k < 26; k++) {
      const t = HIT + 1.1 + r2() * (tail - 1.9);
      melo.add(bell(scale[Math.floor(r2() * scale.length)] + (r2() > 0.6 ? 12 : 0), 1.2), t, 0.035 + 0.04 * r2(), r2() * 1.6 - 0.8);
    }
  }

  // ---------- sends and stem balance ----------
  const out = new Stem(DUR);
  out.mix(drums, 0.92);
  out.mix(bass, 0.9);
  out.mix(pads, 0.86);
  out.mix(melo, 0.9);
  out.mix(fx, 0.9);
  out.mix(pingPong(melo, S16 * 3, 0.4, 4800), 0.3);
  const rvSend = new Stem(DUR);
  rvSend.mix(melo, 0.9);
  rvSend.mix(pads, 0.45);
  rvSend.mix(fx, 0.55);
  // only the claps and rolls should bloom, not the kick
  const drumHp = new Stem(DUR);
  const hpL = new Biquad("hp", 500), hpR = new Biquad("hp", 500);
  for (let i = 0; i < drums.n; i++) { drumHp.L[i] = hpL.tick(drums.L[i]); drumHp.R[i] = hpR.tick(drums.R[i]); }
  rvSend.mix(drumHp, 0.3);
  out.mix(reverb(rvSend, { room: 0.86, damp: 0.4 }), 0.26);

  // silence for the half-beat before each hit, final fade, glue
  out.envelope((t) => {
    let g = 1;
    // dead air before the slash: fade the tape-stop tail out, then start hard on the drop
    if (t > SCRATCH + 0.22 && t < T0) g = clamp(1 - (t - SCRATCH - 0.22) / 0.1);
    if (t > HIT - 0.045 && t < HIT) g *= (HIT - t) / 0.045;
    if (t > DUR - 0.7) g *= clamp((DUR - t) / 0.7);
    return g;
  });
  out.scale(1.0 / out.peak());
  out.saturate(1.2);
  out.scale(0.84 / out.peak());
  return out;
}
