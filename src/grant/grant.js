// grant.js — the extension page the app's Approve button lands on.
//
// The app cannot call browser.permissions.request; only extension pages can. Safari iOS, however, often
// resolves request() without showing any sheet (hosts stay at "Ask"), so the page contacts each requested
// host once — Safari surfaces its own native "would like to access …" sheet when the extension actually
// reaches a host. That fetch is what makes the phone show its prompt, and it happens on load so the user
// is not asked to tap a second HTML button.
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

  // The phone's native sheet appears when the extension reaches a host it has not been allowed for. Each
  // requested host is contacted once, no credentials, no body read, with a hard deadline so a silent
  // network can never hang this page.
  async function touch(hosts) {
    await Promise.all(hosts.map((origin) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      return fetch(`https://${hostOf(origin)}/`, {
        method: "GET", mode: "no-cors", credentials: "omit", cache: "no-store", signal: controller.signal,
      }).catch(() => null).finally(() => clearTimeout(timer));
    }));
  }

  // One honest pass: contact the hosts (Safari shows its sheet), then hand back whatever the background
  // measured. The page never claims success it has not observed.
  async function finish() {
    $("grantAllow").disabled = true;
    $("grantCancel").disabled = true;
    setStatus("Checking with Safari…");
    await new Promise((resolve) => setTimeout(resolve, 900));
    const payload = await report();
    const missing = stillAsking(payload);
    if (missing.length) {
      setStatus(`Safari still has ${missing.length === 1 ? "1 website" : `${missing.length} websites`} not allowed. Returning…`, true);
    } else {
      setStatus("Allowed. Returning…");
    }
    setTimeout(() => returnWith(payload), 1200);
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

  // Fallback path — request() must be called synchronously inside a tap so Safari's prompt carries the
  // user's gesture. The async work lives in afterRequest(), after the synchronous request() call.
  function afterRequest() {
    void (async () => { await touch(origins); await finish(); })();
  }

  $("grantAllow").addEventListener("click", () => {
    $("grantAllow").disabled = true;
    setStatus("Waiting for Safari…");
    let pending;
    try {
      const details = { origins };
      pending = promiseApi ? permissions.request(details)
        : permissions.request(details, () => afterRequest());
    } catch {
      afterRequest();
      return;
    }
    if (pending?.then) pending.then(afterRequest, afterRequest);
  });
  $("grantCancel").addEventListener("click", () => void returnToApp());
})();
