// Load library artwork near the scroll viewport, using the bounded cover cache queue.
(function () {
  "use strict";
  const AT = (window.AnimeTracker = window.AnimeTracker || {});
  const images = new Map();
  let root, observer, closed = false, generation = 0, frame = null, fallbackHost;
  const active = () => !closed && !document.hidden && document.visibilityState !== "hidden";

  function load(img) {
    const record = images.get(img);
    if (!active() || !record || record.loaded || record.pending || !img.isConnected) return;
    const token = {};
    const epoch = generation;
    record.pending = token;
    Promise.resolve(AT.CoverCache.warm([record.url])).catch(() => {}).then(() => {
      if (record.pending !== token) return;
      record.pending = null;
      if (!active() || epoch !== generation || images.get(img) !== record || !img.isConnected ||
          img.dataset.atCoverUrl !== record.url) return;
      img.src = AT.CoverCache.resolve(record.url) || record.url;
      record.loaded = true;
      observer?.unobserve(img);
    });
  }

  function checkViewport() {
    frame = null;
    if (!active()) return;
    const bounds = fallbackHost?.getBoundingClientRect?.() || { top: 0, bottom: window.innerHeight };
    for (const [img, record] of images) {
      if (record.loaded || record.pending || !img.isConnected || !img.getClientRects().length) continue;
      const rect = img.getBoundingClientRect();
      if (rect.bottom >= bounds.top - 300 && rect.top <= bounds.bottom + 300) load(img);
    }
  }

  function scheduleCheck() {
    if (active() && frame === null) frame = window.requestAnimationFrame(checkViewport);
  }

  function observe(list) {
    if (closed || !list) return;
    root = list;
    const mounted = new Set(root.querySelectorAll("img[data-at-cover-url]"));
    for (const [img, record] of images) {
      if (mounted.has(img) && img.dataset.atCoverUrl === record.url) continue;
      observer?.unobserve(img);
      images.delete(img);
    }
    const scrollHost = root.closest(".main-content") || document.querySelector(".main-content");
    if (typeof IntersectionObserver !== "undefined" && !observer) {
      observer = new IntersectionObserver(entries => {
        if (!active()) return;
        for (const entry of entries) if (entry.isIntersecting) load(entry.target);
      }, { root: scrollHost, rootMargin: "300px 0px" });
    } else if (typeof IntersectionObserver === "undefined" && fallbackHost !== scrollHost) {
      fallbackHost?.removeEventListener("scroll", scheduleCheck);
      fallbackHost = scrollHost;
      fallbackHost?.addEventListener("scroll", scheduleCheck, { passive: true });
    }
    for (const img of mounted) {
      if (!images.has(img)) {
        const src = img.getAttribute("src") || "";
        images.set(img, { url: img.dataset.atCoverUrl, loaded: !!src && !src.startsWith("data:image/gif;"), pending: null });
      }
      if (active() && !images.get(img).loaded) observer?.observe(img);
    }
    AT.CoverCache.releaseUnused();
    if (!observer) scheduleCheck();
  }

  document.addEventListener("visibilitychange", () => {
    generation++;
    observer?.disconnect();
    for (const record of images.values()) record.pending = null;
    if (active() && root) observe(root);
  });
  window.addEventListener("resize", scheduleCheck, { passive: true });
  window.addEventListener("pagehide", () => {
    closed = true;
    generation++;
    observer?.disconnect();
    fallbackHost?.removeEventListener("scroll", scheduleCheck);
    if (frame !== null) window.cancelAnimationFrame(frame);
    images.clear();
    root = null;
  });
  AT.LibraryCoverLoader = { observe };
})();
