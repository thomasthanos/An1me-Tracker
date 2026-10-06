// context-menu.js — the popup's own right-click (and long-press) menu.
//
// The browser's menu offers nothing about a tracker row ("Reload", "Save image as…") and on the fetch log
// it covers the panel it belongs to. Providers register the elements they speak for and the items to show;
// anything without a provider keeps the native menu, which is what copy/paste in the search box, text
// selection and the cover images' own actions still need.
//
// Card items click the card's real buttons, so every action keeps the one handler, confirmation prompt and
// pending state it already had; nothing here reimplements a mutation.
(function () {
  "use strict";

  const AT = (window.AnimeTracker = window.AnimeTracker || {});
  if (AT.ContextMenu) return;

  const EDGE = 8;
  const LONG_PRESS_MS = 480;
  const MOVE_TOLERANCE = 12;

  const providers = [];
  const state = { el: null, anchor: null, open: false, pressTimer: 0, pressStart: null, pressProvider: null, swallowClick: false };

  function define(matches, buildItems) {
    if (typeof matches !== "function" && typeof matches !== "string") return;
    if (typeof buildItems !== "function") return;
    providers.push({ matches, buildItems });
  }

  function closestMatch(node, matches) {
    let el = node && node.nodeType === 1 ? node : node?.parentElement || null;
    while (el) {
      try {
        if (typeof matches === "string" ? el.matches?.(matches) : matches(el)) return el;
      } catch {}
      el = el.parentElement;
    }
    return null;
  }

  function findProvider(node) {
    for (const provider of providers) {
      const el = closestMatch(node, provider.matches);
      if (el) return { el, buildItems: provider.buildItems };
    }
    return null;
  }

  // Inputs and anything marked data-native-menu keep the browser's own menu.
  function wantsNativeMenu(node) {
    let el = node && node.nodeType === 1 ? node : node?.parentElement || null;
    while (el) {
      if (el.hasAttribute?.("data-native-menu")) return true;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ─── Clipboard ────────────────────────────────────────────────────────────────────────────────────

  function fallbackCopy(value) {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  async function copyText(value, message) {
    const text = String(value ?? "").trim();
    if (!text) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // A popup can lose focus between the click and the write; the old selection copy still works.
      ok = fallbackCopy(text);
    }
    AT.showToast?.({ message: ok ? message || "Copied" : "Could not copy", type: ok ? "success" : "error", duration: 2000 });
  }

  const copyItem = (label, value, message) => ({ label, icon: "copy", onSelect: () => copyText(value, message) });

  // ─── Built-in providers ───────────────────────────────────────────────────────────────────────────

  // Fetch & Import log rows: the row is the only place the run's reason for a show lives, and its text is
  // not selectable, so the copy actions are the whole point of the menu there.
  const logRowText = (row) => {
    const name = row.querySelector(".ffui-log-name")?.textContent?.trim() || "";
    const detail = row.querySelector(".ffui-log-detail")?.textContent?.trim() || "";
    return { name, detail, line: [name, detail].filter(Boolean).join(" — ") };
  };

  define(".ffui-log-row", (row) => {
    const { name, detail, line } = logRowText(row);
    const items = [];
    if (line) items.push(copyItem("Copy row", line, "Row copied"));
    if (name) items.push(copyItem("Copy title", name, "Title copied"));
    if (detail) items.push(copyItem("Copy status", detail, "Status copied"));
    return items;
  });

  // Anime cards and grouped rows. Each entry maps to a button the card already renders; one that is not
  // there (a movie has no episode list, a group toggles its members) is simply left out.
  const CARD_ACTIONS = [
    { selector: ".movie-open-link", label: () => "Open anime page", icon: "link" },
    { selector: ".anime-title-text, .grp-name", label: () => "Copy title", icon: "copy", copy: true },
    { separator: true },
    { selector: ".anime-favorite-toggle, .group-favorite-toggle", label: (b) => (b.dataset.favorite === "true" ? "Remove from favorites" : "Add to favorites"), icon: "star" },
    { selector: ".anime-complete-toggle, .group-complete-toggle", label: (b) => (b.dataset.completed === "true" ? "Unmark completed" : "Mark completed"), icon: "check" },
    { selector: ".anime-onhold-toggle, .group-onhold-toggle", label: (b) => (b.dataset.onhold === "true" ? "Resume watching" : "Put on hold"), icon: "pause" },
    { selector: ".anime-drop-toggle, .group-drop-toggle", label: (b) => (b.dataset.dropped === "true" ? "Unmark dropped" : "Mark dropped"), icon: "drop" },
    { separator: true },
    { selector: ".anime-edit-title, .season-edit-btn, .movie-edit-btn", label: () => "Edit title", icon: "edit" },
    { selector: ".anime-delete, .season-delete-btn, .movie-delete-btn", label: () => "Delete", icon: "delete", danger: true },
  ];

  const CARD_CONTAINERS = ".anime-card, .season-item, .part-item, .anime-season-group, .anime-movie-group";

  define(CARD_CONTAINERS, (card) => {
    const items = [];
    for (const action of CARD_ACTIONS) {
      if (action.separator) {
        if (items.length) items.push({ separator: true });
        continue;
      }
      const button = card.querySelector(action.selector);
      if (!button || button.disabled) continue;
      const label = typeof action.label === "function" ? action.label(button) : action.label;
      if (!label) continue;
      if (action.copy) {
        items.push(copyItem(label, button.textContent || "", "Title copied"));
        continue;
      }
      items.push({
        label,
        icon: action.icon,
        danger: action.danger === true,
        onSelect: () => { try { button.click(); } catch {} },
      });
    }
    return items;
  });

  // ─── Menu element ─────────────────────────────────────────────────────────────────────────────────

  function ensureEl() {
    if (state.el && state.el.isConnected) return state.el;
    const el = document.createElement("div");
    el.className = "at-ctx";
    el.setAttribute("role", "menu");
    el.hidden = true;
    document.body.appendChild(el);
    state.el = el;
    return el;
  }

  function renderItems(items) {
    const el = ensureEl();
    el.replaceChildren();
    for (const item of items) {
      if (!item) continue;
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "at-ctx-sep";
        sep.setAttribute("role", "separator");
        el.appendChild(sep);
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = `at-ctx-item${item.danger ? " is-danger" : ""}`;
      button.setAttribute("role", "menuitem");
      button.disabled = item.disabled === true;
      const icon = document.createElement("span");
      icon.className = "at-ctx-icon";
      icon.innerHTML = AT.UIHelpers?.createIcon?.(item.icon) || "";
      const label = document.createElement("span");
      label.className = "at-ctx-label";
      label.textContent = item.label || "";
      button.append(icon, label);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
        try { item.onSelect?.(); } catch {}
      });
      el.appendChild(button);
    }
    return el;
  }

  function place(el, x, y) {
    const box = el.getBoundingClientRect();
    const maxX = Math.max(EDGE, window.innerWidth - box.width - EDGE);
    el.style.left = `${Math.round(Math.max(EDGE, Math.min(x, maxX)))}px`;
    const below = y + box.height + EDGE > window.innerHeight;
    el.style.top = `${Math.round(below ? Math.max(EDGE, y - box.height) : y)}px`;
  }

  function open(x, y, items, anchor) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return false;
    const el = renderItems(list);
    state.anchor = anchor || null;
    el.hidden = false;
    el.classList.remove("is-open");
    place(el, x, y);
    requestAnimationFrame(() => el.classList.add("is-open"));
    state.open = true;
    el.querySelector(".at-ctx-item:not(:disabled)")?.focus?.({ preventScroll: true });
    return true;
  }

  function close() {
    cancelPress();
    state.open = false;
    state.anchor = null;
    const el = state.el;
    if (!el || el.hidden) return;
    el.classList.remove("is-open");
    el.hidden = true;
    el.replaceChildren();
  }

  // ─── Pointer, touch and keyboard wiring ───────────────────────────────────────────────────────────

  function showFor(node, x, y) {
    const provider = findProvider(node);
    if (!provider) return false;
    const items = provider.buildItems(provider.el, { clientX: x, clientY: y });
    if (!items || !items.length) return false;
    return open(x, y, items, provider.el);
  }

  function onContextMenu(event) {
    if (wantsNativeMenu(event.target)) return;
    if (!findProvider(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    close();
    showFor(event.target, event.clientX, event.clientY);
  }

  function cancelPress() {
    if (state.pressTimer) clearTimeout(state.pressTimer);
    state.pressTimer = 0;
    state.pressStart = null;
    state.pressProvider = null;
  }

  function onTouchStart(event) {
    if (event.touches.length !== 1 || state.open) return;
    if (wantsNativeMenu(event.target)) return;
    const provider = findProvider(event.target);
    if (!provider) return;
    const touch = event.touches[0];
    state.pressStart = { x: touch.clientX, y: touch.clientY };
    state.pressProvider = provider;
    if (state.pressTimer) clearTimeout(state.pressTimer);
    state.pressTimer = setTimeout(() => {
      state.pressTimer = 0;
      const at = state.pressStart;
      const target = state.pressProvider;
      state.pressStart = null;
      state.pressProvider = null;
      if (!at || !target) return;
      const items = target.buildItems(target.el, { clientX: at.x, clientY: at.y });
      if (!items || !items.length) return;
      // The finger's release still produces a click on the row underneath; swallow that one. A browser
      // that fires no click at all would otherwise leave the flag armed for the next real tap, so the
      // swallow is both bounded in time and skipped for a tap that lands on the menu itself.
      state.swallowClick = true;
      setTimeout(() => { state.swallowClick = false; }, 700);
      open(at.x, at.y, items, target.el);
      try { navigator.vibrate?.(12); } catch {}
    }, LONG_PRESS_MS);
  }

  function onTouchMove(event) {
    if (!state.pressTimer) return;
    const touch = event.touches[0];
    if (!touch || !state.pressStart) return;
    if (Math.abs(touch.clientX - state.pressStart.x) > MOVE_TOLERANCE || Math.abs(touch.clientY - state.pressStart.y) > MOVE_TOLERANCE) {
      cancelPress();
    }
  }

  function onSwallowClick(event) {
    if (!state.swallowClick) return;
    // A real tap on a menu item is the user's choice, not the long press's leftover.
    if (state.el?.contains(event.target)) return;
    state.swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerDown(event) {
    if (!state.open) return;
    if (state.el?.contains(event.target)) return;
    close();
  }

  function onKeyDown(event) {
    if (!state.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const anchor = state.anchor;
      close();
      try { anchor?.focus?.({ preventScroll: true }); } catch {}
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...(state.el?.querySelectorAll(".at-ctx-item:not(:disabled)") || [])];
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = index === -1 ? (step === 1 ? 0 : items.length - 1) : (index + step + items.length) % items.length;
    items[next].focus({ preventScroll: true });
  }

  function init() {
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true, capture: true });
    document.addEventListener("touchend", cancelPress, { passive: true, capture: true });
    document.addEventListener("touchcancel", cancelPress, { passive: true, capture: true });
    document.addEventListener("click", onSwallowClick, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
  }

  AT.ContextMenu = Object.freeze({ define, open, close, copyText, init });
  init();
})();
