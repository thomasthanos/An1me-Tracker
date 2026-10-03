// player-observer.js — owns the episode's <video>. Finds it (waiting while the player loads), moves
// to the new element when a server switch replaces it, and listens to it once on behalf of every
// module: subscribers get "video" when an element is bound, then "timeupdate", "metadata", "pause",
// "seeked" and "ended" from whichever element is current.
(function () {
  "use strict";

  if (window.self !== window.top) return;

  const AT = (window.AnimeTrackerContent = window.AnimeTrackerContent || {});

  // Our events and the media events behind them.
  const MEDIA_EVENTS = Object.freeze({
    timeupdate: ["timeupdate"],
    metadata: ["loadedmetadata", "durationchange", "loadeddata"],
    pause: ["pause"],
    seeked: ["seeked"],
    ended: ["ended"],
  });

  const subscribers = new Map([["video", new Set()], ...Object.keys(MEDIA_EVENTS).map((name) => [name, new Set()])]);
  let video = null;
  let detachVideo = null;
  let stopSearch = null;

  function emit(name, target) {
    for (const handler of [...subscribers.get(name)]) {
      try {
        handler(target);
      } catch (error) {
        globalThis.__atSwallow?.(`PlayerObserver.${name}`, error);
      }
    }
  }

  function bind(next) {
    if (next === video) return;
    detachVideo?.();
    video = next;
    const attached = [];
    for (const [name, types] of Object.entries(MEDIA_EVENTS)) {
      const forward = () => {
        if (video === next) emit(name, next);
      };
      for (const type of types) {
        next.addEventListener(type, forward, { passive: true });
        attached.push([type, forward]);
      }
    }
    detachVideo = () => {
      for (const [type, forward] of attached) next.removeEventListener(type, forward);
      detachVideo = null;
    };
    AT.Logger?.debug?.("PlayerObserver: video bound");
    emit("video", next);
  }

  function unbind() {
    detachVideo?.();
    video = null;
  }

  function stopSearching() {
    stopSearch?.();
    stopSearch = null;
  }

  // Polls on the configured cadence and also checks after page mutations, within the same budget the
  // video monitor always had (VIDEO_CHECK_INTERVAL x MAX_RETRIES).
  function search() {
    if (stopSearch) return;
    const tryBind = () => {
      const found = AT.PlayerDom.findVideo();
      if (!found) return false;
      stopSearching();
      bind(found);
      return true;
    };
    if (tryBind()) return;

    const { CONFIG, PageEvents, Logger } = AT;
    const budgetMs = CONFIG.VIDEO_CHECK_INTERVAL * CONFIG.MAX_RETRIES;
    const poll = setInterval(tryBind, CONFIG.VIDEO_CHECK_INTERVAL);
    const stopObserving = PageEvents.observe(document.body, { childList: true, subtree: true }, tryBind, { throttleMs: 100 });
    const giveUp = setTimeout(() => {
      stopSearching();
      Logger?.info?.("Video not found after max retries");
    }, budgetMs);
    stopSearch = () => {
      clearInterval(poll);
      clearTimeout(giveUp);
      stopObserving();
    };
  }

  // Binds the current video, or waits for one. Safe to call repeatedly.
  function start() {
    if (video?.isConnected) return;
    if (video) unbind();
    search();
  }

  // The server switch replaced (or is about to replace) the player: forget the element and find the new one.
  function rescan() {
    stopSearching();
    unbind();
    search();
  }

  function stop() {
    stopSearching();
    unbind();
  }

  // Calls handler(video) for name ("video" or a media event). A "video" subscriber that arrives after
  // the element is bound is called right away. Returns an unsubscribe.
  function on(name, handler) {
    const set = subscribers.get(name);
    if (!set) throw new Error(`PlayerObserver: unknown event "${name}"`);
    set.add(handler);
    if (name === "video" && video) {
      try {
        handler(video);
      } catch (error) {
        globalThis.__atSwallow?.("PlayerObserver.video", error);
      }
    }
    return () => set.delete(handler);
  }

  AT.PlayerObserver = Object.freeze({ start, rescan, stop, on, getVideo: () => video });
})();
