// tooltip.js — one styled tooltip for the whole popup, in place of the browser's own title bubble.
//
// The native bubble cannot be styled, appears after a long, uneven delay, follows the system's light or
// dark theme, and is clipped at the window's edge — which is exactly where the fetch log's detail text
// (its only explanation of what happened to a show) sits. This reads the same `title` / `data-tooltip`
// text and draws it as an element of the popup.
//
// The `title` attribute is detached only while the bubble is up and put straight back on hide, so the
// markup, the suites that read `title`/innerHTML and screen readers keep seeing it.
(function () {
  "use strict";

  const AT = (window.AnimeTracker = window.AnimeTracker || {});
  if (AT.Tooltip) return;

  const SHOW_DELAY_MS = 250;
  const HIDE_FADE_MS = 140;
  const EDGE = 8;
  const GAP = 9;

  const state = { el: null, target: null, pending: null, stashed: null, showTimer: 0, hideTimer: 0 };

  // Hover only: a touch tap fires pointerover too, and a bubble on every tap is noise. The fetch log's
  // detail is not lost on a phone — its stylesheet gives it a second line instead of an ellipsis.
  function canHover() {
    try {
      return !window.matchMedia || window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    } catch {
      return true;
    }
  }

  function textFor(el) {
    const explicit = el.getAttribute("data-tooltip");
    if (explicit) return explicit;
    return el.getAttribute("title") || "";
  }

  // The nearest ancestor that actually has something to say. An empty title (several renderers emit one
  // for a non-filler episode) must not shadow a titled ancestor.
  function anchorFor(node) {
    let el = node && node.nodeType === 1 ? node : node?.parentElement || null;
    while (el) {
      if ((el.hasAttribute?.("data-tooltip") || el.hasAttribute?.("title")) && textFor(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function ensureEl() {
    if (state.el && state.el.isConnected) return state.el;
    const el = document.createElement("div");
    el.className = "at-tooltip";
    el.setAttribute("role", "tooltip");
    el.hidden = true;
    document.body.appendChild(el);
    state.el = el;
    return el;
  }

  function place(target) {
    const el = ensureEl();
    const rect = target.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const widest = Math.max(EDGE, window.innerWidth - box.width - EDGE);
    el.style.left = `${Math.round(Math.max(EDGE, Math.min(rect.left + rect.width / 2 - box.width / 2, widest)))}px`;
    const above = rect.top - box.height - GAP;
    if (above >= EDGE) {
      el.style.top = `${Math.round(above)}px`;
      el.dataset.placement = "top";
    } else {
      el.style.top = `${Math.round(rect.bottom + GAP)}px`;
      el.dataset.placement = "bottom";
    }
  }

  function detachTitle(target) {
    if (!target.hasAttribute("title")) return;
    state.stashed = { el: target, title: target.getAttribute("title") };
    target.removeAttribute("title");
  }

  function restoreTitle() {
    const stashed = state.stashed;
    state.stashed = null;
    if (!stashed) return;
    const { el, title } = stashed;
    // Only where nothing has written a title in the meantime and the node is still mounted.
    if (el?.isConnected && !el.hasAttribute("title")) el.setAttribute("title", title);
  }

  function show(target) {
    const text = textFor(target);
    if (!text) return;
    const el = ensureEl();
    // A fade started by the previous target must not take this bubble down with it.
    if (state.hideTimer) clearTimeout(state.hideTimer);
    state.hideTimer = 0;
    detachTitle(target);
    state.target = target;
    el.textContent = text;
    el.hidden = false;
    place(target);
    requestAnimationFrame(() => el.classList.add("is-visible"));
  }

  function cancelPending() {
    if (state.showTimer) clearTimeout(state.showTimer);
    state.showTimer = 0;
    state.pending = null;
  }

  function hide() {
    cancelPending();
    restoreTitle();
    state.target = null;
    const el = state.el;
    if (!el || el.hidden) return;
    el.classList.remove("is-visible");
    if (state.hideTimer) clearTimeout(state.hideTimer);
    state.hideTimer = setTimeout(() => {
      state.hideTimer = 0;
      if (!state.el || state.target) return;
      state.el.hidden = true;
      state.el.textContent = "";
    }, HIDE_FADE_MS);
  }

  function onPointerOver(event) {
    if (event.pointerType === "touch" || !canHover()) return;
    const target = anchorFor(event.target);
    if (!target || target === state.target || target === state.pending) return;
    cancelPending();
    if (state.target) hide();
    state.pending = target;
    state.showTimer = setTimeout(() => {
      state.showTimer = 0;
      if (state.pending !== target) return;
      state.pending = null;
      if (target.isConnected) show(target);
    }, SHOW_DELAY_MS);
  }

  function onPointerOut(event) {
    const target = anchorFor(event.target);
    if (!target) return;
    const related = event.relatedTarget;
    if (related && target.contains(related)) return;
    if (target !== state.target) {
      if (target === state.pending) cancelPending();
      return;
    }
    hide();
  }

  // Keyboard focus shows it at once: a user tabbing through has no hover delay to spend.
  function onFocusIn(event) {
    const target = anchorFor(event.target);
    if (!target) return;
    cancelPending();
    if (state.target && state.target !== target) hide();
    if (target !== state.target) show(target);
  }

  function onFocusOut(event) {
    const target = anchorFor(event.target);
    if (!target) return;
    const related = event.relatedTarget;
    if (related && target.contains(related)) return;
    if (target === state.target) hide();
  }

  function init() {
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hide();
    }, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
  }

  AT.Tooltip = Object.freeze({ hide, refresh: hide, init });
  init();
})();
