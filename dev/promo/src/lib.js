// Shared runtime for the promo. Everything here is deterministic: time only ever arrives as an
// argument from the HyperFrames clock, and randomness comes from a seeded mulberry32 stream.
(function () {
  const W = 1920;
  const H = 1080;
  const CUES = window.PROMO_CUES;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- math ----
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  /** 0 before `a`, 1 after `b`, linear in between. */
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  const TAU = Math.PI * 2;
  const E = {
    lin: (x) => x,
    inQuad: (x) => x * x,
    outQuad: (x) => 1 - (1 - x) * (1 - x),
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outQuart: (x) => 1 - Math.pow(1 - x, 4),
    outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
    outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
    outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (TAU / 3)) + 1),
  };
  /** Eased 0..1 between two times. */
  const tween = (t, a, b, ease = E.outCubic) => ease(ramp(t, a, b));
  /** A bump: 0 -> 1 over `rise`, then back to 0 over `fall`, starting at t0. */
  const bump = (t, t0, rise, fall) => (t < t0 ? 0 : t < t0 + rise ? (t - t0) / rise : clamp(1 - (t - t0 - rise) / fall));
  /** Decaying impulse starting at t0. */
  const decay = (t, t0, tau) => (t < t0 ? 0 : Math.exp(-(t - t0) / tau));
  /** Stable pseudo-random in [0,1) for an integer key. */
  const hash = (n) => {
    let x = (n | 0) * 374761393 + 668265263;
    x = (x ^ (x >>> 13)) * 1274126177;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  /** Smooth 1D value noise of time. */
  const noise = (x, seed = 0) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return lerp(hash(i + seed * 7919), hash(i + 1 + seed * 7919), u) * 2 - 1;
  };
  const fmtTime = (s) => {
    s = Math.max(0, Math.floor(s));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  };

  // ---- DOM ----
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function add(parent, html) {
    const node = typeof html === "string" ? el(html) : html;
    parent.appendChild(node);
    return node;
  }
  function canvas(parent, cls = "") {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    c.className = "layer " + cls;
    parent.appendChild(c);
    return c.getContext("2d");
  }
  /** Set transform/opacity in one go (only for elements GSAP does not own). */
  function place(node, { x = 0, y = 0, s = 1, sx, sy, r = 0, o, skew = 0 } = {}) {
    node.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${r.toFixed(3)}deg) skewX(${skew.toFixed(2)}deg) scale(${(sx ?? s).toFixed(4)},${(sy ?? s).toFixed(4)})`;
    if (o !== undefined) node.style.opacity = clamp(o).toFixed(3);
  }

  // ---- text helpers ----
  /** Scene headline: words become spans so they can slam in one by one. `*word*` tints a word. */
  function title(parent, lines, { cls = "" } = {}) {
    const node = add(parent, `<h1 class="title ${cls}"></h1>`);
    const words = [];
    lines.forEach((line) => {
      const row = add(node, `<span class="title-line"></span>`);
      line.split(" ").forEach((raw) => {
        const m = raw.match(/^\*(.+?)\*(.*)$/);
        const w = add(row, `<span class="tw${m ? " hl" : ""}"><span class="tw-in">${m ? m[1] + m[2] : raw}</span></span>`);
        words.push(w.firstElementChild);
      });
    });
    return { node, words };
  }
  /** GSAP entrance for a title built with title(): words slam up from below, staggered. */
  function titleIn(tl, ttl, at, { stagger = 0.055, dur = 0.5 } = {}) {
    tl.fromTo(
      ttl.words,
      { yPercent: 120, rotation: 6, opacity: 0 },
      { yPercent: 0, rotation: 0, opacity: 1, duration: dur, ease: "back.out(1.6)", stagger },
      at,
    );
  }
  /** Katakana sound-effect lettering. Returns the node; jitter it from frame(). */
  function kana(parent, text, { x, y, size = 120, color = "#fff", stroke = "#070810", rot = 0, cls = "" }) {
    const node = add(parent, `<div class="kana ${cls}" data-layout-allow-overlap data-layout-ignore style="left:${x}px;top:${y}px;font-size:${size}px;color:${color};-webkit-text-stroke:${Math.max(6, size / 9)}px ${stroke}"></div>`);
    node.dataset.rot = rot;
    [...text].forEach((ch) => add(node, `<span>${ch}</span>`));
    return node;
  }
  /** Manga "on twos" shake for kana lettering: each glyph wobbles on a seeded 12 fps step. */
  function kanaTick(node, t, { amp = 6, show = 1, seed = 1, pop = 1 } = {}) {
    const step = Math.floor(t * 12);
    const rot = +node.dataset.rot || 0;
    node.style.opacity = clamp(show).toFixed(3);
    node.style.transform = `rotate(${rot}deg) scale(${pop.toFixed(3)})`;
    const glyphs = node.children;
    for (let i = 0; i < glyphs.length; i++) {
      const dx = (hash(step * 31 + i * 7 + seed) - 0.5) * amp * 2;
      const dy = (hash(step * 17 + i * 13 + seed + 99) - 0.5) * amp * 2;
      const r = (hash(step * 11 + i * 5 + seed + 7) - 0.5) * amp * 1.2;
      glyphs[i].style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${r.toFixed(1)}deg)`;
    }
  }

  // ---- brand artwork (inlined from .github/assets, re-animated from the clock) ----
  {
    const st = document.createElement("style");
    st.textContent = window.PROMO_BRAND.css;
    document.head.appendChild(st);
  }
  let brandSeq = 0;
  function brand(key, { width, cls = "" } = {}) {
    const a = window.PROMO_BRAND.assets[key];
    const n = ++brandSeq;
    // every instance gets its own id namespace so gradients resolve inside hidden scenes too
    const svg = a.svg.split(key + "-").join(key + n + "-");
    const w = width || a.width;
    const h = (w * a.height) / a.width;
    const wrap = el(`<div class="brand-wrap ${cls}" data-layout-ignore style="width:${w}px;height:${h}px">${svg}</div>`);
    const node = wrap.firstElementChild;
    node.setAttribute("width", w);
    node.setAttribute("height", h);
    const parts = {
      pulse: [...node.querySelectorAll(".pulse")],
      orbit: [...node.querySelectorAll(".orbit")],
      progress: [...node.querySelectorAll(".progress")],
      float: [...node.querySelectorAll(".float")],
      drift: [...node.querySelectorAll(".drift")],
    };
    parts.progress.forEach((p) => {
      p.style.transformBox = "fill-box";
      p.style.transformOrigin = "left center";
    });
    const badge = /^(badge|header|ios)/.test(key);
    wrap.tick = (t) => {
      // same motions the README SVGs run in CSS, now a function of the clock
      const pulse = badge ? 0.725 - 0.275 * Math.cos((TAU * t) / 5) : 0.7 - 0.3 * Math.cos((TAU * t) / 4);
      parts.pulse.forEach((p, i) => (p.style.opacity = (badge ? pulse : 0.7 - 0.3 * Math.cos((TAU * (t + i * 0.35)) / 4)).toFixed(3)));
      parts.orbit.forEach((p) => p.setAttribute("stroke-dashoffset", (-(t / 12) * 120).toFixed(2)));
      const ph = (t % 9) / 9;
      const sx = ph < 0.15 ? 0.62 : ph < 0.7 ? 0.62 + 0.38 * E.inOutSine((ph - 0.15) / 0.55) : 1;
      parts.progress.forEach((p) => (p.style.transform = `scaleX(${sx.toFixed(4)})`));
      parts.float.forEach((p, i) => (p.style.transform = `translateY(${(-2 + 2 * Math.cos((TAU * (t + i * 0.8)) / 7)).toFixed(2)}px)`));
      parts.drift.forEach((p) => (p.style.transform = `translateX(${(12 - 12 * Math.cos((TAU * t) / 9)).toFixed(2)}px)`));
    };
    wrap.tick(0);
    return wrap;
  }

  // ---- canvas painters shared by several scenes ----
  /** Radial manga speed lines converging on (cx, cy). Re-seeded on a 15 fps step for the flicker. */
  function speedLines(ctx, t, { cx, cy, inner = 260, color = "#fff", count = 90, alpha = 1, seed = 1, fps = 15, outer = 1500, width = 1 }) {
    const rnd = mulberry32(seed * 1000 + Math.floor(t * fps));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const a = rnd() * TAU;
      const r0 = inner * (0.75 + rnd() * 0.9);
      const w = (0.004 + rnd() * 0.014) * width;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a - w) * outer, cy + Math.sin(a - w) * outer);
      ctx.lineTo(cx + Math.cos(a + w) * outer, cy + Math.sin(a + w) * outer);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  /** Soft radial glow blob. */
  function glow(ctx, x, y, r, color, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  /** Perspective neon grid floor (synthwave), scrolling with time. */
  function gridFloor(ctx, t, { horizon = 640, color = "#00F0FF", alpha = 0.22, speed = 0.35 }) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const g = ctx.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, color);
    ctx.strokeStyle = g;
    ctx.globalAlpha = alpha;
    for (let i = -14; i <= 14; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * 34, horizon);
      ctx.lineTo(W / 2 + i * 300, H);
      ctx.stroke();
    }
    const ph = (t * speed) % 1;
    for (let k = 0; k < 12; k++) {
      const z = (k + ph) / 12;
      const y = horizon + (H - horizon) * z * z;
      ctx.globalAlpha = alpha * (0.25 + 0.75 * z);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }
  /** Expanding shockwave ring. p: 0..1 */
  function ring(ctx, x, y, r, p, color, width = 10) {
    if (p <= 0 || p >= 1) return;
    ctx.save();
    ctx.globalAlpha = (1 - p) * (1 - p);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (1 - p) + 1;
    ctx.beginPath();
    ctx.arc(x, y, r * E.outCubic(p), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  /** Four-point anime sparkle. */
  function sparkle(ctx, x, y, r, rot = 0, color = "#fff", alpha = 1) {
    if (r <= 0.5 || alpha <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = clamp(alpha);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a + TAU / 8) * r * 0.16, Math.sin(a + TAU / 8) * r * 0.16);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- scene registration ----
  // Fonts: the composition only becomes "ready" (and capture only starts) once every face,
  // weight and script it uses has loaded and the headlines have been fitted to the safe area.
  const FONT_FACES = [
    ['800 64px "Manrope"', "ΑΒΓ αβγ ABC"],
    ['700 32px "Manrope"', "ΑΒΓ"],
    ['500 32px "Manrope"', "ΑΒΓ"],
    ['700 32px "JetBrains Mono"', "ΕΠ 14:28"],
    ['500 32px "JetBrains Mono"', "ΕΠ 14:28"],
    ['400 16px "Inter"', "Επ. abc"],
    ['500 16px "Inter"', "Επ. abc"],
    ['600 16px "Inter"', "Επ. abc"],
    ['700 16px "Inter"', "Επ. abc"],
    ['400 64px "Dela Gothic One"', "ゴシャキーン"],
    ['400 32px "PROXON"', "Anime Tracker"],
    ['400 32px "ComicSans"', "253"],
  ];
  const SAFE_W = W - 2 * 96;
  function fitTitles() {
    document.querySelectorAll(".title").forEach((ttl) => {
      const lines = [...ttl.querySelectorAll(".title-line")];
      const widest = Math.max(...lines.map((l) => l.offsetWidth));
      if (widest > SAFE_W) {
        const fs = parseFloat(getComputedStyle(ttl).fontSize);
        ttl.style.fontSize = Math.floor((fs * SAFE_W) / widest) + "px";
      }
    });
  }
  let bootDone;
  const fontsReady = new Promise((res) => (bootDone = res));
  /** Called once from main.js after every scene has been built. */
  async function boot() {
    try {
      await document.fonts.ready;
      await Promise.all(FONT_FACES.map(([f, s]) => document.fonts.load(f, s)));
      await document.fonts.ready;
    } catch (e) {
      console.warn("font preload:", e);
    }
    fitTitles();
    for (const s of Object.values(scenes)) s.render(0);
    bootDone();
  }

  const scenes = {};
  /**
   * Register one scene composition. def = { build(host), timeline(tl, refs), frame(t, refs) }.
   * `t` in timeline positions and frame() is local to the scene (seconds since its start).
   */
  function scene(id, def) {
    const host = document.getElementById(id);
    const len = parseFloat(host.dataset.duration);
    const refs = def.build(host) || {};
    refs.len = len;
    refs.start = parseFloat(host.dataset.start);
    const tl = gsap.timeline({ paused: true });
    if (def.timeline) def.timeline(tl, refs);
    tl.to({}, { duration: len }, 0); // pin the timeline to the scene length
    window.__timelines = window.__timelines || {};
    window.__timelines[id] = tl;
    const render = (t) => def.frame(clamp(t, 0, len), refs);
    scenes[id] = { host, tl, render, start: refs.start, len };
    if (window.__hyperframes && window.__hyperframes.registerFrameSource) {
      window.__hyperframes.registerFrameSource({ element: host, ready: fontsReady, render });
    }
    render(0);
  }

  // Dev fallback: outside HyperFrames (plain browser) expose a manual seek. Never used in a render.
  if (!window.__hyperframes) {
    window.__promoSeek = (T) => {
      for (const s of Object.values(scenes)) {
        const lt = T - s.start;
        const on = lt >= 0 && lt < s.len;
        s.host.style.visibility = on ? "visible" : "hidden";
        if (on) {
          s.tl.seek(lt);
          s.render(lt);
        }
      }
    };
  }

  window.P = {
    W, H, CUES, TAU, E, mulberry32, clamp, lerp, ramp, tween, bump, decay, hash, noise, fmtTime,
    el, add, canvas, place, title, titleIn, kana, kanaTick, brand,
    speedLines, glow, gridFloor, ring, sparkle, scene, scenes, fontsReady, boot,
  };
})();
