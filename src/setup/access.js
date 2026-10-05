// access.js — the website access page. The card itself is the popup's (SiteAccess.mountSetup): one tap asks
// Safari, and where that does not work it leads to Settings, then checks again whenever the page is shown.
(function () {
  "use strict";

  const SiteAccess = window.AnimeTracker?.SiteAccess;
  const card = document.getElementById("setupAccess");
  const checking = document.getElementById("setupChecking");
  const done = document.getElementById("setupDone");

  SiteAccess?.mountSetup([card], {
    onRender(missing) {
      checking.hidden = true;
      done.hidden = missing.length > 0;
    },
  });

  // A tab the extension opened may be closed by it; window.close() covers browsers without tabs.getCurrent.
  document.getElementById("setupClose").addEventListener("click", () => {
    try {
      chrome.tabs.getCurrent((tab) => {
        if (tab?.id != null) chrome.tabs.remove(tab.id);
        else window.close();
      });
    } catch {
      window.close();
    }
  });
})();
