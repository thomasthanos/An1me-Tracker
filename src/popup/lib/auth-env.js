// auth-env.js — what this browser offers for sign-in, and how auth errors are read.
(function () {
  "use strict";

  function getRedirectUrl() {
    try {
      return chrome.identity?.getRedirectURL?.() || "";
    } catch {
      return "";
    }
  }

  // Google and AniList sign-in open chrome.identity.launchWebAuthFlow, which only completes on a
  // Chromium-hosted redirect (https://<id>.chromiumapp.org). Browsers without it (Safari has no
  // chrome.identity at all) sign in with email/password and receive the AniList login through cloud sync.
  function supportsWebAuthFlow() {
    if (typeof chrome?.identity?.launchWebAuthFlow !== "function") return false;
    return /^https:\/\/[a-z0-9]+\.chromiumapp\.org(?:\/|$)/.test(getRedirectUrl());
  }

  // The user closed or declined the sign-in window — not an error worth reporting.
  function isAuthCancelled(error) {
    if (error?.code === "auth/popup-closed-by-user" || error?.code === "auth/cancelled-popup-request") return true;
    const message = String((typeof error === "string" ? error : error?.message) || "").toLowerCase();
    return ["did not approve", "cancelled", "canceled", "closed"].some((fragment) => message.includes(fragment));
  }

  // Identity Toolkit errors arrive as "CODE" or "CODE : detail"; returns CODE.
  function authErrorCode(error) {
    const message = typeof error === "string" ? error : error?.message;
    return String(message || "")
      .split(":")[0]
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");
  }

  window.AnimeTracker = window.AnimeTracker || {};
  window.AnimeTracker.AuthEnv = { getRedirectUrl, supportsWebAuthFlow, isAuthCancelled, authErrorCode };
})();
