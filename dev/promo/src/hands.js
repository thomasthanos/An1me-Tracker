// Articulated hands and arms for the characters.
//
// A hand is a small rig, not a drawing: a palm, four fingers with three phalanges each and a
// two-bone thumb. Every finger has its own curl (0 = straight, 1 = closed); curling is a bend
// towards or away from the viewer, so the phalanges foreshorten and fold over the palm the way a
// real fist closes. An arm is two bones solved with IK from the shoulder to wherever the wrist is
// asked to be, so a gesture is authored as "wrist here, hand at this angle, fingers like this"
// and everything in between follows. Poses are plain data and blend linearly, which is what
// makes the gestures animate instead of popping. All of it is a pure function of the pose.
(function () {
  const { clamp, lerp } = P;
  const OUT = "#160f24";
  const SKIN = "#ffe2d2";
  const SKIN_SH = "#f1b8a2";
  const NAIL = "#fff3ee";
  const D2R = Math.PI / 180;
  const n = (v) => v.toFixed(1);

  // index, middle, ring, pinky — knuckle position, rest angle, phalanx lengths and widths
  const FINGERS = [
    { base: [22, -64], ang: 7, len: [27, 18, 15], w: [15.5, 14, 12.5] },
    { base: [7, -68], ang: 1, len: [30, 20, 16], w: [16, 14.5, 13] },
    { base: [-8, -66], ang: -6, len: [28, 18, 15], w: [15.5, 14, 12.5] },
    { base: [-22, -60], ang: -15, len: [22, 14, 12.5], w: [13.5, 12, 11] },
  ];
  const BEND = [78, 96, 62]; // degrees each joint closes at full curl

  const line = (x1, y1, x2, y2, w, c) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2 + 0.01)}" y2="${n(y2)}" stroke="${c}" stroke-width="${n(w)}" stroke-linecap="round"/>`;

  /**
   * One finger. Returns SVG for the visible phalanges.
   * view "palm": curled phalanges fold over the finger (towards the viewer).
   * view "back": curled phalanges disappear behind the knuckles.
   */
  function finger(spec, curl, spread, view, splay = 0) {
    const a = (spec.ang * spread + splay) * D2R;
    let dx = Math.sin(a), dy = -Math.cos(a);
    let [x, y] = spec.base;
    let phi = 0;
    let out = "";
    const pts = [[x, y]];
    for (let k = 0; k < 3; k++) {
      phi += curl * BEND[k];
      const c = Math.cos(phi * D2R);
      if (view === "back" && c < 0) break; // folded away behind the hand
      // a touch of in-plane bend so a curl is not perfectly straight-on
      const turn = (view === "palm" ? -1 : 1) * curl * 5 * D2R * (spec.ang < 0 ? -1 : 1);
      const ndx = dx * Math.cos(turn) - dy * Math.sin(turn);
      const ndy = dx * Math.sin(turn) + dy * Math.cos(turn);
      dx = ndx; dy = ndy;
      const L = spec.len[k] * c;
      const nx = x + dx * L, ny = y + dy * L;
      const w = spec.w[k] * (1 + 0.1 * (1 - Math.abs(c))); // a knuckle seen end-on reads slightly bigger
      const sx = k === 0 ? x - dx * 7 : x, sy = k === 0 ? y - dy * 7 : y; // root tucks into the palm
      out += line(x, y, nx, ny, w + 5, OUT) + line(sx, sy, nx, ny, w, SKIN);
      if (k > 0) out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(w / 2 - 0.2)}" fill="${SKIN}"/>`;
      // crease across the joint
      if (k > 0 && Math.abs(c) > 0.35) {
        const px = -dy, py = dx;
        out += `<path d="M${n(x - px * w * 0.3)} ${n(y - py * w * 0.3)}L${n(x + px * w * 0.3)} ${n(y + py * w * 0.3)}" stroke="${SKIN_SH}" stroke-width="1.6" stroke-linecap="round"/>`;
      }
      x = nx; y = ny;
      pts.push([x, y]);
      if (k === 2 && c > 0.3) {
        if (view === "back") {
          // fingernail
          const px = -dy, py = dx;
          const nw = w * 0.3, nl = Math.min(L * 0.62, 9);
          out += `<path d="M${n(x - px * nw - dx * nl)} ${n(y - py * nw - dy * nl)}L${n(x + px * nw - dx * nl)} ${n(y + py * nw - dy * nl)}Q${n(x + px * nw * 1.2 + dx * 2)} ${n(y + py * nw * 1.2 + dy * 2)} ${n(x + dx * 3.4)} ${n(y + dy * 3.4)}Q${n(x - px * nw * 1.2 + dx * 2)} ${n(y - py * nw * 1.2 + dy * 2)} ${n(x - px * nw - dx * nl)} ${n(y - py * nw - dy * nl)}Z" fill="${NAIL}" stroke="${SKIN_SH}" stroke-width="1.2"/>`;
        } else {
          out += `<circle cx="${n(x - dx * 2)}" cy="${n(y - dy * 2)}" r="${n(w * 0.26)}" fill="#fff" opacity=".35"/>`; // fingertip pad
        }
      }
    }
    return out;
  }

  function thumb(curl, opp, view) {
    // opposition swings the thumb from "out to the side" to "across the palm"
    const ang = lerp(62, -18, opp) * D2R;
    let x = lerp(29, 15, opp), y = lerp(-22, -32, opp);
    let dx = Math.sin(ang), dy = -Math.cos(ang);
    const len = [25, 19], w = [18, 15.5];
    let out = "";
    let phi = 0;
    for (let k = 0; k < 2; k++) {
      phi += curl * (k ? 80 : 46);
      const c = Math.cos(phi * D2R);
      const turn = -curl * 14 * D2R;
      const ndx = dx * Math.cos(turn) - dy * Math.sin(turn);
      const ndy = dx * Math.sin(turn) + dy * Math.cos(turn);
      dx = ndx; dy = ndy;
      const L = len[k] * Math.max(0.25, c);
      const nx = x + dx * L, ny = y + dy * L;
      const sx = k === 0 ? x - dx * 9 : x, sy = k === 0 ? y - dy * 9 : y;
      out += line(x, y, nx, ny, w[k] + 5, OUT) + line(sx, sy, nx, ny, w[k], SKIN);
      if (k > 0) out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(w[k] / 2)}" fill="${SKIN}"/>`;
      x = nx; y = ny;
      if (k === 1 && view === "back") {
        const px = -dy, py = dx, nw = 4.6;
        out += `<path d="M${n(x - px * nw - dx * 8)} ${n(y - py * nw - dy * 8)}L${n(x + px * nw - dx * 8)} ${n(y + py * nw - dy * 8)}Q${n(x + px * nw + dx * 3)} ${n(y + py * nw + dy * 3)} ${n(x + dx * 4)} ${n(y + dy * 4)}Q${n(x - px * nw + dx * 3)} ${n(y - py * nw + dy * 3)} ${n(x - px * nw - dx * 8)} ${n(y - py * nw - dy * 8)}Z" fill="${NAIL}" stroke="${SKIN_SH}" stroke-width="1.2"/>`;
      }
    }
    return out;
  }

  const PALM = "M-19 4C-29 -8 -33 -30 -31 -50C-30 -60 -24 -66 -15 -67L22 -70C31 -70 36 -62 35 -52C37 -34 30 -12 19 4Z";

  function handSvg(pose) {
    const view = pose.view || "palm";
    const curls = pose.curls || [0, 0, 0, 0, 0];
    const spread = pose.spread ?? 1;
    let s = `<path d="${PALM}" fill="${SKIN}" stroke="${OUT}" stroke-width="2.6" stroke-linejoin="round"/>`;
    if (view === "palm") {
      s += `<ellipse cx="20" cy="-24" rx="12" ry="20" transform="rotate(18 20 -24)" fill="${SKIN_SH}" opacity=".45"/>`;
      s += `<path d="M-25 -42Q-4 -52 24 -46M-22 -27Q0 -38 27 -31M-6 -10Q2 -24 16 -30" fill="none" stroke="${SKIN_SH}" stroke-width="1.8" stroke-linecap="round"/>`;
    } else {
      s += `<path d="M-20 -52q5 -5 9 0M-6 -57q5 -6 10 0M9 -58q5 -6 10 0M23 -54q4 -5 8 0" fill="none" stroke="${SKIN_SH}" stroke-width="1.8" stroke-linecap="round"/>`;
      s += `<path d="M-13 -44L-6 -8M2 -48L3 -8M17 -46L11 -8" fill="none" stroke="${SKIN_SH}" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>`;
    }
    const order = view === "palm" ? [3, 2, 1, 0] : [0, 1, 2, 3];
    for (const i of order) s += finger(FINGERS[i], clamp(curls[i + 1]), spread, view, (pose.splay || 0) * (i - 1.5));
    s += thumb(clamp(curls[0]), clamp(pose.opp ?? 0), view);
    return s;
  }

  /** A phone held up to the viewer: screen forward, fingertips round one edge, thumb on the glass. */
  function phoneSvg(pose) {
    const glow = clamp(pose.glow ?? 0);
    const bar = clamp(pose.bar ?? 0.6);
    const th = pose.thumb ?? 0; // -1..1 scroll position of the thumb tip
    const grip = clamp(pose.grip ?? 0.5);
    let s = `<path d="${PALM}" fill="${SKIN}" stroke="${OUT}" stroke-width="2.6" stroke-linejoin="round"/>`;
    // phone body
    s += `<g transform="translate(-2 -84)"><rect x="-41" y="-74" width="82" height="148" rx="14" fill="#0b101c" stroke="${OUT}" stroke-width="3"/>`;
    s += `<rect x="-35" y="-67" width="70" height="134" rx="9" fill="#101e31"/><rect x="-35" y="-67" width="70" height="134" rx="9" fill="#54d2ff" opacity="${(0.1 + 0.26 * glow).toFixed(3)}"/>`;
    s += `<rect x="-12" y="-63" width="24" height="6" rx="3" fill="#05070c"/>`;
    s += `<rect x="-28" y="-50" width="56" height="34" rx="5" fill="#244d67"/><path d="M-6 -41l14 8-14 8z" fill="#8af5dd"/>`;
    s += `<rect x="-28" y="-9" width="56" height="5" rx="2.5" fill="#2b405b"/><rect x="-28" y="-9" width="${n(56 * bar)}" height="5" rx="2.5" fill="#65cfff"/>`;
    s += `<rect x="-28" y="4" width="40" height="5" rx="2.5" fill="#3a4c68"/><rect x="-28" y="15" width="30" height="5" rx="2.5" fill="#3a4c68"/>`;
    s += `<rect x="-28" y="32" width="56" height="20" rx="6" fill="#8af5dd" opacity="${(0.55 + 0.45 * glow).toFixed(3)}"/></g>`;
    // fingertips wrapping the far edge
    for (let i = 0; i < 4; i++) {
      const y = -64 - i * 21 + (i === 3 ? 4 : 0);
      const reach = 9 + 5 * grip - (i === 3 ? 3 : 0);
      s += line(-50, y, -43 + reach, y - 2, 18 - i, OUT) + line(-52, y, -43 + reach, y - 2, 13 - i, SKIN);
    }
    // thumb across the glass
    const tx = 6 - 6 * Math.abs(th), ty = -62 - th * 18;
    s += line(34, -30, 26, -46, 23, OUT) + line(26, -46, tx, ty, 20.5, OUT) + line(36, -26, 26, -46, 18, SKIN) + line(26, -46, tx, ty, 15.5, SKIN);
    s += `<circle cx="26" cy="-46" r="7.7" fill="${SKIN}"/>`;
    return s;
  }

  /** Blend two poses. Numbers and number arrays interpolate; everything else snaps at k = 0.5. */
  function mix(a, b, k) {
    k = clamp(k);
    const out = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[key], y = b[key];
      if (typeof x === "number" && typeof y === "number") out[key] = lerp(x, y, k);
      else if (Array.isArray(x) && Array.isArray(y)) out[key] = x.map((v, i) => lerp(v, y[i], k));
      else out[key] = k < 0.5 ? x ?? y : y ?? x;
    }
    return out;
  }

  // curls: [thumb, index, middle, ring, pinky]
  const SHAPES = {
    open: { curls: [0, 0, 0, 0, 0], spread: 1.5, opp: 0, splay: 3 },
    relaxed: { curls: [0.25, 0.28, 0.34, 0.4, 0.46], spread: 0.9, opp: 0.25, splay: 0 },
    fist: { curls: [0.75, 0.95, 0.97, 0.97, 0.95], spread: 0.5, opp: 0.85, splay: 0 },
    point: { curls: [0.4, 0, 0.93, 0.95, 0.95], spread: 0.5, opp: 0.5, splay: 0 },
    two: { curls: [0.6, 0.02, 0.06, 0.92, 0.94], spread: 1.1, opp: 0.8, splay: 0 },
    thumbUp: { curls: [0, 0.95, 0.97, 0.97, 0.95], spread: 0.5, opp: 0, splay: 0 },
    claw: { curls: [0.3, 0.42, 0.46, 0.46, 0.44], spread: 1.5, opp: 0.1, splay: 3 },
  };

  /**
   * Create an arm + hand inside an SVG group. shoulder: [x, y] in rig units.
   * set(pose): { x, y, rot, scale, side, view, curls, spread, opp, splay, show, elbow, phone }
   *   x, y   wrist position      rot   hand rotation (0 = fingers up, clockwise positive)
   *   side   1 or -1 (mirrors the hand so the thumb is on the correct side)
   *   elbow  1 or -1, which way the elbow bends
   */
  function create(group, { shoulder, sleeve, cuff = "#fff", upper = 118, fore = 112, width = 50 }) {
    const NS = "http://www.w3.org/2000/svg";
    const arm = document.createElementNS(NS, "g");
    const hand = document.createElementNS(NS, "g");
    group.appendChild(arm);
    group.appendChild(hand);
    function set(p) {
      const show = clamp(p.show ?? 1);
      group.setAttribute("opacity", show.toFixed(3));
      if (show <= 0) return;
      const [sx, sy] = shoulder;
      const wx = p.x, wy = p.y;
      // two-bone IK
      let dx = wx - sx, dy = wy - sy;
      let d = Math.hypot(dx, dy);
      const reach = upper + fore - 0.5;
      const dd = Math.min(d, reach);
      const a = Math.atan2(dy, dx);
      const cosA = clamp((upper * upper + dd * dd - fore * fore) / (2 * upper * dd), -1, 1);
      const ea = a + (p.elbow ?? 1) * Math.acos(cosA);
      const ex = sx + Math.cos(ea) * upper, ey = sy + Math.sin(ea) * upper;
      const fa = Math.atan2(wy - ey, wx - ex);
      const ux = Math.cos(fa), uy = Math.sin(fa);
      const path = `M${n(sx)} ${n(sy)}L${n(ex)} ${n(ey)}L${n(wx - ux * 6)} ${n(wy - uy * 6)}`;
      arm.innerHTML =
        `<path d="${path}" fill="none" stroke="${OUT}" stroke-width="${width + 5.5}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${path}" fill="none" stroke="${sleeve}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>` +
        // fold at the elbow
        `<path d="M${n(ex - Math.cos(ea + 1.2) * width * 0.34)} ${n(ey - Math.sin(ea + 1.2) * width * 0.34)}L${n(ex + ux * 14)} ${n(ey + uy * 14)}" stroke="${OUT}" stroke-width="2" stroke-linecap="round" opacity=".45" fill="none"/>` +
        // cuff
        `<path d="M${n(wx - ux * 22)} ${n(wy - uy * 22)}L${n(wx - ux * 4)} ${n(wy - uy * 4)}" stroke="${OUT}" stroke-width="${width + 3}" fill="none"/>` +
        `<path d="M${n(wx - ux * 20)} ${n(wy - uy * 20)}L${n(wx - ux * 6)} ${n(wy - uy * 6)}" stroke="${cuff}" stroke-width="${width - 2}" fill="none"/>`;
      const sc = p.scale ?? 1.12;
      const rot = p.rot ?? (fa / D2R + 90);
      hand.setAttribute("transform", `translate(${n(wx)} ${n(wy)}) rotate(${rot.toFixed(2)}) scale(${((p.side ?? 1) * sc).toFixed(3)} ${sc.toFixed(3)})`);
      hand.innerHTML = p.phone ? phoneSvg(p.phone) : handSvg(p);
    }
    return { set };
  }

  P.hands = { create, mix, SHAPES, handSvg };
})();
