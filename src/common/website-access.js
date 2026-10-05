// Safari-wide network pause. Local library/progress operations remain available.
// Checks run on startup, explicit setup and permission events, never on a timer.
(function (root) {
  "use strict";
  if (root.AnimeTrackerWebsiteAccess) return;
  let manifest = {};
  try { manifest = (root.browser?.runtime || root.chrome?.runtime)?.getManifest?.() || {}; } catch {}
  const optional = manifest.optional_host_permissions || [];
  const origins = optional.length ? [...new Set([...(manifest.host_permissions || []), ...optional])] : [];
  const enabled = origins.length > 0;
  const KEY = "websiteAccessState";
  const listeners = new Set(), transfers = new Set();
  let state = { version: manifest.version, allowed: !enabled, checking: enabled, blockedOrigins: origins };
  let refreshPromise = null, epoch = 0;
  const worker = typeof document === "undefined";
  const browserApi = root.browser?.permissions;
  const promiseOnly = typeof browserApi?.contains === "function";
  const api = promiseOnly ? browserApi : root.chrome?.permissions;

  function publish(next) {
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    if (!next.allowed) for (const controller of transfers) controller.abort();
    for (const listener of listeners) { try { listener(state); } catch {} }
    if (worker && enabled) root.AnimeTrackerUtils?.storage.set({ [KEY]: state }).catch(() => {});
  }

  function contains(origin) {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 1500);
      const done = value => { clearTimeout(timer); resolve(value === true); };
      try {
        const details = { origins: [origin] };
        const callback = value => done(root.chrome?.runtime?.lastError ? false : value);
        const pending = promiseOnly ? api.contains(details) : api.contains(details, callback);
        if (pending?.then) pending.then(done, () => done(false));
      } catch { done(false); }
    });
  }

  async function readWorkerState() {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 2000);
      const done = response => { clearTimeout(timer); resolve(response?.state || null); };
      try {
        const pending = root.chrome.runtime.sendMessage({ type: "GET_WEBSITE_ACCESS" }, response => {
          const error = root.chrome.runtime.lastError; done(error ? null : response);
        });
        if (pending?.then) pending.then(done, () => done(null));
      } catch { done(null); }
    });
  }

  function refresh() {
    if (!enabled) return Promise.resolve(state);
    if (refreshPromise) return refreshPromise;
    const generation = epoch;
    const run = (async () => {
      let next;
      if (typeof api?.contains === "function") {
        const granted = await Promise.all(origins.map(contains));
        const blockedOrigins = origins.filter((_origin, index) => !granted[index]);
        next = { version: manifest.version, checking: false, allowed: !blockedOrigins.length, blockedOrigins };
      } else if (!worker) {
        next = await readWorkerState();
      }
      if (generation === epoch) publish(next?.version === manifest.version ? next :
        { version: manifest.version, checking: false, allowed: false, blockedOrigins: origins });
      return state;
    })();
    refreshPromise = run;
    run.finally(() => { if (refreshPromise === run) refreshPromise = null; });
    return run;
  }

  function invalidate(event) {
    epoch++;
    refreshPromise = null;
    const removed = (event?.origins || []).filter(origin => origins.includes(origin));
    publish({ version: manifest.version, checking: true, allowed: false,
      blockedOrigins: [...new Set([...state.blockedOrigins, ...removed])] });
    void refresh();
  }

  const deniedError = () => Object.assign(new Error("no site access: tracker network work paused"),
    { code: "SITE_ACCESS_REQUIRED", deferRetry: true, paused: true });
  const canRun = async () => {
    if (state.checking) await refresh();
    return state.allowed;
  };
  const originalFetch = root.fetch;
  if (enabled && typeof originalFetch === "function") {
    // This is the extension's isolated world; the website's own player is unaffected.
    root.fetch = async function (input, options = {}) {
      const url = String(input?.url || input);
      if (!/^https?:/i.test(url)) return originalFetch.call(root, input, options);
      if (!(await canRun())) throw deniedError();
      const controller = new AbortController();
      const abort = () => controller.abort();
      const signal = options.signal;
      if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
      transfers.add(controller);
      try { return await originalFetch.call(root, input, { ...options, signal: controller.signal }); }
      catch (error) { if (!state.allowed) throw deniedError(); throw error; }
      finally { transfers.delete(controller); signal?.removeEventListener("abort", abort); }
    };
  }

  root.AnimeTrackerWebsiteAccess = Object.freeze({ enabled, origins, canRun, refresh,
    getState: () => state, isPaused: () => enabled && !state.allowed, deniedError,
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); } });
  if (enabled) {
    api?.onAdded?.addListener?.(invalidate);
    api?.onRemoved?.addListener?.(invalidate);
    if (!worker) root.chrome?.storage?.onChanged?.addListener?.((changes, area) => {
      const next = changes[KEY]?.newValue;
      if (area === "local" && next?.version === manifest.version) publish(next);
    });
    void refresh();
  }
})(globalThis);
