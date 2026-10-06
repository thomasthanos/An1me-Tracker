// Event-driven speed controls for the video already owned by PlayerObserver.
// Preferences are device-local; boosts never touch saved progress or normal speed.
(function () {
  "use strict";
  if (window.self !== window.top) return;
  const AT = (window.AnimeTrackerContent = window.AnimeTrackerContent || {});
  const model = globalThis.AnimeTrackerSpeedPreferences;
  const mobile = globalThis.AnimeTrackerUtils?.isMobileDevice?.() === true;
  const rates = mobile ? model.MOBILE_RATES : model.NORMAL_RATES;
  const same = (a, b) => Math.abs(a - b) < 0.0001;
  const label = rate => `${Number(rate.toFixed(2))}×`;
  let running = false, generation = 0, preferences = model.normalize(null, mobile);
  let stopStorage = null, stopVideo = null, binding = null;
  const pending = new Map();
  let preferenceRevision = 0;
  const desired = key => pending.has(key) ? pending.get(key) : preferences[key];

  // The worker serialises preference writes. When no worker answers at all (iOS can leave the extension's worker
  // unreachable for a while), the page writes the same patch itself: these are device-local settings.
  const WORKER_REPLY_MS = 4000;
  async function writeHere(patch) {
    const stored = await chrome.storage.local.get([model.KEY]);
    await chrome.storage.local.set({ [model.KEY]: model.patch(stored?.[model.KEY], patch, mobile) });
    return { success: true };
  }

  function persist(delta) {
    const patch = Object.fromEntries(Object.entries(delta).filter(([key, value]) =>
      desired(key) !== value));
    if (!Object.keys(patch).length) return;
    for (const [key, value] of Object.entries(patch)) pending.set(key, value);
    const saved = response => {
      for (const [key, value] of Object.entries(patch)) if (pending.get(key) === value) pending.delete(key);
      if (!response?.success) {
        inform("Could not save playback preferences.");
      } else if (Object.hasOwn(patch, "normalRate") && !pending.has("normalRate") && binding &&
        preferences.normalRate !== binding.normal) {
        // Reconcile conflicting external edits from current local storage.
        // A delayed response snapshot must not overwrite a newer choice.
        const current = generation, revision = preferenceRevision;
        AT.Storage.get([model.KEY]).then(stored => {
          if (running && generation === current && preferenceRevision === revision) changed(stored?.[model.KEY]);
        }).catch(() => {});
      }
    };
    let settled = false;
    const answer = (response, unreachable) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!unreachable) { saved(response); return; }
      writeHere(patch).then(saved, () => saved(null));
    };
    const timer = setTimeout(() => answer(null, true), WORKER_REPLY_MS);
    try {
      chrome.runtime.sendMessage({ type: "UPDATE_SPEED_CONTROL_PREFERENCES", patch, mobile }, response => {
        answer(response, !!chrome.runtime.lastError);
      });
    } catch {
      answer(null, true);
    }
  }

  function inform(message) {
    if (!binding) return;
    binding.status.textContent = message;
    setMenu(true);
  }

  function refresh() {
    const b = binding;
    if (!b) return;
    const actual = Number(b.video.playbackRate);
    const text = Number.isFinite(actual) && actual > 0 ? label(actual) : "Speed";
    if (b.text.textContent !== text) b.text.textContent = text;
    b.button.setAttribute("aria-label", `Playback speed ${text}. ${mobile ? "Hold for 2×." : "F7 hold, F8 toggle boost."}`);
    for (const option of b.menu.querySelectorAll("[data-speed-rate]")) {
      option.setAttribute("aria-checked", String(same(Number(option.dataset.speedRate), actual)));
    }
  }

  function applyRate(rate) {
    const b = binding;
    if (!b || !Number.isFinite(rate) || rate <= 0 || rate > 8) return false;
    const previous = Number(b.video.playbackRate);
    if (same(previous, rate)) { refresh(); return true; }
    b.expectedRate = rate;
    try { b.video.playbackRate = rate; } catch {}
    const applied = same(Number(b.video.playbackRate), rate);
    if (!applied) {
      b.expectedRate = previous;
      // Some engines clamp a rate instead of throwing. Keep the previous usable rate.
      if (!same(Number(b.video.playbackRate), previous)) {
        try { b.video.playbackRate = previous; } catch {}
      }
      inform(`This player could not apply ${label(rate)}. Current speed: ${label(Number(b.video.playbackRate))}.`);
    } else b.status.textContent = "";
    refresh();
    return applied;
  }

  function updateBoost() {
    const b = binding;
    if (!b) return;
    if (!applyRate(b.held || b.toggled ? preferences.boostRate : b.normal)) {
      b.held = false; b.toggled = false;
    }
  }

  function hold() {
    const b = binding;
    if (!b || b.held) return;
    if (!b.toggled) b.normal = Number(b.video.playbackRate);
    b.held = true;
    updateBoost();
  }

  function release() {
    const b = binding;
    if (!b) return;
    clearTimeout(b.holdTimer); b.holdTimer = null;
    b.pointerId = null;
    if (!b.held) return;
    b.held = false;
    updateBoost();
  }

  function selectRate(rate) {
    const b = binding;
    if (!b || !rates.includes(rate)) return;
    if (!applyRate(rate)) return;
    clearTimeout(b.holdTimer); b.holdTimer = null;
    b.held = false; b.toggled = false; b.normal = rate;
    persist({ normalRate: rate });
    setMenu(false);
  }

  function saveAudio(b) {
    clearTimeout(b.audioTimer); b.audioTimer = null;
    const volume = Number(b.video.volume), muted = b.video.muted;
    if (!Number.isFinite(volume) || volume < 0 || volume > 1 || typeof muted !== "boolean") return;
    if (b.expectedAudio && same(volume, b.expectedAudio.volume) && muted === b.expectedAudio.muted) return;
    b.expectedAudio = null;
    persist({ defaultVolume: volume, defaultMuted: muted });
  }

  function restorePreferences() {
    const b = binding;
    if (!b || b.applied || b.video.readyState < 1) return;
    b.applied = true;
    b.loading = false;
    if (desired("normalRate") !== null) {
      b.normal = desired("normalRate");
      applyRate(b.held || b.toggled ? preferences.boostRate : b.normal);
    }
    if (!mobile && (desired("defaultVolume") !== null || desired("defaultMuted") !== null)) {
      const volume = desired("defaultVolume") ?? b.video.volume;
      const muted = desired("defaultMuted") ?? b.video.muted;
      b.expectedAudio = { volume, muted };
      try {
        if (!same(b.video.volume, volume)) b.video.volume = volume;
        if (b.video.muted !== muted) b.video.muted = muted;
      } catch {}
    }
    refresh();
  }

  // In ArtPlayer's bar the button is one of its controls: as tall as the bar and as flat as the controls beside it.
  // In the player's corner it sits just above ArtPlayer's bar layer (60), below its loading, notices and settings,
  // and hides with the controls unless its menu is open, so an unseen button cannot catch a tap.
  const CSS = `
    .at-speed-control{position:relative;display:inline-flex;flex:none;align-items:center;font:600 13px system-ui,sans-serif;color:#f7fafc;z-index:30}
    .at-speed-control.at-speed-overlay{position:absolute;top:10px;right:10px}
    .art-video-player>.at-speed-control.at-speed-overlay{z-index:65}
    .art-video-player:not(.art-control-show):not(.art-hover)>.at-speed-overlay:not(.at-speed-open){visibility:hidden;opacity:0}
    .at-speed-control button{box-sizing:border-box;cursor:pointer;color:inherit;font:inherit;border:1px solid #ffffff30;background:#15202e;border-radius:10px;min-height:44px;min-width:44px;padding:8px;line-height:1.2}
    .at-speed-control .at-speed-button{display:flex;align-items:center;justify-content:center;gap:5px;touch-action:none}
    .at-speed-control.at-speed-bar{align-self:stretch}
    .at-speed-bar .at-speed-button{height:100%;min-height:0;padding:0 8px;border:0;border-radius:6px;background:none}
    .at-speed-phone.at-speed-bar .at-speed-button svg{display:none}
    .at-speed-button svg{width:18px;height:18px;flex:none;pointer-events:none}
    .at-speed-control button:focus-visible{outline:2px solid #70d8ff;outline-offset:2px}
    .at-speed-menu{position:absolute;right:0;bottom:calc(100% + 6px);width:184px;box-sizing:border-box;padding:8px;background:#101b28;border:1px solid #70d8ff55;border-radius:14px;box-shadow:0 4px 12px #0008;max-height:200px;overflow:auto}
    .at-speed-overlay .at-speed-menu{top:calc(100% + 6px);bottom:auto}
    .at-speed-options{display:grid;grid-template-columns:1fr 1fr;gap:5px}
    .at-speed-menu [aria-checked=true]{color:#101b28;background:#70d8ff;border-color:#70d8ff}
    .at-speed-status{font-size:12px;line-height:1.4;font-weight:400;margin-top:6px;color:#ffe2a5}
    .at-speed-status:empty{display:none}
    .at-speed-control[hidden],.at-speed-menu[hidden]{display:none!important}
  `;

  // How wide the button is in the bar, until it has been there to be measured.
  const BAR_WIDTH_ESTIMATE = mobile ? 44 : 72;

  // The room ArtPlayer's bar has left: past its right-hand group up to the edge .art-bottom clips, plus the gap it
  // leaves between its left- and right-hand groups. The button's own width does not count against it.
  function artBarHasRoom(b, controls) {
    const clip = (controls.closest(".art-bottom") || b.root).getBoundingClientRect();
    const right = controls.getBoundingClientRect();
    const left = controls.parentElement?.querySelector(":scope > .art-controls-left")?.getBoundingClientRect();
    const own = b.widget.parentNode === controls ? b.widget.getBoundingClientRect().width : 0;
    const room = clip.right - right.right + Math.max(0, left ? right.left - left.right : 0) + own;
    return room >= (b.barWidth || BAR_WIDTH_ESTIMATE);
  }

  // ArtPlayer's bar when it has room, first on its right so fullscreen stays last. A phone held upright has none (back,
  // play, forward, volume, the time, quality, settings and fullscreen fill it), and the button appended after
  // fullscreen was pushed past the edge .art-bottom clips: never seen upright, and sideways after fullscreen and taller
  // than the bar. Without room it goes to the player's top-right corner, and back to the bar when the phone is turned.
  function mount() {
    const b = binding;
    if (!b || !b.video.isConnected) return;
    const controls = b.root.querySelector(".art-controls-right, .plyr__controls");
    const artBar = !!controls?.matches(".art-controls-right");
    const inBar = !!controls && (!artBar || artBarHasRoom(b, controls));
    const target = inBar ? controls : b.root;
    if (b.widget.parentNode === target) return;
    b.widget.classList.toggle("at-speed-overlay", !inBar);
    b.widget.classList.toggle("at-speed-bar", inBar && artBar);
    if (!inBar && b.doc.defaultView.getComputedStyle(target).position === "static") {
      b.positionTarget = target; b.oldPosition = target.style.position;
      target.style.position = "relative";
    }
    if (inBar && artBar) {
      target.prepend(b.widget);
      b.barWidth = b.widget.getBoundingClientRect().width || b.barWidth;
    } else target.append(b.widget);
    fitMenu();
  }

  // The menu opens away from the edge the button sits on (up from the bar, down from the corner) and is never taller
  // than the player leaves room for. While it is open the corner button stays shown, even when ArtPlayer hides its
  // controls.
  function fitMenu() {
    const b = binding;
    if (!b || b.menu.hidden) return;
    const clip = (b.widget.closest(".art-bottom") || b.root).getBoundingClientRect();
    const box = b.widget.getBoundingClientRect();
    const room = b.widget.classList.contains("at-speed-overlay") ? clip.bottom - box.bottom - 12 : box.top - clip.top - 12;
    b.menu.style.maxHeight = `${Math.max(88, Math.floor(room))}px`;
  }

  function setMenu(open) {
    const b = binding;
    if (!b) return;
    b.menu.hidden = !open;
    b.button.setAttribute("aria-expanded", String(open));
    b.widget.classList.toggle("at-speed-open", open);
    fitMenu();
  }

  function observeControls() {
    const b = binding;
    if (!b || b.stopControls || document.hidden || b.doc.hidden || b.nativeFullscreen) return;
    mount();
    b.stopControls = AT.PageEvents.observe(b.root, { childList: true, subtree: true }, mount, { throttleMs: 150 });
  }

  function visibility() {
    const b = binding;
    if (!b) return;
    if (document.hidden || b.doc.hidden || b.nativeFullscreen) {
      release(); b.stopControls?.(); b.stopControls = null;
    } else observeControls();
  }

  function editing(event) {
    return event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
      !!event.target?.closest?.("input,textarea,select,[contenteditable]:not([contenteditable=false])");
  }

  function keydown(event) {
    if (!binding || editing(event) || !["F7", "F8"].includes(event.code || event.key)) return;
    event.preventDefault();
    if (event.repeat) return;
    if ((event.code || event.key) === "F7") hold();
    else {
      if (!binding.held && !binding.toggled) binding.normal = Number(binding.video.playbackRate);
      binding.toggled = !binding.toggled;
      updateBoost();
    }
  }

  function detach() {
    const b = binding;
    if (!b) return;
    if (b.audioTimer) saveAudio(b);
    clearTimeout(b.holdTimer);
    for (const cleanup of b.cleanups) cleanup();
    b.stopControls?.();
    if (b.held || b.toggled) applyRate(b.normal);
    b.widget.remove(); b.style.remove();
    if (b.positionTarget?.style.position === "relative") b.positionTarget.style.position = b.oldPosition;
    binding = null;
  }

  function bind(video) {
    if (!running || !preferences.enabled || !video || binding?.video === video) return;
    detach();
    const doc = video.ownerDocument;
    const root = video.closest(".art-video-player,.artplayer-app,.plyr") || video.parentElement;
    if (!root) return;
    const widget = doc.createElement("div"); widget.className = mobile ? "at-speed-control at-speed-phone" : "at-speed-control";
    const button = doc.createElement("button"); button.type = "button"; button.className = "at-speed-button";
    button.setAttribute("aria-haspopup", "menu"); button.setAttribute("aria-expanded", "false");
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 17a9 9 0 1 1 16 0M12 13l4-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="13" r="1.5" fill="currentColor"/></svg>';
    const text = doc.createElement("span"); button.append(text);
    const menu = doc.createElement("div"); menu.className = "at-speed-menu"; menu.hidden = true; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "Playback speed");
    const options = doc.createElement("div"); options.className = "at-speed-options"; menu.append(options);
    const status = doc.createElement("div"); status.className = "at-speed-status"; status.setAttribute("role", "status"); menu.append(status);
    const style = doc.createElement("style"); style.id = "at-speed-control-style"; style.textContent = CSS; (doc.head || doc.documentElement).append(style);
    widget.append(button, menu);
    const b = binding = { video, doc, root, widget, button, text, menu, status, style, cleanups: [], normal: Number(video.playbackRate),
      held: false, toggled: false, expectedRate: null, expectedAudio: null, applied: false, holdTimer: null, audioTimer: null, suppressClick: false };
    const listen = (target, name, handler, options) => {
      target.addEventListener(name, handler, options);
      b.cleanups.push(() => target.removeEventListener(name, handler, options));
    };
    for (const rate of rates) {
      const option = doc.createElement("button"); option.type = "button"; option.dataset.speedRate = String(rate); option.textContent = label(rate); option.setAttribute("role", "menuitemradio");
      listen(option, "click", () => selectRate(rate)); options.append(option);
    }
    listen(button, "click", event => {
      event.stopPropagation();
      if (b.suppressClick) { b.suppressClick = false; event.preventDefault(); return; }
      setMenu(menu.hidden);
    });
    listen(widget, "keydown", event => { if (event.key === "Escape") { setMenu(false); button.focus(); } });
    listen(doc, "click", event => { if (!widget.contains(event.target)) setMenu(false); });
    // Turning a phone resizes the player: the bar may now have room for the button, or no longer.
    let resizeTimer = null;
    listen(doc.defaultView, "resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(mount, 100); });
    b.cleanups.push(() => clearTimeout(resizeTimer));
    if (mobile) {
      listen(button, "pointerdown", event => {
        if (event.button !== 0 || b.pointerId != null) return;
        b.pointerId = event.pointerId; b.suppressClick = false;
        try { button.setPointerCapture(event.pointerId); } catch {}
        b.holdTimer = setTimeout(() => {
          b.holdTimer = null; b.suppressClick = true;
          setMenu(false); hold();
        }, 300);
      });
      const endPointer = event => {
        if (b.pointerId !== event.pointerId) return;
        b.pointerId = null; release();
      };
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) listen(button, type, endPointer);
      listen(button, "contextmenu", event => event.preventDefault());
    } else {
      for (const target of new Set([document, doc])) {
        listen(target, "keydown", keydown);
        listen(target, "keyup", event => { if ((event.code || event.key) === "F7") release(); });
      }
      listen(video, "volumechange", () => {
        if (b.expectedAudio && same(video.volume, b.expectedAudio.volume) && video.muted === b.expectedAudio.muted) return;
        clearTimeout(b.audioTimer); b.audioTimer = setTimeout(() => saveAudio(b), 250);
      });
    }
    for (const target of new Set([window, doc.defaultView])) listen(target, "blur", release);
    for (const target of new Set([document, doc])) listen(target, "visibilitychange", visibility);
    listen(video, "webkitbeginfullscreen", () => { b.nativeFullscreen = true; widget.hidden = true; visibility(); });
    listen(video, "webkitendfullscreen", () => { b.nativeFullscreen = false; widget.hidden = false; visibility(); });
    listen(video, "ratechange", () => {
      refresh();
      const actual = Number(video.playbackRate);
      // load() resets playbackRate before metadata. That browser-generated
      // reset is not a deliberate normal-speed selection.
      if (video.readyState < 1 || b.loading || same(actual, b.expectedRate) || b.held || b.toggled) return;
      b.expectedRate = null; b.normal = actual;
      if (rates.includes(actual)) persist({ normalRate: actual });
    });
    const loading = () => {
      b.loading = true; b.applied = false;
      clearTimeout(b.holdTimer); b.holdTimer = null; b.pointerId = null;
      b.held = false; b.toggled = false;
    };
    listen(video, "emptied", loading);
    listen(video, "loadstart", loading);
    listen(video, "loadedmetadata", () => { b.applied = false; restorePreferences(); });
    listen(video, "playing", restorePreferences);
    observeControls(); restorePreferences(); refresh();
  }

  function connectVideo() {
    if (!stopVideo && running && preferences.enabled) stopVideo = AT.PlayerObserver.on("video", bind);
  }

  function changed(raw) {
    preferenceRevision++;
    const previous = preferences;
    preferences = model.normalize(raw, mobile);
    if (!preferences.enabled) { stopVideo?.(); stopVideo = null; detach(); return; }
    connectVideo();
    const b = binding;
    if (!b) return;
    const normal = desired("normalRate");
    if (normal !== null && normal !== b.normal) {
      b.normal = normal;
      if (!b.held && !b.toggled) applyRate(b.normal);
    }
    if (preferences.boostRate !== previous.boostRate && (b.held || b.toggled)) updateBoost();
    if (!mobile && (preferences.defaultVolume !== previous.defaultVolume || preferences.defaultMuted !== previous.defaultMuted)) {
      // Reuse the same one-shot audio guard for settings updates.
      b.applied = false; restorePreferences();
    }
    refresh();
  }

  async function start() {
    if (running) return;
    running = true; const current = ++generation;
    let revision = 0;
    stopStorage = AT.PageEvents.onStorage(model.KEY, changes => {
      revision++;
      changed(changes[model.KEY]?.newValue);
    });
    try {
      const stored = await AT.Storage.get([model.KEY]);
      if (!running || generation !== current) return;
      if (revision === 0) preferences = model.normalize(stored?.[model.KEY], mobile);
      connectVideo();
    } catch {
      if (running && generation === current) connectVideo();
    }
  }

  function stop() {
    running = false; generation++;
    stopStorage?.(); stopStorage = null;
    stopVideo?.(); stopVideo = null;
    detach(); pending.clear();
  }

  AT.SpeedControl = Object.freeze({ start, stop, resetForServerSwitch: detach });
})();
