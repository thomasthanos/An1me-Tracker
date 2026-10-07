// permission-report.js — answers the native app's "verify" request.
//
// The companion app cannot see into Safari: iOS exposes no API for a WebExtension's site access, and this
// build ships without entitlements so SideStore can sign it with any Apple ID. So the app opens
// https://an1me.to/?at_verify=1 in Safari. This script only runs where Safari lets the extension in, so the
// fact that it runs at all is the evidence: it asks the background worker for its version (proving the
// worker is alive too) and hands both back by opening an1metracker://state?p=… .
//
// It does nothing at all unless the marker is present, so ordinary visits are untouched.
(function () {
  "use strict";

  const MARKER = "at_verify";
  const SCHEME = "an1metracker";
  const TIMEOUT_MS = 5000;

  let requested = false;
  try {
    requested = new URLSearchParams(location.search).has(MARKER);
  } catch {
    requested = false;
  }
  if (!requested) return;

  // UTF-8 safe, URL safe base64: JSON.stringify can produce characters btoa alone would reject.
  function encodeBase64Url(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  let handedOver = false;
  function handOver(extra) {
    if (handedOver) return;
    handedOver = true;
    try {
      // Drop the marker first, so going back to this page does not report a second time.
      history.replaceState(null, "", location.pathname + location.hash);
    } catch {}
    // `site` and `capturedAt` are always present: this script ran on the page. `error` says only that the
    // background worker did not answer, which the app shows separately.
    const payload = { site: String(location.hostname || "an1me.to"), capturedAt: Date.now(), ...extra };
    window.location.href = `${SCHEME}://state?p=${encodeBase64Url(payload)}`;
  }

  const timer = setTimeout(() => handOver({ error: "timeout" }), TIMEOUT_MS);

  try {
    chrome.runtime.sendMessage({ type: "GET_PERMISSION_REPORT" }, (reply) => {
      clearTimeout(timer);
      const error = chrome.runtime.lastError;
      if (error) {
        handOver({ error: String(error.message || error) });
        return;
      }
      if (!reply?.success || !reply.report) {
        handOver({ error: String(reply?.error || "unavailable") });
        return;
      }
      handOver({ extensionVersion: reply.report.extensionVersion });
    });
  } catch (error) {
    clearTimeout(timer);
    handOver({ error: String(error?.message || error) });
  }
})();
