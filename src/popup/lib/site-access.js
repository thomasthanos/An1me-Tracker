// site-access.js — which of the sites the extension needs the browser lets it reach, and asking for the rest.
//
// Safari lists every host from the manifest under the extension's settings, each Allow, Ask or Deny, and a
// background request to a host left on Ask fails ("no site access"). There is no "All Websites" switch for an
// extension that names its hosts, so the user has to allow each one, or accept the prompt this module raises.
// Chrome grants the hosts at install, but lets the user withhold them per site; the same check covers that.
(function () {
  "use strict";

  // The hosts a phone needs. Covers load as ordinary images and AniList is desktop-only, so they are left out.
  const GROUPS = Object.freeze([
    {
      id: "sync",
      label: "Cloud sync and sign-in",
      origins: ["https://firestore.googleapis.com/*", "https://identitytoolkit.googleapis.com/*", "https://securetoken.googleapis.com/*"],
    },
    { id: "filler", label: "Filler data", origins: ["https://www.animefillerlist.com/*", "https://api.jikan.moe/*"] },
    { id: "outro", label: "Skip Outro", origins: ["https://api.aniskip.com/*"] },
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

  // Must run straight from a tap: browsers only show the permission prompt for a user gesture. Calls back once,
  // with true when granted; false when refused, unsupported or failed.
  function request(origins, callback) {
    const api = permissionsApi();
    let settled = false;
    // Safari can answer through both the callback and the promise; act on the first answer only.
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

  // Fills `container` with what is blocked and an Allow access button, or hides it when nothing is. `onGranted`
  // runs once the user allowed everything that was blocked. Resolves to the blocked origins.
  async function render(container, { onGranted = null, showPath = null } = {}) {
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
    const blockedGroups = GROUPS.filter((group) => group.origins.some((origin) => blocked.includes(origin)));
    container.append(el("p", "site-access-text", "The browser is not letting the extension reach some of the sites it needs:"));
    const list = el("ul", "site-access-list");
    for (const group of blockedGroups) {
      const hosts = group.origins.filter((origin) => blocked.includes(origin)).map(hostLabel).join(", ");
      const item = el("li");
      item.append(el("strong", null, group.label), doc.createTextNode(` (${hosts})`));
      list.append(item);
    }
    container.append(list);

    const button = el("button", "site-access-btn", "Allow access");
    button.type = "button";
    container.append(button);
    const path = el("p", "site-access-path",
      `Or in ${SETTINGS_PATH}, set each of these to Allow: ${blocked.map(hostLabel).join(", ")}.`);
    // The Settings path is the way that always works on an iPhone; show it there, or once a request failed.
    const phone = showPath ?? !!globalThis.AnimeTrackerUtils?.isMobileDevice?.();
    path.hidden = !phone;
    container.append(path);

    button.addEventListener("click", () => {
      request(blocked, (granted) => {
        if (!granted) {
          path.hidden = false;
          return;
        }
        container.hidden = true;
        if (typeof onGranted === "function") onGranted();
      });
    });
    return blocked;
  }

  window.AnimeTracker = window.AnimeTracker || {};
  window.AnimeTracker.SiteAccess = Object.freeze({ GROUPS, SETTINGS_PATH, hostLabel, blockedOrigins, request, render });
})();
