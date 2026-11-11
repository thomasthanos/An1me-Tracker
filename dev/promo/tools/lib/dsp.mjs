// Tiny deterministic DSP toolkit for the promo soundtrack. No dependencies, no wall clock,
// no Math.random(): every noise source is a seeded mulberry32 stream, so a rebuild is
// sample-identical.
import { writeFileSync } from "node:fs";

export const SR = 48000;
export const TAU = Math.PI * 2;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dB = (d) => Math.pow(10, d / 20);
export const secs = (t) => Math.max(0, Math.round(t * SR));

/** Stereo buffer with a few mixing helpers. */
export class Stem {
  constructor(seconds) {
    this.n = secs(seconds);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
  }
  /** Mix a mono buffer in at `t` seconds. pan: -1 (left) .. 1 (right), equal power. */
  add(buf, t, gain = 1, pan = 0) {
    const s = secs(t);
    const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
    const gl = Math.cos(a) * Math.SQRT2 * gain;
    const gr = Math.sin(a) * Math.SQRT2 * gain;
    const end = Math.min(this.n, s + buf.length);
    for (let i = s, j = 0; i < end; i++, j++) {
      this.L[i] += buf[j] * gl;
      this.R[i] += buf[j] * gr;
    }
  }
  /** Mix a stereo pair in at `t` seconds. */
  addStereo(l, r, t, gain = 1) {
    const s = secs(t);
    const end = Math.min(this.n, s + l.length);
    for (let i = s, j = 0; i < end; i++, j++) {
      this.L[i] += l[j] * gain;
      this.R[i] += r[j] * gain;
    }
  }
  mix(other, gain = 1) {
    const n = Math.min(this.n, other.n);
    for (let i = 0; i < n; i++) {
      this.L[i] += other.L[i] * gain;
      this.R[i] += other.R[i] * gain;
    }
  }
  scale(g) {
    for (let i = 0; i < this.n; i++) {
      this.L[i] *= g;
      this.R[i] *= g;
    }
  }
  /** Multiply by a gain curve given as fn(seconds). */
  envelope(fn) {
    for (let i = 0; i < this.n; i++) {
      const g = fn(i / SR);
      this.L[i] *= g;
      this.R[i] *= g;
    }
  }
  peak() {
    let p = 0;
    for (let i = 0; i < this.n; i++) {
      const a = Math.abs(this.L[i]);
      const b = Math.abs(this.R[i]);
      if (a > p) p = a;
      if (b > p) p = b;
    }
    return p;
  }
  /** Soft saturation, keeps the stem inside (-1, 1). */
  saturate(drive = 1) {
    const k = 1 / Math.tanh(drive);
    for (let i = 0; i < this.n; i++) {
      this.L[i] = Math.tanh(this.L[i] * drive) * k;
      this.R[i] = Math.tanh(this.R[i] * drive) * k;
    }
  }
}

/** RBJ biquad, transposed direct form II. */
export class Biquad {
  constructor(type, f, q = 0.707, gainDb = 0) {
    this.z1 = 0;
    this.z2 = 0;
    this.set(type, f, q, gainDb);
  }
  set(type, f, q = 0.707, gainDb = 0) {
    const w = (TAU * clamp(f, 10, SR * 0.45)) / SR;
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === "lp") {
      b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    } else if (type === "hp") {
      b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    } else if (type === "bp") {
      b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    } else if (type === "peak") {
      const A = Math.pow(10, gainDb / 40);
      b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
    } else {
      throw new Error("unknown biquad type " + type);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  tick(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** Run a filter over a mono buffer; `sweep(i, t)` may retune it every 32 samples. */
export function filterBuf(buf, type, f, q = 0.707, sweep) {
  const bq = new Biquad(type, typeof f === "function" ? f(0) : f, q);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    if (typeof f === "function" && (i & 31) === 0) bq.set(type, f(i / SR), typeof q === "function" ? q(i / SR) : q);
    out[i] = bq.tick(buf[i]);
  }
  return out;
}

function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** Band-limited saw oscillator: returns fn(freq) -> sample. */
export function sawOsc(phase = 0) {
  let ph = phase % 1;
  return (freq) => {
    const dt = freq / SR;
    ph += dt;
    if (ph >= 1) ph -= 1;
    return 2 * ph - 1 - polyblep(ph, dt);
  };
}

/** Band-limited square oscillator. */
export function squareOsc(phase = 0) {
  let ph = phase % 1;
  return (freq) => {
    const dt = freq / SR;
    ph += dt;
    if (ph >= 1) ph -= 1;
    let v = ph < 0.5 ? 1 : -1;
    v += polyblep(ph, dt);
    v -= polyblep((ph + 0.5) % 1, dt);
    return v;
  };
}

export function sineOsc(phase = 0) {
  let ph = phase * TAU;
  return (freq) => {
    ph += (TAU * freq) / SR;
    if (ph > TAU) ph -= TAU;
    return Math.sin(ph);
  };
}

/** White noise buffer from a seed. */
export function noiseBuf(seconds, seed) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(secs(seconds));
  for (let i = 0; i < out.length; i++) out[i] = rnd() * 2 - 1;
  return out;
}

/** Render fn(t, i) for `seconds` into a mono buffer. */
export function render(seconds, fn) {
  const out = new Float32Array(secs(seconds));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / SR, i);
  return out;
}

/** Linear attack, exponential decay. */
export const ad = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

/** Short fades at both ends so nothing clicks. */
export function declick(buf, inS = 0.003, outS = 0.01) {
  const a = Math.min(buf.length, secs(inS));
  const b = Math.min(buf.length, secs(outS));
  for (let i = 0; i < a; i++) buf[i] *= i / a;
  for (let i = 0; i < b; i++) buf[buf.length - 1 - i] *= i / b;
  return buf;
}

/** Stereo ping-pong delay send. Returns a wet-only stem. */
export function pingPong(stem, time, feedback = 0.42, lowpass = 5200) {
  const d = secs(time);
  const wet = new Stem(stem.n / SR);
  const bufL = new Float32Array(d);
  const bufR = new Float32Array(d);
  const lpL = new Biquad("lp", lowpass);
  const lpR = new Biquad("lp", lowpass);
  let p = 0;
  for (let i = 0; i < stem.n; i++) {
    const inp = (stem.L[i] + stem.R[i]) * 0.5;
    const outL = bufL[p];
    const outR = bufR[p];
    bufL[p] = lpL.tick(inp + outR * feedback);
    bufR[p] = lpR.tick(outL * feedback);
    wet.L[i] = outL;
    wet.R[i] = outR;
    p = (p + 1) % d;
  }
  return wet;
}

/** Compact Schroeder/Freeverb-style stereo reverb send. Returns a wet-only stem. */
export function reverb(stem, { room = 0.84, damp = 0.35, predelay = 0.012 } = {}) {
  const combT = [0.0297, 0.0371, 0.0411, 0.0437, 0.0353, 0.0319];
  const apT = [0.005, 0.0017, 0.0123];
  const wet = new Stem(stem.n / SR);
  const pd = secs(predelay);
  for (let ch = 0; ch < 2; ch++) {
    const src = ch === 0 ? stem.L : stem.R;
    const dst = ch === 0 ? wet.L : wet.R;
    const spread = ch === 0 ? 0 : 0.00071;
    const combs = combT.map((t) => ({ buf: new Float32Array(secs(t + spread)), p: 0, lp: 0 }));
    const aps = apT.map((t) => ({ buf: new Float32Array(secs(t + spread)), p: 0 }));
    for (let i = 0; i < stem.n; i++) {
      const x = i >= pd ? src[i - pd] : 0;
      let acc = 0;
      for (const c of combs) {
        const y = c.buf[c.p];
        c.lp = y * (1 - damp) + c.lp * damp;
        c.buf[c.p] = x + c.lp * room;
        c.p = (c.p + 1) % c.buf.length;
        acc += y;
      }
      acc /= combs.length;
      for (const a of aps) {
        const b = a.buf[a.p];
        const y = -acc + b;
        a.buf[a.p] = acc + b * 0.5;
        a.p = (a.p + 1) % a.buf.length;
        acc = y;
      }
      dst[i] = acc;
    }
  }
  return wet;
}

/** 24-bit PCM stereo WAV. */
export function writeWav(path, stem, { bits = 24 } = {}) {
  const bytes = bits / 8;
  const dataLen = stem.n * 2 * bytes;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2 * bytes, 28);
  buf.writeUInt16LE(2 * bytes, 32);
  buf.writeUInt16LE(bits, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  const max = Math.pow(2, bits - 1) - 1;
  let o = 44;
  for (let i = 0; i < stem.n; i++) {
    for (const v of [stem.L[i], stem.R[i]]) {
      const s = Math.round(clamp(v, -1, 1) * max);
      if (bits === 24) {
        buf.writeIntLE(s, o, 3);
      } else {
        buf.writeInt16LE(s, o);
      }
      o += bytes;
    }
  }
  writeFileSync(path, buf);
}
