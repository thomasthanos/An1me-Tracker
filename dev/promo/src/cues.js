// Single source of truth for the film's timing. Loaded by the composition (browser)
// and by tools/build-promo-audio.mjs (Node), so picture and sound share one cue sheet.
(function (root) {
  const FPS = 45;
  const DURATION = 35.0;
  root.PROMO_CUES = {
    fps: FPS,
    duration: DURATION,
    frames: Math.round(FPS * DURATION), // 1575
    // scene i runs from scenes[i] to scenes[i + 1]
    scenes: [0.0, 5.0, 10.5, 15.5, 21.0, 26.8, 30.8, 35.0],
    s1: { heartbeats: [0.3, 1.12, 1.9, 2.62], scratch: 3.3, slash: 3.8 },
    s2: { shine: 5.2, uiPop: 5.75, scrubStart: 7.15, scrubEnd: 7.55, play: 10.05 },
    s3: { alert: 10.62, aura: 10.95, ignite: 11.5, gear15: 12.2, gear20: 13.0, boom: 13.65 },
    s4: { typeStart: 16.0, typeEnd: 16.85, cards: 17.1, cardGap: 0.2, click: 20.3 },
    s5: { warp: 22.5, land: 23.65 },
    s6: { impacts: [27.2, 27.75, 28.3], lock: 29.7 },
    s7: { hit: 30.8 },
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
