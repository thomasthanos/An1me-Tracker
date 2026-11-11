// SCENE 5 · 21.0–26.8s · CLOUD SYNC: FROM THE PC TO THE iPHONE IN BED
// Split screen. The saved position (Επ. 19 · 16:40) leaves the desktop, passes through the
// cloud-sync portal and lands on the iPhone, where Kai picks the episode back up from bed.
(function () {
  const { add, clamp, lerp, ramp, tween, bump, decay, hash, E, TAU, W, H } = P;
  const C = P.CUES.s5;
  const T0 = P.CUES.scenes[4];
  const L = { warp: C.warp - T0, land: C.land - T0 };
  const RING = [924, 512];
  const RS = 0.78; // portal scale: it has to sit between the monitor and the phone
  const SRC = [566, 558]; // chip on the desktop
  const DST = [1242, 556]; // chip on the phone
  const SAVED = 16 * 60 + 40, TOTAL = 23 * 60 + 40;

  P.scene("s5", {
    build(host) {
      const bg = P.canvas(host);
      const ttl = P.title(host, ["ΑΠΟ ΤΟ PC... ΚΑΤΕΥΘΕΙΑΝ ΣΤΟ *iPHONE* *ΣΟΥ!*"]);
      ttl.node.style.setProperty("--hl", "#FF2A85");
      ttl.node.style.setProperty("--hl-glow", "rgba(255,42,133,.6)");

      // ---- desktop ----
      const mon = add(
        host,
        `<div class="s5-mon" data-layout-ignore><div class="s5-screen" data-layout-allow-occlusion>
            <div class="player-bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><div class="player-url">an1me.to/watch/jujutsu-kaisen/episode-19</div></div>
            <canvas width="620" height="232"></canvas>
            <div class="s5-row"><div class="s5-t">Jujutsu Kaisen<small>CONTINUE WATCHING</small></div><div class="s5-slot"></div></div>
            <div class="s5-bar"><i></i></div>
            <div class="s5-sleep"><svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="#54d2ff" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg><span>PC · OFF</span></div>
          </div><div class="s5-stand"></div><div class="s5-base"></div>
          <div class="s5-browsers"><span><i style="background:#34a853"></i>Chrome</span><span><i style="background:#2f9bf0"></i>Edge</span><span><i style="background:#ff6b2b"></i>Brave</span></div></div>`,
      );
      const actD = P.brand("actionDesktop", { width: 174 * 1.5 });
      actD.style.left = "286px";
      actD.style.top = "812px";
      host.appendChild(actD);

      // ---- iPhone ----
      const phone = add(
        host,
        `<div class="s5-phone" data-layout-ignore><div class="s5-notch"></div><div class="s5-pscreen">
            <div class="s5-status"><span>9:41</span><span>5G ▮▮▮</span></div>
            <div class="s5-safari">an1me.to</div>
            <canvas width="234" height="132"></canvas>
            <div class="s5-phead">${P.ui.icons.logo}<span>Anime Tracker</span></div>
            <div class="s5-pcard"><small>CONTINUE WATCHING</small><b>Jujutsu Kaisen</b><div class="s5-slot"></div><div class="s5-bar"><i></i></div>
              <div class="s5-resume">${P.ui.icons.play}<span>Συνέχεια</span></div></div>
            <div class="s5-synced">${P.ui.icons.check}<span>Cloud Synced</span></div>
          </div></div>`,
      );
      const actI = P.brand("actionIphone", { width: 174 * 1.5 });
      actI.style.left = "1202px";
      actI.style.top = "812px";
      host.appendChild(actI);
      const ios = P.brand("iosSettingUp", { width: 520 });
      ios.style.left = "614px";
      ios.style.top = "822px";
      host.appendChild(ios);

      // ---- Kai, in bed ----
      const pillow = add(host, `<div class="s5-pillow"></div>`);
      const kai = P.character(host, { who: "kai", x: 1478, y: 322, scale: 1.24, hand: "phone", seed: 51 });
      const blanket = add(host, `<div class="s5-blanket"></div>`);

      // ---- portal ----
      const portal = P.canvas(host, "top");
      portal.canvas.style.zIndex = 6;
      const sync = P.brand("badgeCloudSync", { width: 112 * 2.05 });
      sync.style.left = RING[0] - 115 + "px";
      sync.style.top = RING[1] - 25 + "px";
      sync.style.zIndex = 7;
      host.appendChild(sync);
      const lab = add(host, `<div class="s5-lab">CLOUD SYNC</div>`);
      const chip = add(host, `<div class="chip s5-chip" data-layout-allow-overlap style="--c:#FFB800;--g:rgba(255,184,0,.6)">${P.ui.icons.bolt("#FFB800", 26)}<span>Επ. 19 · <b>16:40</b></span></div>`);
      const k1 = P.kana(host, "ワープ!", { x: 770, y: 224, size: 100, color: "#00F0FF", rot: -7 });
      const k2 = P.kana(host, "ピコーン!", { x: 1420, y: 216, size: 84, color: "#FF2A85", rot: 7 });
      const q = (n, s) => n.querySelector(s);
      return {
        bg, ttl, mon, monCtx: q(mon, "canvas").getContext("2d"), monBar: q(mon, ".s5-bar i"), sleep: q(mon, ".s5-sleep"), actD, actI, ios,
        phone, phCtx: q(phone, "canvas").getContext("2d"), phBar: q(phone, ".s5-bar i"), phSlot: q(phone, ".s5-slot"), resume: q(phone, ".s5-resume"), synced: q(phone, ".s5-synced"),
        pillow, kai, blanket, portal, sync, lab, chip, k1, k2,
      };
    },

    timeline(tl, r) {
      P.titleIn(tl, r.ttl, 0.2);
      tl.fromTo(r.mon, { x: -200, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, 0.05);
      tl.fromTo(r.phone, { y: 160, opacity: 0, rotation: 10 }, { y: 0, opacity: 1, rotation: 3, duration: 0.55, ease: "back.out(1.4)" }, 0.18);
      tl.fromTo([r.pillow, r.kai.node, r.blanket], { x: 260, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, 0.25);
      tl.fromTo(r.sync, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" }, 0.5);
      tl.fromTo(r.lab, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, 0.7);
      tl.fromTo([r.actD, r.ios, r.actI], { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)", stagger: 0.1 }, 0.8);
      tl.fromTo(r.resume, { scale: 1 }, { scale: 1.12, duration: 0.12, yoyo: true, repeat: 3, ease: "power2.out" }, L.land + 0.5);
      tl.to(r.phone, { scale: 1.05, duration: 0.1, yoyo: true, repeat: 1, ease: "power2.out" }, L.land);
    },

    frame(t, r) {
      const ctx = r.bg;
      // split-screen ground: desktop blue on the left, bedtime magenta on the right
      ctx.fillStyle = "#070810";
      ctx.fillRect(0, 0, W, H);
      P.glow(ctx, 380, 520, 900, "rgba(0,150,255,.42)", 1);
      P.glow(ctx, 1560, 560, 900, "rgba(255,42,133,.4)", 1);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 18]);
      ctx.lineDashOffset = -t * 60;
      ctx.beginPath();
      ctx.moveTo(1060, 190);
      ctx.lineTo(860, 900);
      ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 40; i++) {
        const left = i % 2 === 0;
        const x = (left ? 40 : 1000) + hash(i * 3) * 880;
        const y = (hash(i * 7) * H + t * (12 + hash(i) * 30)) % H;
        P.glow(ctx, x, y, 6 + hash(i * 5) * 12, left ? "rgba(0,240,255,.9)" : "rgba(255,120,190,.9)", 0.3);
      }

      const w = t - L.warp;
      const landed = t >= L.land;
      const lt = t - L.land;

      // desktop: playing until the position is sent, then it goes to sleep
      const off = tween(t, L.warp + 0.5, L.warp + 1.0, E.outCubic);
      P.ui.paintEpisode(r.monCtx, 620, 232, SAVED - 6 + Math.min(t, L.warp), t, t < L.warp, ["#0b2a5e", "#2d6cff", "#00F0FF"]);
      r.monBar.style.transform = `scaleX(${((SAVED - 6 + Math.min(t, L.warp)) / TOTAL).toFixed(4)})`;
      r.sleep.style.opacity = off.toFixed(3);
      r.actD.tick(t);
      r.actI.tick(t);
      r.ios.tick(t);
      r.sync.tick(t * 2);

      // iPhone: waiting, then resumes at the synced second
      P.ui.paintEpisode(r.phCtx, 234, 132, SAVED + Math.max(0, lt - 0.7), t, lt > 0.7, ["#2a0f4d", "#ff2a85", "#ffb800"]);
      r.phBar.style.transform = `scaleX(${(landed ? (SAVED / TOTAL) * tween(lt, 0, 0.5, E.outCubic) : 0).toFixed(4)})`;
      r.phSlot.textContent = landed ? "Επ. 19 · 16:40" : "συγχρονισμός…";
      r.phSlot.classList.toggle("on", landed);
      r.synced.style.opacity = ramp(lt, 0.1, 0.3).toFixed(3);
      r.phone.style.boxShadow = `0 0 0 2px rgba(255,255,255,.14), 0 0 ${(40 + 80 * decay(t, L.land, 0.4)).toFixed(0)}px rgba(255,42,133,${(0.35 + 0.5 * decay(t, L.land, 0.4)).toFixed(2)}), 0 30px 80px rgba(0,0,0,.7)`;

      // Kai
      r.kai.set(t, {
        mouth: landed ? "grin" : "smile", eye: landed && lt < 1.3 ? "happy" : "open", open: landed ? 1 : 0.78, look: [-7, 3],
        blush: landed ? 0.8 : 0.3, browLift: landed ? 5 : 0, phoneGlow: landed ? 1 : 0.2, phoneBar: landed ? SAVED / TOTAL : 0.05,
        handY: -8 * decay(t, L.land, 0.25), tilt: -4,
      });

      // ---- the portal ----
      const f = r.portal;
      f.clearRect(0, 0, W, H);
      const [cx, cy] = RING;
      const open = tween(t, 0.4, 0.9, E.outBack);
      const hot = w >= 0 && lt < 0.6 ? 1 : 0.35;
      f.save();
      f.translate(cx, cy);
      P.glow(f, 0, 0, 330 * RS * open, "rgba(0,240,255,.55)", 0.5 + 0.4 * hot);
      const rings = [[196, 5, "#00F0FF", 1.1, [36, 22]], [176, 9, "#FF2A85", -1.7, [70, 30]], [156, 3, "#fff", 2.6, [10, 16]], [214, 2, "#FFB800", -0.6, [4, 20]]];
      rings.forEach(([rad, lw, col, spd, dash], i) => {
        f.save();
        f.rotate(t * spd * (1 + hot * 1.5));
        f.strokeStyle = col;
        f.lineWidth = lw;
        f.setLineDash(dash);
        f.shadowColor = col;
        f.shadowBlur = 22;
        f.globalAlpha = open * (0.55 + 0.45 * hot);
        f.beginPath();
        f.arc(0, 0, rad * RS * open * (1 + 0.04 * Math.sin(t * 5 + i)), 0, TAU);
        f.stroke();
        f.restore();
      });
      // rune ticks
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU - t * 0.5;
        f.fillStyle = i % 3 ? "rgba(0,240,255,.8)" : "#fff";
        f.globalAlpha = open * 0.8;
        f.fillRect(Math.cos(a) * 236 * RS * open - 2, Math.sin(a) * 236 * RS * open - 2, 4 + (i % 3 ? 0 : 5), 4);
      }
      f.restore();
      f.globalAlpha = 1;

      // the saved position in flight
      const A = 0.5, B = 0.68; // into the ring by A, out of it from B (fractions of the trip)
      const trip = clamp(w / (L.land - L.warp));
      let px, py, sc, op = 1, sk = 0;
      if (w < 0) {
        [px, py] = SRC;
        sc = 1 + 0.05 * Math.sin(t * 6);
      } else if (trip < A) {
        const k = E.inCubic(trip / A);
        px = lerp(SRC[0], cx, k);
        py = lerp(SRC[1], cy, k) - 120 * Math.sin(Math.PI * k);
        sc = lerp(1.1, 0.25, k);
        sk = -24 * k;
      } else if (trip < B) {
        px = cx; py = cy; sc = 0.2; op = 0;
      } else if (trip < 1) {
        const k = E.outCubic((trip - B) / (1 - B));
        px = lerp(cx, DST[0], k);
        py = lerp(cy, DST[1], k) - 90 * Math.sin(Math.PI * k);
        sc = lerp(0.25, 1.15, k);
        sk = 24 * (1 - k);
      } else {
        [px, py] = DST;
        sc = 1 + 0.25 * decay(t, L.land, 0.12);
        op = 1 - ramp(lt, 0.35, 0.6); // hands over to the phone's own label
      }
      r.chip.style.opacity = (op * ramp(t, 0.45, 0.6)).toFixed(3);
      r.chip.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-50%) skewX(${sk.toFixed(1)}deg) scale(${sc.toFixed(3)})`;

      // warp streaks along the path + swirl in the ring
      if (w >= 0 && lt < 0.5) {
        for (let i = 0; i < 46; i++) {
          const u = (hash(i * 3) + w * (0.9 + hash(i * 5))) % 1;
          const toRing = i % 2 === 0;
          const from = toRing ? SRC : RING, to = toRing ? RING : DST;
          if ((toRing && trip > A + 0.1) || (!toRing && trip < B - 0.05)) continue;
          const x = lerp(from[0], to[0], u) + (hash(i * 7) - 0.5) * 120 * Math.sin(Math.PI * u);
          const y = lerp(from[1], to[1], u) - 100 * Math.sin(Math.PI * u) + (hash(i * 11) - 0.5) * 90;
          f.fillStyle = toRing ? "rgba(0,240,255,.85)" : "rgba(255,120,190,.9)";
          f.fillRect(x, y, 26 + hash(i * 13) * 50, 3);
        }
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * TAU + w * 9;
          const rad = 150 * RS * (1 - ((w * 1.4 + hash(i)) % 1));
          P.sparkle(f, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 16, a, i % 2 ? "#fff" : "#00F0FF", 0.9);
        }
        const fl = bump(w, (L.land - L.warp) * A, 0.06, 0.3);
        if (fl > 0.02) P.glow(f, cx, cy, 420, "rgba(255,255,255,.95)", fl);
      }
      // landing
      if (landed) {
        for (let k = 0; k < 3; k++) P.ring(f, DST[0], DST[1], 420, ramp(lt, k * 0.09, 0.6 + k * 0.09), k === 1 ? "#FFB800" : "#FF2A85", 12);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU;
          const d = 80 + 260 * E.outCubic(ramp(lt, 0, 0.6));
          P.sparkle(f, DST[0] + Math.cos(a) * d, DST[1] + Math.sin(a) * d, 26 * bump(lt, 0, 0.08, 0.5), lt * 4 + i, i % 2 ? "#fff" : "#FFD0E6", 1);
        }
      }
      P.kanaTick(r.k1, t, { amp: 5, show: ramp(w, 0, 0.05) * (1 - ramp(w, 0.8, 1.05)), seed: 3, pop: lerp(1.8, 1, tween(w, 0, 0.3, E.outBack)) });
      P.kanaTick(r.k2, t, { amp: 4, show: ramp(lt, 0, 0.05) * (1 - ramp(lt, 1.1, 1.4)), seed: 7, pop: lerp(1.8, 1, tween(lt, 0, 0.3, E.outBack)) });
      r.lab.style.letterSpacing = (0.3 + 0.08 * hot).toFixed(3) + "em";
    },
  });
})();
