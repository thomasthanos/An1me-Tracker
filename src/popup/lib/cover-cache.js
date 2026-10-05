// cover-cache.js — in-memory/storage cache for anime cover images.
(function () {
  "use strict";

  const AT = (window.AnimeTracker = window.AnimeTracker || {});

  const CACHE_NAME = "at-covers-v1";
  // Below this there is nothing worth reclaiming and a prune would just cost a keys() walk.
  const PRUNE_MIN_ENTRIES = 40;
  const MAX_ACTIVE_JOBS = 3;
  const mem = new Map();
  const retired = new Set();
  const pending = new Map();
  const queue = [];
  let activeJobs = 0;
  let retained = null;
  let closed = false;

  function cachesAvailable() {
    return typeof self !== "undefined" && self.caches && typeof self.caches.open === "function";
  }

  async function openCache() {
    try {
      return await self.caches.open(CACHE_NAME);
    } catch {
      return null;
    }
  }

  function isAn1meUrl(url) {
    try {
      const host = new URL(url, location.href).hostname.toLowerCase();
      return host === "an1me.to" || host.endsWith(".an1me.to");
    } catch {
      return false;
    }
  }

  function canWork() {
    return !closed && !document.hidden && document.visibilityState !== "hidden";
  }

  function isCurrent(job) {
    return job.valid && !job.controller.signal.aborted && canWork() && (retained === null || retained.has(job.url));
  }

  function revoke(objectUrl) {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {}
  }

  function releaseUnused() {
    if (!retired.size) return;
    const mounted = new Set(Array.from(document.querySelectorAll("img.at-cover"), (img) => img.getAttribute("src") || img.src));
    for (const objectUrl of retired) {
      // A card can remain mounted until the following render finishes. Revoking its
      // source during retention would break an image that is still on screen.
      if (mounted.has(objectUrl)) continue;
      revoke(objectUrl);
      retired.delete(objectUrl);
    }
  }

  function invalidate(job) {
    job.valid = false;
    job.controller.abort();
  }

  function cancelPending() {
    for (const job of pending.values()) invalidate(job);
    while (queue.length) {
      const job = queue.shift();
      pending.delete(job.url);
      job.finish();
    }
  }

  async function fetchViaAn1meGateway(url, signal) {
    if (signal.aborted) return null;
    const reply = await new Promise((resolve) => {
      // A dispatched background transfer has no cancellation RPC. Keep its slot
      // until the reply, including after hiding, so resumed work cannot overlap it.
      try {
        chrome.runtime.sendMessage({ type: "AN1ME_GATEWAY_FETCH", url, as: "dataUrl", timeoutMs: 15000 }, (r) => {
          void chrome.runtime.lastError;
          resolve(r || null);
        });
      } catch {
        resolve(null);
      }
    });
    if (signal.aborted || !reply || !reply.ok || typeof reply.dataUrl !== "string" || !reply.dataUrl.startsWith("data:image/")) return null;
    try {
      return await (await fetch(reply.dataUrl, { signal })).blob();
    } catch {
      return null;
    }
  }

  async function runJob(job) {
    const cache = await openCache();
    if (!cache || !isCurrent(job)) return;
    try {
      const hit = await cache.match(job.url);
      if (!isCurrent(job)) return;
      if (hit) {
        const blob = await hit.blob();
        if (!isCurrent(job)) return;
        if (blob && blob.size > 0) {
          mem.set(job.url, URL.createObjectURL(blob));
          return;
        }
      }
    } catch {}
    if (!isCurrent(job)) return;

    if (globalThis.AnimeTrackerWebsiteAccess && !(await globalThis.AnimeTrackerWebsiteAccess.canRun())) return;
    const timeoutId = setTimeout(() => job.controller.abort(), 15000);
    try {
      // an1me.to covers use only the challenge-aware gateway.
      const response = isAn1meUrl(job.url)
        ? await fetchViaAn1meGateway(job.url, job.controller.signal).then((blob) => (blob ? new Response(blob) : null))
        : await fetch(job.url, { credentials: "omit", cache: "force-cache", signal: job.controller.signal });
      if (!response || !response.ok || !isCurrent(job)) return;
      const copy = response.clone();
      const blob = await response.blob();
      if (!isCurrent(job) || !blob || blob.size === 0) return;
      await cache.put(job.url, copy).catch(() => {});
      if (!isCurrent(job)) {
        // CacheStorage writes cannot be aborted. A write already in flight when
        // prune/pagehide runs must remove its own late insertion after settling.
        await cache.delete(job.url).catch(() => {});
        return;
      }
      mem.set(job.url, URL.createObjectURL(blob));
    } catch {}
    finally {
      clearTimeout(timeoutId);
    }
  }

  function pump() {
    if (!canWork()) return;
    while (activeJobs < MAX_ACTIVE_JOBS && queue.length) {
      const job = queue.shift();
      if (!isCurrent(job)) {
        pending.delete(job.url);
        job.finish();
        continue;
      }
      activeJobs++;
      runJob(job).catch(() => {}).finally(() => {
        pending.delete(job.url);
        activeJobs--;
        job.finish();
        pump();
      });
    }
  }

  const CoverCache = {
    resolve(url) {
      if (!url) return url;
      return mem.get(url) || globalThis.AnimeTrackerWebsiteAccess?.imageUrl(url) || url;
    },

    // Retention follows the entire library; warming follows the viewport. Updating
    // this synchronously also invalidates pending results before any disk work.
    retain(validUrls) {
      retained = new Set(validUrls || []);
      for (const job of pending.values()) {
        if (!retained.has(job.url)) invalidate(job);
      }
      for (const [url, objectUrl] of mem) {
        if (retained.has(url)) continue;
        mem.delete(url);
        retired.add(objectUrl);
      }
      releaseUnused();
      pump();
    },

    releaseUnused,

    // The cover store had no eviction at all, so every cover an entry ever pointed at stayed on
    // disk forever - including art replaced by a re-scrape and entries the user deleted. Keyed on
    // "still referenced by the library" rather than on age, because CacheStorage keeps no
    // timestamps to age against.
    async prune(validUrls) {
      this.retain(validUrls);
      if (!cachesAvailable()) return 0;
      const cache = await openCache();
      if (!cache) return 0;
      try {
        const keys = await cache.keys();
        if (keys.length <= PRUNE_MIN_ENTRIES) return 0;
        let removed = 0;
        for (const request of keys) {
          if (retained.has(request.url)) continue;
          if (await cache.delete(request)) removed++;
        }
        return removed;
      } catch {
        return 0;
      }
    },

    async warm(urls) {
      releaseUnused();
      if (!canWork() || !cachesAvailable() || !urls || !urls.length) return;
      const jobs = [];
      for (const url of urls) {
        if (!url || typeof url !== "string" || !url.startsWith("https://")) continue;
        if (mem.has(url) || (retained !== null && !retained.has(url))) continue;
        let job = pending.get(url);
        if (job && (!job.valid || job.controller.signal.aborted)) {
          // A hidden popup can return while an uncancellable gateway reply is pending.
          // Wait for its occupied slot, then warm a fresh job rather than exposing the
          // original URL and bypassing this queue with a native image request.
          jobs.push(job.promise.then(() => this.warm([url])));
          continue;
        }
        if (!job) {
          job = { url, valid: true, controller: new AbortController() };
          job.promise = new Promise((resolve) => { job.finish = resolve; });
          pending.set(url, job);
          queue.push(job);
        }
        jobs.push(job.promise);
      }
      pump();
      await Promise.all(jobs);
    },
  };

  AT.CoverCache = CoverCache;

  // Free the object URLs when the popup/side panel goes away (long side-panel
  // sessions would otherwise hold one blob URL per distinct cover).
  window.addEventListener("pagehide", () => {
    closed = true;
    cancelPending();
    for (const objectUrl of mem.values()) revoke(objectUrl);
    for (const objectUrl of retired) revoke(objectUrl);
    mem.clear();
    retired.clear();
  });
  document.addEventListener("visibilitychange", () => {
    if (!canWork()) cancelPending();
  });
  const releaseAccess = globalThis.AnimeTrackerWebsiteAccess?.subscribe(state => {
    if (!state.allowed) cancelPending();
  });
  window.addEventListener("pagehide", () => releaseAccess?.(), { once: true });
})();
