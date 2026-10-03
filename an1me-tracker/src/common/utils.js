// utils.js — small helpers shared by every context (service worker, popup, content scripts).
// Loaded before any module that uses them; nothing here may touch window or document.
(function (root) {
  "use strict";

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  // Epoch milliseconds from a Date-parsable value or a number; 0 when missing or invalid.
  function toMillis(value) {
    const ms = toMillisOrNaN(value);
    return Number.isFinite(ms) ? ms : 0;
  }

  // Same, but NaN when missing or invalid, for callers that must tell "no timestamp" from epoch 0.
  function toMillisOrNaN(value) {
    if (!value) return NaN;
    const ms = typeof value === "number" ? value : new Date(value).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }

  function slugify(title) {
    return String(title || "")
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, " ")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  const HTML_ENTITIES = Object.freeze({
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    ndash: "–",
    mdash: "—",
    hellip: "…",
  });

  // String-only, so it also runs in the service worker. Repeats for double-encoded text ("&amp;amp;").
  function decodeHtmlEntities(text) {
    let decoded = String(text ?? "");
    for (let pass = 0; pass < 3 && decoded.includes("&"); pass += 1) {
      const next = decoded
        .replace(/&#x([0-9a-f]+);/gi, (match, hex) => fromCodePoint(parseInt(hex, 16), match))
        .replace(/&#(\d+);/g, (match, dec) => fromCodePoint(parseInt(dec, 10), match))
        .replace(/&([a-z]+);/gi, (match, name) => HTML_ENTITIES[name.toLowerCase()] ?? match);
      if (next === decoded) break;
      decoded = next;
    }
    return decoded;
  }

  function fromCodePoint(codePoint, fallback) {
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return fallback;
    }
  }

  // 32-bit FNV-1a, base36.
  function hashText(value) {
    const text = String(value ?? "");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  // Cache key for derived views of the library: the library revision when the caller has one,
  // otherwise a hash of the data itself.
  function cacheSignature(data, revision = null) {
    if (revision !== null && revision !== undefined && revision !== "") {
      const value = Number(revision);
      if (Number.isFinite(value) && value >= 0) return `revision:${value}`;
    }
    try {
      const serialized = JSON.stringify(data || {});
      return `${serialized.length}|${hashText(serialized)}`;
    } catch {
      return `uncacheable:${Date.now()}:${Math.random()}`;
    }
  }

  function storageCall(method, arg, failure) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local[method](arg, (result) => {
          const errorMessage = chrome.runtime.lastError?.message;
          if (errorMessage) reject(new Error(`${failure}: ${errorMessage}`));
          else resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // chrome.storage.local as promises that reject on runtime.lastError.
  const storage = Object.freeze({
    get: (keys) => storageCall("get", keys, "Local storage read failed").then((result) => result || {}),
    set: (items) => storageCall("set", items, "Local storage write failed").then(() => undefined),
    remove: (keys) => storageCall("remove", keys, "Local storage remove failed").then(() => undefined),
  });

  // Phones get gentler background work: the OS suspends the worker sooner and the network is slower.
  function isMobileDevice() {
    return typeof navigator !== "undefined" && (
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }

  function auto4kEnabled(value) {
    if (isMobileDevice()) return false;
    return typeof value === "boolean" ? value : true;
  }

  function copyGuardEnabled(value) {
    if (isMobileDevice()) return false;
    return typeof value === "boolean" ? value : true;
  }

  function skiptimeHelperEnabled(value) {
    if (isMobileDevice()) return false;
    return typeof value === "boolean" ? value : false;
  }

  if (typeof document !== "undefined" && document.documentElement?.classList?.add) {
    document.documentElement.classList.add(isMobileDevice() ? "is-mobile" : "is-desktop");
  }

  root.AnimeTrackerUtils = Object.freeze({
    sleep,
    toMillis,
    toMillisOrNaN,
    slugify,
    decodeHtmlEntities,
    hashText,
    cacheSignature,
    storage,
    isMobileDevice,
    auto4kEnabled,
    copyGuardEnabled,
    skiptimeHelperEnabled,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
