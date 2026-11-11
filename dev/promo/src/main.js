// Root timeline + boot. The root "main" composition only needs a paused timeline pinned to the
// film length; every scene registered its own timeline and frame source when its file loaded.
(function () {
  window.__timelines = window.__timelines || {};
  const root = gsap.timeline({ paused: true });
  root.to({}, { duration: P.CUES.duration }, 0);
  window.__timelines["main"] = root;

  // dev fallback (plain browser, no HyperFrames runtime): extend the manual seek to the overlays
  if (window.__promoSeek) {
    const seekScenes = window.__promoSeek;
    window.__promoSeek = (t) => {
      seekScenes(t);
      P.overlays.renderFx(t);
      P.overlays.renderCaptions(t);
    };
  }
  P.boot();
})();
