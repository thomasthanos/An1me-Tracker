// Safari's supporting hosts are optional in the packaged manifest so an explicit tap can request them together.
// Setup only checks permission state; it does no fetching, polling or storage migration.
(function () {
  "use strict";

  const GROUPS = Object.freeze([
    { id: "filler", label: "Filler data", origins: ["https://www.animefillerlist.com/*", "https://api.jikan.moe/*"] },
  ]);

  const SETTINGS_PATH = "Settings → Apps → Safari → Extensions → An1me.to Tracker";

  function permissionsApi() {
    // browser.* uses promises only; chrome.* accepts callbacks. Safari exposes the former too.
    const browserApi = globalThis.browser?.permissions;
    if (typeof browserApi?.contains === "function") return { api: browserApi, promiseOnly: true };
    const api = globalThis.chrome?.permissions;
    return typeof api?.contains === "function" ? { api, promiseOnly: false } : null;
  }

  // The name Safari shows for the host in the extension's settings.
  function hostLabel(origin) {
    return String(origin).replace(/^https?:\/\//, "").replace(/\/\*$/, "").replace(/^www\./, "");
  }

  // Legacy filler notices avoid false alarms when the API cannot answer. First-run setup instead keeps
  // unknown hosts visible, so unavailable APIs still lead to manual instructions.
  function isAllowed(provider, origin, unknown = true) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(unknown), 1500);
      const done = (granted) => { clearTimeout(timer); resolve(typeof granted === "boolean" ? granted : unknown); };
      try {
        const details = { origins: [origin] };
        const callbackDone = granted => {
          const error = globalThis.chrome?.runtime?.lastError;
          done(error ? unknown : granted);
        };
        const pending = provider.promiseOnly ? provider.api.contains(details) : provider.api.contains(details, callbackDone);
        if (pending && typeof pending.then === "function") pending.then(done, () => done(unknown));
      } catch {
        done(unknown);
      }
    });
  }

  // The needed origins the browser keeps the extension off, in GROUPS order. Empty without a permissions API.
  async function blockedOrigins() {
    if (globalThis.AnimeTrackerWebsiteAccess?.enabled) {
      await globalThis.AnimeTrackerWebsiteAccess.canRun();
      return globalThis.AnimeTrackerWebsiteAccess.getState().blockedOrigins;
    }
    const provider = permissionsApi();
    if (!provider) return [];
    const all = GROUPS.flatMap((group) => group.origins);
    const allowed = await Promise.all(all.map((origin) => isAllowed(provider, origin)));
    return all.filter((_origin, index) => !allowed[index]);
  }

  // Must run straight from a click: browsers only show the permission prompt for a user gesture. Calls back
  // once, with true when granted; false when refused, unsupported or failed.
  function request(origins, callback) {
    const provider = permissionsApi();
    let settled = false;
    let timer = null;
    // A browser can answer through both the callback and the promise; act on the first answer only.
    const settle = (granted) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (granted === true) void globalThis.AnimeTrackerWebsiteAccess?.refresh();
      callback(granted === true);
    };
    if (typeof provider?.api?.request !== "function" || !origins.length) {
      settle(false);
      return;
    }
    try {
      // A missing callback must not leave the access button disabled forever. Late grants
      // are picked up by the permission event listener even after this bounded wait.
      timer = setTimeout(() => settle(false), 30_000);
      const details = { origins };
      const callbackDone = granted => {
        const error = globalThis.chrome?.runtime?.lastError;
        settle(error ? false : granted);
      };
      const pending = provider.promiseOnly ? provider.api.request(details) : provider.api.request(details, callbackDone);
      if (pending && typeof pending.then === "function") pending.then(settle, () => settle(false));
    } catch {
      settle(false);
    }
  }

  function declaredOptionalOrigins() {
    let declared = [];
    try {
      const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
      declared = runtime?.getManifest?.()?.optional_host_permissions || [];
    } catch {}
    return [...new Set(Array.isArray(declared) ? declared.filter(origin => typeof origin === "string") : [])];
  }

  function optionalOrigins() {
    const declared = declaredOptionalOrigins();
    return GROUPS.flatMap((group) => group.origins).filter(origin => declared.includes(origin));
  }

  // A desktop browser shows its prompt for any host the user withheld. Safari on iPhone and iPad prompts only for
  // optional hosts: asking for required ones changed nothing there and left the notice up.
  function canAskInPlace(blocked) {
    if (!globalThis.AnimeTrackerUtils?.isMobileDevice?.()) return true;
    const optional = declaredOptionalOrigins();
    return blocked.length > 0 && blocked.every((origin) => optional.includes(origin));
  }

  // Request the supporting services together, directly from a tap. Safari controls its consent UI.
  // Chrome keeps required hosts, so with no optional services there is no additional request.
  function askIfOptional(callback) {
    const origins = declaredOptionalOrigins();
    if (!origins.length) {
      callback(true);
      return;
    }
    request(origins, callback);
  }

  // Fills `container` with which filler sites are blocked and how to allow them, or hides it when none are.
  // On a desktop browser it offers Allow access, and `onGranted` runs once the user allowed them. Resolves to
  // the blocked origins.
  async function render(container, { onGranted = null, knownBlockedOrigins = null } = {}) {
    if (!container) return [];
    const token = {};
    setupGenerations.set(container, token);
    const all = [...new Set([...GROUPS.flatMap(group => group.origins), ...declaredOptionalOrigins(),
      ...(globalThis.AnimeTrackerWebsiteAccess?.origins || [])])];
    const blocked = Array.isArray(knownBlockedOrigins)
      ? all.filter(origin => knownBlockedOrigins.includes(origin)) : await blockedOrigins();
    if (setupGenerations.get(container) !== token || !container.isConnected) return blocked;
    container.replaceChildren();
    container.hidden = blocked.length === 0;
    if (!blocked.length) return blocked;

    const doc = container.ownerDocument;
    const el = (tag, className, text) => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    };
    const hosts = blocked.map(hostLabel);
    const strongHosts = (parent) => hosts.forEach((host, index) => {
      if (index) parent.append(doc.createTextNode(index === hosts.length - 1 ? " and " : ", "));
      parent.append(el("strong", null, host));
    });

    container.append(el("p", "site-access-text", "Online work is paused until the tracker has access to every required website. Local progress and saved data remain available."));

    const phone = !!globalThis.AnimeTrackerUtils?.isMobileDevice?.();
    // Where the settings are the only way (on a phone), the steps; elsewhere, where to look if the prompt is refused.
    const fallback = phone ? el("ol", "site-access-steps") : el("p", "site-access-path",
      `If no prompt appears, allow ${hosts.join(" and ")} in the extension's site access settings.`);
    if (phone) {
      fallback.append(el("li", null, `Open ${SETTINGS_PATH} (the Safari Settings button in the An1me Tracker app opens it).`));
      const allow = el("li");
      allow.append(doc.createTextNode("Under Permissions, tap "));
      strongHosts(allow);
      allow.append(doc.createTextNode(" and choose Allow for each."));
      fallback.append(allow, el("li", null, "Come back and run Fetch & Import again."));
    }

    if (!canAskInPlace(blocked)) {
      container.append(fallback);
      return blocked;
    }

    const line = el("p", "site-access-text");
    line.append(doc.createTextNode("Blocked: "));
    strongHosts(line);
    line.append(doc.createTextNode("."));
    container.append(line);
    const button = el("button", "site-access-btn", "Allow access");
    button.type = "button";
    container.append(button);
    fallback.hidden = true;
    container.append(fallback);

    button.addEventListener("click", () => {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = phone ? "Waiting for Safari…" : "Waiting for browser…";
      button.setAttribute("aria-busy", "true");
      request(phone ? declaredOptionalOrigins() : blocked, async (granted) => {
        if (setupGenerations.get(container) !== token || !container.isConnected) return;
        button.disabled = false;
        button.textContent = "Allow access";
        button.removeAttribute("aria-busy");
        if (!granted) {
          fallback.hidden = false;
          return;
        }
        if (globalThis.AnimeTrackerWebsiteAccess?.enabled) {
          await globalThis.AnimeTrackerWebsiteAccess.refresh();
          if (setupGenerations.get(container) !== token || !container.isConnected) return;
          if (globalThis.AnimeTrackerWebsiteAccess.isPaused()) {
            await render(container, { onGranted, knownBlockedOrigins: globalThis.AnimeTrackerWebsiteAccess.getState().blockedOrigins });
            return;
          }
        }
        container.hidden = true;
        if (typeof onGranted === "function") onGranted();
      });
    });
    return blocked;
  }

  const setupGenerations = new WeakMap();

  // The An1me Tracker app opens the extension's own page in Settings when Safari hands it this link (iOS app 8.2.10+).
  const APP_SETTINGS_URL = "an1metracker://safari-settings";
  // Set once Safari has been asked and the websites are still not allowed: on iPhone the prompt can answer
  // without changing anything, and offering the same button again only sent the user round in circles.
  const PROMPT_FAILED_KEY = "siteAccessPromptFailedAt";
  let promptFailedInMemory = false;

  function promptFailed() {
    if (promptFailedInMemory) return true;
    try { return !!localStorage.getItem(PROMPT_FAILED_KEY); } catch { return false; }
  }

  function notePromptFailed() {
    promptFailedInMemory = true;
    try { localStorage.setItem(PROMPT_FAILED_KEY, String(Date.now())); } catch {}
  }

  function clearPromptFailed() {
    promptFailedInMemory = false;
    try { localStorage.removeItem(PROMPT_FAILED_KEY); } catch {}
  }

  // The iPhone app can take the user straight to the extension's settings; elsewhere there is no app to ask.
  function canOpenSettingsFromApp() {
    return !!globalThis.AnimeTrackerUtils?.isMobileDevice?.() && declaredOptionalOrigins().length > 0;
  }

  // The websites to allow on this device: every website the tracker uses where Safari gates them (the Safari
  // build), nothing elsewhere.
  function setupOrigins() {
    const access = globalThis.AnimeTrackerWebsiteAccess;
    if (access?.enabled) return access.origins;
    return globalThis.AnimeTrackerUtils?.isMobileDevice?.() ? declaredOptionalOrigins() : [];
  }

  async function missingSetupOrigins() {
    const origins = setupOrigins();
    const provider = permissionsApi();
    const granted = provider ? await Promise.all(origins.map(origin => isAllowed(provider, origin, false))) : origins.map(() => false);
    return origins.filter((_origin, index) => !granted[index]);
  }

  // `onRender` hears the websites still missing after every render, including the one after a tap.
  async function renderSetup(containers, options = {}) {
    const targets = (Array.isArray(containers) ? containers : [containers]).filter(Boolean);
    const tokens = targets.map(container => {
      const token = {}; setupGenerations.set(container, token); return token;
    });
    const provider = permissionsApi();
    const missing = await missingSetupOrigins();
    if (!missing.length) clearPromptFailed();
    targets.forEach((container, index) => {
      if (setupGenerations.get(container) !== tokens[index] || !container.isConnected) return;
      container.replaceChildren(); container.hidden = !missing.length;
      if (!missing.length) return;
      const doc = container.ownerDocument;
      const element = (tag, className, text) => {
        const node = doc.createElement(tag); if (className) node.className = className;
        if (text != null) node.textContent = text; return node;
      };
      container.append(element("p", "site-access-title", "Safari website access"),
        element("p", "site-access-text", "Online work is paused until all required websites are allowed. Local progress is still saved. Allow metadata, covers, Skip Outro and cloud sync together."));
      const details = element("details", "site-access-hosts");
      details.append(element("summary", null, `${missing.length} websites need access`));
      const list = element("ul");
      missing.forEach(origin => list.append(element("li", null, hostLabel(origin))));
      details.append(list); container.append(details);

      const fromApp = canOpenSettingsFromApp();
      const settings = element("a", "site-access-link", "Open Safari Settings");
      settings.href = APP_SETTINGS_URL;
      const steps = element("ol", "site-access-steps");
      steps.append(element("li", null, fromApp ? `Tap Open Safari Settings, or open ${SETTINGS_PATH}.` : `Open ${SETTINGS_PATH}.`),
        element("li", null, "Under Permissions, set each website listed above to Allow."),
        element("li", null, "Come back to Safari. This card checks again by itself."));
      const requestable = missing.filter(origin => declaredOptionalOrigins().includes(origin));
      const canRequest = typeof provider?.api?.request === "function" && requestable.length > 0;
      container.append(steps, settings);
      let button = null;
      // Settings first once a prompt has not worked, or where the extension cannot ask at all; the prompt
      // then stays below as a second try.
      const showSettings = (show) => {
        steps.hidden = !show;
        settings.hidden = !show || !fromApp;
        if (show) details.open = true;
        button?.classList.toggle("is-secondary", show);
      };
      if (canRequest) {
        button = element("button", "site-access-btn", "Allow website access");
        button.type = "button";
        button.addEventListener("click", () => {
          if (button.disabled) return;
          button.disabled = true;
          button.textContent = "Waiting for Safari…";
          button.setAttribute("aria-busy", "true");
          request(requestable, async allowed => {
            if (setupGenerations.get(container) !== tokens[index] || !container.isConnected) return;
            if (!allowed) {
              notePromptFailed();
              button.disabled = false; button.textContent = "Allow website access";
              button.removeAttribute("aria-busy"); showSettings(true);
              return;
            }
            // Safari can say yes and still leave the websites on Ask. Check what it actually did.
            const stillMissing = (await missingSetupOrigins()).filter(origin => requestable.includes(origin));
            if (stillMissing.length) notePromptFailed();
            void globalThis.AnimeTrackerWebsiteAccess?.refresh();
            void renderSetup(targets, options);
          });
        });
        container.append(button);
      }
      showSettings(!canRequest || promptFailed());
    });
    if (typeof options.onRender === "function") options.onRender(missing);
    return missing;
  }

  const mountedSetups = new Set();

  function refreshSetup() {
    for (const refresh of mountedSetups) refresh();
  }

  function mountSetup(containers, { onRender = null } = {}) {
    const targets = (Array.isArray(containers) ? containers : [containers]).filter(Boolean);
    let disposed = false;
    const refresh = () => {
      if (!disposed) void renderSetup(targets, { onRender: missing => { if (!disposed && typeof onRender === "function") onRender(missing); } });
    };
    const provider = globalThis.AnimeTrackerWebsiteAccess?.enabled || globalThis.AnimeTrackerUtils?.isMobileDevice?.() ? permissionsApi() : null;
    const events = [provider?.api?.onAdded, provider?.api?.onRemoved].filter(Boolean);
    events.forEach(event => event.addListener?.(refresh));
    // Websites are allowed in the Settings app, which sends no permission event back: check again when the
    // page is shown again instead.
    const recheck = () => {
      if (document.visibilityState === "hidden") return;
      void globalThis.AnimeTrackerWebsiteAccess?.refresh?.();
      refresh();
    };
    if (provider) {
      document.addEventListener("visibilitychange", recheck);
      window.addEventListener("pageshow", recheck);
    }
    mountedSetups.add(refresh);
    const dispose = () => {
      disposed = true;
      mountedSetups.delete(refresh);
      targets.forEach(container => setupGenerations.delete(container));
      events.forEach(event => event.removeListener?.(refresh));
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("beforeunload", dispose);
    };
    window.addEventListener("beforeunload", dispose, { once: true });
    refresh();
    const releaseAccess = globalThis.AnimeTrackerWebsiteAccess?.subscribe(state => {
      const controller = window.AnimeTracker?.SyncStatusController;
      if (state.allowed) controller?.clearActivity("site-access");
      else controller?.setActivity("site-access", { label: "Paused — website access required", tone: "error" });
    });
    window.addEventListener("beforeunload", () => releaseAccess?.(), { once: true });
    return dispose;
  }

  window.AnimeTracker = window.AnimeTracker || {};
  window.AnimeTracker.SiteAccess = Object.freeze({ GROUPS, SETTINGS_PATH, APP_SETTINGS_URL, hostLabel, blockedOrigins, request,
    askIfOptional, render, renderSetup, mountSetup, refreshSetup, notePromptFailed });
})();
