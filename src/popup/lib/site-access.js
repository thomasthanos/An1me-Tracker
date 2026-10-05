// site-access.js — whether the browser lets the extension reach the filler sites, and how to allow them.
//
// Safari lists every host from the manifest under the extension's settings, each Allow, Ask or Deny; there is
// no "All Websites" switch for an extension that names its hosts. A host left on Ask still answers requests
// that its own CORS headers allow, which is why sign-in, cloud sync and Jikan keep working there. AnimeFillerList
// sends no CORS headers, so it can only be read with Allow, and every filler lookup fails as "no site access"
// until then. Jikan is asked for too: with Allow its real errors (a 429, a 5xx) come through instead of a bare
// "Load failed". Chrome grants hosts at install but lets the user withhold them per site; the check covers it.
// Safari shows its own prompt for hosts the manifest declares optional (the Safari build declares these two that
// way, see dev/scripts/package.js) once the extension requests them; for required hosts it shows nothing.
(function () {
  "use strict";

  const GROUPS = Object.freeze([
    { id: "filler", label: "Filler data", origins: ["https://www.animefillerlist.com/*", "https://api.jikan.moe/*"] },
  ]);

  const SETTINGS_PATH = "Settings → Apps → Safari → Extensions → An1me.to Tracker";

  function permissionsApi() {
    const api = globalThis.chrome?.permissions;
    return typeof api?.contains === "function" ? api : null;
  }

  // The name Safari shows for the host in the extension's settings.
  function hostLabel(origin) {
    return String(origin).replace(/^https?:\/\//, "").replace(/\/\*$/, "").replace(/^www\./, "");
  }

  // Whether the browser says the extension may reach `origin`. Any doubt (an error, no answer) counts as allowed:
  // a false alarm would send the user hunting for a setting that is already right.
  function isAllowed(api, origin) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(true), 1500);
      const done = (granted) => { clearTimeout(timer); resolve(granted !== false); };
      try {
        const pending = api.contains({ origins: [origin] }, done);
        if (pending && typeof pending.then === "function") pending.then(done, () => done(true));
      } catch {
        done(true);
      }
    });
  }

  // The needed origins the browser keeps the extension off, in GROUPS order. Empty without a permissions API.
  async function blockedOrigins() {
    const api = permissionsApi();
    if (!api) return [];
    const all = GROUPS.flatMap((group) => group.origins);
    const allowed = await Promise.all(all.map((origin) => isAllowed(api, origin)));
    return all.filter((_origin, index) => !allowed[index]);
  }

  // Must run straight from a click: browsers only show the permission prompt for a user gesture. Calls back
  // once, with true when granted; false when refused, unsupported or failed.
  function request(origins, callback) {
    const api = permissionsApi();
    let settled = false;
    // A browser can answer through both the callback and the promise; act on the first answer only.
    const settle = (granted) => {
      if (settled) return;
      settled = true;
      callback(granted === true);
    };
    if (typeof api?.request !== "function" || !origins.length) {
      settle(false);
      return;
    }
    try {
      const pending = api.request({ origins }, settle);
      if (pending && typeof pending.then === "function") pending.then(settle, () => settle(false));
    } catch {
      settle(false);
    }
  }

  // The filler origins this build declares optional, which Safari will prompt for when requested.
  function optionalOrigins() {
    let declared = [];
    try {
      declared = globalThis.chrome?.runtime?.getManifest?.()?.optional_host_permissions || [];
    } catch {}
    return GROUPS.flatMap((group) => group.origins).filter((origin) => declared.includes(origin));
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
    const origins = optionalOrigins();
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
      request(blocked, (granted) => {
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

  window.AnimeTracker = window.AnimeTracker || {};
  window.AnimeTracker.SiteAccess = Object.freeze({ GROUPS, SETTINGS_PATH, hostLabel, blockedOrigins, request, askIfOptional, render });
})();
