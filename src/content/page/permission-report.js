// permission-report.js — answers the native app's "verify access" request.
//
// The companion app cannot read a WebExtension's host permissions: iOS exposes no public API for that, and
// this build ships without entitlements so SideStore can sign it with any Apple ID. So the app opens
// https://an1me.to/?at_verify=1 in Safari, this script asks the background worker for the verified reading,
// and it hands the answer back by opening an1metracker://state?p=… — which brings the app forward with a
// dated snapshot in hand.
//
// It does nothing at all unless the marker is present, so ordinary visits are untouched.
(function () {
  "use strict";

  const MARKER = "at_verify";
  const SCHEME = "an1metracker";
  const TIMEOUT_MS = 5000;

  const GRANT_MARKER = "at_grant";
  let params = null;
  try {
    params = new URLSearchParams(location.search);
  } catch {
    params = null;
  }

  // ?at_grant=<hosts|all>&at_title=<row> — the app's Allow / Enable Required Access buttons. A content
  // script cannot call permissions.request, so the background moves this tab to the extension's own grant
  // page, where one tap asks Safari and the result is handed back to the app.
  if (params?.has(GRANT_MARKER)) {
    try {
      history.replaceState(null, "", location.pathname + location.hash);
    } catch {}
    try {
      chrome.runtime.sendMessage({
        type: "OPEN_GRANT_PAGE",
        hosts: params.get(GRANT_MARKER) || "all",
        title: params.get("at_title") || "",
      }, () => void chrome.runtime.lastError);
    } catch {}
    return;
  }

  if (!params?.has(MARKER)) return;

  // UTF-8 safe, URL safe base64: JSON.stringify can produce characters btoa alone would reject.
  function encodeBase64Url(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function handOver(payload) {
    try {
      // Drop the marker first, so going back to this page does not report a second time.
      history.replaceState(null, "", location.pathname + location.hash);
    } catch {}
    window.location.href = `${SCHEME}://state?p=${encodeBase64Url(payload)}`;
  }

  // A failure payload carries neither grantedOrigins nor allWebsites. The app reads that as "the extension
  // could not measure this", which is different from — and must never be confused with — "nothing is
  // allowed yet".
  const failed = (reason) => ({ error: String(reason || "unavailable"), capturedAt: Date.now() });

  const timer = setTimeout(() => handOver(failed("timeout")), TIMEOUT_MS);

  try {
    chrome.runtime.sendMessage({ type: "GET_PERMISSION_REPORT" }, (reply) => {
      clearTimeout(timer);
      const error = chrome.runtime.lastError;
      if (error) {
        handOver(failed(error.message));
        return;
      }
      if (!reply?.success || !reply.report) {
        handOver(failed(reply?.error));
        return;
      }
      handOver(reply.report);
    });
  } catch (error) {
    clearTimeout(timer);
    handOver(failed(error?.message || error));
  }
})();
