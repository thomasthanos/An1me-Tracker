const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "../..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
let failures = 0;
async function test(name, fn) { try { await fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.stack}`); } }
function page(url = "https://an1me.to/watch/naruto-episode-1") {
  const win = new EventTarget(), doc = new EventTarget();
  const timers = new Set(), observers = new Set();
  const messages = [];
  const location = new URL(url);
  const empty = () => {};
  Object.assign(doc, { readyState: "complete", visibilityState: "visible", body: {}, documentElement: {},
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null });
  Object.assign(win, { location, __atSwallow: empty }); win.self = win; win.top = win;
  let playerStops = 0, starts = 0, get = async () => ({}), snapshot;
  const cleanup = [];
  const AT = {
    Logger: new Proxy({}, { get: () => empty }), CONFIG: { DELAYS: { INIT: 1000, OUTRO_RPC_TIMEOUT: 4000 }, SELECTORS: { PLAYER_SELECTION: [] } },
    EpisodeHighlight: new Proxy({}, { get: (_, key) => key === "bumpLatestEpisodeFromPage" ? async () => {} : empty }),
    AnimeParser: { extractAnimeInfo: () => location.pathname.startsWith("/watch/") ? { animeSlug: "naruto", animeTitle: "Naruto", episodeNumber: 1, uniqueId: "naruto__episode-1" } : null },
    VideoMonitor: { cleanupPage() { cleanup.splice(0).forEach(fn => fn()); }, cleanup: empty, addPageCleanup: fn => cleanup.push(fn),
      getVideoElement: () => null, startWatching: (_, handlers) => { starts++; AT.lastHandlers = handlers; } },
    PlayerObserver: { stop: () => playerStops++, start: empty, getVideo: () => null, on: () => empty },
    PlayerDom: { documents: () => [doc], findVideo: () => null, findAnyVideo: () => null },
    ProgressTracker: { reset: empty, saveVideoProgress: empty, isEpisodeTracked: async () => false }, Notifications: { cleanup: empty },
    PageEvents: { onStorage: () => empty, observe() { const token = {}; observers.add(token); return () => observers.delete(token); } },
    SkiptimeHelper: { unmount: empty, mount: empty },
  };
  win.AnimeTrackerContent = AT;
  const c = vm.createContext({ window: win, document: doc, location, history: { pushState: empty, replaceState: empty }, Event, Element: class {}, URL,
    chrome: { storage: { local: { get: keys => get(keys) } }, runtime: { onMessage: { addListener: fn => snapshot = fn }, sendMessage: (message, cb) => { messages.push(message); cb?.(null); return Promise.resolve(null); } } },
    setTimeout(fn, ms) { const t = { fn, ms, kind: "timeout" }; timers.add(t); return t; }, clearTimeout: t => timers.delete(t),
    setInterval(fn, ms) { const t = { fn, ms, kind: "interval" }; timers.add(t); return t; }, clearInterval: t => timers.delete(t),
  });
  vm.runInContext(read("src/common/utils.js"), c);
  return { c, AT, win, doc, location, timers, observers, messages, starts: () => starts, stops: () => playerStops,
    setGet: fn => get = fn, load: f => vm.runInContext(read(f), c),
    async init() { const t = [...timers].find(t => t.ms === 1000 && t.kind === "timeout"); timers.delete(t); await t.fn(); },
    navigate(path) { location.href = "https://an1me.to" + path; win.dispatchEvent(new Event("at:locationchange")); } };
}
(async () => {
  await test("SPA navigation hands off partial progress with the departed episode identity before teardown", async () => {
    const h = page(), saved = [];
    const original = { animeSlug: "naruto", episodeNumber: 1, uniqueId: "naruto__episode-1", url: h.location.href, coverImage: "naruto.jpg" };
    h.AT.AnimeParser.extractAnimeInfo = () => original;
    h.AT.Storage = { mutate: async () => ({}) };
    h.AT.ProgressTracker.shouldMarkComplete = () => false;
    h.AT.ProgressTracker.saveVideoProgress = (...args) => saved.push({ args, context: h.AT.getWatchProgressContext() });
    h.load("src/content/main.js"); await h.init();
    h.AT.VideoMonitor.getVideoElement = () => ({ currentTime: 200, duration: 1200 });
    h.navigate("/watch/bleach-episode-5");
    assert.equal(saved.length, 1); assert.equal(saved[0].args[0], "naruto__episode-1");
    assert.equal(saved[0].args[1], 200); assert.equal(saved[0].args[4], true);
    assert.equal(saved[0].context.url, "https://an1me.to/watch/naruto-episode-1");
    assert.equal(h.AT.getWatchProgressContext(), null);
  });
  await test("pause hands off its latest sample without requesting cloud sync before persistence", async () => {
    const h = page(), saved = [];
    h.AT.ProgressTracker.saveVideoProgress = (...args) => saved.push(args);
    h.load("src/content/main.js"); await h.init();
    h.AT.VideoMonitor.getVideoElement = () => ({ currentTime: 110, duration: 1200 });
    h.AT.lastHandlers.handlePause();
    assert.equal(saved.length, 1); assert.equal(saved[0][1], 110); assert.equal(saved[0][4], true);
    assert.equal(h.messages.filter(m => m.type === "SYNC_PROGRESS_ONLY").length, 0);
  });
  // iPhone Safari keeps pages in its back-forward cache: going back to the episode restores the page without
  // reloading it. The pagehide that preceded it tore tracking down, so without a fresh start on pageshow the
  // restored episode would play with nothing saving its progress.
  await test("a watch page restored from the back-forward cache starts tracking again", async () => {
    const h = page(); h.load("src/content/main.js"); await h.init(); assert.equal(h.starts(), 1);
    const before = h.stops();
    h.win.dispatchEvent(new Event("pagehide"));
    assert.ok(h.stops() > before, "leaving tears tracking down");
    const restored = new Event("pageshow"); restored.persisted = true;
    h.win.dispatchEvent(restored);
    for (let i = 0; i < 20 && h.starts() < 2; i++) await new Promise(setImmediate);
    assert.equal(h.starts(), 2, "and the restored page watches its video again");
    // Control: an ordinary first load (not from the cache) does not start a second time.
    const fresh = new Event("pageshow"); fresh.persisted = false;
    h.win.dispatchEvent(fresh);
    for (let i = 0; i < 20; i++) await new Promise(setImmediate);
    assert.equal(h.starts(), 2);
  });
  await test("leaving a watch route immediately releases player, page timers and observers", async () => {
    const h = page(); h.load("src/content/main.js"); await h.init(); assert.equal(h.starts(), 1);
    const before = h.stops(); h.navigate("/anime/naruto/");
    assert.equal(h.timers.size, 0); assert.equal(h.observers.size, 0); assert.ok(h.stops() > before);
  });
  await test("an init awaiting storage cannot start watching after navigation", async () => {
    const h = page(); let resolve;
    h.setGet(keys => keys.includes("autoSkipFillers") ? new Promise(r => resolve = r) : Promise.resolve({}));
    h.load("src/content/main.js"); const pending = h.init(); await Promise.resolve();
    h.navigate("/anime/naruto/"); resolve({}); await pending;
    assert.equal(h.starts(), 0); assert.equal(h.timers.size, 0);
  });
  await test("enabled skip helper owns no search observers or polling on a library route", async () => {
    const h = page("https://an1me.to/"); h.setGet(async () => ({ skiptimeHelperEnabled: true }));
    h.load("src/content/player/skiptime.js"); await new Promise(setImmediate);
    assert.equal(h.observers.size, 0); assert.equal(h.timers.size, 0);
  });
  await test("skip helper releases watch-page observers on navigation and resumes without permanent polling", async () => {
    const h = page(); h.setGet(async () => ({ skiptimeHelperEnabled: true }));
    h.load("src/content/player/skiptime.js"); await new Promise(setImmediate);
    assert.ok(h.observers.size > 0, "helper must actually start on the watch page");
    assert.equal(h.timers.size, 0, "identity changes use events rather than a permanent interval");
    h.navigate("/"); assert.equal(h.observers.size, 0); assert.equal(h.timers.size, 0);
    h.navigate("/watch/naruto-episode-2"); await new Promise(setImmediate); assert.ok(h.observers.size > 0);
    h.doc.visibilityState = "hidden"; h.doc.dispatchEvent(new Event("visibilitychange")); assert.equal(h.observers.size, 0);
    h.doc.visibilityState = "visible"; h.doc.dispatchEvent(new Event("visibilitychange")); assert.ok(h.observers.size > 0);
  });
  await test("airing countdown stops hidden timers and starts exactly one when shown", () => {
    const h = page();
    // Rendered cards retain a dedicated text child alongside their decorative SVG.
    const label = { textContent: "" };
    const countdownNode = { dataset: { nextAiringAt: Date.now() + 3600000 }, classList: { toggle() {} },
      getClientRects: () => [{}], querySelector: selector => selector === ".meta-time-label" ? label : null };
    h.doc.querySelectorAll = () => [countdownNode];
    h.load("src/popup/lib/airing-countdown.js");
    const countdown = h.c.window.AnimeTracker.AiringCountdown; countdown.start(); assert.equal(h.timers.size, 1);
    h.doc.hidden = true; h.doc.dispatchEvent(new Event("visibilitychange")); assert.equal(h.timers.size, 0);
    h.doc.hidden = false; h.doc.dispatchEvent(new Event("visibilitychange")); assert.equal(h.timers.size, 1);
    countdown.stop(); h.doc.dispatchEvent(new Event("visibilitychange")); assert.equal(h.timers.size, 0);
  });
  await test("unload tracking atomically clears tombstones and both episodes' progress, including duplicate saves", async () => {
    const src = read("background.js"); const body = src.slice(src.indexOf("function normalizeTrackedDuration("), src.indexOf("const messageHandlers ="));
    const store = { animeData: {}, deletedAnime: { naruto: { deletedAt: new Date().toISOString() } }, videoProgress: { "naruto__episode-1": { currentTime: 100 }, "naruto__episode-2": { currentTime: 120 } } };
    const c = vm.createContext({ dlog() {}, isPlaceholderDuration: () => false,
      runBgLibraryTransaction: async (keys, operation) => {
        const snapshot = structuredClone(Object.fromEntries(keys.map(k => [k, store[k]])));
        const result = await operation(snapshot); if (result?.data) Object.assign(store, structuredClone(result.data)); return result;
      } });
    vm.runInContext(body, c);
    const info = { animeSlug: "naruto", episodeNumber: 1, secondEpisodeNumber: 2, isDoubleEpisode: true, uniqueId: "naruto__episode-1" };
    await c.persistBeforeUnloadTrack(info, 1200);
    assert.equal(store.animeData.naruto.episodes.length, 2); assert.deepEqual(store.videoProgress, {}); assert.deepEqual(store.deletedAnime, {});
    store.deletedAnime.naruto = { deletedAt: "stale" }; store.videoProgress[info.uniqueId] = { currentTime: 1 };
    await c.persistBeforeUnloadTrack(info, 1200);
    assert.equal(store.animeData.naruto.episodes.length, 2); assert.deepEqual(store.videoProgress, {}); assert.deepEqual(store.deletedAnime, {});
  });
  await test("a duplicate content save still commits tombstone and resume-point cleanup without a completion notification", async () => {
    const h = page(); let commits = 0, notifications = 0;
    const store = { animeData: { naruto: { episodes: [{ number: 1, duration: 1200 }] } }, deletedAnime: { naruto: "old" }, videoProgress: { "naruto__episode-1": { currentTime: 100 } } };
    h.AT.EpisodeWriter = { writeEpisode: () => ({ changed: false }) };
    h.AT.Notifications.showCompletion = () => notifications++;
    h.AT.Storage = { isAbortResult: () => false, mutate: async (_, fn) => { if (fn(store) !== false) commits++; return store; } };
    h.load("src/content/player/progress-tracker.js");
    await h.AT.ProgressTracker.saveWatchedEpisode({ animeSlug: "naruto", animeTitle: "Naruto", episodeNumber: 1, uniqueId: "naruto__episode-1" }, 1200);
    assert.equal(commits, 1); assert.deepEqual(store.deletedAnime, {}); assert.deepEqual(store.videoProgress, {}); assert.equal(notifications, 0);
  });
  await test("an ended handler awaiting storage preserves the completed previous episode through the background after navigation", async () => {
    const h = page(); h.load("src/content/main.js"); await h.init();
    const video = { currentTime: 100, duration: 120, playbackRate: 1 };
    h.AT.VideoMonitor.getVideoElement = () => video;
    h.AT.CONFIG.MIN_WATCH_SECONDS_BEFORE_COMPLETE = 1; h.AT.CONFIG.HARD_MIN_WATCH_SECONDS = 0;
    h.AT.ProgressTracker.refreshTrackedEpisodeDuration = async () => false;
    h.AT.ProgressTracker.shouldMarkComplete = () => false;
    h.AT.lastHandlers.handleTimeUpdate(); await new Promise(setImmediate);
    video.currentTime = 101; h.AT.lastHandlers.handleTimeUpdate(); await new Promise(setImmediate);
    let resolve; const saved = [];
    h.AT.ProgressTracker.isEpisodeTracked = () => new Promise(r => resolve = r);
    h.AT.ProgressTracker.saveWatchedEpisode = async info => saved.push(info);
    h.AT.ProgressTracker.clearSavedProgress = async () => {};
    const pending = h.AT.lastHandlers.handleEnded(); h.navigate("/"); resolve(false); await pending;
    assert.deepEqual(saved, []);
    const completion = h.messages.find(message => message.type === "TRACK_BEFORE_UNLOAD");
    assert.ok(completion, "the previous completed episode must still be saved");
    assert.equal(completion.animeInfo.uniqueId, "naruto__episode-1"); assert.equal(completion.duration, 120);
  });
  await test("media timeupdate still records completion once after removing duplicate periodic polling", async () => {
    const h = page();
    h.AT.AnimeParser.extractAnimeInfo = () => ({ animeSlug: "naruto", animeTitle: "Naruto", episodeNumber: 1, isDoubleEpisode: true, secondEpisodeNumber: 2, uniqueId: "naruto__episode-1" });
    h.load("src/content/main.js"); await h.init();
    let writes = 0, notices = 0;
    const video = { currentTime: 97, duration: 100, playbackRate: 1 };
    h.AT.VideoMonitor.getVideoElement = () => video;
    h.AT.CONFIG.MIN_WATCH_SECONDS_BEFORE_COMPLETE = 1; h.AT.CONFIG.HARD_MIN_WATCH_SECONDS = 1;
    h.AT.ProgressTracker.refreshTrackedEpisodeDuration = async () => false;
    h.AT.ProgressTracker.shouldMarkComplete = (time, duration) => time / duration >= 0.85;
    h.AT.ProgressTracker.clearSavedProgress = async () => {};
    h.AT.Notifications.showCompletion = () => notices++;
    h.AT.EpisodeWriter = { writeEpisode(info, duration, data) { writes++; data[info.animeSlug] = { episodes: [{ number: info.episodeNumber, duration }] }; return { changed: true }; } };
    const data = { animeData: {}, deletedAnime: { naruto: "old" }, videoProgress: { "naruto__episode-1": { currentTime: 20 }, "naruto__episode-2": { currentTime: 30 } } };
    h.AT.Storage = { isAbortResult: () => false, isContextValid: () => true, mutate: async (_, fn) => { fn(data); return data; } };
    for (const time of [97, 98, 99]) { video.currentTime = time; h.AT.lastHandlers.handleTimeUpdate(); await new Promise(setImmediate); }
    assert.equal(writes, 1); assert.equal(notices, 1); assert.equal(data.animeData.naruto.episodes[0].number, 1);
    assert.deepEqual(data.videoProgress, {}); assert.deepEqual(data.deletedAnime, {});
  });
  await test("an empty Continue Watching shelf releases its resize and share observers", () => {
    const src = read("src/content/page/continue-watching.js");
    const start = src.includes("  function unmountShelf()") ? src.indexOf("  function unmountShelf()") : src.indexOf("  function render(items)");
    const body = src.slice(start, src.indexOf("  function collectAnimeInfoKeys("));
    let disconnected = 0, stopped = 0, removed = 0;
    const c = vm.createContext({ document: { getElementById: () => ({ remove: () => removed++ }) }, clearTimeout() {},
      canRender: () => true, stopShareWatcher: () => stopped++ });
    c.disconnected = () => disconnected++;
    vm.runInContext('let dismissed = false, renderGeneration = 0, renderDebounce = null; const CONTAINER_ID = "shelf"; let trackResizeObserver = { disconnect: disconnected };' + body, c);
    c.render([]); assert.equal(disconnected, 1); assert.equal(stopped, 1); assert.equal(removed, 1);
  });
  await test("the homepage event bus emits route changes for actual history calls and popstate exactly once", () => {
    const h = page("https://an1me.to/"); let events = 0;
    h.win.history = { pushState: (_, __, url) => { h.location.href = new URL(url, h.location).href; return 42; },
      replaceState: (_, __, url) => { h.location.href = new URL(url, h.location).href; } };
    h.c.chrome.storage.onChanged = { addListener() {}, removeListener() {} };
    delete h.AT.PageEvents;
    h.load("src/content/lib/page-events.js");
    h.load("src/content/lib/navigation-bridge.js");
    h.win.addEventListener("at:locationchange", () => events++);
    assert.equal(h.win.history.pushState({}, "", "/watch/naruto-episode-1"), 42); assert.equal(events, 1);
    h.load("src/content/lib/page-events.js"); h.load("src/content/lib/navigation-bridge.js");
    h.win.history.replaceState({}, "", "/"); assert.equal(events, 2);
    h.location.href = "https://an1me.to/anime/naruto/"; h.win.dispatchEvent(new Event("popstate")); assert.equal(events, 3);
    let deliver;
    h.c.MutationObserver = class { constructor(callback) { deliver = callback; } observe() {} disconnect() {} takeRecords() { return []; } };
    const unsubscribe = h.AT.PageEvents.observe(h.doc.body, { childList: true, subtree: true }, () => {});
    h.location.href = "https://an1me.to/";
    deliver([{ type: "childList", target: h.doc.body }]); assert.equal(events, 4, "existing DOM batches detect site-world navigation too");
    unsubscribe(); assert.equal(h.AT.PageEvents.stats().domSubscribers, 0);
    h.win.history.pushState({}, "", "/watch/naruto-episode-2"); assert.equal(events, 5);
    h.win.history.pushState({}, "", "/"); assert.equal(events, 6, "returning home emits navigation even with no observers");
  });
  process.exitCode = failures ? 1 : 0;
})();
