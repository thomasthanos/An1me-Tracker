// player-dom.js — finds the player across the page and its same-origin iframes. The video can sit in
// the page (ArtPlayer) or inside an embed iframe (Plyr), so every lookup searches both.
(function () {
  "use strict";

  const AT = (window.AnimeTrackerContent = window.AnimeTrackerContent || {});

  // The page first (or `first`, e.g. the video's own document), then each readable iframe document.
  function documents(first = null) {
    const docs = [];
    const add = (doc) => {
      if (doc && !docs.includes(doc)) docs.push(doc);
    };
    add(first);
    add(document);
    for (const iframe of document.querySelectorAll("iframe")) {
      try {
        add(iframe.contentDocument || iframe.contentWindow?.document);
      } catch {}
    }
    return docs;
  }

  function iframeDocuments() {
    return documents().filter((doc) => doc !== document);
  }

  function query(selector, first = null) {
    for (const doc of documents(first)) {
      try {
        const node = doc.querySelector(selector);
        if (node) return node;
      } catch {}
    }
    return null;
  }

  // Loaded and laid out: a video that has metadata, a real duration and is not hidden.
  function isVideoActive(video) {
    if (!video) return false;
    try {
      return (
        video.readyState > 0 &&
        video.duration > 0 &&
        video.duration < 100000 &&
        (video.offsetParent !== null || video.getBoundingClientRect().width > 50 || video.style.display !== "none")
      );
    } catch {
      return false;
    }
  }

  // The playing episode's video: the page's ArtPlayer video, any active page video, then inside each
  // iframe the Plyr video, the ArtPlayer video, or any active video.
  function findVideo() {
    const { SELECTORS } = AT.CONFIG;
    const pageVideo = document.querySelector(SELECTORS.VIDEO);
    if (isVideoActive(pageVideo)) return pageVideo;
    for (const video of document.querySelectorAll(SELECTORS.VIDEO_FALLBACK)) {
      if (isVideoActive(video)) return video;
    }
    for (const doc of iframeDocuments()) {
      try {
        const plyrVideo = doc.querySelector(SELECTORS.PLYR_WRAP)?.querySelector(SELECTORS.VIDEO_FALLBACK);
        if (isVideoActive(plyrVideo)) return plyrVideo;
        const artVideo = doc.querySelector(SELECTORS.VIDEO);
        if (isVideoActive(artVideo)) return artVideo;
        for (const video of doc.querySelectorAll("video")) {
          if (isVideoActive(video)) return video;
        }
      } catch {}
    }
    return null;
  }

  // Any video element, ready or not (for hooks that wait for its metadata).
  function findAnyVideo() {
    for (const doc of documents()) {
      try {
        const video = doc.querySelector("video.art-video") || doc.querySelector("video");
        if (video) return video;
      } catch {}
    }
    return null;
  }

  function ensurePositioned(element) {
    try {
      if (getComputedStyle(element).position === "static") element.style.position = "relative";
    } catch {}
  }

  // Where overlays (toasts, the resume prompt) mount so they stay visible in fullscreen: the player
  // inside an embed iframe when there is one, otherwise the page body.
  function overlayTarget() {
    for (const doc of iframeDocuments()) {
      try {
        const player = doc.querySelector(".art-video-player") || doc.querySelector(".artplayer-app") || doc.querySelector(".plyr__video-wrapper");
        if (player) {
          ensurePositioned(player);
          return { doc, container: player };
        }
        const parent = doc.querySelector("video")?.parentElement;
        if (parent) {
          ensurePositioned(parent);
          return { doc, container: parent };
        }
      } catch {}
    }
    return { doc: document, container: document.body };
  }

  AT.PlayerDom = Object.freeze({ documents, query, isVideoActive, findVideo, findAnyVideo, overlayTarget });
})();
