// grant.js — the extension page behind the iOS app's "Allow" and "Enable Required Access" buttons.
//
// The app cannot call browser.permissions.request; only extension pages can, and only from a user gesture.
// So the app opens https://an1me.to/?at_grant=<hosts|all>, the content script there asks the background to
// move the tab here, and this page shows one button. Its tap calls permissions.request() for exactly the
// requested origins — never more than the manifest declares — which is what makes Safari show its own
// "would like to access …" prompt. Whatever the user answers, a fresh permission report is handed back to
// the app through an1metracker://state?p=…, the same channel as the verify flow.
(function () {
  "use strict";

  const SCHEME = "an1metracker";
  const runtime = (globalThis.browser || globalThis.chrome).runtime;
  const promiseApi = typeof globalThis.browser?.permissions?.request === "function";
  const permissions = promiseApi ? globalThis.browser.permissions : globalThis.chrome?.permissions;
  const $ = (id) => document.getElementById(id);

  const isBroad = (origin) => origin === "<all_urls>" || origin === "*://*/*";
  const manifest = runtime.getManifest();
  const declared = [...new Set([...(manifest.host_permissions || []), ...(manifest.optional_host_permissions || [])])]
    .filter((origin) => !isBroad(origin));
  const hostOf = (origin) => origin.replace(/^https?:\/\//, "").replace(/\/\*$/, "");

  const params = new URLSearchParams(location.search);
  const wanted = (params.get("hosts") || "all").split(",").map((value) => value.trim()).filter(Boolean);
  // Only declared origins can be requested; anything else in the link is ignored.
  const origins = wanted.includes("all") ? declared : declared.filter((origin) => wanted.includes(hostOf(origin)));
  const title = (params.get("title") || "").trim();

  function encodeBase64Url(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function report() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: "timeout", capturedAt: Date.now() }), 5000);
      try {
        runtime.sendMessage({ type: "GET_PERMISSION_REPORT" }, (reply) => {
          clearTimeout(timer);
          const error = globalThis.chrome?.runtime?.lastError;
          resolve(!error && reply?.success && reply.report ? reply.report
            : { error: String(error?.message || reply?.error || "unavailable"), capturedAt: Date.now() });
        });
      } catch (error) {
        clearTimeout(timer);
        resolve({ error: String(error?.message || error), capturedAt: Date.now() });
      }
    });
  }

  function returnWith(payload) {
    location.href = `${SCHEME}://state?p=${encodeBase64Url(payload)}`;
  }

  async function returnToApp() {
    $("grantAllow").disabled = true;
    $("grantCancel").disabled = true;
    returnWith(await report());
  }

  const stillAsking = (payload) => payload?.allWebsites ? [] :
    origins.filter((origin) => !(payload?.grantedOrigins || []).includes(origin));

  // Never claims success without evidence: the page reports what the background measured after the tap.
  async function verifyAndReturn() {
    $("grantAllow").disabled = true;
    $("grantCancel").disabled = true;
    const payload = await report();
    const missing = stillAsking(payload);
    if (missing.length) {
      setStatus(`Safari still has ${missing.length === 1 ? "1 website" : `${missing.length} websites`} not allowed. ` +
        "Returning to the app…", true);
      setTimeout(() => returnWith(payload), 1200);
      return;
    }
    setStatus("Allowed. Returning to the app…");
    returnWith(payload);
  }

  function setStatus(text, error = false) {
    $("grantStatus").textContent = text;
    $("grantStatus").classList.toggle("error", error);
  }

  $("grantTitle").textContent = title ? `Allow access for ${title}` : "Allow website access";
  const list = $("grantHosts");
  for (const origin of origins) {
    const item = document.createElement("li");
    item.textContent = hostOf(origin);
    list.append(item);
  }

  if (!origins.length || typeof permissions?.request !== "function") {
    $("grantDetail").textContent = origins.length
      ? "This version of Safari cannot ask for website access from here."
      : "Nothing to allow: these websites are not used by this version.";
    $("grantAllow").hidden = true;
    $("grantCancel").textContent = "Back to An1me Tracker";
  }

  // request() must be called synchronously inside the tap handler: Safari only shows its prompt for a
  // request that carries the user's gesture, so nothing is awaited before it.
  $("grantAllow").addEventListener("click", () => {
    $("grantAllow").disabled = true;
    setStatus("Waiting for Safari…");
    let pending;
    const settle = (granted, error) => {
      if (!granted && !error) {
        setStatus("Not allowed. Returning to the app…", true);
        void returnToApp();
        return;
      }
      void verifyAndReturn();
    };
    try {
      const details = { origins };
      pending = promiseApi ? permissions.request(details)
        : permissions.request(details, (granted) => settle(granted === true, globalThis.chrome?.runtime?.lastError));
    } catch (error) {
      settle(false, error);
      return;
    }
    if (pending?.then) pending.then((granted) => settle(granted === true), (error) => settle(false, error));
  });
  $("grantCancel").addEventListener("click", () => void returnToApp());
})();
