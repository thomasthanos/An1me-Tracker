// The real An1me Tracker popup, rebuilt from dev/screenshots and the extension's own tokens and
// fonts (PROXON wordmark, ComicSans stats, Inter body), plus the player it watches.
(function () {
  const { add, el } = P;
  const S = (d, w = 20, extra = "") => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const icons = {
    logo: `<svg class="at-logo" viewBox="0 0 26 28" fill="none" stroke="#54d2ff" stroke-width="2.6" stroke-linejoin="round"><path d="M4 3.5L22 14L4 24.5Z"/></svg>`,
    bars: S(`<path d="M6 20V11M12 20V5M18 20v-6"/>`),
    award: S(`<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5"/>`),
    gear: S(`<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>`),
    plus: S(`<path d="M12 5v14M5 12h14"/>`),
    search: S(`<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>`, 19),
    menu: S(`<path d="M5 7h14M5 12h10M5 17h14"/>`),
    grid: S(`<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>`, 16),
    film: S(`<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M8 5v14M16 5v14M3.5 10h4.5M3.5 14.5h4.5M16 10h4.5M16 14.5h4.5"/>`, 16),
    watching: S(`<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>`, 13),
    check: S(`<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5.5-6"/>`, 15),
    chevron: S(`<path d="M9 6l6 6-6 6"/>`, 16),
    play: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>`,
    pause: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.6" height="16" rx="1.3"/><rect x="13.9" y="4" width="4.6" height="16" rx="1.3"/></svg>`,
    bolt: (c = "#FFB800", w = 30) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="${c}" stroke="#070810" stroke-width="1.2" stroke-linejoin="round"><path d="M13.5 1.5L4 13.5h6.5L9 22.5 20 9.5h-6.8Z"/></svg>`,
    warn: (c = "#fff", w = 34) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L22 20.5H2Z"/><path d="M12 10v5M12 17.8v.2"/></svg>`,
    monitor: (c = "#00F0FF", w = 30) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/></svg>`,
    phone: (c = "#FF2A85", w = 30) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2" width="11" height="20" rx="2.6"/><path d="M10.5 5h3M10.5 19h3"/></svg>`,
    star: (c = "#FFB800", w = 30) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="${c}" stroke="#070810" stroke-width="1" stroke-linejoin="round"><path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6Z"/></svg>`,
    shield: (c = "#10B981", w = 30) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l8 3.2v6.3c0 4.8-8 9.5-8 9.5s-8-4.7-8-9.5V5.7Z"/><path d="M8.5 12l2.6 2.6 4.6-5"/></svg>`,
    searchBig: (c = "#00F0FF", w = 30) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`,
    cursor: `<svg width="44" height="44" viewBox="0 0 24 24"><path d="M4 2.5l15 8.2-6.6 1.7 4 7-2.9 1.6-4-7L4.8 19Z" fill="#fff" stroke="#070810" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  };

  /** Abstract cover art (no real key art): a seeded neon gradient with the title's initials. */
  function cover(title, hueA, hueB) {
    const init = title.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    const id = "cv" + init + hueA;
    return `<div class="at-cover"><svg width="50" height="64" viewBox="0 0 50 64">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hueA} 90% 58%)"/><stop offset="1" stop-color="hsl(${hueB} 85% 28%)"/></linearGradient></defs>
      <rect width="50" height="64" fill="url(#${id})"/>
      <circle cx="36" cy="16" r="9" fill="#fff" opacity=".28"/>
      <path d="M0 50L14 34l10 10 9-8 17 16v12H0Z" fill="#070810" opacity=".5"/>
      <path d="M-4 30L30 -4M6 40L40 6M20 50L54 16" stroke="#fff" stroke-opacity=".12" stroke-width="3"/>
      <text x="25" y="41" text-anchor="middle" font-family="PROXON, Inter, sans-serif" font-size="17" fill="#fff" style="paint-order:stroke" stroke="#070810" stroke-opacity=".55" stroke-width="3">${init}</text>
    </svg></div>`;
  }

  function cardMarkup(c) {
    return `<div class="at-card">
      ${cover(c.title, c.hue[0], c.hue[1])}
      <div class="at-body">
        <div class="at-title">${c.title}</div>
        <div class="at-pills">
          <span class="at-pill ep">${c.ep}</span>
          <span class="at-pill st">${icons.watching} Watching</span>
          <span class="at-meta">${c.at}</span>
        </div>
        <div class="at-prog"><div class="at-track"><div class="at-fill"></div></div><div class="at-pct">0%</div></div>
      </div>
      <div class="at-play">${icons.play}</div>
    </div>`;
  }

  /**
   * Tracker popup. opts: { x, y, w, scale, tabs, search, section, cards: [{title, ep, at, pct, hue}] }
   * Returns refs for per-frame control.
   */
  function panel(parent, opts) {
    const o = Object.assign({ w: 520, scale: 1, tabs: false, search: true, section: "In Progress", cards: [], foot: true }, opts);
    const node = add(
      parent,
      `<div class="at-panel" data-layout-ignore style="left:${o.x}px;top:${o.y}px;width:${o.w}px">
        <div class="at-head">${icons.logo}<div class="at-name">Anime Tracker</div>
          <div class="at-ibtn">${icons.bars}</div><div class="at-ibtn">${icons.award}</div><div class="at-ibtn">${icons.gear}</div></div>
        <div class="at-stats">
          <div class="at-stat"><b>9</b><span>ANIME</span></div><div class="at-stat"><b>1</b><span>MOVIES</span></div>
          <div class="at-stat"><b>253</b><span>EPISODES</span></div><div class="at-stat"><b>4d</b><span>TIME</span></div></div>
        ${o.tabs ? `<div class="at-tabs"><div class="at-tab on">${icons.grid} All</div><div class="at-tab">${icons.film} Series</div><div class="at-tab">${icons.film} Movies</div></div>` : ""}
        ${o.search ? `<div class="at-search"><div class="at-sbtn">${icons.plus}</div><div class="at-input"><span style="color:#71809c;display:flex">${icons.search}</span><span class="at-typed"></span><span class="at-caret"></span><span class="at-ph">Search anime...</span></div><div class="at-sbtn" style="color:#aab6d0">${icons.menu}</div></div>` : ""}
        ${o.section ? `<div class="at-sect"><span>▸ ${o.section}</span><i>${o.cards.length}</i>${icons.chevron}</div>` : ""}
        <div class="at-list">${o.cards.map(cardMarkup).join("")}</div>
        ${o.foot ? `<div class="at-foot"><span>Anime Tracker v${window.PROMO_BRAND.version}</span><span class="sync">${icons.check} Cloud Synced</span></div>` : ""}
      </div>`,
    );
    node.style.transformOrigin = "0 0";
    const q = (s) => node.querySelector(s);
    const cards = [...node.querySelectorAll(".at-card")].map((c, i) => ({
      node: c, fill: c.querySelector(".at-fill"), pct: c.querySelector(".at-pct"), play: c.querySelector(".at-play"), data: o.cards[i],
    }));
    return { node, scale: o.scale, input: q(".at-input"), typed: q(".at-typed"), caret: q(".at-caret"), ph: q(".at-ph"), sect: q(".at-sect"), cards, o };
  }
  /** Fill a card's progress bar to `k` (0..1) of its saved percentage. */
  function cardProgress(card, k) {
    const v = card.data.pct * k;
    card.fill.style.transform = `scaleX(${v.toFixed(4)})`;
    card.pct.textContent = Math.round(v * 100) + "%";
  }

  /** The watched tab: a browser strip, the episode, and a scrubber the tracker resumes. */
  function player(parent, o) {
    const sh = Math.round((o.w * 9) / 16);
    const node = add(
      parent,
      `<div class="player" data-layout-ignore style="left:${o.x}px;top:${o.y}px;width:${o.w}px">
        <div class="player-bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>
          <div class="player-url">an1me.to/watch/${o.slug}</div></div>
        <div class="player-screen" style="height:${sh}px">
          <canvas width="${o.w}" height="${sh}"></canvas>
          <div class="player-ep">${o.title}<small>${o.ep}</small></div>
          <div class="player-ctl">
            <div class="scrub"><div class="scrub-buf"></div><div class="scrub-fill"></div><div class="scrub-mark"></div><div class="scrub-knob"></div></div>
            <div class="player-row"><div class="pbtn"><span class="ic-play">${icons.play}</span><span class="ic-pause" style="display:none">${icons.pause}</span></div>
              <div class="player-time"><span class="cur">00:00</span> <em>/ ${P.fmtTime(o.total)}</em></div><div class="player-spacer"></div>
              <div class="player-chip spd">1×</div><div class="player-chip">HD</div></div>
          </div>
        </div>
      </div>`,
    );
    const q = (s) => node.querySelector(s);
    const ctx = q("canvas").getContext("2d");
    const refs = {
      node, ctx, w: o.w, h: sh, total: o.total, cur: q(".cur"), fill: q(".scrub-fill"), knob: q(".scrub-knob"), mark: q(".scrub-mark"), scrub: q(".scrub"),
      pbtn: q(".pbtn"), icPlay: q(".ic-play"), icPause: q(".ic-pause"), spd: q(".spd"),
    };
    /** Paint the "episode" (an abstract anime sky) and set the transport to `sec`. */
    refs.set = (t, sec, playing, speed = 1) => {
      const k = P.clamp(sec / o.total);
      const trackW = o.w - 52;
      refs.cur.textContent = P.fmtTime(sec);
      refs.fill.style.transform = `scaleX(${k.toFixed(5)})`;
      refs.knob.style.transform = `translateX(${(trackW * k).toFixed(2)}px)`;
      refs.icPlay.style.display = playing ? "none" : "";
      refs.icPause.style.display = playing ? "" : "none";
      paintEpisode(ctx, o.w, sh, sec, t, playing, o.palette, speed);
    };
    refs.setMark = (sec) => (refs.mark.style.left = ((o.w - 52) * P.clamp(sec / o.total)).toFixed(2) + "px");
    return refs;
  }

  /** Stand-in episode footage: a neon dusk skyline that drifts with the episode time. */
  function paintEpisode(ctx, w, h, sec, t, playing, pal = ["#2a0f4d", "#ff2a85", "#ffb800"], speed = 1) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal[0]);
    g.addColorStop(0.62, pal[1]);
    g.addColorStop(1, pal[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // sun
    const sx = w * 0.68, sy = h * 0.6;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.42);
    sg.addColorStop(0, "rgba(255,244,200,.95)");
    sg.addColorStop(0.35, "rgba(255,190,90,.55)");
    sg.addColorStop(1, "rgba(255,190,90,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff3cf";
    ctx.beginPath();
    ctx.arc(sx, sy, h * 0.13, 0, Math.PI * 2);
    ctx.fill();
    // drifting clouds / speed streaks
    const drift = sec * 14 + t * 6;
    const rnd = P.mulberry32(77);
    for (let i = 0; i < 16; i++) {
      const y = h * (0.1 + rnd() * 0.5);
      const len = 80 + rnd() * 260;
      const x = ((rnd() * (w + 400) + drift * (0.4 + rnd())) % (w + 400)) - 200;
      ctx.fillStyle = `rgba(255,255,255,${0.06 + rnd() * 0.12})`;
      ctx.fillRect(x, y, len, 3 + rnd() * 9);
    }
    // skyline
    const r2 = P.mulberry32(5);
    ctx.fillStyle = "#150a2a";
    let x = -((sec * 6) % 60);
    while (x < w) {
      const bw = 26 + r2() * 60;
      const bh = h * (0.12 + r2() * 0.3);
      ctx.fillRect(x, h - bh - h * 0.2, bw, bh + h * 0.2);
      x += bw + 3;
    }
    if (!playing) {
      ctx.fillStyle = "rgba(4,6,14,.38)";
      ctx.fillRect(0, 0, w, h);
    } else if (speed > 1.05) {
      // fast-forward streaks
      const r3 = P.mulberry32(900 + Math.floor(t * 30));
      ctx.fillStyle = "rgba(255,255,255,.22)";
      for (let i = 0; i < 14 * (speed - 1) + 4; i++) ctx.fillRect(r3() * w, r3() * h, 60 + r3() * 220 * speed, 2);
    }
  }

  P.ui = { icons, panel, cardProgress, player, cover, paintEpisode };
})();
