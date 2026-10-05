// Safari-wide network pause. Local library/progress operations remain available.
// Checks run on startup, explicit setup and permission events, never on a timer.
(function (root) {
  "use strict";
  if (root.AnimeTrackerWebsiteAccess) return;
  let manifest = {};
  try { manifest = (root.browser?.runtime || root.chrome?.runtime)?.getManifest?.() || {}; } catch {}
  const optional = manifest.optional_host_permissions || [];
  const declared = [...(manifest.host_permissions || []), ...optional];
  // The Safari build asks for every website in one pattern, which iOS Settings shows as a single "All Websites"
  // switch: that one grant is the gate. Builds that listed each service as optional need all of them instead.
  const broad = declared.find(origin => origin === "<all_urls>" || origin === "*://*/*");
  const origins = broad ? [broad] : optional.length ? [...new Set(declared)] : [];
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

  function invalidate(event, removal = false) {
    const relevant = (event?.origins || []).some(pattern => pattern === '<all_urls>' || origins.includes(pattern));
    if (!relevant) return;
    epoch++;
    refreshPromise = null;
    const removed = (event?.origins || []).filter(origin => origins.includes(origin));
    // Adding access must not interrupt requests which were already permitted.
    if (removal) publish({ version: manifest.version, checking: true, allowed: false,
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
      const signal = options.signal || input?.signal;
      if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
      transfers.add(controller);
      const finish = () => { transfers.delete(controller); signal?.removeEventListener("abort", abort); };
      controller.signal.addEventListener('abort', finish, { once: true });
      try {
        const response = await originalFetch.call(root, input, { ...options, signal: controller.signal });
        // Fetch resolves at headers. Keep cancellation alive until its body has actually
        // finished, including cloned responses consumed by the cover disk cache.
        if (response.body?.getReader && typeof root.ReadableStream === 'function' && typeof root.Response === 'function') {
          const reader = response.body.getReader();
          const body = new root.ReadableStream({
            async pull(stream) {
              try {
                const chunk = await reader.read();
                if (chunk.done) { finish(); stream.close(); }
                else stream.enqueue(chunk.value);
              } catch (error) { finish(); stream.error(!state.allowed ? deniedError() : error); }
            },
            cancel(reason) { finish(); return reader.cancel(reason); },
          });
          const wrapped = new root.Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
          for (const key of ['url', 'type', 'redirected']) Object.defineProperty(wrapped, key, { value: response[key] });
          return wrapped;
        }
        finish(); return response;
      }
      catch (error) { finish(); if (!state.allowed) throw deniedError(); throw error; }
      // Successful streams release themselves only when consumed/cancelled, not at headers.
    };
  }

  root.AnimeTrackerWebsiteAccess = Object.freeze({ enabled, origins, canRun, refresh,
    getState: () => state, isPaused: () => enabled && !state.allowed, deniedError,
    imageUrl(url, fallback = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7") {
      return enabled && !state.allowed && /^https?:/i.test(String(url)) ? fallback : url;
    },
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); } });
  if (enabled) {
    api?.onAdded?.addListener?.(event => invalidate(event, false));
    api?.onRemoved?.addListener?.(event => invalidate(event, true));
    if (!worker) root.chrome?.storage?.onChanged?.addListener?.((changes, area) => {
      const next = changes[KEY]?.newValue;
      if (area === "local" && next?.version === manifest.version) publish(next);
    });
    void refresh();
    // BFCache can restore the page with changed permissions. Recheck on that event,
    // while leaving the page's local progress writer independent of network cleanup.
    root.addEventListener?.('pagehide', () => { for (const controller of transfers) controller.abort(); });
    root.addEventListener?.('pageshow', event => { if (event.persisted) void refresh(); });
  }
})(globalThis);
