// SCENE 6 · 26.8–30.8s · 100% PRIVACY & SECURITY
// An energy shield (cast by Rei) domes over your data. Trackers and ad SDKs slam into it and
// shatter; the lock closes. Claims come straight from PRIVACY.md / SECURITY.md / manifest.json.
(function () {
  const { add, clamp, lerp, ramp, tween, bump, decay, hash, E, TAU, W, H } = P;
  const C = P.CUES.s6;
  const T0 = P.CUES.scenes[5];
  const IMP = C.impacts.map((x) => x - T0);
  const LOCK = C.lock - T0;
  const DC = [960, 1110], RX = 860, RY = 860; // the dome: its base sits below the frame
  const onDome = (deg) => [DC[0] + RX * Math.cos((deg * Math.PI) / 180), DC[1] - RY * Math.sin((deg * Math.PI) / 180)];
  const THREATS = [
    { label: "ADS SDK", from: [2140, 60], deg: 52, at: IMP[0], big: true },
    { label: "ANALYTICS", from: [-240, 100], deg: 129, at: IMP[1], big: true },
    { label: "TRACKING PIXEL", from: [2200, 360], deg: 30, at: IMP[2], big: true },
    { label: "TELEMETRY", from: [-260, 420], deg: 152, at: IMP[2] + 0.5 },
    { label: "PROFILING", from: [1500, -120], deg: 76, at: IMP[2] + 0.95 },
  ].map((th) => ({ ...th, hit: onDome(th.deg) }));

  P.scene("s6", {
    build(host) {
      const bg = P.canvas(host);
      const ttl = P.title(host, ["ΜΗΔΕΝΙΚΟ *TRACKING* · 100% *ΔΙΚΑ* *ΣΟΥ* ΔΕΔΟΜΕΝΑ"]);
      ttl.node.style.setProperty("--hl", "#35E3A4");
      ttl.node.style.setProperty("--hl-glow", "rgba(16,185,129,.7)");
      // the lattice sits behind Rei and the data so it never crosses a face or a line of copy
      const lattice = P.canvas(host);
      const rei = P.character(host, { who: "rei", x: 140, y: 430, scale: 1.3, glasses: true, hand: "palm", seed: 61 });
      const data = add(
        host,
        `<div class="s6-data"><div class="s6-ban b1"></div><div class="s6-ban b2"></div>
          <div class="s6-chips">
            <div class="chip s6-chip" style="--c:#35E3A4;--g:rgba(16,185,129,.45)"><b>0</b><span>Analytics SDKs</span></div>
            <div class="chip s6-chip" style="--c:#00F0FF">${P.ui.icons.shield("#00F0FF", 28)}<span>Local-First</span></div>
            <div class="chip s6-chip" style="--c:#35E3A4;--g:rgba(16,185,129,.45)">${P.ui.icons.shield("#35E3A4", 28)}<span>CodeQL Verified</span></div>
            <div class="s6-mv3"></div>
          </div></div>`,
      );
      const priv = P.brand("headerPrivacy", { width: 640 });
      const sec = P.brand("headerSecurity", { width: 640 });
      const mv3 = P.brand("badgeManifest", { width: 101 * 2.5 });
      [priv, sec, mv3].forEach((b) => (b.style.position = "relative"));
      data.querySelector(".b1").appendChild(priv);
      data.querySelector(".b2").appendChild(sec);
      data.querySelector(".s6-mv3").appendChild(mv3);
      const lock = add(
        host,
        `<div class="s6-lock"><svg width="112" height="127" viewBox="0 0 60 68" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path class="shackle" d="M18 30V19a12 12 0 0 1 24 0v11" stroke="#35E3A4" stroke-width="5"/>
            <rect x="9" y="30" width="42" height="32" rx="7" fill="#0c2a22" stroke="#35E3A4" stroke-width="4"/>
            <circle cx="30" cy="43" r="4.5" fill="#35E3A4"/><path d="M30 46v8" stroke="#35E3A4" stroke-width="4"/>
          </svg><div class="s6-own">100% ΔΙΚΑ ΣΟΥ</div></div>`,
      );
      const pills = THREATS.map((th) => add(host, `<div class="s6-threat${th.big ? " big" : ""}" data-layout-allow-overlap>${P.ui.icons.warn("#fff", th.big ? 28 : 22)}<span>${th.label}</span></div>`));
      const blocked = THREATS.map((th) => add(host, `<div class="s6-blocked" data-layout-allow-overlap style="left:${th.hit[0]}px;top:${th.hit[1]}px"><s>${th.label}</s> BLOCKED</div>`));
      const dome = P.canvas(host, "top");
      dome.canvas.style.zIndex = 6;
      const k1 = P.kana(host, "ガキーン!", { x: 1250, y: 200, size: 104, color: "#35E3A4", rot: 7 });
      const k2 = P.kana(host, "バリア!", { x: 596, y: 292, size: 80, color: "#00F0FF", rot: -6 });
      return {
        bg, lattice, ttl, rei, data, bans: [...data.querySelectorAll(".s6-ban")], chips: [...data.querySelectorAll(".s6-chip, .s6-mv3")], priv, sec, mv3,
        lock, shackle: lock.querySelector(".shackle"), own: lock.querySelector(".s6-own"), pills, blocked, dome, k1, k2,
      };
    },

    timeline(tl, r) {
      P.titleIn(tl, r.ttl, 0.18, { stagger: 0.045 });
      tl.fromTo(r.rei.node, { y: 200, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "expo.out" }, 0.02);
      tl.fromTo(r.bans, { x: 160, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out", stagger: 0.12 }, 0.12);
      tl.fromTo(r.chips, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2)", stagger: 0.12 }, 0.85);
      tl.fromTo(r.lock, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.8)" }, 1.7);
      tl.to(r.lock, { scale: 1.18, duration: 0.09, yoyo: true, repeat: 1, ease: "power2.out" }, LOCK);
      tl.fromTo(r.own, { scale: 2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28, ease: "expo.out" }, LOCK + 0.04);
      r.blocked.forEach((b, i) => {
        tl.fromTo(b, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: "back.out(2.4)" }, THREATS[i].at + 0.02);
        tl.to(b, { opacity: 0, y: -30, duration: 0.3, ease: "power2.in" }, THREATS[i].at + 0.62);
      });
    },

    frame(t, r) {
      const up = tween(t, 0.1, 0.55, E.outCubic); // the shield rising
      const hits = THREATS.filter((th) => t >= th.at);
      let jolt = 0;
      THREATS.forEach((th) => (jolt = Math.max(jolt, (th.big ? 1 : 0.4) * decay(t, th.at, 0.14))));

      const ctx = r.bg;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#03110d");
      g.addColorStop(1, "#06261c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      P.glow(ctx, 960, 900, 1100, "rgba(16,185,129,.42)", 1);
      P.glow(ctx, 200, 120, 520, "rgba(255,40,60,.3)", 0.6 + 0.4 * jolt);
      P.glow(ctx, 1760, 140, 560, "rgba(255,40,60,.3)", 0.6 + 0.4 * jolt);
      // matrix-ish data rain outside the shield
      for (let i = 0; i < 60; i++) {
        const x = hash(i * 3) * W;
        const y = (hash(i * 7) * H + t * (120 + hash(i) * 260)) % H;
        ctx.fillStyle = `rgba(53,227,164,${(0.08 + 0.2 * hash(i * 5)).toFixed(2)})`;
        ctx.fillRect(x, y, 2, 30 + hash(i * 9) * 70);
      }

      // Rei holds the barrier
      const locked = t >= LOCK;
      r.rei.set(t, {
        blink: false, mouth: locked ? "grin" : jolt > 0.3 ? "flat" : "smirk", eye: locked && t < LOCK + 0.5 ? "happy" : "open", brow: locked ? 2 : 14, open: locked ? 1 : 0.84,
        look: [6, -4], wind: 0.35 + 0.5 * jolt, handY: -74 - 10 * jolt, handRot: -6, dx: -6 * jolt, blush: locked ? 0.6 : 0.15,
        flash: 0.5 * decay(t, IMP[0], 0.2),
      });
      [r.priv, r.sec, r.mv3].forEach((b) => b.tick(t + 1));
      r.data.style.transform = `translate(${(-5 * jolt).toFixed(1)}px,${(3 * jolt).toFixed(1)}px)`;

      // threats fly in, then are gone the instant they touch the shield
      THREATS.forEach((th, i) => {
        const p = ramp(t, th.at - Math.min(0.75, th.at - 0.04), th.at);
        const k = E.inQuad(p);
        const x = lerp(th.from[0], th.hit[0], k);
        const y = lerp(th.from[1], th.hit[1], k);
        const ang = (Math.atan2(th.hit[1] - th.from[1], th.hit[0] - th.from[0]) * 180) / Math.PI;
        const el = r.pills[i];
        el.style.opacity = p > 0 && t < th.at ? "1" : "0";
        el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) rotate(${(ang > 90 || ang < -90 ? ang + 180 : ang).toFixed(1)}deg) scale(${(1 + 0.25 * k).toFixed(3)})`;
      });

      // lock: the shackle drops shut
      const shut = tween(t, LOCK - 0.08, LOCK, E.inCubic);
      r.shackle.setAttribute("transform", `translate(0 ${(-9 * (1 - shut)).toFixed(2)}) rotate(${(-28 * (1 - shut)).toFixed(2)} 42 30)`);

      // ---- the shield: lattice behind the content, rim and impacts in front ----
      const lat = r.lattice;
      const f = r.dome;
      lat.clearRect(0, 0, W, H);
      f.clearRect(0, 0, W, H);
      lat.save();
      lat.beginPath();
      lat.ellipse(DC[0], DC[1], RX * up, RY * up, 0, Math.PI, TAU);
      lat.closePath();
      lat.clip();
      const dg = lat.createRadialGradient(DC[0], DC[1], RY * 0.35, DC[0], DC[1], RX);
      dg.addColorStop(0, "rgba(16,185,129,0)");
      dg.addColorStop(0.8, "rgba(16,185,129,.07)");
      dg.addColorStop(1, "rgba(53,227,164,.34)");
      lat.fillStyle = dg;
      lat.fillRect(0, 0, W, H);
      // hex lattice: bright at the rim and wherever an impact ripple is passing
      const S = 44, HH = S * Math.sqrt(3);
      lat.lineWidth = 2;
      for (let row = 0; row * (HH / 2) < H; row++) {
        for (let col = 0; col * S * 3 < W + S * 3; col++) {
          const x = col * S * 3 + (row % 2 ? S * 1.5 : 0);
          const y = row * (HH / 2);
          if (y < 230) continue;
          const nx = (x - DC[0]) / RX, ny = (y - DC[1]) / RY;
          const d = Math.sqrt(nx * nx + ny * ny); // 1 at the rim
          if (d > 1.02) continue;
          let a = 0.05 + 0.5 * Math.pow(clamp((d - 0.72) / 0.28), 2.2) + 0.06 * Math.sin(t * 3 + x * 0.01 + y * 0.013);
          for (const th of hits) {
            const age = t - th.at;
            if (age > 0.9) continue;
            const dist = Math.hypot(x - th.hit[0], y - th.hit[1]);
            const wave = age * 1500;
            a += (th.big ? 1.1 : 0.6) * Math.exp(-Math.pow((dist - wave) / 90, 2)) * (1 - age / 0.9);
          }
          if (a < 0.03) continue;
          lat.strokeStyle = `rgba(110,255,205,${Math.min(1, a).toFixed(3)})`;
          lat.beginPath();
          for (let k = 0; k < 6; k++) {
            const ang = (k * Math.PI) / 3;
            const hx = x + Math.cos(ang) * S, hy = y + Math.sin(ang) * S;
            k ? lat.lineTo(hx, hy) : lat.moveTo(hx, hy);
          }
          lat.closePath();
          lat.stroke();
        }
      }
      lat.restore();
      // rim
      f.save();
      f.lineWidth = 7 + 6 * jolt;
      f.strokeStyle = "#8dffd6";
      f.shadowColor = "#10B981";
      f.shadowBlur = 50 + 60 * jolt;
      f.globalAlpha = up;
      f.beginPath();
      f.ellipse(DC[0], DC[1], RX * up, RY * up, 0, Math.PI, TAU);
      f.stroke();
      f.restore();

      // impacts: flash, rings, shards thrown back
      hits.forEach((th, n) => {
        const age = t - th.at;
        if (age > 1) return;
        const [x, y] = th.hit;
        const size = th.big ? 1 : 0.55;
        P.glow(f, x, y, 420 * size, "rgba(255,255,255,.95)", decay(t, th.at, 0.08));
        P.glow(f, x, y, 520 * size, "rgba(53,227,164,.9)", decay(t, th.at, 0.22));
        for (let k = 0; k < 3; k++) P.ring(f, x, y, 520 * size, ramp(age, k * 0.07, 0.55 + k * 0.07), k % 2 ? "#fff" : "#35E3A4", 14);
        const ox = x - DC[0], oy = y - DC[1];
        const ol = Math.hypot(ox, oy);
        for (let i = 0; i < 26 * size; i++) {
          const spread = (hash(i * 7 + n * 31) - 0.5) * 2.2;
          const dir = Math.atan2(oy, ox) + spread;
          const v = 400 + hash(i * 11 + n) * 1300;
          const px = x + Math.cos(dir) * v * age;
          const py = y + Math.sin(dir) * v * age + 700 * age * age;
          const s = 6 + hash(i * 13) * 16;
          f.save();
          f.translate(px, py);
          f.rotate(dir + age * 9);
          f.globalAlpha = clamp(1.1 - age * 1.4);
          f.fillStyle = i % 3 ? "#ff4257" : "#fff";
          f.fillRect(-s / 2, -s / 4, s, s / 2);
          f.restore();
        }
      });
      // lock confirmation
      for (let k = 0; k < 2; k++) P.ring(f, 1262, 800, 260, ramp(t, LOCK + k * 0.08, LOCK + 0.5 + k * 0.08), "#35E3A4", 10);

      P.kanaTick(r.k1, t, { amp: 7, show: ramp(t, IMP[0], IMP[0] + 0.04) * (1 - ramp(t, IMP[0] + 0.75, IMP[0] + 1.0)), seed: 5, pop: lerp(1.5, 1, tween(t, IMP[0], IMP[0] + 0.3, E.outBack)) });
      P.kanaTick(r.k2, t, { amp: 4, show: ramp(t, 0.25, 0.35) * (1 - ramp(t, 1.6, 1.9)), seed: 6, pop: lerp(1.8, 1, tween(t, 0.25, 0.55, E.outBack)) });
    },
  });
})();
