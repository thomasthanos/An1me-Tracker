// SCENE 1 · 0.0–5.0s · THE PROBLEM (manga panic hook)
// 03:00, thirty tabs, no idea which episode. At 3.8s a katana cuts the frame in two and the
// An1me Tracker hero artwork is revealed behind it.
(function () {
  const { add, clamp, lerp, ramp, tween, bump, decay, hash, E, TAU, W, H } = P;
  const C = P.CUES.s1;
  // the cut: top-right to bottom-left
  const P1 = [1601, -80];
  const P2 = [319, 1160];
  const LEN = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
  const DIR = [(P2[0] - P1[0]) / LEN, (P2[1] - P1[1]) / LEN];
  const NRM = [DIR[1], -DIR[0]]; // unit normal of the cut, pointing to the lower-right half

  const TAGS = [
    ["ΕΠ. 17;", 112, 404, -8], ["ΕΠ. 18;", 632, 318, 7], ["12:40;", 100, 626, 6], ["14:28;", 652, 566, -6], ["ΠΟΙΟ ΛΕΠΤΟ;", 566, 806, 4],
  ];
  const TAB_NAMES = ["Επ. 12", "an1me.to", "Επ. 17", "Αναζήτηση", "Επ. 18?", "wiki", "Επ. 16", "recap", "Επ. 19", "forum", "Επ. 17 (2)", "…"];

  /** One copy of the manga panel. The frame is drawn twice (one per half of the cut). */
  function buildManga(root) {
    const ctx = P.canvas(root);
    const panel = add(root, `<div class="s1-panel"><div class="s1-tone"></div></div>`);
    const kai = P.character(root, { who: "kai", x: 196, y: 286, scale: 1.34, seed: 3 });
    const clock = add(root, `<div class="s1-clock"><svg width="38" height="38" viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" fill="#FFB800" stroke="#070810" stroke-width="1.2"/></svg><span class="hh">03</span><span class="colon">:</span><span>00</span><small>ΠΜ</small></div>`);
    const tags = TAGS.map(([txt, x, y, r]) => add(root, `<div class="s1-q" style="left:${x}px;top:${y}px" data-r="${r}">${txt}</div>`));
    const browser = add(
      root,
      `<div class="s1-browser" data-layout-ignore><div class="s1-tabs"></div>
        <div class="s1-url"><span class="lock"></span>an1me.to/watch/…/episode-<b>??</b></div>
        <div class="s1-body">
          <div class="s1-count"><b>30</b> ΑΝΟΙΧΤΑ TABS</div>
          <div class="s1-rows">
            <div class="s1-row"><i></i><span>Επεισόδιο 16</span><em>το είδα;</em></div>
            <div class="s1-row"><i></i><span>Επεισόδιο 17</span><em>μισό; ολόκληρο;</em></div>
            <div class="s1-row hot"><i></i><span>Επεισόδιο 18</span><em>12:40; ή 14:28;</em></div>
            <div class="s1-row"><i></i><span>Επεισόδιο 19</span><em>spoiler!!</em></div>
          </div>
          <div class="s1-big">?</div>
        </div></div>`,
    );
    const tabBar = browser.querySelector(".s1-tabs");
    const tabs = [];
    for (let i = 0; i < 30; i++) tabs.push(add(tabBar, `<div class="s1-tab"><i style="background:hsl(${(i * 47) % 360} 80% 60%)"></i><span>${TAB_NAMES[i % TAB_NAMES.length]}</span></div>`));
    const count = browser.querySelector(".s1-count b");
    const rows = [...browser.querySelectorAll(".s1-row")];
    const big = browser.querySelector(".s1-big");
    const k1 = P.kana(root, "ゴゴゴゴ", { x: 1180, y: 742, size: 150, color: "#9b4dff", rot: -6 });
    const k2 = P.kana(root, "ゴゴゴ", { x: 60, y: 880, size: 96, color: "#7a2cff", rot: 6 });
    const ttl = P.title(root, ["ΞΕΧΑΣΕΣ ΠΑΛΙ ΣΕ *ΠΟΙΟ* *ΕΠΕΙΣΟΔΙΟ* ΕΜΕΙΝΕΣ;"]);
    ttl.node.style.setProperty("--hl", "#FF2A85");
    ttl.node.style.setProperty("--hl-glow", "rgba(255,42,133,.6)");
    const colon = clock.querySelector(".colon");

    function update(t) {
      // heartbeat: the whole panel thumps
      let beat = 0;
      for (const hb of C.heartbeats) beat = Math.max(beat, decay(t, hb, 0.12), 0.7 * decay(t, hb + 0.21, 0.1));
      const freeze = t >= C.scratch; // the record scratch stops the world
      const tt = freeze ? C.scratch : t;
      const glitch = t >= C.scratch && t < C.slash - 0.14 ? 1 : 0;
      const step = Math.floor(t * 22);
      const gx = glitch * (hash(step) - 0.5) * 46;

      // background: speed lines converging on Kai, purple dread
      ctx.fillStyle = "#0b0718";
      ctx.fillRect(0, 0, W, H);
      P.glow(ctx, 470, 560, 900, "rgba(120,50,220,.55)", 0.8 + 0.2 * beat);
      P.glow(ctx, 1500, 300, 700, "rgba(255,42,133,.25)", 1);
      P.speedLines(ctx, tt, { cx: 470, cy: 560, inner: 380 - 40 * beat, color: "#efe6ff", count: 120, alpha: 0.5 + 0.35 * beat, seed: 1, fps: 14 });
      P.speedLines(ctx, tt, { cx: 470, cy: 560, inner: 520, color: "#9b4dff", count: 60, alpha: 0.5, seed: 2, fps: 14, width: 2 });
      // red pulse vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 1150);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, `rgba(${Math.round(120 + 110 * beat)},0,${Math.round(40 + 30 * beat)},${0.55 + 0.3 * beat})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      const zoom = 1 + 0.018 * beat;
      root.style.transform = `translate(${gx.toFixed(1)}px,0) scale(${zoom.toFixed(4)})`;

      P.place(panel, { r: -1.6, s: tween(t, 0.05, 0.5, E.outBack), o: ramp(t, 0.05, 0.2) });
      kai.node.style.opacity = ramp(t, 0.12, 0.3).toFixed(3);
      const dart = Math.sin(tt * 5.2) > 0 ? 1 : -1;
      const shake = (hash(Math.floor(tt * 16)) - 0.5) * 5;
      kai.set(tt, {
        mouth: tt > 1.0 ? "panic" : "o", brow: -15, browLift: 5, irisScale: lerp(0.8, 0.52, ramp(tt, 0.4, 2.4)),
        look: [dart * 7, 1], bags: 1, sweat: ramp(tt, 0.5, 1), gloom: ramp(tt, 0.3, 1.2), dx: shake, bob: -4 * beat, blink: false,
        mouthScale: 1 + 0.12 * Math.sin(tt * 18),
      });

      P.place(clock, { s: tween(t, 0.2, 0.6, E.outBack), o: ramp(t, 0.2, 0.32), r: 2 });
      colon.style.opacity = Math.floor(tt * 2) % 2 ? "0.25" : "1";

      // question tags pop one by one around his head
      tags.forEach((q, i) => {
        const at = 0.75 + i * 0.42;
        const wob = Math.sin(tt * 6 + i * 2) * 3;
        P.place(q, { s: tween(t, at, at + 0.3, E.outBack), o: ramp(t, at, at + 0.08), r: +q.dataset.r + wob, y: -6 * Math.sin(tt * 3 + i) });
      });

      // browser: tabs multiply until there are 30 of them
      P.place(browser, { x: lerp(180, 0, tween(t, 0.25, 0.75, E.outExpo)), o: ramp(t, 0.25, 0.45), r: 1.2 });
      const n = Math.round(lerp(5, 30, tween(tt, 0.5, 2.9, E.inOutCubic)));
      tabs.forEach((tab, i) => {
        tab.style.display = i < n ? "" : "none";
        tab.style.opacity = i === n - 1 ? "1" : "0.72";
      });
      count.textContent = n;
      rows.forEach((r, i) => {
        const at = 0.9 + i * 0.3;
        P.place(r, { x: lerp(60, 0, tween(t, at, at + 0.35, E.outCubic)), o: ramp(t, at, at + 0.15) });
      });
      P.place(big, { s: 1 + 0.12 * beat + 0.04 * Math.sin(tt * 7), r: 8 * Math.sin(tt * 2.2), o: ramp(t, 1.4, 1.7) });

      P.kanaTick(k1, tt, { amp: 7, show: ramp(t, 0.6, 0.8), seed: 3, pop: lerp(1.5, 1, tween(t, 0.6, 0.95, E.outBack)) });
      P.kanaTick(k2, tt, { amp: 5, show: ramp(t, 1.5, 1.7), seed: 9, pop: lerp(1.5, 1, tween(t, 1.5, 1.85, E.outBack)) });
    }
    return { update, ttl };
  }

  P.scene("s1", {
    build(host) {
      // --- what the blade reveals ---
      const reveal = add(host, `<div class="layer s1-reveal"></div>`);
      const rctx = P.canvas(reveal);
      const heroBox = add(reveal, `<div class="s1-hero"></div>`);
      const hero = P.brand("hero", { width: 1320 });
      heroBox.appendChild(hero);
      const sheen = add(heroBox, `<div class="s1-sheen"></div>`);
      const slashTxt = add(reveal, `<div class="s1-slashtxt">SLASH!</div>`);
      const kz = P.kana(reveal, "ザシュッ!", { x: 1250, y: 150, size: 140, color: "#00F0FF", rot: 9 });
      // --- the manga panel, in two halves along the cut ---
      const halves = ["A", "B"].map((k) => {
        const node = add(host, `<div class="layer s1-half s1-half${k}"><div class="layer s1-manga"></div></div>`);
        return { node, manga: buildManga(node.firstElementChild) };
      });
      const fx = P.canvas(host, "s1-fx");
      return { reveal, rctx, hero, heroBox, sheen, slashTxt, kz, halves, fx };
    },

    timeline(tl, r) {
      const words = r.halves.flatMap((h) => h.manga.ttl.words);
      // both copies of the headline slam in together
      tl.fromTo(words, { yPercent: 120, rotation: 6, opacity: 0 }, { yPercent: 0, rotation: 0, opacity: 1, duration: 0.5, ease: "back.out(1.6)", stagger: { each: 0.06, grid: [2, words.length / 2], axis: "x" } }, 0.3);
      tl.fromTo(r.heroBox, { scale: 0.62, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: "back.out(1.8)" }, C.slash + 0.06);
      tl.fromTo(r.slashTxt, { scale: 2.2, opacity: 0, rotation: -14 }, { scale: 1, opacity: 1, rotation: -8, duration: 0.3, ease: "expo.out" }, C.slash + 0.02);
      tl.to(r.slashTxt, { opacity: 0, x: -60, duration: 0.3, ease: "power2.in" }, C.slash + 0.75);
    },

    frame(t, r) {
      r.halves.forEach((h) => h.manga.update(t));

      // impact frame + the two halves sliding apart along the cut
      const cut = t >= C.slash;
      const impact = t >= C.slash && t < C.slash + 0.07;
      const sl = tween(t, C.slash + 0.05, C.slash + 0.8, E.outQuart);
      const slide = 1500 * sl;
      const gap = 420 * sl;
      r.halves.forEach((h, i) => {
        const sgn = i === 0 ? -1 : 1; // A (upper-left) leaves up and away, B (lower-right) down and away
        const x = sgn * (DIR[0] * slide + NRM[0] * gap);
        const y = sgn * (DIR[1] * slide + NRM[1] * gap);
        h.node.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(sgn * -3 * sl).toFixed(2)}deg)`;
        h.node.style.filter = impact ? "invert(1) grayscale(1) contrast(1.6)" : "none";
        h.node.style.visibility = sl >= 1 ? "hidden" : "visible";
      });

      // reveal layer
      const lt = Math.max(0, t - C.slash);
      const ctx = r.rctx;
      ctx.fillStyle = "#070810";
      ctx.fillRect(0, 0, W, H);
      if (cut) {
        P.glow(ctx, 960, 520, 980, "rgba(0,240,255,.34)", 1);
        P.glow(ctx, 520, 760, 720, "rgba(255,42,133,.3)", 1);
        P.glow(ctx, 1500, 260, 620, "rgba(255,184,0,.16)", 1);
        P.speedLines(ctx, t, { cx: 960, cy: 525, inner: 760, color: "#00F0FF", count: 70, alpha: 0.22, seed: 7, fps: 12 });
        P.speedLines(ctx, t, { cx: 960, cy: 525, inner: 820, color: "#FF2A85", count: 50, alpha: 0.2, seed: 8, fps: 12 });
        for (let k = 0; k < 3; k++) P.ring(ctx, 960, 525, 1300, ramp(lt, 0.02 + k * 0.12, 0.8 + k * 0.12), k % 2 ? "#FF2A85" : "#00F0FF", 16);
        for (let i = 0; i < 12; i++) {
          const a = hash(i * 9) * TAU;
          const d = 480 + hash(i * 5 + 1) * 420;
          P.sparkle(ctx, 960 + Math.cos(a) * d * 1.3, 525 + Math.sin(a) * d * 0.55, 26 * bump(lt, 0.2 + hash(i) * 0.7, 0.12, 0.35), lt * 2 + i, i % 2 ? "#fff" : "#9ff", 1);
        }
      }
      r.hero.tick(lt + 1.2);
      r.sheen.style.transform = `translateX(${lerp(-500, 1500, ramp(lt, 0.5, 1.0)).toFixed(1)}px) skewX(-20deg)`;
      r.sheen.style.opacity = ramp(lt, 0.5, 0.55) * (1 - ramp(lt, 0.95, 1.0));
      P.kanaTick(r.kz, t, { amp: 6, show: ramp(lt, 0.02, 0.08) * (1 - ramp(lt, 0.95, 1.15)), seed: 5, pop: lerp(1.8, 1, tween(lt, 0.02, 0.3, E.outBack)) });

      // the blade
      const f = r.fx;
      f.clearRect(0, 0, W, H);
      const draw = ramp(t, C.slash - 0.13, C.slash);
      const fade = 1 - ramp(t, C.slash + 0.04, C.slash + 0.32);
      if (draw > 0 && fade > 0) {
        const x1 = P1[0], y1 = P1[1];
        const x2 = lerp(P1[0], P2[0], E.inQuad(draw));
        const y2 = lerp(P1[1], P2[1], E.inQuad(draw));
        f.save();
        f.lineCap = "round";
        f.globalAlpha = fade;
        const strokes = [["rgba(255,42,133,.5)", 54], ["rgba(0,240,255,.75)", 24], ["#fff", 9]];
        for (const [c, w] of strokes) {
          f.strokeStyle = c;
          f.lineWidth = w * (0.5 + 0.5 * fade);
          f.beginPath();
          f.moveTo(x1, y1);
          f.lineTo(x2, y2);
          f.stroke();
        }
        // sparks thrown off the edge
        if (cut) {
          for (let i = 0; i < 60; i++) {
            const u = hash(i * 3 + 1);
            const side = hash(i * 7) > 0.5 ? 1 : -1;
            const sp = 260 + hash(i * 11) * 1100;
            const px = lerp(P1[0], P2[0], u) + NRM[0] * side * sp * lt + DIR[0] * (hash(i) - 0.5) * 300 * lt;
            const py = lerp(P1[1], P2[1], u) + NRM[1] * side * sp * lt + 500 * lt * lt;
            f.fillStyle = i % 3 ? "#fff" : i % 2 ? "#00F0FF" : "#FF2A85";
            f.globalAlpha = fade;
            f.fillRect(px, py, 3 + hash(i * 13) * 7, 3 + hash(i * 17) * 3);
          }
        }
        f.restore();
      }
      // white flash on contact
      const flash = decay(t, C.slash, 0.07);
      if (flash > 0.01) {
        f.fillStyle = `rgba(255,255,255,${Math.min(1, flash * 1.1).toFixed(3)})`;
        f.fillRect(0, 0, W, H);
      }
    },
  });
})();
