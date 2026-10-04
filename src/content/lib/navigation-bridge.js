// Runs in the page's MAIN world, where the site's history calls are made.
// Shared lifecycle events keep working even after every DOM observer is released.
(function () {
  "use strict";
  if (window.self !== window.top || window.__atNavigationBridgeInstalled) return;
  window.__atNavigationBridgeInstalled = true;
  let lastPath = window.location.pathname;
  const notify = () => {
    const path = window.location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    window.dispatchEvent(new Event("at:locationchange"));
  };
  for (const method of ["pushState", "replaceState"]) {
    const original = window.history[method];
    window.history[method] = function (...args) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
  }
  window.addEventListener("popstate", notify);
})();
