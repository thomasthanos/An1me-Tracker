// settings-view.js — the Settings screen.
(function () {
  "use strict";

  // One copy table for every preference toggle's subtitle, keyed by the toggle's element id. The subtitles
  // used to be written twice - here and in main.js - with different wording for five of the seven toggles,
  // so the text changed depending on whether you had just clicked a toggle or the view had re-rendered.
  // main.js reads this table through SettingsView.toggleSubtitle.
  const TOGGLE_COPY = Object.freeze({
    settingsCopyGuard: {
      on: "Block copy outside allowed text",
      off: "Copy protection is turned off",
      mobile: "Disabled on mobile (prevents touch lag)",
    },
    settingsSmartNotif: { on: "You will be notified of new episodes", off: "Notify when new episodes drop" },
    settingsAutoSkipFiller: { on: "Filler episodes will be auto-skipped", off: "Skip filler, jump to next canon ep" },
    settingsSkiptime: {
      on: "Capture intro/outro on an1me.to/watch",
      off: "Floating panel for intro/outro contributions",
      mobile: "Disabled on mobile (desktop only)",
    },
    settingsAuto4kServer: {
      on: "Auto-switch to 4K/Remaster server when available",
      off: "Premium server auto-pick is off",
      mobile: "Disabled on mobile (prevents overheating)",
    },
    settingsAutoResume: { on: "Resume playback without asking", off: "Ask before resuming where you left off" },
    settingsAdGuard: { on: "Block pop-up ads on an1me.to", off: "Pop-up ads are allowed" },
    settingsSpeedControl: { on: "Remember speed and hold-to-boost choices", off: "Speed control is turned off" },
  });

  function toggleSubtitle(id, enabled) {
    const copy = TOGGLE_COPY[id];
    if (!copy) return "";
    if (globalThis.AnimeTrackerUtils?.isMobileDevice?.() && copy.mobile) {
      return copy.mobile;
    }
    return enabled ? copy.on : copy.off;
  }

  function escapeHtml(value) {
    return window.AnimeTracker.UIHelpers.escapeHtml(value);
  }

  const ICONS = {
    signOut:
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    heart:
      '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    trash:
      '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M11 12l8-8"/><path d="M15 4h4v4"/>',
    copy: '<path d="M7 3h8l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M15 3v5h4"/><rect x="8.5" y="12" width="7" height="5.5" rx="1.2"/><path d="M10 12v-1.2a2 2 0 0 1 4 0V12"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    skipFwd: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
    skipMark: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>',
    sparkles:
      '<path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><path d="M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8"/><circle cx="12" cy="12" r="3.6"/>',
    fourK:
      '<text x="12" y="17" text-anchor="middle" font-size="15" font-weight="900" fill="currentColor" stroke="none" font-family="Inter, Segoe UI, sans-serif">4K</text>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    database:
      '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    chevron: '<polyline points="9 18 15 12 9 6"/>',
    speed: '<path d="M4 19a9 9 0 1 1 16 0"/><path d="m12 13 5-5"/><circle cx="12" cy="13" r="1.5"/><path d="M5 13h1M18 13h1M12 4v1"/>',
  };

  function sectionHead(iconKey, title, pill = "") {
    return `
            <div class="settings-head">
                <span class="settings-head-icon">${svg(iconKey)}</span>
                <span class="settings-head-title">${escapeHtml(title)}</span>
                ${pill ? `<span class="settings-head-pill">${escapeHtml(pill)}</span>` : ""}
            </div>`;
  }

  function svg(iconKey, extraClass = "") {
    const paths = ICONS[iconKey];
    if (!paths) return "";
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round"
                     class="settings-icon ${extraClass}" aria-hidden="true" focusable="false">${paths}</svg>`;
  }

  function renderHeader(user, needsReauth = false) {
    const photo = user?.photoURL ? escapeHtml(user.photoURL) : "src/icons/icon48.png";
    const name = escapeHtml(user?.displayName || user?.email?.split("@")[0] || "User");
    const email = escapeHtml(user?.email || "");
    const signedIn = !!user;

    const bannerHtml =
      signedIn && needsReauth
        ? `
            <div class="settings-reauth-banner" id="settingsReauthBanner">
                <span class="settings-reauth-warning">Cloud sync paused. Reconnect required.</span>
                <button class="settings-reauth-btn" id="settingsReauthBtn" type="button">Reconnect</button>
            </div>
        `
        : "";

    return `
            <header class="settings-header" data-signed-in="${signedIn}">
                <div class="settings-account-pill" ${signedIn ? "" : "hidden"}
                     title="${email}" data-tooltip="${email}">
                    <img class="settings-pill-avatar" id="settingsAvatar" src="${photo}" alt="">
                    <span class="settings-pill-name" id="settingsUserName">${name}</span>
                    <span class="settings-pill-email" id="settingsUserEmail" hidden>${email}</span>
                    <button class="settings-pill-signout" id="settingsSignOut" type="button"
                            aria-label="Sign out" title="Sign out">
                        ${svg("signOut")}
                    </button>
                </div>
                <span class="settings-account-status" data-when="signed-out"
                      ${signedIn ? "hidden" : ""}>Local only</span>
                ${bannerHtml}
            </header>
        `;
  }

  function renderToggleItem({ id, subtitleId, iconKey, title, subtitle, enabled, disabled = false }) {
    const en = !disabled && !!enabled;
    const dis = !!disabled;
    return `
            <button class="settings-toggle-row" id="${id}" type="button"
                    data-enabled="${en}" aria-pressed="${en}" ${dis ? 'data-mobile-disabled="true" aria-disabled="true"' : ""}>
                <span class="settings-toggle-icon-wrap">${svg(iconKey, "settings-toggle-icon-svg")}</span>
                <span class="settings-toggle-text">
                    <span class="settings-toggle-title">${escapeHtml(title)}</span>
                    <span class="settings-toggle-subtitle" id="${subtitleId}">${escapeHtml(subtitle)}</span>
                </span>
                <span class="settings-toggle-control" aria-hidden="true"></span>
            </button>
        `;
  }

  // Safari gives extensions no notifications API, so the alerts switch has nothing to turn on. Known here
  // straight away: waiting for the background to say so left the switch looking live whenever the iPhone's
  // suspended worker answered late.
  const ALERTS_UNAVAILABLE_SUBTITLE = "Not available on this browser";
  function alertsUnavailable() {
    return typeof globalThis.chrome?.notifications?.create !== "function";
  }

  function renderPreferencesSection(state) {
    const isMobile = !!(globalThis.AnimeTrackerUtils?.isMobileDevice?.());
    const noAlerts = alertsUnavailable();
    const items = [
      renderToggleItem({
        id: "settingsCopyGuard",
        subtitleId: "settingsCopyGuardSubtitle",
        iconKey: "copy",
        title: "Copy Guard",
        subtitle: toggleSubtitle("settingsCopyGuard", state.copyGuard),
        enabled: state.copyGuard,
        disabled: isMobile,
      }),
      renderToggleItem({
        id: "settingsSmartNotif",
        subtitleId: "settingsSmartNotifSubtitle",
        iconKey: "bell",
        title: "New Episode Alerts",
        subtitle: noAlerts ? ALERTS_UNAVAILABLE_SUBTITLE : toggleSubtitle("settingsSmartNotif", state.smartNotif),
        enabled: state.smartNotif,
        disabled: noAlerts,
      }),
      renderToggleItem({
        id: "settingsAutoSkipFiller",
        subtitleId: "settingsAutoSkipFillerSubtitle",
        iconKey: "skipFwd",
        title: "Auto-Skip Fillers",
        subtitle: toggleSubtitle("settingsAutoSkipFiller", state.autoSkipFiller),
        enabled: state.autoSkipFiller,
      }),
      renderToggleItem({
        id: "settingsSkiptime",
        subtitleId: "settingsSkiptimeSubtitle",
        iconKey: "skipMark",
        title: "Skiptime Contributor",
        subtitle: toggleSubtitle("settingsSkiptime", state.skiptimeHelper),
        enabled: state.skiptimeHelper,
        disabled: isMobile,
      }),
      renderToggleItem({
        id: "settingsAuto4kServer",
        subtitleId: "settingsAuto4kServerSubtitle",
        iconKey: "fourK",
        title: "Auto-Pick Premium",
        subtitle: toggleSubtitle("settingsAuto4kServer", state.auto4kServer),
        enabled: state.auto4kServer,
        disabled: isMobile,
      }),
      renderToggleItem({
        id: "settingsAutoResume",
        subtitleId: "settingsAutoResumeSubtitle",
        iconKey: "skipFwd",
        title: "Auto-Resume",
        subtitle: toggleSubtitle("settingsAutoResume", state.autoResume),
        enabled: state.autoResume,
      }),
      renderToggleItem({
        id: "settingsAdGuard",
        subtitleId: "settingsAdGuardSubtitle",
        iconKey: "skipMark",
        title: "Ad Guard",
        subtitle: toggleSubtitle("settingsAdGuard", state.adGuard),
        enabled: state.adGuard,
      }),
    ].join("");

    return `
            <section class="settings-card settings-card--preferences">
                ${sectionHead("gear", "PREFERENCES", "7 settings")}
                <div class="settings-toggle-list">${items}</div>
            </section>
        `;
  }

  function renderConnectionsSection() {
    return `
            <section class="settings-card settings-connections-card" id="settingsConnectionsSection">
                <div class="settings-head">
                    <span class="settings-head-icon">${svg("link")}</span>
                    <span class="settings-head-title">CONNECTIONS</span>
                    <span class="anilist-pill settings-connections-status-pill" title="Connected" hidden>Connected</span>
                </div>
                <div class="settings-connections-mount" id="settingsConnectionsMount"></div>
            </section>
        `;
  }

  let speedPreferences = null;
  let speedBusy = false;
  let speedInitialized = false;
  let speedRevision = 0;
  const speedIsMobile = () => !!globalThis.AnimeTrackerUtils?.isMobileDevice?.();
  let speedMenu = null;

  function renderSpeedSelect(id, title, choices) {
    return `<div class="settings-speed-field"><span id="${id}Label">${title}</span>
      <div class="settings-speed-select">
        <button id="${id}" class="settings-speed-trigger" type="button" role="combobox"
          aria-labelledby="${id}Label ${id}Value" aria-describedby="settingsSpeedHint"
          aria-haspopup="listbox" aria-controls="${id}Menu" aria-expanded="false">
          <span id="${id}Value"></span>${svg("chevron", "settings-speed-chevron")}
        </button>
        <div id="${id}Menu" class="settings-speed-menu" role="listbox" aria-labelledby="${id}Label" hidden>
          ${choices.map(({ value, text }, index) => `<button type="button" role="option" tabindex="-1"
            id="${id}Option${index}" data-speed-control="${id}" data-speed-choice="${value}" aria-selected="false">
            <span>${text}</span>${svg("check")}</button>`).join("")}
        </div>
      </div></div>`;
  }

  function closeSpeedMenu(restoreFocus = false) {
    if (!speedMenu) return;
    const { trigger, menu, parent, cleanups } = speedMenu;
    speedMenu = null;
    for (const cleanup of cleanups) cleanup();
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false"); trigger.removeAttribute("aria-activedescendant");
    if (parent.isConnected) parent.append(menu); else menu.remove();
    if (restoreFocus && !trigger.disabled && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  function activateSpeedOption(index) {
    if (!speedMenu) return;
    const { trigger, menu } = speedMenu, options = [...menu.querySelectorAll('[role="option"]')];
    speedMenu.index = (index + options.length) % options.length;
    options.forEach((option, position) => option.classList.toggle("is-active", position === speedMenu.index));
    const active = options[speedMenu.index];
    trigger.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }

  function positionSpeedMenu() {
    if (!speedMenu) return;
    const { trigger, menu } = speedMenu;
    if (!trigger.getClientRects().length) { closeSpeedMenu(); return; }
    const rect = trigger.getBoundingClientRect(), view = window.visualViewport;
    const leftEdge = (view?.offsetLeft || 0) + 8, topEdge = (view?.offsetTop || 0) + 8;
    const rightEdge = leftEdge + (view?.width || innerWidth) - 16;
    const bottomEdge = topEdge + (view?.height || innerHeight) - 16;
    const width = Math.min(Math.max(180, rect.width), rightEdge - leftEdge);
    const below = bottomEdge - rect.bottom - 6, above = rect.top - topEdge - 6;
    const down = below >= Math.min(360, menu.scrollHeight) || below >= above;
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${Math.max(24, Math.min(360, down ? below : above))}px`;
    menu.style.left = `${Math.max(leftEdge, Math.min(rect.left, rightEdge - width))}px`;
    menu.style.top = `${Math.max(topEdge, Math.min(down ? rect.bottom + 6 : rect.top - 6 - menu.offsetHeight, bottomEdge - menu.offsetHeight))}px`;
  }

  function openSpeedMenu(trigger) {
    if (trigger.disabled || speedBusy) return;
    if (speedMenu?.trigger === trigger) { closeSpeedMenu(); return; }
    closeSpeedMenu();
    const menu = document.getElementById(`${trigger.id}Menu`);
    speedMenu = { trigger, menu, parent: menu.parentElement, cleanups: [], index: 0, typed: "", typedAt: 0 };
    const listen = (target, type, handler, options) => {
      target?.addEventListener(type, handler, options);
      speedMenu.cleanups.push(() => target?.removeEventListener(type, handler, options));
    };
    document.body.append(menu); menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true"); trigger.focus({ preventScroll: true });
    positionSpeedMenu();
    if (!speedMenu) return;
    const options = [...menu.querySelectorAll('[role="option"]')];
    activateSpeedOption(Math.max(0, options.findIndex(option => option.dataset.speedChoice === trigger.value)));
    const outside = event => { if (!menu.contains(event.target) && !trigger.contains(event.target)) closeSpeedMenu(); };
    listen(document, "pointerdown", outside);
    listen(document, "focusin", outside);
    listen(document, "scroll", event => { if (!menu.contains(event.target)) closeSpeedMenu(); }, { capture: true, passive: true });
    listen(document, "visibilitychange", () => { if (document.hidden) closeSpeedMenu(); });
    listen(window, "blur", () => closeSpeedMenu());
    listen(window, "resize", positionSpeedMenu, { passive: true });
    listen(window.visualViewport, "resize", positionSpeedMenu, { passive: true });
  }

  function chooseSpeedOption(option) {
    const trigger = document.getElementById(option.dataset.speedControl);
    if (!trigger || trigger.disabled || speedBusy) return;
    trigger.value = option.dataset.speedChoice;
    closeSpeedMenu(true);
    trigger.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function speedMenuKey(event) {
    const trigger = event.target.closest?.(".settings-speed-trigger") ||
      (speedMenu?.menu.contains(event.target) ? speedMenu.trigger : null);
    if (!trigger || trigger.disabled || speedBusy || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (key === "Escape") {
      if (speedMenu) { event.preventDefault(); event.stopPropagation(); closeSpeedMenu(true); }
      return;
    }
    if (key === "Tab") { closeSpeedMenu(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(key) && !/^[0-9.p]$/i.test(key)) return;
    event.preventDefault();
    const wasOpen = speedMenu?.trigger === trigger;
    if (!wasOpen) openSpeedMenu(trigger);
    if (!speedMenu) return;
    const options = [...speedMenu.menu.querySelectorAll('[role="option"]')];
    if (key === "Enter" || key === " ") { if (wasOpen) chooseSpeedOption(options[speedMenu.index]); }
    else if (key === "Home") activateSpeedOption(0);
    else if (key === "End") activateSpeedOption(options.length - 1);
    else if (key === "ArrowDown" || key === "ArrowUp") { if (wasOpen) activateSpeedOption(speedMenu.index + (key === "ArrowDown" ? 1 : -1)); }
    else {
      const now = Date.now(); speedMenu.typed = (now - speedMenu.typedAt < 650 ? speedMenu.typed : "") + key.toLowerCase(); speedMenu.typedAt = now;
      const found = options.findIndex(option => option.textContent.trim().toLowerCase().startsWith(speedMenu.typed));
      if (found >= 0) activateSpeedOption(found);
    }
  }

  function updateSpeedSelect(id, value, disabled) {
    const trigger = document.getElementById(id), menu = document.getElementById(`${id}Menu`);
    if (!trigger || !menu) return;
    trigger.value = value; trigger.disabled = disabled;
    const options = [...menu.querySelectorAll('[role="option"]')];
    for (const option of options) option.setAttribute("aria-selected", String(option.dataset.speedChoice === value));
    const selected = options.find(option => option.dataset.speedChoice === value);
    document.getElementById(`${id}Value`).textContent = selected?.querySelector("span").textContent || "Player default";
    if (disabled && speedMenu?.trigger === trigger) closeSpeedMenu();
  }

  function speedAudioText(preferences) {
    const parts = [];
    if (preferences.defaultVolume !== null) parts.push(`Volume ${Math.round(preferences.defaultVolume * 100)}%`);
    if (preferences.defaultMuted !== null) parts.push(preferences.defaultMuted ? "Muted" : "Sound on");
    return parts.length ? `Remembered audio: ${parts.join(", ")}` : "Player audio is used until you change volume or mute.";
  }

  function renderSpeedControlSection() {
    const model = globalThis.AnimeTrackerSpeedPreferences;
    if (!model) return "";
    const mobile = speedIsMobile();
    const preferences = model.normalize(speedPreferences, mobile);
    const normalOptions = [{ value: "", text: "Player default" }, ...(mobile ? model.MOBILE_RATES : model.NORMAL_RATES)
      .map(rate => ({ value: String(rate), text: `${rate}×` }))];
    const boostOptions = model.BOOST_RATES.map(rate => ({ value: String(rate), text: `${rate}×` }));
    return `<section class="settings-card settings-speed-card" id="settingsSpeedSection">
      ${sectionHead("speed", "Speed Control")}
      ${renderToggleItem({ id: "settingsSpeedControl", subtitleId: "settingsSpeedControlSubtitle", iconKey: "speed",
        title: "Speed control", subtitle: toggleSubtitle("settingsSpeedControl", preferences.enabled), enabled: preferences.enabled })}
      <div class="settings-speed-fields">
        ${renderSpeedSelect("settingsNormalSpeed", "Normal speed", normalOptions)}
        ${mobile ? "" : renderSpeedSelect("settingsBoostSpeed", "Hold boost", boostOptions)}
      </div>
      <p class="settings-speed-hint" id="settingsSpeedHint">${mobile
        ? "Press and hold the speed control for 2×; release to return. In native fullscreen, use the player’s own controls."
        : "Hold F7 for a temporary boost; release to return. F8 toggles boost. Tap the speed control to choose normal speed."}</p>
      ${mobile ? "" : `<div class="settings-speed-audio"><span id="settingsSpeedAudioInfo">${escapeHtml(speedAudioText(preferences))}</span>
        <button class="settings-speed-reset" id="settingsSpeedAudioReset" type="button">Reset audio default</button></div>`}
    </section>`;
  }

  function updateSpeedControl() {
    const model = globalThis.AnimeTrackerSpeedPreferences;
    const section = document.getElementById("settingsSpeedSection");
    if (!model || !section) return;
    const preferences = model.normalize(speedPreferences, speedIsMobile());
    section.setAttribute("aria-busy", String(speedBusy));
    updateToggle("settingsSpeedControl", preferences.enabled, toggleSubtitle("settingsSpeedControl", preferences.enabled));
    const toggle = document.getElementById("settingsSpeedControl");
    if (toggle) toggle.disabled = speedBusy;
    updateSpeedSelect("settingsNormalSpeed", preferences.normalRate === null ? "" : String(preferences.normalRate), speedBusy || !preferences.enabled);
    updateSpeedSelect("settingsBoostSpeed", String(preferences.boostRate), speedBusy || !preferences.enabled);
    const audio = document.getElementById("settingsSpeedAudioInfo");
    if (audio) audio.textContent = speedAudioText(preferences);
    const reset = document.getElementById("settingsSpeedAudioReset");
    if (reset) reset.disabled = speedBusy || !preferences.enabled || (preferences.defaultVolume === null && preferences.defaultMuted === null);
  }

  async function loadSpeedControlPreferences() {
    const model = globalThis.AnimeTrackerSpeedPreferences;
    const revision = speedRevision;
    try {
      const stored = await chrome.storage.local.get([model.KEY]);
      if (revision === speedRevision) speedPreferences = model.normalize(stored[model.KEY], speedIsMobile());
    } catch (error) {
      window.PopupLogger?.warn?.("Settings", "Could not load speed preferences:", error);
    }
    updateSpeedControl();
  }

  async function saveSpeedControlPatch(delta) {
    if (speedBusy) return;
    const model = globalThis.AnimeTrackerSpeedPreferences;
    const mobile = speedIsMobile();
    speedBusy = true;
    updateSpeedControl();
    const revision = speedRevision;
    try {
      model.patch(speedPreferences, delta, mobile);
      const response = await window.AnimeTracker.sendRuntimeRequest(
        { type: "UPDATE_SPEED_CONTROL_PREFERENCES", patch: delta, mobile }, { timeoutMs: 10000 });
      if (response?.success !== true || !response.preferences) throw new Error(response?.error || "Speed preferences were not saved");
      // Storage events may already contain a newer edit from another popup or the player.
      if (revision === speedRevision) speedPreferences = model.normalize(response.preferences, mobile);
    } catch (error) {
      await loadSpeedControlPreferences();
      window.AnimeTracker.UIHelpers?.showToast?.("Could not save speed preference", { type: "error", duration: 2200 });
      window.PopupLogger?.warn?.("Settings", "Speed preference update failed:", error);
    } finally {
      speedBusy = false;
      updateSpeedControl();
    }
  }

  async function initializeSpeedControl() {
    const model = globalThis.AnimeTrackerSpeedPreferences;
    if (!model || speedInitialized) return;
    speedInitialized = true;
    document.addEventListener("click", event => {
      const option = event.target.closest?.("[data-speed-choice]");
      if (option) { chooseSpeedOption(option); return; }
      const trigger = event.target.closest?.(".settings-speed-trigger");
      if (trigger) { openSpeedMenu(trigger); return; }
      if (speedMenu && !speedMenu.menu.contains(event.target)) closeSpeedMenu();
      const toggle = event.target.closest?.("#settingsSpeedControl");
      const reset = event.target.closest?.("#settingsSpeedAudioReset");
      const control = toggle || reset;
      if (!control || control.disabled || speedBusy) return;
      event.stopPropagation();
      const preferences = model.normalize(speedPreferences, speedIsMobile());
      void saveSpeedControlPatch(toggle ? { enabled: !preferences.enabled } : { defaultVolume: null, defaultMuted: null });
    });
    // Consume menu Escape before main's bubble shortcut leaves Settings.
    document.addEventListener("keydown", speedMenuKey, true);
    document.addEventListener("change", event => {
      const control = event.target;
      if (control.disabled || speedBusy) return;
      if (control.id === "settingsNormalSpeed") {
        void saveSpeedControlPatch({ normalRate: control.value === "" ? null : Number(control.value) });
      } else if (control.id === "settingsBoostSpeed" && !speedIsMobile()) {
        void saveSpeedControlPatch({ boostRate: Number(control.value) });
      }
    });
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== "local" || !changes[model.KEY]) return;
      speedRevision++;
      speedPreferences = model.normalize(changes[model.KEY].newValue, speedIsMobile());
      updateSpeedControl();
    });
    await loadSpeedControlPreferences();
  }

  function renderDataSection() {
    return `
            <section class="settings-card settings-data-card">
                ${sectionHead("database", "DATA TOOLS")}
                <div class="settings-data-top">
                    <button class="settings-data-action settings-data-action--primary" id="settingsFetchFillers" type="button">
                        ${svg("sparkles")}
                        <span class="settings-data-action-text">
                            <span class="settings-data-action-title">Fetch &amp; Import</span>
                            <span class="settings-data-action-subtitle">Fillers, counts &amp; info</span>
                        </span>
                    </button>
                    <button class="settings-data-action" id="settingsRefresh" type="button">
                        ${svg("refresh")}
                        <span class="settings-data-action-text">
                            <span class="settings-data-action-title">Refresh / Sync</span>
                            <span class="settings-data-action-subtitle">Sync with cloud</span>
                        </span>
                    </button>
                </div>
                <div class="settings-backup-card">
                    <div class="settings-backup-head">
                        <span class="settings-backup-title">Backup</span>
                        <span class="settings-backup-sub">Keep a local copy of your library</span>
                    </div>
                    <div class="settings-backup-actions">
                        <button class="settings-btn-outline" id="settingsExportData" type="button">
                            ${svg("download")}<span>Export JSON</span>
                        </button>
                        <button class="settings-btn-outline" id="settingsImportData" type="button">
                            ${svg("upload")}<span>Import JSON</span>
                        </button>
                    </div>
                    <input type="file" id="settingsImportFile" accept="application/json,.json"
                           style="display:none" aria-hidden="true">
                </div>
            </section>
        `;
  }

  function _setPasswordInner(passwordIsSet) {
    return passwordIsSet
      ? `
            <button class="settings-action settings-action--set settings-action--full" id="settingsSetPassword" type="button">
                ${svg("check")}
                <span class="settings-action-text">
                    <span class="settings-action-title">Password set</span>
                    <span class="settings-action-subtitle">Tap to update it</span>
                </span>
                <span class="settings-action-arrow">${svg("chevron")}</span>
            </button>`
      : `
            <button class="settings-action settings-action--full" id="settingsSetPassword" type="button">
                ${svg("key")}
                <span class="settings-action-text">
                    <span class="settings-action-title">Set password</span>
                    <span class="settings-action-subtitle">Mobile email login</span>
                </span>
                <span class="settings-action-arrow">${svg("chevron")}</span>
            </button>`;
  }

  function renderDangerCard(user, passwordIsSet, isMobile) {
    const showSetPw = !(!user || isMobile);
    return `
            <div class="settings-danger-row" data-has-password="${showSetPw}">
                <section class="settings-card settings-card--danger">
                    <button class="settings-action settings-action--danger settings-action--full" id="settingsClear" type="button">
                        ${svg("trash")}
                        <span class="settings-action-text">
                            <span class="settings-action-title">Clear all data</span>
                            <span class="settings-action-subtitle">Local reset</span>
                        </span>
                        <span class="settings-action-arrow">${svg("chevron")}</span>
                    </button>
                </section>
                <section class="settings-card settings-card--password" id="settingsSetPwCard"${showSetPw ? "" : " hidden"}>
                        ${showSetPw ? _setPasswordInner(passwordIsSet) : ""}
                </section>
            </div>
        `;
  }

  function renderAboutCard() {
    return `
            <section class="settings-card settings-card--compact settings-card--support">
                <div class="settings-about-row">
                    <div class="settings-about-copy">
                        <span class="settings-about-title">Keep Anime Tracker evolving</span>
                        <span class="settings-about-note">If the extension helps your daily watching flow, you can support future updates here.</span>
                    </div>
                    <button class="settings-about-donate" id="settingsDonate" type="button">
                        ${svg("heart")}<span>Donate</span>
                    </button>
                </div>
            </section>
        `;
  }

  function render(container, params = {}) {
    if (!container) return;
    container.removeAttribute("hidden");

    const { user = null, settings = {}, passwordIsSet = false, isMobile = false, needsReauth = false } = params;
    const isMobileEffective = isMobile || !!(globalThis.AnimeTrackerUtils?.isMobileDevice?.());

    const state = {
      copyGuard: globalThis.AnimeTrackerUtils?.copyGuardEnabled ? globalThis.AnimeTrackerUtils.copyGuardEnabled(settings.copyGuard) : (!isMobileEffective && settings.copyGuard !== false),
      smartNotif: settings.smartNotif === true,
      autoSkipFiller: settings.autoSkipFiller === true,
      skiptimeHelper: globalThis.AnimeTrackerUtils?.skiptimeHelperEnabled ? globalThis.AnimeTrackerUtils.skiptimeHelperEnabled(settings.skiptimeHelper) : (!isMobileEffective && settings.skiptimeHelper === true),
      auto4kServer: globalThis.AnimeTrackerUtils?.auto4kEnabled ? globalThis.AnimeTrackerUtils.auto4kEnabled(settings.auto4kServer) : (!isMobileEffective && settings.auto4kServer !== false),
      adGuard: settings.adGuard !== false,
      autoResume: settings.autoResume === true,
    };

    const alreadyRendered = container.querySelector(".settings-view-inner");
    if (!alreadyRendered) {
      container.innerHTML = `
                <div class="settings-view-inner">
                    ${renderHeader(user, needsReauth)}
                    <div id="settingsSiteAccess" class="site-access" hidden></div>
                    ${renderPreferencesSection(state)}
                    ${renderSpeedControlSection()}
                    ${renderConnectionsSection()}
                    ${renderDataSection()}
                    ${renderDangerCard(user, passwordIsSet, isMobileEffective)}
                    ${renderAboutCard()}
                </div>
            `;
      updateSpeedControl();
      return;
    }

    const avatar = container.querySelector("#settingsAvatar");
    const nameEl = container.querySelector("#settingsUserName");
    const emailEl = container.querySelector("#settingsUserEmail");
    const pill = container.querySelector(".settings-account-pill");
    const localOnlyBadge = container.querySelector('[data-when="signed-out"]');
    const headerEl = container.querySelector(".settings-header");

    if (avatar) avatar.src = user?.photoURL || "src/icons/icon48.png";
    if (nameEl) nameEl.textContent = user?.displayName || user?.email?.split("@")[0] || "User";
    if (emailEl) emailEl.textContent = user?.email || "";
    if (pill) {
      if (user) {
        pill.removeAttribute("hidden");
        pill.setAttribute("title", user.email || "");
        pill.dataset.tooltip = user.email || "";
      } else {
        pill.setAttribute("hidden", "");
      }
    }
    if (localOnlyBadge) {
      if (user) localOnlyBadge.setAttribute("hidden", "");
      else localOnlyBadge.removeAttribute("hidden");
    }
    if (headerEl) {
      headerEl.dataset.signedIn = user ? "true" : "false";

      const bannerEl = headerEl.querySelector("#settingsReauthBanner");
      if (user && needsReauth) {
        if (!bannerEl) {
          headerEl.insertAdjacentHTML(
            "beforeend",
            `
                        <div class="settings-reauth-banner" id="settingsReauthBanner">
                            <span class="settings-reauth-warning">Cloud sync paused. Reconnect required.</span>
                            <button class="settings-reauth-btn" id="settingsReauthBtn" type="button">Reconnect</button>
                        </div>
                    `,
          );
        }
      } else {
        bannerEl?.remove();
      }
    }

    const setPwCard = container.querySelector("#settingsSetPwCard");
    if (setPwCard) {
      const showSetPw = !(!user || isMobileEffective);
      setPwCard.closest(".settings-danger-row")?.setAttribute("data-has-password", showSetPw ? "true" : "false");
      const existingBtn = setPwCard.querySelector("#settingsSetPassword");
      const expectedState = !showSetPw ? "absent" : passwordIsSet ? "set" : "unset";
      const currentState = !existingBtn ? "absent" : existingBtn.classList.contains("settings-action--set") ? "set" : "unset";
      if (expectedState !== currentState) {
        setPwCard.innerHTML = showSetPw ? _setPasswordInner(passwordIsSet) : "";
        if (showSetPw) setPwCard.removeAttribute("hidden");
        else setPwCard.setAttribute("hidden", "");
      }
    }

    updateToggle(
      "settingsCopyGuard",
      state.copyGuard,
      toggleSubtitle("settingsCopyGuard", state.copyGuard),
    );
    updateToggle(
      "settingsSmartNotif",
      state.smartNotif,
      toggleSubtitle("settingsSmartNotif", state.smartNotif),
    );
    updateToggle(
      "settingsAutoSkipFiller",
      state.autoSkipFiller,
      toggleSubtitle("settingsAutoSkipFiller", state.autoSkipFiller),
    );
    updateToggle(
      "settingsSkiptime",
      state.skiptimeHelper,
      toggleSubtitle("settingsSkiptime", state.skiptimeHelper),
    );
    updateToggle(
      "settingsAuto4kServer",
      state.auto4kServer,
      toggleSubtitle("settingsAuto4kServer", state.auto4kServer),
    );
    updateToggle(
      "settingsAutoResume",
      state.autoResume,
      toggleSubtitle("settingsAutoResume", state.autoResume),
    );
    updateToggle(
      "settingsAdGuard",
      state.adGuard,
      toggleSubtitle("settingsAdGuard", state.adGuard),
    );
    updateSpeedControl();
  }

  function _ensureSettingsLiveRegion() {
    let live = document.getElementById("settingsLiveRegion");
    if (live) return live;
    live = document.createElement("div");
    live.id = "settingsLiveRegion";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    live.style.cssText =
      "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
    document.body.appendChild(live);
    return live;
  }

  function updateToggle(id, enabled, subtitle) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const isMobile = !!(globalThis.AnimeTrackerUtils?.isMobileDevice?.());
    const isMobileDisabledKey =
      (isMobile && (id === "settingsCopyGuard" || id === "settingsSkiptime" || id === "settingsAuto4kServer")) ||
      (id === "settingsSmartNotif" && alertsUnavailable());
    if (id === "settingsSmartNotif" && alertsUnavailable()) subtitle = ALERTS_UNAVAILABLE_SUBTITLE;
    const prev = btn.getAttribute("aria-pressed") === "true";
    const en = !isMobileDisabledKey && !!enabled;
    btn.dataset.enabled = en ? "true" : "false";
    btn.setAttribute("aria-pressed", en ? "true" : "false");
    if (isMobileDisabledKey) {
      btn.setAttribute("aria-disabled", "true");
      btn.dataset.mobileDisabled = "true";
    }
    if (subtitle) {
      const subtitleId = btn.querySelector(".settings-toggle-subtitle")?.id;
      if (subtitleId) {
        const subEl = document.getElementById(subtitleId);
        if (subEl) subEl.textContent = subtitle;
      }
    }
    if (prev !== en) {
      const titleEl = btn.querySelector(".settings-toggle-title");
      const titleText = titleEl?.textContent?.trim() || "Setting";
      const live = _ensureSettingsLiveRegion();
      live.textContent = "";
      requestAnimationFrame(() => {
        live.textContent = `${titleText} ${en ? "enabled" : "disabled"}`;
      });
    }
  }

  window.AnimeTracker = window.AnimeTracker || {};
  window.AnimeTracker.SettingsView = { render, updateToggle, toggleSubtitle, initializeSpeedControl, alertsUnavailable };

  const initialContainer = document.getElementById("settingsView");
  if (initialContainer) {
    render(initialContainer, { user: null, settings: {} });
    initialContainer.setAttribute("hidden", "");
  }
})();
