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

  // Whether the browser says the extension may reach `origin`. Any doubt (an error, no answer) counts as allowed:
  // a false alarm would send the user hunting for a setting that is already right.
  function isAllowed(provider, origin, unknown = true) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(unknown), 1500);
      const done = (granted) => { clearTimeout(timer); resolve(typeof granted === "boolean" ? granted : unknown); };
      try {
        const details = { origins: [origin] };
        const pending = provider.promiseOnly ? provider.api.contains(details) : provider.api.contains(details, done);
        if (pending && typeof pending.then === "function") pending.then(done, () => done(unknown));
      } catch {
        done(unknown);
      }
    });
  }

  // The needed origins the browser keeps the extension off, in GROUPS order. Empty without a permissions API.
  async function blockedOrigins() {
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
      const pending = provider.promiseOnly ? provider.api.request(details) : provider.api.request(details, settle);
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
    const optional = optionalOrigins();
    return blocked.length > 0 && blocked.every((origin) => optional.includes(origin));
  }

  // Asks for the optional filler sites straight from a tap that is about to need them (Fetch & Import): Safari
  // shows its prompt only for those not granted yet, and answers at once for the rest. Calls back once, with
  // true when everything asked for is allowed; at once with true where nothing is optional (Chrome).
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
  async function render(container, { onGranted = null } = {}) {
    if (!container) return [];
    const blocked = await blockedOrigins();
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

    container.append(el("p", "site-access-text", "The browser is keeping the extension off the filler sites, so filler data cannot be fetched."));

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
      request(phone ? declaredOptionalOrigins() : blocked, (granted) => {
        if (!granted) {
          fallback.hidden = false;
          return;
        }
        container.hidden = true;
        if (typeof onGranted === "function") onGranted();
      });
    });
    return blocked;
  }

  const setupGenerations = new WeakMap();

  async function renderSetup(containers) {
    const targets = (Array.isArray(containers) ? containers : [containers]).filter(Boolean);
    const tokens = targets.map(container => {
      const token = {}; setupGenerations.set(container, token); return token;
    });
    const origins = globalThis.AnimeTrackerUtils?.isMobileDevice?.() ? declaredOptionalOrigins() : [];
    const provider = permissionsApi();
    const granted = provider ? await Promise.all(origins.map(origin => isAllowed(provider, origin, false))) : origins.map(() => false);
    const missing = origins.filter((_origin, index) => !granted[index]);
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
        element("p", "site-access-text", "Allow the websites used for metadata, covers, Skip Outro and cloud sync in one setup step."));
      const details = element("details", "site-access-hosts");
      details.append(element("summary", null, `${missing.length} websites need access`));
      const list = element("ul");
      missing.forEach(origin => list.append(element("li", null, hostLabel(origin))));
      details.append(list); container.append(details);
      const steps = element("ol", "site-access-steps");
      steps.append(element("li", null, `Open ${SETTINGS_PATH}.`),
        element("li", null, "Under Permissions, choose Allow for the websites listed above."),
        element("li", null, "Return to Safari and reopen the tracker."));
      steps.hidden = typeof provider?.api?.request === "function";
      if (steps.hidden) {
        const button = element("button", "site-access-btn", "Allow website access");
        button.type = "button";
        button.addEventListener("click", () => {
          button.disabled = true;
          request(missing, allowed => {
            if (allowed) { void renderSetup(targets); }
            else { button.disabled = false; steps.hidden = false; }
          });
        });
        container.append(button);
      }
      container.append(steps);
    });
    return missing;
  }

  function mountSetup(containers) {
    const targets = (Array.isArray(containers) ? containers : [containers]).filter(Boolean);
    let disposed = false;
    const refresh = () => { if (!disposed) void renderSetup(targets); };
    const provider = globalThis.AnimeTrackerUtils?.isMobileDevice?.() ? permissionsApi() : null;
    const events = [provider?.api?.onAdded, provider?.api?.onRemoved].filter(Boolean);
    events.forEach(event => event.addListener?.(refresh));
    const dispose = () => {
      disposed = true;
      targets.forEach(container => setupGenerations.delete(container));
      events.forEach(event => event.removeListener?.(refresh));
      window.removeEventListener("beforeunload", dispose);
    };
    window.addEventListener("beforeunload", dispose, { once: true });
    refresh();
    return dispose;
  }

  window.AnimeTracker = window.AnimeTracker || {};
  window.AnimeTracker.SiteAccess = Object.freeze({ GROUPS, SETTINGS_PATH, hostLabel, blockedOrigins, request, askIfOptional, render, renderSetup, mountSetup });
})();
