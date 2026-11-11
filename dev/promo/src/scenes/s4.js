// SCENE 4 · 15.5–21.0s · THE LIBRARY & INSTANT SEARCH
// The real library popup: a title is typed into the search bar, five live cards cascade in with
// their progress bars, and one click resumes the first one.
(function () {
  const { add, clamp, lerp, ramp, tween, bump, decay, hash, E, TAU, W, H } = P;
  const C = P.CUES.s4;
  const HS = P.hands.SHAPES;
  const T0 = P.CUES.scenes[3];
  const L = { t0: C.typeStart - T0, t1: C.typeEnd - T0, cards: C.cards - T0, gap: C.cardGap, click: C.click - T0 };
  const QUERY = "One Piece";
  const PX = 712, PY = 204, PW = 620, PS = 0.86;
  const CARDS = [
    { title: "One Piece", ep: "Επ. 1122", at: "14:28", pct: 0.97, hue: [28, 350] },
    { title: "Jujutsu Kaisen", ep: "Επ. 19/47", at: "16:40", pct: 0.4, hue: [265, 330] },
    { title: "Bleach: TYBW", ep: "Επ. 27/40", at: "08:12", pct: 0.68, hue: [200, 250] },
    { title: "86: Eighty-Six", ep: "Επ. 12/23", at: "21:05", pct: 0.52, hue: [350, 20] },
    { title: "Chainsaw Man", ep: "Επ. 8/12", at: "03:47", pct: 0.67, hue: [12, 45] },
  ];

  P.scene("s4", {
    build(host) {
      const bg = P.canvas(host);
      const ttl = P.title(host, ["ΟΛΗ Η *ΒΙΒΛΙΟΘΗΚΗ* ΣΟΥ. ΣΕ *ΕΝΑ* *ΚΛΙΚ.*"]);
      const rei = P.character(host, { who: "rei", x: 10, y: 322, scale: 1.55, glasses: true, seed: 41 });
      const kz = P.kana(host, "キラッ!", { x: 430, y: 226, size: 96, color: "#FF2A85", rot: 8 });
      const panel = P.ui.panel(host, { x: PX, y: PY, w: PW, search: true, section: "In Progress", cards: CARDS });
      const col = add(
        host,
        `<div class="s4-col">
          <div class="chip s4-c1">${P.ui.icons.searchBig("#00F0FF", 32)}<span>ΑΝΑΖΗΤΗΣΗ <b>ΣΤΗ ΣΤΙΓΜΗ</b></span></div>
          <div class="chip s4-c2" style="--c:#FF2A85;--g:rgba(255,42,133,.45)">${P.ui.icons.star("#FF2A85", 32)}<span>ΟΛΑ <b>ΟΡΓΑΝΩΜΕΝΑ</b></span></div>
          <div class="s4-feat"></div>
          <div class="s4-cta">${P.ui.icons.play}<span>ΣΥΝΕΧΕΙΑ ΜΕ <b>1 ΚΛΙΚ</b></span></div>
          <div class="chip s4-toast" style="--c:#35E3A4;--g:rgba(16,185,129,.5)">${P.ui.icons.shield("#35E3A4", 30).replace(/<path d="M12 2.5[^>]*>/, '<circle cx="12" cy="12" r="9"/>')}<span>One Piece · <b>Επ. 1122 · 14:28</b></span></div>
        </div>`,
      );
      const feat = P.brand("featuresDesktop", { width: 540 });
      feat.style.position = "relative";
      col.querySelector(".s4-feat").appendChild(feat);
      const cursor = add(host, `<div class="s4-cursor">${P.ui.icons.cursor}</div>`);
      const fx = P.canvas(host, "top");
      fx.canvas.style.zIndex = 9;
      const q = (s) => col.querySelector(s);
      return { bg, ttl, rei, kz, panel, col, c1: q(".s4-c1"), c2: q(".s4-c2"), featBox: q(".s4-feat"), feat, cta: q(".s4-cta"), toast: q(".s4-toast"), cursor, fx };
    },

    timeline(tl, r) {
      P.titleIn(tl, r.ttl, 0.2);
      tl.fromTo(r.rei.node, { x: -280, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "expo.out" }, 0.02);
      tl.fromTo(r.panel.node, { scale: PS * 0.82, opacity: 0, y: 70 }, { scale: PS, opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" }, 0.08);
      tl.fromTo(r.c1, { x: 140, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)" }, L.t0 + 0.1);
      tl.fromTo(r.c2, { x: 140, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)" }, L.cards + 0.15);
      tl.fromTo(r.featBox, { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, L.cards + 0.6);
      tl.fromTo(r.cta, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" }, 3.45);
      tl.to(r.cta, { scale: 1.1, duration: 0.1, yoyo: true, repeat: 1, ease: "power2.out" }, L.click);
      tl.fromTo(r.toast, { y: 30, opacity: 0, scale: 0.7 }, { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.2)" }, L.click + 0.04);
      r.panel.cards.forEach((c, i) => {
        tl.fromTo(c.node, { x: 110, opacity: 0, scale: 0.9 }, { x: 0, opacity: 1, scale: 1, duration: 0.38, ease: "back.out(1.5)" }, L.cards + i * L.gap);
      });
      tl.to(r.panel.cards[0].node, { scale: 1.045, duration: 0.09, yoyo: true, repeat: 1, ease: "power2.out" }, L.click);
    },

    frame(t, r) {
      const ctx = r.bg;
      ctx.fillStyle = "#070810";
      ctx.fillRect(0, 0, W, H);
      P.glow(ctx, 1010, 560, 900, "rgba(40,130,255,.38)", 1);
      P.glow(ctx, 300, 700, 700, "rgba(255,42,133,.26)", 1);
      P.glow(ctx, 1640, 420, 600, "rgba(0,240,255,.2)", 1);
      // the blue shard field from the store screenshots
      for (let i = 0; i < 90; i++) {
        const x = 1250 + hash(i * 3) * 760 + Math.sin(t * 0.6 + i) * 14;
        const y = (hash(i * 7 + 1) * 1200 - t * (10 + hash(i * 5) * 40) + 1200) % 1200 - 60;
        const s = 4 + hash(i * 11) * 16;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(hash(i * 13) * TAU + t * (hash(i) - 0.5) * 1.6);
        ctx.fillStyle = `rgba(${80 + Math.round(60 * hash(i * 17))},${180 + Math.round(60 * hash(i * 19))},255,${(0.18 + 0.5 * hash(i * 23)).toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.7, s * 0.6);
        ctx.lineTo(-s * 0.6, s * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      P.gridFloor(ctx, t, { horizon: 760, color: "#54d2ff", alpha: 0.16, speed: 0.25 });

      // typing
      const n = Math.round(ramp(t, L.t0, L.t1) * QUERY.length);
      r.panel.typed.textContent = QUERY.slice(0, n);
      r.panel.ph.style.display = n ? "none" : "";
      r.panel.input.classList.toggle("focus", t >= L.t0 - 0.12);
      r.panel.caret.style.opacity = t >= L.t0 - 0.12 && (t < L.t1 + 0.1 || Math.floor(t * 2.5) % 2 === 0) ? "1" : "0";
      // live progress bars
      r.panel.cards.forEach((c, i) => {
        const at = L.cards + i * L.gap;
        P.ui.cardProgress(c, tween(t, at + 0.12, at + 0.95, E.outCubic));
        c.node.classList.toggle("hot", i === 0 && t >= at + 0.2);
      });
      r.feat.tick(t);

      // Rei presents the library
      const click = decay(t, L.click, 0.4);
      // right hand: presents the library, points along as each card lands, thumbs-up on the click
      let tapK = 0;
      r.panel.cards.forEach((c, i) => (tapK = Math.max(tapK, bump(t, L.cards + i * L.gap - 0.03, 0.05, 0.14))));
      const present = { x: 400, y: 392 + 4 * Math.sin(t * 3), rot: 56, view: "palm", side: -1, elbow: 1, ...HS.open };
      const point = { x: 408 + 12 * tapK, y: 380 + 5 * Math.sin(t * 2.2) - 6 * tapK, rot: 80 - 5 * tapK, view: "back", side: -1, elbow: 1, ...HS.point, curls: HS.point.curls.map((c, i) => (i === 1 ? 0.2 * tapK : c)) };
      const yes = { x: 392, y: 356 - 16 * decay(t, L.click + 0.1, 0.16), rot: -52, view: "back", side: 1, elbow: 1, ...HS.thumbUp };
      let arm = P.hands.mix(present, point, tween(t, L.t0 - 0.15, L.t0 + 0.2, E.inOutCubic));
      if (t > L.click - 0.15) arm = P.hands.mix(point, yes, tween(t, L.click - 0.15, L.click + 0.12, E.outBack));
      r.rei.set(t, {
        mouth: t > L.click ? "grin" : t > L.cards ? "grin" : "smile", eye: t > L.click && t < L.click + 0.33 ? "happy" : "open",
        look: [7, t < L.cards ? -1 : 1], blush: 0.35 + 0.4 * click, browLift: 3, tilt: 2, armR: arm,
      });
      P.kanaTick(r.kz, t, { amp: 4, show: ramp(t, L.cards, L.cards + 0.05) * (1 - ramp(t, L.cards + 1.3, L.cards + 1.6)), seed: 2, pop: lerp(1.9, 1, tween(t, L.cards, L.cards + 0.3, E.outBack)) });

      // cursor glides to the first card's resume button and clicks
      const c0 = r.panel.cards[0];
      const tx = PX + (c0.node.offsetLeft + c0.play.offsetLeft + 21) * PS;
      const ty = PY + (c0.node.offsetTop + c0.play.offsetTop + 21) * PS;
      const mv = tween(t, L.click - 0.95, L.click - 0.1, E.inOutCubic);
      const cx = lerp(1420, tx, mv) - 4;
      const cy = lerp(900, ty, mv) - 2 + 60 * Math.sin(Math.PI * mv) * -1;
      const press = bump(t, L.click - 0.05, 0.05, 0.12);
      r.cursor.style.opacity = ramp(t, L.click - 1.05, L.click - 0.9).toFixed(3);
      r.cursor.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) scale(${(1 - 0.2 * press).toFixed(3)})`;

      const f = r.fx;
      f.clearRect(0, 0, W, H);
      for (let k = 0; k < 3; k++) P.ring(f, tx, ty, 240, ramp(t, L.click + k * 0.08, L.click + 0.5 + k * 0.08), k === 1 ? "#FFB800" : "#54d2ff", 10);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + 0.3;
        const d = 60 + 200 * E.outCubic(ramp(t, L.click, L.click + 0.5));
        P.sparkle(f, tx + Math.cos(a) * d, ty + Math.sin(a) * d, 24 * bump(t, L.click, 0.08, 0.42), t * 5 + i, i % 2 ? "#fff" : "#FFE9A8", 1);
      }
      // each card lands with a little spark on its bar
      r.panel.cards.forEach((c, i) => {
        const at = L.cards + i * L.gap;
        const y = PY + (c.node.offsetTop + 43) * PS;
        P.sparkle(f, PX + PW * PS + 6, y, 34 * bump(t, at + 0.1, 0.07, 0.3), t * 3 + i, "#54d2ff", 1);
      });
    },
  });
})();
