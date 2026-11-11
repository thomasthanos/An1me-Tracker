// Original anime characters for the promo, drawn as SVG and posed from the clock.
//   Kai — sleepless otaku in a hoodie (scenes 1, 3, 5, 7); powers up into a golden mode.
//   Rei — megane heroine with long magenta hair (scenes 2, 4, 6, 7).
// P.character(parent, opts) returns { node, set(t, pose) }. pose.armL / pose.armR place a hand. `set` is a pure function of its
// arguments: blinking, hair sway and breathing are all derived from `t`.
(function () {
  const { clamp, lerp, hash, noise, TAU, E } = P;
  const OUT = "#160f24"; // ink line
  const SKIN = "#ffe2d2";
  const SKIN_SH = "#f4bda8";
  let seq = 0;

  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const mix = (a, b, t) => {
    const A = hex(a), B = hex(b);
    return "#" + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, "0")).join("");
  };
  const polar = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];
  const f = (n) => n.toFixed(1);

  const PALETTE = {
    kai: {
      hair: "#3c4fc0", hairSh: "#252f7d", hairHi: "#9db2ff",
      powHair: "#ffcf2e", powSh: "#f08a00", powHi: "#fff7c2",
      irisTop: "#0a2f5e", irisBot: "#35dcff", powIrisTop: "#b85a00", powIrisBot: "#ffe66b",
      top: "#2b2456", topSh: "#1c173d", trim: "#00F0FF", shirt: "#eef0ff",
    },
    rei: {
      hair: "#ff4f9a", hairSh: "#c4186b", hairHi: "#ffc0dc",
      irisTop: "#06456f", irisBot: "#19f0ff",
      top: "#161b36", topSh: "#0d1024", trim: "#00F0FF", shirt: "#f6f8ff",
    },
  };

  // ---- Kai's spiky hair is generated, so every spike can sway and flare with power ----
  const KAI_SPIKES = [
    [-24, 30, 26, -8], [-4, 44, 24, 6], [16, 38, 24, -5], [36, 54, 24, 7], [56, 46, 23, -6], [75, 60, 22, 5],
    [94, 52, 22, -4], [113, 58, 23, 6], [132, 44, 24, -7], [151, 52, 24, 5], [170, 40, 24, -6], [190, 46, 24, 8], [208, 30, 26, -4],
  ];
  function kaiBack(t, power, seed) {
    const cx = 200, cy = 176, R = 104;
    let d = "";
    KAI_SPIKES.forEach(([a, len, w, lean], i) => {
      const sway = 2.6 * Math.sin(t * 2.3 + i * 1.7 + seed) + power * 5 * noise(t * 9 + i, i + seed);
      const tipA = lerp(a + lean, lerp(a, 90, 0.42), power) + sway;
      const L = len * (1 + 1.5 * power) * (1 + power * 0.12 * Math.sin(t * 14 + i * 2.1));
      const b0 = polar(cx, cy, R, a - w / 2);
      const b1 = polar(cx, cy, R, a + w / 2);
      const tip = polar(cx, cy, R + L, tipA);
      const c0 = polar(cx, cy, R + L * 0.5, a - w * 0.62);
      const c1 = polar(cx, cy, R + L * 0.42, a + w * 0.62);
      d += (i === 0 ? `M${f(b0[0])} ${f(b0[1])}` : `L${f(b0[0])} ${f(b0[1])}`) + `Q${f(c0[0])} ${f(c0[1])} ${f(tip[0])} ${f(tip[1])}Q${f(c1[0])} ${f(c1[1])} ${f(b1[0])} ${f(b1[1])}`;
    });
    return d + "L96 262L304 262Z";
  }
  // [baseX0, baseX1, tipX, tipY, powerTipX, powerTipY]
  const KAI_BANGS = [
    [112, 148, 120, 198, 84, 132], [138, 174, 150, 170, 126, 36], [164, 204, 192, 190, 190, 150],
    [194, 232, 224, 168, 236, 24], [224, 260, 252, 172, 284, 44], [250, 290, 282, 198, 318, 130],
  ];
  function kaiBangs(t, power, seed) {
    return KAI_BANGS.map(([x0, x1, tx, ty, px, py], i) => {
      const sway = 3 * Math.sin(t * 2.6 + i * 1.3 + seed) * (1 + power * 1.5);
      const X = lerp(tx, px, power) + sway;
      const Y = lerp(ty, py, power) + power * 4 * Math.sin(t * 13 + i);
      const y0 = 112;
      const m0x = lerp(x0, X, 0.45) - 9 - power * 14;
      const m1x = lerp(x1, X, 0.45) + 9 + power * 14;
      const my = lerp(y0, Y, 0.55);
      return `M${f(x0)} ${y0}Q${f(m0x)} ${f(my)} ${f(X)} ${f(Y)}Q${f(m1x)} ${f(my)} ${f(x1)} ${y0}`;
    });
  }

  function eyeMarkup(u, side, pal) {
    // geometry is authored for the viewer's-left eye and mirrored for the right one
    const m = side === "L" ? "" : ' transform="translate(400 0) scale(-1 1)"';
    return `
    <g class="eye eye${side}"${m}>
      <g class="eye-open">
        <clipPath id="${u}-ec${side}"><path d="M133 198C137 174 181 170 190 197C188 220 177 228 161 228C146 228 135 218 133 198Z"/></clipPath>
        <path class="sclera" d="M133 198C137 174 181 170 190 197C188 220 177 228 161 228C146 228 135 218 133 198Z" fill="#fff"/>
        <g clip-path="url(#${u}-ec${side})">
          <rect x="128" y="168" width="68" height="14" fill="#d9dcf5" opacity=".8"/>
          <g class="iris">
            <ellipse cx="162" cy="202" rx="18.5" ry="23" fill="url(#${u}-iris)" stroke="${OUT}" stroke-width="2"/>
            <ellipse class="iris-pow" cx="162" cy="202" rx="18.5" ry="23" fill="url(#${u}-irisP)" opacity="0"/>
            <ellipse cx="162" cy="204" rx="8" ry="12.5" fill="#0a0716"/>
            <path d="M146 212Q162 228 178 212" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="5"/>
            <circle class="hl" cx="${side === "L" ? 154 : 170}" cy="191" r="6.6" fill="#fff"/>
            <circle class="hl" cx="${side === "L" ? 169 : 155}" cy="213" r="3" fill="#fff" opacity=".9"/>
          </g>
        </g>
        <path class="lash" d="M129 200C135 172 181 166 191 195" fill="none" stroke="${OUT}" stroke-width="6.5" stroke-linecap="round"/>
        <path class="lash" d="M130 199l-9-6M134 190l-8-8" fill="none" stroke="${OUT}" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M144 228Q161 233 178 227" fill="none" stroke="${OUT}" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>
      </g>
      <path class="eye-happy" d="M132 208Q161 180 190 208" fill="none" stroke="${OUT}" stroke-width="6.5" stroke-linecap="round" opacity="0"/>
      <path class="brow" d="M130 160Q158 146 190 158" fill="none" stroke="${pal.hairSh}" stroke-width="5.6" stroke-linecap="round"/>
      <g class="bags" opacity="0">
        <path d="M138 236Q161 246 184 235" fill="none" stroke="#7b5ea8" stroke-width="3" stroke-linecap="round" opacity=".7"/>
        <path d="M144 243Q161 250 178 243" fill="none" stroke="#7b5ea8" stroke-width="2" stroke-linecap="round" opacity=".45"/>
      </g>
    </g>`;
  }

  const MOUTHS = {
    smile: `<path d="M183 258Q200 273 217 258" fill="none" stroke="#7a2438" stroke-width="3.4" stroke-linecap="round"/>`,
    smirk: `<path d="M185 262Q205 269 221 253" fill="none" stroke="#7a2438" stroke-width="3.4" stroke-linecap="round"/>`,
    grin: `<path d="M179 255Q200 252 221 255Q217 283 200 285Q183 283 179 255Z" fill="#6a1830" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round"/><path d="M183 257Q200 255 217 257L215 263Q200 260 185 263Z" fill="#fff"/><ellipse cx="200" cy="278" rx="10" ry="5" fill="#ff7b93"/>`,
    panic: `<path d="M176 256Q200 250 224 256Q222 280 200 282Q178 280 176 256Z" fill="#5a1630" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round"/><path d="M180 259q5 6 10 0t10 0t10 0t10 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M180 277q5-6 10 0t10 0t10 0t10 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
    shout: `<path d="M174 248Q200 240 226 248Q230 290 200 296Q170 290 174 248Z" fill="#5a1026" stroke="${OUT}" stroke-width="2.6" stroke-linejoin="round"/><path d="M179 250Q200 244 221 250L219 258Q200 253 181 258Z" fill="#fff"/><path d="M184 286Q200 291 216 286L214 280Q200 284 186 280Z" fill="#fff"/><ellipse cx="200" cy="276" rx="12" ry="6" fill="#ff6b88"/>`,
    o: `<ellipse cx="200" cy="265" rx="8" ry="10" fill="#6a1830" stroke="${OUT}" stroke-width="2.4"/>`,
    flat: `<path d="M186 262L214 262" fill="none" stroke="#7a2438" stroke-width="3.4" stroke-linecap="round"/>`,
  };

  function markup(who, u, pal, opts) {
    const kai = who === "kai";
    const body = kai
      ? `
      <path class="hood" d="M112 356C124 296 168 288 200 288C232 288 276 296 288 356C256 380 144 380 112 356Z" fill="${pal.topSh}" stroke="${OUT}" stroke-width="2.6"/>
      <path class="neck" d="M177 272L177 322C190 334 210 334 223 322L223 272Z" fill="${SKIN_SH}" stroke="${OUT}" stroke-width="2.4"/>
      <path d="M48 500C52 410 92 356 162 340L178 322C190 336 210 336 222 322L238 340C308 356 348 410 352 500Z" fill="${pal.top}" stroke="${OUT}" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M176 324L200 370L224 324C212 336 188 336 176 324Z" fill="${pal.shirt}" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M162 340Q176 372 200 372Q224 372 238 340" fill="none" stroke="${OUT}" stroke-width="2.6"/>
      <path d="M92 420Q120 470 110 500M308 420Q280 470 290 500" fill="none" stroke="${pal.topSh}" stroke-width="5" stroke-linecap="round"/>
      <path class="string" d="M186 366L183 424" fill="none" stroke="${pal.trim}" stroke-width="3.4" stroke-linecap="round"/>
      <path class="string" d="M214 366L218 418" fill="none" stroke="${pal.trim}" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M150 440h100v36a8 8 0 0 1-8 8h-84a8 8 0 0 1-8-8z" fill="${pal.topSh}" stroke="${OUT}" stroke-width="2.4"/>`
      : `
      <path class="neck" d="M178 272L178 322C190 334 210 334 222 322L222 272Z" fill="${SKIN_SH}" stroke="${OUT}" stroke-width="2.4"/>
      <path d="M52 500C56 414 96 360 164 342L178 322C190 336 210 336 222 322L236 342C304 360 344 414 348 500Z" fill="${pal.top}" stroke="${OUT}" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M170 324L200 384L230 324C214 338 186 338 170 324Z" fill="${pal.shirt}" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M170 324L152 356L194 376Z" fill="#fff" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M230 324L248 356L206 376Z" fill="#fff" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M152 356L200 470L248 356" fill="none" stroke="${OUT}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M200 378L176 364L178 394ZM200 378L224 364L222 394Z" fill="${pal.trim}" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M194 380l-6 34 12 10 12-10-6-34z" fill="${pal.trim}" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/>
      <circle cx="200" cy="379" r="7" fill="#fff" stroke="${OUT}" stroke-width="2.2"/>`;

    const hairBack = kai
      ? `<path class="hair-back" d="" fill="${pal.hair}" stroke="${OUT}" stroke-width="2.8" stroke-linejoin="round"/>`
      : `<g class="hair-backL"><path d="M100 176C86 250 78 340 84 436C96 474 132 470 142 438L152 300L150 176Z" fill="${pal.hairSh}" stroke="${OUT}" stroke-width="2.8" stroke-linejoin="round"/></g>
         <g class="hair-backR"><path d="M300 176C314 250 322 340 316 436C304 474 268 470 258 438L248 300L250 176Z" fill="${pal.hairSh}" stroke="${OUT}" stroke-width="2.8" stroke-linejoin="round"/></g>
         <path d="M98 184C86 96 150 52 200 52C250 52 314 96 302 184L296 300L104 300Z" fill="${pal.hair}" stroke="${OUT}" stroke-width="2.8" stroke-linejoin="round"/>`;

    const hairFront = kai
      ? `<path class="hair-cap" d="M112 180C102 104 152 64 200 64C248 64 298 104 288 180C284 150 270 128 250 118C218 106 182 106 150 118C130 128 116 150 112 180Z" fill="${pal.hair}"/>
         <path d="M112 180C102 104 152 64 200 64C248 64 298 104 288 180" fill="none" stroke="${OUT}" stroke-width="2.6" stroke-linecap="round"/>
         ${KAI_BANGS.map(() => `<path class="bang" d="" fill="${pal.hair}" stroke="${OUT}" stroke-width="2.6" stroke-linejoin="round"/>`).join("")}
         <path class="hair-hi" d="M146 98Q200 76 254 98" fill="none" stroke="${pal.hairHi}" stroke-width="6" stroke-linecap="round" opacity=".55"/>`
      : `<g class="lockL"><path d="M112 156C102 204 104 252 113 296L136 290C128 250 128 204 132 160Z" fill="${pal.hair}" stroke="${OUT}" stroke-width="2.6" stroke-linejoin="round"/></g>
         <g class="lockR"><path d="M288 156C298 204 296 252 287 296L264 290C272 250 272 204 268 160Z" fill="${pal.hair}" stroke="${OUT}" stroke-width="2.6" stroke-linejoin="round"/></g>
         <path class="fringe" d="M112 178C104 106 156 72 200 72C244 72 296 106 288 178C282 166 274 158 266 170C260 152 250 150 242 168C234 148 222 148 215 166C208 150 194 150 187 166C180 148 168 148 160 168C152 150 142 152 136 170C128 158 120 164 112 178Z" fill="${pal.hair}" stroke="${OUT}" stroke-width="2.6" stroke-linejoin="round"/>
         <path class="hair-hi" d="M140 104Q200 80 260 104" fill="none" stroke="${pal.hairHi}" stroke-width="7" stroke-linecap="round" opacity=".7"/>
         <path class="ahoge" d="M196 74C186 44 204 28 222 34C210 38 204 52 208 74Z" fill="${pal.hair}" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round"/>`;

    const glasses = opts.glasses
      ? `<g class="glasses">
          <clipPath id="${u}-lens"><rect x="127" y="178" width="66" height="50" rx="15"/><rect x="207" y="178" width="66" height="50" rx="15"/></clipPath>
          <rect x="127" y="178" width="66" height="50" rx="15" fill="#bff6ff" fill-opacity=".14"/>
          <rect x="207" y="178" width="66" height="50" rx="15" fill="#bff6ff" fill-opacity=".14"/>
          <g clip-path="url(#${u}-lens)">
            <rect class="lens-flash" x="120" y="170" width="160" height="66" fill="#fff" opacity="0"/>
            <path class="lens-glint" d="M0 170l18 0-26 66-18 0zM30 170l8 0-26 66-8 0z" fill="#fff" opacity="0"/>
          </g>
          <rect x="127" y="178" width="66" height="50" rx="15" fill="none" stroke="#0e1226" stroke-width="4"/>
          <rect x="207" y="178" width="66" height="50" rx="15" fill="none" stroke="#0e1226" stroke-width="4"/>
          <path d="M193 198Q200 192 207 198" fill="none" stroke="#0e1226" stroke-width="4" stroke-linecap="round"/>
          <path d="M127 194L112 190M273 194L288 190" fill="none" stroke="#0e1226" stroke-width="3.4" stroke-linecap="round"/>
        </g>`
      : "";

    return `<svg class="chr chr-${who}" viewBox="0 0 400 500" width="400" height="500" overflow="visible" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${u}-iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.irisTop}"/><stop offset=".55" stop-color="${pal.irisBot}"/><stop offset="1" stop-color="#eaffff"/></linearGradient>
        <linearGradient id="${u}-irisP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.powIrisTop || pal.irisTop}"/><stop offset=".6" stop-color="${pal.powIrisBot || pal.irisBot}"/><stop offset="1" stop-color="#fffbe0"/></linearGradient>
      </defs>
      <g class="rig">
        ${hairBack}
        <g class="torso">${body}</g>
        <g class="head">
          <path d="M118 188C104 182 99 206 108 219C113 226 120 223 121 215Z" fill="${SKIN}" stroke="${OUT}" stroke-width="2.4"/>
          <path d="M282 188C296 182 301 206 292 219C287 226 280 223 279 215Z" fill="${SKIN}" stroke="${OUT}" stroke-width="2.4"/>
          <path class="face" d="M118 172C116 110 160 84 200 84C240 84 284 110 282 172C284 216 268 254 236 280C222 291 210 297 200 297C190 297 178 291 164 280C132 254 116 216 118 172Z" fill="${SKIN}" stroke="${OUT}" stroke-width="2.8" stroke-linejoin="round"/>
          <path class="fshade" d="M124 146C150 132 250 132 276 146C262 124 138 124 124 146Z" fill="${SKIN_SH}" opacity=".5"/>
          <g class="blush" opacity="0">
            <ellipse cx="141" cy="242" rx="19" ry="9" fill="#ff5c8a" opacity=".42"/><ellipse cx="259" cy="242" rx="19" ry="9" fill="#ff5c8a" opacity=".42"/>
            <path d="M132 246l5-9M141 247l5-9M150 246l5-9M250 246l5-9M259 247l5-9M268 246l5-9" stroke="#ff5c8a" stroke-width="2" stroke-linecap="round" opacity=".7"/>
          </g>
          <g class="gloom" opacity="0"><path d="M128 120l0 34M146 112l0 38M164 108l0 36M236 108l0 36M254 112l0 38M272 120l0 34" stroke="#3b2b6b" stroke-width="3" stroke-linecap="round" opacity=".55"/></g>
          ${eyeMarkup(u, "L", pal)}
          ${eyeMarkup(u, "R", pal)}
          <path d="M200 236l-3.5 9 5.5 1.5" fill="none" stroke="#d89a86" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          <g class="mouth"></g>
          <g class="sweat" opacity="0"><path d="M296 150C304 164 308 174 300 180C292 184 286 176 290 166Z" fill="#8fe9ff" stroke="${OUT}" stroke-width="2"/><path d="M104 132C98 144 96 152 102 156C108 158 112 152 110 144Z" fill="#8fe9ff" stroke="${OUT}" stroke-width="2"/></g>
          ${hairFront}
          <g class="brows-top"></g>
          ${glasses}
        </g>
        <g class="armL" opacity="0"></g><g class="armR" opacity="0"></g>
      </g>
    </svg>`;
  }

  /** Eye openness from an automatic, seeded blink schedule. */
  function autoBlink(t, seed) {
    const period = 2.9;
    const k = Math.floor(t / period);
    const at = k * period + 0.6 + hash(k * 13 + seed) * 1.6;
    const d = t - at;
    if (d < 0 || d > 0.2) return 1;
    return d < 0.07 ? 1 - d / 0.07 : d < 0.11 ? 0 : (d - 0.11) / 0.09;
  }

  P.character = function (parent, opts) {
    const who = opts.who;
    const pal = PALETTE[who];
    const u = "chr" + ++seq;
    const seed = opts.seed ?? seq * 17;
    const wrap = P.add(parent, `<div class="chr-wrap ${opts.cls || ""}" style="left:${opts.x}px;top:${opts.y}px;width:${400 * opts.scale}px;height:${500 * opts.scale}px">${markup(who, u, pal, opts)}</div>`);
    const svg = wrap.firstElementChild;
    svg.setAttribute("width", 400 * opts.scale);
    svg.setAttribute("height", 500 * opts.scale);
    if (opts.flip) svg.style.transform = "scaleX(-1)";
    const $ = (s) => svg.querySelector(s);
    const $$ = (s) => [...svg.querySelectorAll(s)];
    // eyebrows read through the fringe, the anime way: lift them above the hair
    const browsTop = $(".brows-top");
    const brows = $$(".brow");
    brows.forEach((b) => {
      const side = b.closest(".eyeL") ? "L" : "R";
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      if (side === "R") g.setAttribute("transform", "translate(400 0) scale(-1 1)");
      g.appendChild(b);
      browsTop.appendChild(g);
    });
    const r = {
      rig: $(".rig"), head: $(".head"), torso: $(".torso"), mouth: $(".mouth"),
      open: $$(".eye-open"), happy: $$(".eye-happy"), iris: $$(".iris"), irisPow: $$(".iris-pow"), lash: $$(".lash"),
      bags: $$(".bags"), blush: $(".blush"), gloom: $(".gloom"), sweat: $(".sweat"),
      back: $(".hair-back"), cap: $(".hair-cap"), fshade: $(".fshade"), bangs: $$(".bang"), hi: $(".hair-hi"),
      backL: $(".hair-backL"), backR: $(".hair-backR"), lockL: $(".lockL"), lockR: $(".lockR"), ahoge: $(".ahoge"),
      flash: $(".lens-flash"), glint: $(".lens-glint"), strings: $$(".string"),
    };
    // arms are solved from the shoulder to wherever a pose puts the wrist (see hands.js)
    const cuff = who === "kai" ? pal.topSh : "#fff";
    const arms = {
      L: P.hands.create($(".armL"), { shoulder: [96, 408], sleeve: pal.top, cuff }),
      R: P.hands.create($(".armR"), { shoulder: [304, 408], sleeve: pal.top, cuff }),
    };
    let lastMouth = null;

    function set(t, p = {}) {
      const power = clamp(p.power ?? 0);
      const breathe = Math.sin(t * 1.9 + seed) * (1 + power * 2.5);
      const bob = (p.bob ?? 0) + breathe * 1.6;
      const tilt = (p.tilt ?? 0) + Math.sin(t * 1.1 + seed) * 0.7;
      r.rig.setAttribute("transform", `translate(${f(p.dx ?? 0)} ${f(p.dy ?? 0)})`);
      r.torso.setAttribute("transform", `translate(0 ${f(breathe * 1.2)})`);
      r.head.setAttribute("transform", `translate(0 ${f(bob)}) rotate(${tilt.toFixed(2)} 200 290)`);

      // eyes
      const eye = p.eye || "open";
      const openness = eye === "happy" ? 0 : clamp(Math.min(p.open ?? 1, p.blink === false ? 1 : autoBlink(t, seed)), 0.06, 1);
      const irisS = p.irisScale ?? 1;
      const lx = (p.look?.[0] ?? 0) + noise(t * 0.7, seed) * 1.2;
      const ly = p.look?.[1] ?? 0;
      r.open.forEach((g) => {
        g.setAttribute("opacity", eye === "happy" ? 0 : 1);
        g.setAttribute("transform", `translate(0 ${f(201 * (1 - openness))}) scale(1 ${openness.toFixed(3)})`);
      });
      r.happy.forEach((g) => g.setAttribute("opacity", eye === "happy" ? 1 : 0));
      r.iris.forEach((g, i) => {
        // the right eye lives in a mirrored group, so its x offset flips
        const sx = i === 0 ? lx : -lx;
        g.setAttribute("transform", `translate(${f(162 + sx - 162 * irisS)} ${f(202 + ly - 202 * irisS)}) scale(${irisS.toFixed(3)})`);
      });
      r.irisPow.forEach((g) => g.setAttribute("opacity", power.toFixed(3)));
      // brows: + angry (inner end down), - worried
      const ba = p.brow ?? 0;
      const lift = p.browLift ?? 0;
      brows.forEach((b) => b.setAttribute("transform", `translate(0 ${f(-lift)}) rotate(${ba.toFixed(2)} 160 154)`));
      brows.forEach((b) => b.setAttribute("stroke", who === "kai" ? mix(pal.hairSh, pal.powSh, power) : pal.hairSh));

      const mouth = p.mouth || "smile";
      if (mouth !== lastMouth) {
        r.mouth.innerHTML = MOUTHS[mouth];
        lastMouth = mouth;
      }
      r.mouth.setAttribute("transform", `translate(0 ${f(p.mouthDy ?? 0)}) scale(${(p.mouthScale ?? 1).toFixed(3)})`);
      r.mouth.style.transformOrigin = "200px 265px";

      r.fshade.setAttribute("opacity", (0.5 * (1 - power)).toFixed(3));
      r.blush.setAttribute("opacity", clamp(p.blush ?? 0).toFixed(3));
      r.gloom.setAttribute("opacity", clamp(p.gloom ?? 0).toFixed(3));
      r.bags.forEach((b) => b.setAttribute("opacity", clamp(p.bags ?? 0).toFixed(3)));
      const sw = clamp(p.sweat ?? 0);
      r.sweat.setAttribute("opacity", sw.toFixed(3));
      r.sweat.setAttribute("transform", `translate(0 ${f(((t * 26) % 30) * sw)})`);

      // hair
      if (who === "kai") {
        const col = mix(pal.hair, pal.powHair, power);
        r.back.setAttribute("d", kaiBack(t, power, seed));
        r.back.setAttribute("fill", mix(pal.hairSh, pal.powSh, power));
        r.cap.setAttribute("fill", col);
        const bd = kaiBangs(t, power, seed);
        r.bangs.forEach((b, i) => {
          b.setAttribute("d", bd[i]);
          b.setAttribute("fill", col);
        });
        r.hi.setAttribute("stroke", mix(pal.hairHi, pal.powHi, power));
        r.strings.forEach((s, i) => s.setAttribute("transform", `rotate(${(Math.sin(t * 2.2 + i * 2) * 3 * (1 + power * 3)).toFixed(2)} 200 366)`));
      } else {
        const wind = p.wind ?? 0;
        const s1 = Math.sin(t * 1.7 + seed) * 2.2 + wind * 9;
        const s2 = Math.sin(t * 1.7 + seed + 1.1) * 2.2 + wind * 11;
        r.backL.setAttribute("transform", `rotate(${s1.toFixed(2)} 124 180)`);
        r.backR.setAttribute("transform", `rotate(${s2.toFixed(2)} 276 180)`);
        r.lockL.setAttribute("transform", `rotate(${(s1 * 0.8).toFixed(2)} 122 158)`);
        r.lockR.setAttribute("transform", `rotate(${(s2 * 0.8).toFixed(2)} 278 158)`);
        r.ahoge.setAttribute("transform", `rotate(${(Math.sin(t * 3.1 + seed) * 7 + wind * 14).toFixed(2)} 202 74)`);
      }

      // megane: the flash blanks the lenses, the glint sweeps across them
      if (r.flash) {
        r.flash.setAttribute("opacity", clamp(p.flash ?? 0).toFixed(3));
        const g = p.glint;
        r.glint.setAttribute("opacity", g == null || g <= 0 || g >= 1 ? 0 : 0.95);
        r.glint.setAttribute("transform", `translate(${f(lerp(96, 300, g ?? 0))} 0)`);
      }
      for (const side of ["L", "R"]) {
        const pose = p["arm" + side];
        if (!pose) arms[side].set({ show: 0 });
        else arms[side].set({ ...pose, y: pose.y + breathe * 1.3 });
      }
    }
    set(0, {});
    return { node: wrap, svg, set };
  };
})();
