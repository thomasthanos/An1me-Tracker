// SCENE 7 · 30.8–35.0s · FINALE & CALL TO ACTION
// Night sky, drifting cyber-sakura, the hero artwork and the version badge, then the offer.
(function () {
  const { add, clamp, lerp, ramp, tween, bump, decay, hash, noise, E, TAU, W, H } = P;
  const BEAT = 60 / 128;
  const HS = P.hands.SHAPES;
  const VERSION = window.PROMO_BRAND.version;

  function petal(ctx, x, y, s, rot, flip, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s * flip);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.bezierCurveTo(0.95, -0.9, 1.05, 0.35, 0.18, 1);
    ctx.lineTo(0, 0.72); // the notch at a sakura petal's tip
    ctx.lineTo(-0.18, 1);
    ctx.bezierCurveTo(-1.05, 0.35, -0.95, -0.9, 0, -1);
    ctx.fill();
    ctx.restore();
  }
  /** Deterministic petal field. `front` petals are the bigger, closer layer. */
  function sakura(ctx, t, count, seed, front) {
    for (let i = 0; i < count; i++) {
      const k = i + seed * 1000;
      const speed = (front ? 150 : 70) + hash(k * 3) * (front ? 170 : 90);
      const span = H + 240;
      const y = ((hash(k * 7) * span + (t + 3) * speed) % span) - 120;
      const x = ((hash(k * 11) * (W + 400) + (t + 3) * (40 + hash(k * 13) * 70) + Math.sin(t * (0.8 + hash(k * 17)) + k) * 60) % (W + 400)) - 200;
      const s = (front ? 16 : 7) + hash(k * 19) * (front ? 20 : 10);
      const rot = hash(k * 23) * TAU + t * (0.6 + hash(k * 29) * 1.8) * (k % 2 ? 1 : -1);
      const flip = Math.cos(t * (1.2 + hash(k * 31) * 2.2) + k); // tumbling
      const cyber = k % 5 === 0;
      petal(ctx, x, y, s, rot, flip, cyber ? "#7cf6ff" : k % 3 ? "#ff8fc4" : "#ff4f9a", (front ? 0.85 : 0.6) * (0.55 + 0.45 * Math.abs(flip)));
      if (front || cyber) P.glow(ctx, x, y, s * 2.6, cyber ? "rgba(0,240,255,.8)" : "rgba(255,90,170,.8)", 0.22);
    }
  }

  P.scene("s7", {
    build(host) {
      const bg = P.canvas(host);
      const kai = P.character(host, { who: "kai", x: -14, y: 598, scale: 0.98, seed: 71 });
      const rei = P.character(host, { who: "rei", x: 1544, y: 598, scale: 0.98, glasses: true, seed: 72, flip: true });
      const heroBox = add(host, `<div class="s7-hero"></div>`);
      const hero = P.brand("hero", { width: 860 });
      heroBox.appendChild(hero);
      const ver = P.brand("badgeVersion", { width: 103 * 2.3 });
      ver.classList.add("s7-ver");
      host.appendChild(ver);
      const h1 = add(host, `<h2 class="s7-title"></h2>`);
      const letters = [..."AN1ME TRACKER"].map((ch) => add(h1, `<span class="${ch === "1" ? "one" : ""}">${ch === " " ? "&nbsp;" : ch}</span>`));
      const v = add(h1, `<span class="v">v${VERSION}</span>`);
      const sub = add(host, `<div class="s7-sub">Η ΜΝΗΜΗ ΣΟΥ ΕΙΝΑΙ ΓΙΑ ΤΑ <b>PLOT TWISTS.</b> <i>ΟΧΙ ΓΙΑ ΤΑ ΕΠΕΙΣΟΔΙΑ.</i></div>`);
      const row = add(
        host,
        `<div class="s7-badges">
          <div class="chip s7-b" style="--c:#00F0FF">${P.ui.icons.monitor("#00F0FF", 30)}<span>Chrome · Edge · Brave</span></div>
          <div class="chip s7-b" style="--c:#FF2A85;--g:rgba(255,42,133,.5)">${P.ui.icons.phone("#FF2A85", 30)}<span>iPhone Safari &amp; SideStore</span></div>
          <div class="chip s7-b" style="--c:#FFB800;--g:rgba(255,184,0,.5)">${P.ui.icons.star("#FFB800", 30)}<span>100% Δωρεάν &amp; Open Source</span></div>
        </div>`,
      );
      const link = add(host, `<div class="s7-link"><span>github.com/thomasthanos/An1me-Tracker</span><em>·</em><span>me.thomast.uk</span><i></i></div>`);
      const fx = P.canvas(host, "top");
      fx.canvas.style.zIndex = 9;
      return { bg, kai, rei, heroBox, hero, ver, h1, letters, v, sub, badges: [...row.querySelectorAll(".s7-b")], link, line: link.querySelector("i"), fx };
    },

    timeline(tl, r) {
      tl.fromTo(r.heroBox, { scale: 1.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "expo.out" }, 0);
      tl.fromTo(r.ver, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.4)" }, 0.4);
      tl.fromTo(r.letters, { yPercent: 110, opacity: 0, rotation: 8 }, { yPercent: 0, opacity: 1, rotation: 0, duration: 0.45, ease: "back.out(1.9)", stagger: 0.03 }, 0.28);
      tl.fromTo(r.v, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.6)" }, 0.78);
      tl.fromTo(r.sub, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 1.0);
      tl.fromTo(r.badges, { scale: 0.3, opacity: 0, y: 30 }, { scale: 1, opacity: 1, y: 0, duration: 0.42, ease: "back.out(2)", stagger: 0.14 }, 1.3);
      tl.fromTo(r.link, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, 1.95);
      tl.fromTo(r.line, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power3.inOut" }, 2.1);
      tl.fromTo(r.kai.node, { y: 320, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "back.out(1.3)" }, 0.35);
      tl.fromTo(r.rei.node, { y: 320, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "back.out(1.3)" }, 0.5);
    },

    frame(t, r) {
      const beat = decay(t % BEAT, 0, 0.11) * clamp(1 - t / 3.4); // the outro pulse, fading with the music
      const ctx = r.bg;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#05060d");
      g.addColorStop(0.55, "#0e0a24");
      g.addColorStop(1, "#24103f");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // stars
      for (let i = 0; i < 110; i++) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.8 + hash(i * 3) * 2) + i));
        ctx.fillStyle = `rgba(255,255,255,${(0.15 + 0.5 * hash(i * 5) * tw).toFixed(2)})`;
        ctx.fillRect(hash(i * 7) * W, hash(i * 11) * 620, 1.5 + hash(i * 13) * 2, 1.5 + hash(i * 13) * 2);
      }
      P.glow(ctx, 960, 300, 760 + 60 * beat, "rgba(0,240,255,.36)", 1);
      P.glow(ctx, 520, 520, 600, "rgba(255,42,133,.3)", 1);
      P.glow(ctx, 1420, 520, 600, "rgba(120,60,255,.3)", 1);
      // neon skyline
      const rnd = P.mulberry32(1234);
      let x = -20;
      while (x < W) {
        const bw = 44 + rnd() * 110;
        const bh = 70 + rnd() * 230;
        const top = H - bh;
        ctx.fillStyle = "#0a0718";
        ctx.fillRect(x, top, bw, bh);
        ctx.fillStyle = rnd() > 0.5 ? "rgba(0,240,255,.8)" : "rgba(255,42,133,.8)";
        ctx.fillRect(x, top, bw, 3);
        const cols = Math.floor(bw / 16), rows = Math.floor(bh / 22);
        for (let cI = 1; cI < cols; cI++) {
          for (let rI = 1; rI < rows; rI++) {
            const lit = rnd();
            if (lit > 0.72) {
              ctx.fillStyle = lit > 0.9 ? "rgba(255,184,0,.75)" : lit > 0.8 ? "rgba(0,240,255,.6)" : "rgba(255,42,133,.55)";
              ctx.fillRect(x + cI * 16 - 4, top + rI * 22, 7, 9);
            }
          }
        }
        x += bw + 4;
      }
      const haze = ctx.createLinearGradient(0, 700, 0, H);
      haze.addColorStop(0, "rgba(255,42,133,0)");
      haze.addColorStop(1, "rgba(255,42,133,.34)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 700, W, 380);
      sakura(ctx, t, 70, 1, false);
      sakura(ctx, t, 16, 2, true); // the big petals stay behind the lockup so no copy is ever covered

      r.hero.tick(t + 2);
      r.ver.tick(t);
      r.heroBox.style.boxShadow = `0 0 0 2px rgba(0,240,255,.55), 0 0 ${(70 + 60 * beat).toFixed(0)}px rgba(0,240,255,${(0.45 + 0.3 * beat).toFixed(2)}), 0 0 220px rgba(255,42,133,.35), 0 40px 90px rgba(0,0,0,.7)`;
      r.h1.style.transform = `translateX(-50%) scale(${(1 + 0.012 * beat).toFixed(4)})`;

      // Kai gives a thumbs-up, Rei waves
      const kUp = tween(t, 0.7, 1.15, E.outBack);
      const thumbs = P.hands.mix({ x: 372, y: 560, rot: -20, view: "back", side: 1, elbow: 1, ...HS.fist }, { x: 368, y: 322 - 10 * bump(t, 2.2, 0.1, 0.25), rot: -54, view: "back", side: 1, elbow: 1, ...HS.thumbUp }, kUp);
      const rUp = tween(t, 0.9, 1.3, E.outBack);
      const sway = Math.sin((t - 1.3) * 7.5) * clamp(t - 1.2) * clamp(3.9 - t);
      const wave = P.hands.mix(
        { x: 380, y: 560, rot: 0, view: "palm", side: -1, elbow: 1, ...HS.relaxed },
        { x: 392 + 10 * sway, y: 300, rot: 6 + 20 * sway, view: "palm", side: -1, elbow: 1, ...HS.open, curls: HS.open.curls.map((c, i) => c + 0.06 + 0.05 * Math.sin(t * 7.5 + i)) },
        rUp,
      );
      r.kai.set(t, { mouth: "grin", browLift: 4, look: [6, -2], blush: 0.4, eye: t > 2.2 && t < 2.6 ? "happy" : "open", tilt: 3, armR: thumbs });
      r.rei.set(t, { mouth: t > 1.4 ? "grin" : "smile", look: [6, -2], blush: 0.4, eye: t > 3.2 && t < 3.6 ? "happy" : "open", flash: 0.9 * decay(t, 1.35, 0.18), glint: ramp(t, 1.35, 1.75), tilt: 3, armR: wave });

      // foreground: the shimmer
      const f = r.fx;
      f.clearRect(0, 0, W, H);
      for (let i = 0; i < 26; i++) {
        const at = 0.1 + hash(i * 3) * 3.6;
        const a = hash(i * 7) * TAU;
        const d = 470 + hash(i * 11) * 260;
        P.sparkle(f, 960 + Math.cos(a) * d * 1.25, 300 + Math.sin(a) * d * 0.42, (16 + hash(i * 13) * 26) * bump(t, at, 0.14, 0.5), t * 1.5 + i, i % 3 ? "#fff" : "#9ff", 1);
      }
      for (let k = 0; k < 3; k++) P.ring(f, 960, 300, 1400, ramp(t, k * 0.12, 0.9 + k * 0.12), k % 2 ? "#FF2A85" : "#00F0FF", 22);
    },
  });
})();
