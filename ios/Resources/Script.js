//
//  Script.js — An1me Tracker iOS companion view
//
//  Every interactive element declares its intent in markup:
//      <button data-action="open-url:https://an1me.to">
//      <button data-action="open-settings">
//
//  Messages are forwarded verbatim to the native `controller`
//  handler in ViewController.swift.
//

(function () {
  "use strict";

  var HANDLER = "controller";

  function post(message) {
    try {
      var webkit = window.webkit;
      if (webkit && webkit.messageHandlers && webkit.messageHandlers[HANDLER]) {
        webkit.messageHandlers[HANDLER].postMessage(message);
        return true;
      }
    } catch (error) {
      // Native bridge unavailable (e.g. plain Safari preview).
    }
    return false;
  }

  function onActivate(event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;

    var trigger = target.closest("[data-action]");
    if (!trigger || trigger.disabled) return;

    event.preventDefault();

    var action = trigger.getAttribute("data-action");
    if (!action) return;

    if (!post(action)) {
      // No native bridge: follow the URL ourselves so the page still works.
      if (action.indexOf("open-url:") === 0) {
        var url = action.slice("open-url:".length);
        if (/^https:\/\//i.test(url)) window.location.href = url;
      }
    }
  }

  function init() {
    document.addEventListener("click", onActivate, false);

    // iOS honours :active most reliably with a touch listener present.
    document.addEventListener("touchstart", function () {}, { passive: true });

    // Suppress the callout / text-selection gestures on long press.
    document.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
