// Overlays that live above every scene: the cut wipes / flashes, and the Greek sales captions
// that light up word by word in sync with the voiceover (timings from the audio build).
(function () {
  const { W, H, add, clamp, ramp, lerp, decay, E } = P;
  const CUES = P.CUES;

  // ---------------------------------------------------------------- cut wipes + flashes
  const fxHost = document.getElementById("fx");
  const ctx = P.canvas(fxHost);
  const cuts = CUES.scenes.slice(1, -2); // every cut except the finale, which is a white-out
  const FINALE = CUES.s7.hit;
  const WIPE = 0.5; // seconds, centred on the cut
  const BLOCK = 3200;
  const SKEW = 300;

  function wipe(p, i) {
    ctx.save();
    if (i % 2) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    // a slanted obsidian slab crosses the frame; it fully covers the picture on the cut itself
    const x = -BLOCK - SKEW + (W + BLOCK + 2 * SKEW) * p;
    const slab = (x0, x1, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x0 + SKEW, 0);
      ctx.lineTo(x1 + SKEW, 0);
      ctx.lineTo(x1, H);
      ctx.lineTo(x0, H);
      ctx.closePath();
      ctx.fill();
    };
    slab(x - 150, x + BLOCK + 150, "rgba(255,42,133,.5)");
    slab(x - 70, x + BLOCK + 70, "#00F0FF");
    slab(x - 44, x + BLOCK + 44, "#FF2A85");
    slab(x, x + BLOCK, "#070810");
    // neon hairlines inside the slab
    ctx.globalAlpha = 0.5;
    for (let k = 0; k < 7; k++) slab(x + 120 + k * 480, x + 126 + k * 480, k % 2 ? "#00F0FF" : "#FF2A85");
    ctx.restore();
  }

  function renderFx(t) {
    ctx.clearRect(0, 0, W, H);
    if (t < 0.35) {
      ctx.fillStyle = `rgba(7,8,16,${(0.72 * (1 - ramp(t, 0, 0.35))).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    cuts.forEach((c, i) => {
      const p = (t - (c - WIPE / 2)) / WIPE;
      if (p > 0 && p < 1) wipe(p, i);
    });
    // finale: build to white, land on the hit, bloom out
    const white = t < FINALE ? Math.pow(ramp(t, FINALE - 0.16, FINALE), 2) : decay(t, FINALE, 0.13);
    if (white > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, white).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  if (window.__hyperframes?.registerFrameSource) {
    window.__hyperframes.registerFrameSource({ element: fxHost, ready: P.fontsReady, render: renderFx });
  }

  // ---------------------------------------------------------------- captions
  const capHost = document.getElementById("captions");
  const ACCENT = ["#FF2A85", "#00F0FF", "#FFB800", "#00F0FF", "#FF2A85", "#35E3A4", "#FFB800"];
  const MAX = 30; // characters per caption line
  const groups = [];
  (window.PROMO_CAPTIONS?.scenes || []).forEach((sc, si) => {
    const bySentence = [];
    sc.words.forEach((w) => (bySentence[w.si] = bySentence[w.si] || []).push(w));
    const chunks = [];
    bySentence.forEach((words) => {
      let cur = [];
      let len = 0;
      const local = [];
      words.forEach((w) => {
        if (cur.length && len + 1 + w.w.length > MAX) {
          local.push(cur);
          cur = [];
          len = 0;
        }
        cur.push(w);
        len += (len ? 1 : 0) + w.w.length;
        if (/[,…]$|\.\.\.$/.test(w.w) && len >= 14) {
          local.push(cur);
          cur = [];
          len = 0;
        }
      });
      if (cur.length) local.push(cur);
      // never leave a single short word alone on a line
      const last = local[local.length - 1];
      if (local.length > 1 && last.length === 1 && last[0].w.length < 9) {
        local.pop();
        local[local.length - 1].push(...last);
      }
      chunks.push(...local);
    });
    chunks.forEach((words, k) => {
      const box = add(capHost, `<div class="cap-box"></div>`);
      const spans = words.map((w) => add(box, `<span class="cap-w">${w.w}</span>`));
      box.style.visibility = "hidden";
      const next = chunks[k + 1];
      groups.push({
        box, spans, words, accent: ACCENT[si],
        from: Math.max(sc.start, words[0].s - 0.1),
        to: next ? next[0].s - 0.1 : Math.min(sc.end - 0.03, words[words.length - 1].e + 0.45),
      });
    });
  });

  function renderCaptions(t) {
    for (const g of groups) {
      const on = t >= g.from && t < g.to;
      g.box.style.visibility = on ? "visible" : "hidden";
      if (!on) continue;
      const inn = E.outBack(ramp(t, g.from, g.from + 0.16));
      const out = 1 - ramp(t, g.to - 0.07, g.to);
      g.box.style.opacity = (ramp(t, g.from, g.from + 0.08) * out).toFixed(3);
      g.box.style.transform = `translateX(-50%) translateY(${lerp(26, 0, inn).toFixed(2)}px) scale(${lerp(0.9, 1, inn).toFixed(4)})`;
      g.box.style.borderColor = g.accent + "66";
      g.words.forEach((w, i) => {
        const sp = g.spans[i];
        const end = g.words[i + 1] ? g.words[i + 1].s : w.e + 0.12;
        const lit = ramp(t, w.s - 0.02, w.s + 0.04);
        const active = t >= w.s - 0.02 && t < end;
        const pop = t >= w.s ? decay(t, w.s, 0.11) : 0;
        sp.style.color = active ? g.accent : lit > 0 ? "#ffffff" : "rgba(244,246,255,0.52)";
        sp.style.textShadow = active ? `0 0 26px ${g.accent}aa, 0 3px 0 rgba(0,0,0,.5)` : "0 3px 0 rgba(0,0,0,.45)";
        sp.style.transform = `translateY(${(-7 * pop).toFixed(2)}px) scale(${(1 + 0.16 * pop).toFixed(4)})`;
      });
    }
  }
  if (window.__hyperframes?.registerFrameSource) {
    window.__hyperframes.registerFrameSource({ element: capHost, ready: P.fontsReady, render: renderCaptions });
  }
  P.overlays = { renderFx, renderCaptions, groups };
})();
