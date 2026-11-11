// SCENE 3 · 10.5–15.5s · SPEED CONTROL: NO MORE BORING FILLERS
// A recap alert fires, Kai powers up in a golden aura, taps the built-in Speed control and the
// speedometer climbs 1.0x -> 1.5x -> 2.0x OVERDRIVE until the recap block is blown away.
(function () {
  const { add, clamp, lerp, ramp, tween, bump, decay, hash, noise, E, TAU, W, H } = P;
  const C = P.CUES.s3;
  const T0 = P.CUES.scenes[2];
  const L = { alert: C.alert - T0, aura: C.aura - T0, ignite: C.ignite - T0, g15: C.gear15 - T0, g20: C.gear20 - T0, boom: C.boom - T0 };
  const KX = 60, KY = 300, KS = 1.6;
  const HEAD = [KX + 200 * KS, KY + 200 * KS];
  // episode strip geometry
  const SX = 760, SY = 330, SW = 1064, SH = 92;
  const REC0 = 0.1, REC1 = 0.38; // the recap block, as a fraction of the strip
  const GC = [1100, 812], GR = 262; // gauge centre / radius
  const SPEEDS = ["1×", "1.25×", "1.5×", "2×"];

  const speedAt = (t) => 1 + 0.5 * tween(t, L.g15 - 0.25, L.g15 + 0.05, E.outBack) + 0.5 * tween(t, L.g20 - 0.25, L.g20 + 0.05, E.outBack);

  P.scene("s3", {
    build(host) {
      const bg = P.canvas(host);
      const shake = add(host, `<div class="layer"></div>`);
      const ttl = P.title(shake, ["ΕΝΣΩΜΑΤΩΜΕΝΟ *SPEED* *CONTROL* · ΠΡΟΣΠΕΡΑΣΕ ΤΑ RECAPS"]);
      ttl.node.style.setProperty("--hl", "#FFB800");
      ttl.node.style.setProperty("--hl-glow", "rgba(255,184,0,.6)");
      const kai = P.character(shake, { who: "kai", x: KX, y: KY, scale: KS, seed: 21 });
      const k1 = P.kana(shake, "ゴゴゴ", { x: 36, y: 790, size: 104, color: "#FFB800", rot: -6 });
      const k2 = P.kana(shake, "ドンッ!!", { x: 900, y: 430, size: 150, color: "#FF2A85", rot: -9 });
      const alert = add(shake, `<div class="s3-alert"><div class="s3-haz"></div>${P.ui.icons.warn("#fff", 40)}<span>ΑΝΙΧΝΕΥΘΗΚΕ 5ΛΕΠΤΟ <b>RECAP / FILLER!</b></span></div>`);
      const strip = add(
        shake,
        `<div class="s3-strip" style="left:${SX}px;top:${SY}px;width:${SW}px;height:${SH}px">
          <div class="s3-seg story" style="left:0;width:${REC0 * 100}%"><span>OP</span></div>
          <div class="s3-seg recap" style="left:${REC0 * 100}%;width:${(REC1 - REC0) * 100}%"><span>RECAP · 5:00</span></div>
          <div class="s3-seg story" style="left:${REC1 * 100}%;width:${(1 - REC1) * 100}%"><span>Η ΙΣΤΟΡΙΑ ΣΥΝΕΧΙΖΕΤΑΙ</span></div>
          <div class="s3-head"><i></i></div>
        </div>`,
      );
      const gauge = add(shake, `<div class="s3-gauge" style="left:${GC[0] - 300}px;top:${GC[1] - 300}px"><div class="s3-num"><span class="v">1.0</span><small>x</small></div><div class="s3-over">OVERDRIVE</div></div>`);
      const col = add(shake, `<div class="s3-col"><div class="s3-lab">SPEED CONTROL</div><div class="s3-pill"></div><div class="s3-chips">${SPEEDS.map((s) => `<div class="s3-chip">${s}</div>`).join("")}</div><div class="s3-keys"><kbd>F7</kbd> κράτα · boost <kbd>F8</kbd> toggle</div></div>`);
      const pill = P.brand("navSpeed", { width: 76 * 3.4 });
      pill.style.position = "relative";
      col.querySelector(".s3-pill").appendChild(pill);
      const fx = P.canvas(host, "top");
      fx.canvas.style.zIndex = 9;
      return {
        bg, shake, ttl, kai, k1, k2, alert, strip, recap: strip.querySelector(".recap"), head: strip.querySelector(".s3-head"),
        gauge, num: gauge.querySelector(".v"), over: gauge.querySelector(".s3-over"), col, pill, chips: [...col.querySelectorAll(".s3-chip")], fx,
      };
    },

    timeline(tl, r) {
      P.titleIn(tl, r.ttl, 0.2, { stagger: 0.045 });
      tl.fromTo(r.kai.node, { x: -300, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "expo.out" }, 0.02);
      tl.fromTo(r.alert, { scaleX: 0.2, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.3, ease: "back.out(1.8)" }, L.alert);
      tl.fromTo(r.strip, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, L.alert + 0.14);
      tl.fromTo(r.gauge, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.7)" }, L.aura);
      tl.fromTo(r.col, { x: 120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, L.aura + 0.1);
      tl.to(r.pill, { scale: 0.86, duration: 0.07, yoyo: true, repeat: 1, ease: "power2.inOut", transformOrigin: "50% 50%" }, L.ignite - 0.03);
      tl.fromTo(r.over, { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "expo.out" }, L.g20);
      tl.to(r.alert, { opacity: 0, y: -30, duration: 0.25, ease: "power2.in" }, L.boom + 0.05);
    },

    frame(t, r) {
      const power = tween(t, L.ignite - 0.04, L.ignite + 0.05, E.lin);
      const charge = ramp(t, L.aura, L.ignite);
      const burst = decay(t, L.ignite, 0.25);
      const boom = decay(t, L.boom, 0.3);
      const sp = speedAt(t);
      const energy = Math.max(charge * 0.55, power);

      // ---- background: crimson dread -> gold blaze ----
      const ctx = r.bg;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#120308");
      g.addColorStop(1, power > 0.5 ? "#4a1403" : "#33070f");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      P.glow(ctx, HEAD[0], HEAD[1] + 60, 900 + 300 * burst, `rgba(255,${Math.round(120 + 64 * energy)},0,.75)`, 0.25 + 0.6 * energy);
      P.glow(ctx, 1400, 600, 800, "rgba(255,42,60,.35)", 0.9);
      P.speedLines(ctx, t, { cx: HEAD[0], cy: HEAD[1], inner: 520 - 120 * energy, color: "#FFD45A", count: 60 + Math.round(90 * energy), alpha: 0.12 + 0.4 * energy, seed: 31, fps: 15, width: 1.3 });
      P.speedLines(ctx, t, { cx: HEAD[0], cy: HEAD[1], inner: 640, color: "#FF3A2A", count: 50, alpha: 0.25, seed: 32, fps: 15, width: 2 });
      // rising embers
      for (let i = 0; i < 70; i++) {
        const sx = hash(i * 3 + 1) * W;
        const life = (t * (0.25 + hash(i * 7) * 0.5) * (1 + energy * 2) + hash(i * 11)) % 1;
        const y = H - life * H * 1.1;
        const x = sx + Math.sin(t * 2 + i) * 30;
        ctx.fillStyle = `rgba(255,${180 + Math.round(60 * hash(i))},80,${((1 - life) * 0.8).toFixed(3)})`;
        ctx.fillRect(x, y, 3 + hash(i * 5) * 4, 3 + hash(i * 5) * 9 * (1 + energy));
      }
      // the aura: layered flame tongues around Kai
      if (energy > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const cx = HEAD[0], cy = HEAD[1] + 190;
        for (let layer = 0; layer < 3; layer++) {
          const scale = (1.25 - layer * 0.22) * (0.55 + 0.45 * energy + 0.5 * burst);
          const N = 30;
          ctx.beginPath();
          for (let i = 0; i <= N; i++) {
            const a = Math.PI + (i / N) * Math.PI; // left -> over the top -> right
            const flick = 0.72 + 0.5 * Math.abs(noise(t * 7 + i * 1.7, layer + 3)) + (i % 2 ? 0.34 : 0);
            const rx = 330 * scale * (0.9 + 0.2 * flick);
            const ry = 520 * scale * flick;
            const x = cx + Math.cos(a) * rx;
            const y = cy + Math.sin(a) * ry;
            if (i === 0) ctx.moveTo(x, cy + 240);
            ctx.lineTo(x, y);
            if (i === N) ctx.lineTo(x, cy + 240);
          }
          ctx.closePath();
          const fg = ctx.createRadialGradient(cx, cy, 60, cx, cy, 620 * scale);
          fg.addColorStop(0, layer === 2 ? "rgba(255,255,220,.85)" : "rgba(255,220,90,.55)");
          fg.addColorStop(0.6, layer === 0 ? "rgba(255,120,0,.4)" : "rgba(255,184,0,.42)");
          fg.addColorStop(1, "rgba(255,80,0,0)");
          ctx.fillStyle = fg;
          ctx.globalAlpha = 0.75 * energy;
          ctx.fill();
        }
        ctx.restore();
      }

      // ---- Kai ----
      r.kai.set(t, {
        power, mouth: t < L.aura ? "flat" : t < L.ignite ? "panic" : t < L.g20 + 0.35 ? "shout" : "grin",
        brow: t < L.aura ? 9 : 17, open: t < L.aura ? 0.72 : 1, blink: false, irisScale: t >= L.ignite ? 0.9 : 1,
        look: [5, t < L.aura ? -3 : 0], dx: (hash(Math.floor(t * 24)) - 0.5) * 7 * (charge * (1 - power) + burst + boom),
        bob: -10 * burst, mouthScale: 1 + 0.08 * Math.sin(t * 22) * power,
      });
      P.kanaTick(r.k1, t, { amp: 6, show: ramp(t, L.aura, L.aura + 0.1) * (1 - ramp(t, L.g15, L.g15 + 0.3)), seed: 6, pop: lerp(1.6, 1, tween(t, L.aura, L.aura + 0.3, E.outBack)) });
      P.kanaTick(r.k2, t, { amp: 9, show: ramp(t, L.boom, L.boom + 0.04) * (1 - ramp(t, L.boom + 0.55, L.boom + 0.8)), seed: 8, pop: lerp(2.4, 1, tween(t, L.boom, L.boom + 0.3, E.outBack)) });

      // screen shake on ignite and boom
      const sh = 16 * burst + 26 * boom;
      const st = Math.floor(t * 45);
      r.shake.style.transform = `translate(${((hash(st) - 0.5) * sh).toFixed(1)}px,${((hash(st + 99) - 0.5) * sh).toFixed(1)}px)`;

      // ---- alert blinks on twos until the recap is gone ----
      const blink = t < L.boom ? (Math.floor(t * 7) % 2 ? 0.62 : 1) : 1;
      r.alert.style.filter = `brightness(${blink})`;
      r.alert.querySelector(".s3-haz").style.backgroundPositionX = (-t * 90).toFixed(1) + "px";

      // ---- episode strip: the playhead tears through the recap ----
      const prog = t < L.boom ? lerp(0.04, REC1, Math.pow(ramp(t, 0.3, L.boom), 2.1)) : REC1 + (t - L.boom) * 0.05;
      r.head.style.transform = `translateX(${(SW * prog).toFixed(1)}px)`;
      const gone = ramp(t, L.boom, L.boom + 0.12);
      r.recap.style.opacity = (1 - gone).toFixed(3);
      r.recap.style.transform = `scale(${(1 + 0.25 * gone).toFixed(3)})`;
      r.recap.style.backgroundPositionX = (-t * 160 * sp).toFixed(1) + "px";

      // ---- gauge ----
      r.num.textContent = sp.toFixed(1);
      const over = t >= L.g20;
      r.gauge.querySelector(".s3-num").style.color = over ? "#FFB800" : "#fff";
      r.gauge.querySelector(".s3-num").style.transform = `scale(${(1 + 0.2 * decay(t, L.g15, 0.15) + 0.3 * decay(t, L.g20, 0.18)).toFixed(3)})`;
      const active = sp >= 1.95 ? 3 : sp >= 1.45 ? 2 : sp >= 1.2 ? 1 : 0;
      r.chips.forEach((c, i) => c.classList.toggle("on", i === active));
      r.pill.tick(t);

      const f = r.fx;
      f.clearRect(0, 0, W, H);
      // dial
      f.save();
      f.translate(GC[0], GC[1]);
      f.lineCap = "round";
      f.lineWidth = 26;
      f.strokeStyle = "rgba(255,255,255,.1)";
      f.beginPath();
      f.arc(0, 0, GR, Math.PI, TAU);
      f.stroke();
      const k = clamp(sp - 1);
      const ag = f.createLinearGradient(-GR, 0, GR, 0);
      ag.addColorStop(0, "#00F0FF");
      ag.addColorStop(0.55, "#FFB800");
      ag.addColorStop(1, "#FF2A85");
      f.strokeStyle = ag;
      f.shadowColor = over ? "#FFB800" : "#00F0FF";
      f.shadowBlur = 30;
      f.beginPath();
      f.arc(0, 0, GR, Math.PI, Math.PI + Math.PI * Math.max(0.012, k));
      f.stroke();
      f.shadowBlur = 0;
      for (let i = 0; i <= 20; i++) {
        const a = Math.PI + (i / 20) * Math.PI;
        const major = i % 5 === 0;
        f.strokeStyle = major ? "#fff" : "rgba(255,255,255,.4)";
        f.lineWidth = major ? 5 : 2.5;
        f.beginPath();
        f.moveTo(Math.cos(a) * (GR - 30), Math.sin(a) * (GR - 30));
        f.lineTo(Math.cos(a) * (GR - (major ? 62 : 46)), Math.sin(a) * (GR - (major ? 62 : 46)));
        f.stroke();
        if (major) {
          f.fillStyle = "rgba(255,255,255,.8)";
          f.font = '700 24px "JetBrains Mono"';
          f.textAlign = "center";
          f.textBaseline = "middle";
          f.fillText((1 + i / 20).toFixed(2).replace(/0$/, "") + "x", Math.cos(a) * (GR + 44), Math.sin(a) * (GR + 44));
        }
      }
      // needle
      const na = Math.PI + Math.PI * k + (over ? noise(t * 30, 5) * 0.035 : 0);
      f.strokeStyle = "#fff";
      f.lineWidth = 8;
      f.shadowColor = "#FF2A85";
      f.shadowBlur = 24;
      f.beginPath();
      f.moveTo(Math.cos(na) * 150, Math.sin(na) * 150);
      f.lineTo(Math.cos(na) * (GR - 20), Math.sin(na) * (GR - 20));
      f.stroke();
      f.restore();

      // tap ripple on the Speed pill
      P.ring(f, 1662, 533, 190, ramp(t, L.ignite, L.ignite + 0.45), "#fff", 10);
      P.ring(f, 1662, 533, 300, ramp(t, L.ignite + 0.05, L.ignite + 0.6), "#FFB800", 8);
      // ignition flash
      if (burst > 0.02) {
        f.fillStyle = `rgba(255,236,170,${Math.min(0.85, burst * 1.2).toFixed(3)})`;
        f.fillRect(0, 0, W, H);
      }
      // boom: shockwaves + the recap block shattering
      const bx = SX + SW * (REC0 + REC1) * 0.5, by = SY + SH / 2;
      const bt = t - L.boom;
      if (bt >= 0) {
        for (let n = 0; n < 4; n++) P.ring(f, bx, by, 1500, ramp(bt, n * 0.09, 0.8 + n * 0.09), n % 2 ? "#FFB800" : "#fff", 26);
        for (let i = 0; i < 90; i++) {
          const a = hash(i * 3 + 5) * TAU;
          const v = 300 + hash(i * 7 + 1) * 1500;
          const x = bx + (hash(i * 13) - 0.5) * SW * (REC1 - REC0) + Math.cos(a) * v * bt;
          const y = by + (hash(i * 17) - 0.5) * SH + Math.sin(a) * v * bt + 900 * bt * bt;
          const s = 6 + hash(i * 19) * 22;
          f.save();
          f.translate(x, y);
          f.rotate(a + bt * (4 + hash(i) * 10));
          f.globalAlpha = clamp(1.25 - bt * 1.1);
          f.fillStyle = i % 4 === 0 ? "#fff" : i % 2 ? "#ff3b4e" : "#8f1220";
          f.fillRect(-s / 2, -s / 3, s, s * 0.66);
          f.restore();
        }
        const fl = decay(t, L.boom, 0.06);
        if (fl > 0.02) {
          f.fillStyle = `rgba(255,255,255,${Math.min(0.9, fl).toFixed(3)})`;
          f.fillRect(0, 0, W, H);
        }
      }
    },
  });
})();
