// Playback rate changes the media clock, not the units stored by the tracker.
// Exercise production page handlers, content storage, the entire worker and Resume renderer.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { cloudWorker } = require("./lib/cloud-worker-harness.js");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const epoch = Date.parse("2026-10-04T12:00:00Z");
const id = "speed-series__episode-1";
const rates = [
  { rate: 1.25, atThreeMinutes: 225, atSixMinutes: 450, percentage: 15 },
  { rate: 1.5, atThreeMinutes: 270, atSixMinutes: 540, percentage: 18 },
  { rate: 2, atThreeMinutes: 360, atSixMinutes: 720, percentage: 24 },
];
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(setImmediate); };

function initial() {
  return { firebase_user: { uid: "speed-user", email: "speed@example.com" },
    firebase_tokens: { idToken: "test-token", refreshToken: "test-refresh", expiresAt: epoch + 3600000 },
    animeData: { "speed-series": { title: "Speed Series", episodes: [], listState: "active", totalEpisodes: 12 },
      // Cloud's compact format omits the default video durationSource; no format-only normalization
      // should obscure this test's strict checks for changes to watched episodes or list state.
      preserved: { title: "Preserved", episodes: [{ number: 1, duration: 1500 }], listState: "on_hold" } },
    videoProgress: { "preserved__episode-2": { currentTime: 321, duration: 1500, percentage: 21, savedAt: new Date(epoch).toISOString() } },
    deletedAnime: {}, groupCoverImages: { preserved: "https://example.com/preserved.jpg" },
    animeInfoCache: { preserved: { totalEpisodes: 12, updatedAt: epoch } },
    episodeTypes_preserved: { filler: [4], canon: [1, 2, 3], fetchedAt: epoch },
  };
}
function protectedData(store, includeLibrary = true) {
  return JSON.stringify({ animeData: includeLibrary ? store.animeData : store.animeData.preserved,
    progress: store.videoProgress["preserved__episode-2"], deletedAnime: store.deletedAnime,
    groupCoverImages: store.groupCoverImages, animeInfoCache: store.animeInfoCache,
    episodeTypes: store.episodeTypes_preserved });
}

async function page(rate, duration = 1500) {
  const worker = cloudWorker(initial()); await flush();
  const win = new EventTarget(), doc = new EventTarget(), location = new URL("https://an1me.to/watch/speed-series-episode-1");
  const timers = new Map(), messages = [], errors = [], cleanups = [];
  const video = { currentTime: 0, duration, playbackRate: rate, paused: false };
  let handlers, nextTimer = 0;
  const empty = () => {};
  Object.assign(doc, { readyState: "complete", visibilityState: "visible", hidden: false,
    body: {}, documentElement: {}, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null });
  Object.assign(win, { location, __atSwallow: empty }); win.self = win; win.top = win;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [worker.now()])); } static now() { return worker.now(); } }
  const AT = { Logger: new Proxy({}, { get: (_, name) => name === "error" ? (...args) => errors.push(args.join(" ")) : empty }),
    AnimeParser: { extractAnimeInfo: () => ({ animeSlug: "speed-series", animeTitle: "Speed Series", episodeNumber: 1,
      uniqueId: id, url: location.href }), extractCoverImage: () => null, extractSiteAnimeId: () => null },
    EpisodeHighlight: new Proxy({}, { get: (_, name) => name === "bumpLatestEpisodeFromPage" ? async () => {} : empty }),
    VideoMonitor: { getVideoElement: () => video, startWatching: (_, value) => handlers = value,
      cleanupPage: () => cleanups.splice(0).forEach(fn => fn()), cleanup: empty, addPageCleanup: fn => cleanups.push(fn) },
    PlayerObserver: { start: empty, stop: empty, on: () => empty, getVideo: () => video },
    PageEvents: { onStorage: () => empty, observe: () => empty },
    Notifications: { cleanup: empty, showCompletion: empty, showBacklogPrompt: empty },
    SkiptimeHelper: { mount: empty, unmount: empty } };
  win.AnimeTrackerContent = AT;
  const chrome = { storage: worker.context.chrome.storage,
    runtime: { id: "speed-test", lastError: null, onMessage: { addListener: empty },
      sendMessage(message, callback) {
        messages.push(message);
        // Only the unrelated metadata endpoints are isolated; storage/progress use real handlers.
        const response = message.type === "GET_OUTRO_START" ? Promise.resolve({ outroStart: 0 }) :
          message.type === "GET_FILLER_EPISODES" ? Promise.resolve({ fillers: [] }) : worker.request(message.type, message);
        response.then(value => callback?.(value));
        return response;
      } } };
  const context = vm.createContext({ window: win, document: doc, location, chrome, Date: Clock, URL, Event, Element: class {},
    setTimeout(fn, ms) { const key = ++nextTimer; timers.set(key, { fn, due: worker.now() + ms }); return key; },
    clearTimeout: key => timers.delete(key), setInterval: () => { throw Error("Unexpected content polling"); }, clearInterval: empty });
  for (const file of ["src/common/utils.js", "src/common/data/library-keys.js", "src/common/data/media-type.js",
    "src/common/data/entry-state.js", "src/common/data/merge-utils.js", "src/content/lib/config.js",
    "src/content/lib/storage.js", "src/content/player/episode-writer.js", "src/content/player/progress-tracker.js", "src/content/main.js"])
    vm.runInContext(read(file), context, { filename: file });
  const init = [...timers].find(([, value]) => value.due === worker.now() + 1000);
  assert.ok(init, "the production init is scheduled"); timers.delete(init[0]); await init[1].fn(); await flush();
  assert.ok(handlers, "production main binds media handlers");
  async function advance(ms) {
    worker.advance(ms);
    for (const [key, timer] of [...timers]) if (timer.due <= worker.now()) { timers.delete(key); await timer.fn(); }
    await flush();
  }
  return { worker, video, AT, messages, errors, handlers, advance,
    async tick(time) { await advance(1000); video.currentTime = time; handlers.handleTimeUpdate(); await flush(); },
    async settled() { await advance(300); },
  };
}

function resume(data, progress) {
  const context = vm.createContext({ console }); context.window = context; context.self = context;
  for (const file of ["src/common/utils.js", "src/common/data/multipart-mappings.js", "src/common/data/media-type.js",
    "src/common/data/anime-identity.js", "src/common/data/franchise-seasons.js", "src/common/data/entry-state.js",
    "src/common/data/merge-utils.js", "src/popup/lib/config.js", "src/popup/lib/ui-helpers.js",
    "src/popup/lib/progress-manager.js", "src/popup/cards/anime-card.js"])
    vm.runInContext(read(file), context, { filename: file });
  const before = JSON.stringify({ data, progress });
  const AT = context.AnimeTracker, item = AT.ProgressManager.getInProgressAnime(data, progress).find(entry => entry.slug === "speed-series");
  assert.ok(item, "partial media position remains visible in Resume");
  const html = AT.AnimeCardRenderer.createInProgressItem(item);
  assert.match(html, /class="ip-continue-btn"/);
  assert.match(html, /watch\/speed-series-episode-1/);
  assert.equal(JSON.stringify({ data, progress }), before, "rendering cannot mutate library or progress");
  return item.episodes[0];
}

for (const { rate, atThreeMinutes, atSixMinutes, percentage } of rates) {
  test(`${rate}x regular, pause and unload saves retain media seconds and Resume without changing library/caches`, async () => {
    const h = await page(rate), protectedBefore = protectedData(h.worker.store);
    await h.advance(3 * 60000); h.video.currentTime = atThreeMinutes;
    h.handlers.handleTimeUpdate(); await flush(); await h.settled();
    assert.equal(h.worker.store.videoProgress[id].currentTime, atThreeMinutes, "regular persistence uses media seconds");
    h.handlers.handlePause(); await flush();
    assert.equal(h.worker.store.videoProgress[id].currentTime, atThreeMinutes, "pause keeps the same timestamp");
    const partial = resume(h.worker.store.animeData, h.worker.store.videoProgress);
    assert.equal(partial.currentTime, atThreeMinutes); assert.equal(partial.percentage, percentage);
    await h.advance(3 * 60000); h.video.currentTime = atSixMinutes;
    h.handlers.handleBeforeUnload(); await flush();
    assert.equal(h.worker.store.videoProgress[id].currentTime, atSixMinutes, "unload keeps the latest media timestamp");
    assert.equal(h.worker.remote.videoProgress[id].currentTime, atSixMinutes, "final position reaches the cloud");
    assert.equal(h.worker.store.videoProgress[id].duration, 1500, "media duration does not shrink with playback speed");
    assert.equal(protectedData(h.worker.store), protectedBefore, "partial playback leaves library, episodes and caches byte-identical");
    assert.deepEqual(h.errors, []);
  });

  test(`${rate}x seeking near the end cannot bypass the completion playback guard`, async () => {
    const h = await page(rate, 1000), before = protectedData(h.worker.store);
    await h.tick(1); await h.tick(900);
    await h.handlers.handleEnded(); h.handlers.handleBeforeUnload(); await flush();
    assert.equal(h.worker.store.animeData["speed-series"].episodes.length, 0);
    assert.equal(protectedData(h.worker.store), before, "a seek cannot mark a watched episode or change its state");
    assert.equal(h.messages.some(message => message.type === "TRACK_BEFORE_UNLOAD"), false);
    assert.deepEqual(h.errors, []);
  });

  test(`${rate}x sustained playback marks exactly one completion at the existing media threshold`, async () => {
    const h = await page(rate, 1000), before = protectedData(h.worker.store, false);
    await h.tick(600);
    for (let position = 600 + rate; position < 850; position += rate) await h.tick(position);
    assert.equal(h.worker.store.animeData["speed-series"].episodes.length, 0, "below 85% remains incomplete");
    await h.tick(850); await h.settled();
    await h.tick(851); await h.handlers.handleEnded(); await flush();
    const entry = h.worker.store.animeData["speed-series"];
    assert.equal(entry.episodes.length, 1, "timeupdate and ended do not double-count completion");
    assert.equal(entry.episodes[0].number, 1); assert.equal(entry.episodes[0].duration, 1000);
    assert.equal(entry.totalWatchTime, 1000, "completed watch time retains the media duration");
    assert.equal(id in h.worker.store.videoProgress, false, "completion removes only its Resume point");
    assert.equal(protectedData(h.worker.store, false), before, "other progress, state and caches remain byte-identical");
    assert.deepEqual(h.errors, []);
  });
}

test("three real minutes at 2x checkpoint 360 media seconds and a PC pull replaces its cached 180-second Resume", async () => {
  const phone = await page(2); await phone.advance(180000); phone.video.currentTime = 360;
  phone.handlers.handlePause(); await flush();
  assert.equal(phone.worker.remote.videoProgress[id].currentTime, 360);
  const seed = initial(), old = { currentTime: 180, duration: 1500, savedAt: new Date(epoch).toISOString() };
  seed.videoProgress[id] = old;
  seed._bgCloudDocCachePersisted = { uid: "speed-user", cachedAt: phone.worker.now() - 60000,
    doc: { animeData: seed.animeData, videoProgress: seed.videoProgress, lastUpdated: new Date(epoch).toISOString() } };
  const pc = cloudWorker(seed, phone.worker.remote, { now: phone.worker.now() }); await flush();
  const protectedBefore = protectedData(pc.store);
  await pc.request("WAKE_AND_POLL_CLOUD", { reason: "popup:open" }); await flush();
  assert.equal(pc.store.videoProgress[id].currentTime, 360);
  assert.equal(resume(pc.store.animeData, pc.store.videoProgress).currentTime, 360);
  assert.equal(protectedData(pc.store), protectedBefore, "pull only changes the active Resume position");
});

test("legacy Resume entries without percentage preserve boosted media positions without mutating stored data", () => {
  for (const { atThreeMinutes, percentage } of rates) {
    const seed = initial(); seed.videoProgress[id] = { currentTime: atThreeMinutes, duration: 1500, savedAt: new Date(epoch).toISOString() };
    const item = resume(seed.animeData, seed.videoProgress);
    assert.equal(item.currentTime, atThreeMinutes); assert.equal(item.percentage, percentage);
  }
});
