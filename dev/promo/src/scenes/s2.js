// SCENE 2 · 5.0–10.5s · AUTO TRACKING & RESUME TO THE SECOND
// Rei pushes her glasses (megane glint), the tracker popup opens next to the player, and the
// scrubber jumps on its own from 00:00 to the saved 14:28.
(function () {
  const { add, clamp, lerp, ramp, tween, bump, decay, hash, E, TAU, W, H } = P;
  const C = P.CUES.s2;
  const HS = P.hands.SHAPES;
  const T0 = P.CUES.scenes[1];
  const L = { shine: C.shine - T0, pop: C.uiPop - T0, s0: C.scrubStart - T0, s1: C.scrubEnd - T0, play: C.play - T0 };
  const SAVED = 14 * 60 + 28;
  const TOTAL = 23 * 60 + 40;

  P.scene("s2", {
    build(host) {
      const bg = P.canvas(host);
      const ttl = P.title(host, ["ΘΥΜΑΤΑΙ ΤΟ ΕΠΕΙΣΟΔΙΟ.", "ΚΑΙ ΤΟ *ΑΚΡΙΒΕΣ* *ΔΕΥΤΕΡΟΛΕΠΤΟ.*"]);
      const RX = 36, RY = 292, RS = 1.62;
      const rei = P.character(host, { who: "rei", x: RX, y: RY, scale: RS, glasses: true, seed: 11 });
      const kz = P.kana(host, "シャキーン!", { x: 300, y: 228, size: 92, color: "#00F0FF", rot: -8 });
      const player = P.ui.player(host, { x: 716, y: 232, w: 860, slug: "jujutsu-kaisen/episode-18", title: "Jujutsu Kaisen", ep: "ΕΠΕΙΣΟΔΙΟ 18", total: TOTAL });
      player.setMark(SAVED);
      const flag = add(player.scrub, `<div class="s2-flag">ΑΠΟΘΗΚΕΥΜΕΝΟ <b>14:28</b></div>`);
      flag.style.left = ((860 - 52) * (SAVED / TOTAL)).toFixed(1) + "px";
      const panel = P.ui.panel(host, {
        x: 1396, y: 296, w: 470, search: false, section: "Continue Watching", foot: true,
        cards: [{ title: "Jujutsu Kaisen", ep: "Ep 18/47", at: "14:28", pct: 0.61, hue: [265, 330] }],
      });
      const badge = add(host, `<div class="chip s2-badge" style="--c:#FFB800;--g:rgba(255,184,0,.55)">${P.ui.icons.bolt()}<span>ΑΥΤΟΜΑΤΗ ΣΥΝΕΧΙΣΗ: <b>ΕΠΕΙΣΟΔΙΟ 18 · 14:28</b></span></div>`);
      const fx = P.canvas(host, "top");
      fx.canvas.style.zIndex = 9;
      return { bg, ttl, rei, kz, player, flag, panel, badge, fx, lens: [RX + 262 * RS, RY + 190 * RS] };
    },

    timeline(tl, r) {
      P.titleIn(tl, r.ttl, 0.25);
      tl.fromTo(r.rei.node, { x: -260, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "expo.out" }, 0.02);
      tl.fromTo(r.player.node, { y: 90, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.5)" }, L.pop - 0.2);
      tl.fromTo(r.panel.node, { scale: 0.5, opacity: 0, rotation: 6 }, { scale: 1, opacity: 1, rotation: 2.5, duration: 0.5, ease: "back.out(1.9)", transformOrigin: "50% 40%" }, L.pop + 0.05);
      tl.fromTo(r.flag, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "back.out(2)" }, L.pop + 0.55);
      tl.fromTo(r.badge, { scale: 0.3, opacity: 0, y: 30 }, { scale: 1, opacity: 1, y: 0, duration: 0.45, ease: "back.out(2.2)" }, L.s1 + 0.02);
      tl.to(r.badge, { scale: 1.07, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" }, L.play);
      tl.to(r.player.pbtn, { scale: 0.78, duration: 0.08, yoyo: true, repeat: 1, ease: "power2.inOut" }, L.play - 0.04);
    },

    frame(t, r) {
      const ctx = r.bg;
      ctx.fillStyle = "#070810";
      ctx.fillRect(0, 0, W, H);
      P.glow(ctx, 380, 620, 820, "rgba(255,42,133,.34)", 1);
      P.glow(ctx, 1320, 480, 900, "rgba(0,240,255,.26)", 1);
      P.gridFloor(ctx, t, { horizon: 700, color: "#00F0FF", alpha: 0.2 });
      // slow bokeh
      for (let i = 0; i < 26; i++) {
        const x = (hash(i * 3) * W + t * (8 + hash(i) * 22)) % W;
        const y = 180 + hash(i * 7 + 2) * 620 + Math.sin(t * 0.8 + i) * 12;
        P.glow(ctx, x, y, 14 + hash(i * 5) * 34, i % 2 ? "rgba(0,240,255,.5)" : "rgba(255,42,133,.5)", 0.35);
      }

      // megane push: hand up, flash, glint sweep, hand down, then she watches the player work
      const up = tween(t, 0.02, L.shine - 0.02, E.outCubic);
      const down = tween(t, 1.25, 1.75, E.inOutCubic);
      const flash = t < L.shine ? 0 : Math.max(decay(t, L.shine, 0.16), 0.9 * (1 - ramp(t, L.shine, L.shine + 0.42)));
      const happy = t > L.s1 + 0.05 && t < L.s1 + 0.9;
      // right hand: rises to the temple, two fingers nudge the frame, drops; later it presents
      // the player and taps "play"
      const push = { x: 348 - 7 * bump(t, L.shine - 0.04, 0.05, 0.3), y: 304 - 9 * bump(t, L.shine - 0.04, 0.05, 0.3), rot: -30, view: "back", side: 1, elbow: 1, ...HS.two };
      const rest = { x: 392, y: 640, rot: 10, view: "back", side: 1, elbow: 1, ...HS.relaxed };
      const show = { x: 372 + 5 * Math.sin(t * 2.4), y: 332 + 4 * Math.sin(t * 3.1), rot: 16 + 5 * Math.sin(t * 2.4), view: "palm", side: -1, elbow: 1, ...HS.open, curls: HS.open.curls.map((c, i) => c + 0.08 + 0.07 * Math.sin(t * 4 + i * 0.9)) };
      const tap = { x: 356 + 8 * bump(t, L.play - 0.07, 0.07, 0.2), y: 344, rot: 52, view: "back", side: -1, elbow: 1, ...HS.point };
      let arm;
      if (t < 1.25) arm = P.hands.mix(rest, push, up);
      else if (t < L.s1 - 0.25) arm = P.hands.mix(push, rest, down);
      else if (t < L.play - 0.5) arm = P.hands.mix(rest, show, tween(t, L.s1 - 0.25, L.s1 + 0.2, E.outBack));
      else arm = P.hands.mix(show, tap, tween(t, L.play - 0.5, L.play - 0.12, E.inOutCubic));
      r.rei.set(t, {
        mouth: t > L.play ? "grin" : happy ? "grin" : t > L.shine ? "smirk" : "flat",
        eye: happy ? "happy" : "open", brow: t < 1.4 ? 9 : 2, open: t < 1.4 ? 0.82 : 1,
        look: [lerp(0, 7, ramp(t, 1.5, 2.0)), 0], blush: happy ? 0.7 : 0.25 * ramp(t, 1.5, 2),
        flash, glint: ramp(t, L.shine, L.shine + 0.4),
        tilt: -2 * up * (1 - down), wind: 0.25 * decay(t, L.shine, 0.5), armR: arm,
      });
      P.kanaTick(r.kz, t, { amp: 4, show: ramp(t, L.shine, L.shine + 0.05) * (1 - ramp(t, 1.5, 1.8)), seed: 4, pop: lerp(2, 1, tween(t, L.shine, L.shine + 0.3, E.outBack)) });

      // the lens flare itself
      const f = r.fx;
      f.clearRect(0, 0, W, H);
      const fl = t - L.shine;
      if (fl >= 0 && fl < 0.9) {
        const k = bump(fl, 0, 0.06, 0.6);
        const [lx, ly] = r.lens; // right lens, outer corner
        P.glow(f, lx, ly, 520 * k, "rgba(255,255,255,.95)", k);
        P.sparkle(f, lx, ly, 330 * k, fl * 1.4, "#fff", k);
        P.sparkle(f, lx, ly, 190 * k, fl * 1.4 + TAU / 8, "#9ff", k);
        P.sparkle(f, lx - 150, ly - 40, 110 * bump(fl, 0.08, 0.08, 0.4), -fl, "#fff", 1);
        for (let i = 0; i < 9; i++) {
          const a = hash(i * 9 + 3) * TAU;
          const d = 120 + 420 * E.outCubic(ramp(fl, 0, 0.7)) * (0.4 + hash(i));
          P.sparkle(f, lx + Math.cos(a) * d, ly + Math.sin(a) * d * 0.7, 30 * bump(fl, 0.05 + hash(i) * 0.25, 0.1, 0.4), fl * 3 + i, i % 2 ? "#00F0FF" : "#fff", 1);
        }
        const white = decay(t, L.shine, 0.05) * 0.55;
        if (white > 0.02) {
          f.fillStyle = `rgba(255,255,255,${white.toFixed(3)})`;
          f.fillRect(0, 0, W, H);
        }
      }

      // transport: paused at 00:00, snaps to the saved second, then plays on "Play"
      const jump = tween(t, L.s0, L.s1, E.inOutCubic);
      const playing = t >= L.play;
      const sec = SAVED * jump + (playing ? t - L.play : 0);
      r.player.set(t, sec, playing);
      // the saved second gets a hit of emphasis when the voice says "exact second"
      const em = bump(t, 3.75, 0.1, 0.5);
      r.player.cur.style.transform = `scale(${(1 + 0.22 * decay(t, L.s1, 0.2) + 0.2 * em).toFixed(3)})`;
      r.player.cur.style.display = "inline-block";
      r.player.cur.style.color = t >= L.s1 ? "#FFB800" : "#fff";
      r.player.cur.style.textShadow = t >= L.s1 ? "0 0 22px rgba(255,184,0,.8)" : "none";
      P.ui.cardProgress(r.panel.cards[0], tween(t, L.pop + 0.3, L.pop + 1.0, E.outCubic));
      r.panel.cards[0].node.classList.toggle("hot", t >= L.s1);

      // jump trail + landing ring on the scrubber
      const px = 716 + 26, py = 232 + 44 + r.player.h - 20 - 46 - 16 - 4;
      const kx = px + (860 - 52) * (sec / TOTAL);
      if (t >= L.s0 && t < L.s1 + 0.6) {
        const tr = ramp(t, L.s0, L.s1);
        f.save();
        f.globalAlpha = (1 - ramp(t, L.s1, L.s1 + 0.35)) * 0.9;
        const g = f.createLinearGradient(px, 0, kx, 0);
        g.addColorStop(0, "rgba(0,240,255,0)");
        g.addColorStop(1, "#fff");
        f.fillStyle = g;
        f.fillRect(px, py - 9 * tr, kx - px, 18 * tr + 4);
        f.restore();
        for (let k = 0; k < 2; k++) P.ring(f, kx, py, 150, ramp(t, L.s1 + k * 0.1, L.s1 + 0.55 + k * 0.1), k ? "#00F0FF" : "#FFB800", 9);
        for (let i = 0; i < 10; i++) {
          const a = hash(i * 13) * TAU;
          P.sparkle(f, kx + Math.cos(a) * 130 * ramp(t, L.s1, L.s1 + 0.5), py + Math.sin(a) * 90 * ramp(t, L.s1, L.s1 + 0.5), 20 * bump(t, L.s1, 0.08, 0.4), t * 4 + i, "#FFE9A8", 1);
        }
      }
      // play press ripple
      if (t >= L.play - 0.02) {
        const bx = 716 + 26 + 23, by = py + 16 + 23 + 8;
        P.ring(f, bx, by, 120, ramp(t, L.play, L.play + 0.4), "#fff", 8);
      }
      const glowP = 0.5 + 0.5 * Math.sin(t * 5);
      r.badge.style.boxShadow = `0 0 0 1px rgba(255,255,255,.05) inset, 0 0 ${(30 + 26 * glowP).toFixed(0)}px rgba(255,184,0,${(0.4 + 0.3 * glowP).toFixed(2)}), 0 14px 40px rgba(0,0,0,.6)`;
    },
  });
})();
