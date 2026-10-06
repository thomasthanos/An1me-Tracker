// Pins the Fetch & Import filler stage against an unreachable AnimeFillerList and a slow Jikan.
//
//   node dev/test/filler-fetch-resilience.test.js
//
// On an iPhone the whole library used to fail at once: when the AnimeFillerList index could not be
// loaded, every show was treated as "not listed", handed to Jikan, negative-cached as having no filler,
// and a single Jikan timeout then opened a one-hour circuit that turned the rest into "filler
// unavailable". These cases hold the replacement behavior: one index request, a clear retryable error,
// nothing cached as a miss, prior data kept, and a manual run that is never refused by an old failure.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const NOW = Date.UTC(2026, 9, 5, 12);
const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const INDEX_HTML = read("dev/test/fixtures/animefillerlist-shows.html");
const showPage = (episodes) =>
  `<table>${Array.from({ length: episodes }, (_, i) => `<tr class="${i % 5 === 3 ? "filler" : "manga_canon"}"><td class="Number">${i + 1}</td></tr>`).join("")}</table>`;

const SHOWS = [["noragami", "Noragami"], ["dandadan", "Dandadan"], ["black-clover", "Black Clover"], ["bleach", "Bleach"], ["one-piece", "One Piece"], ["fairy-tail", "Fairy Tail"]];
const info = (title) => ({ title, totalEpisodes: 28, latestEpisode: 28, status: "FINISHED", schemaVersion: 5, cachedAt: NOW, mediaType: "TV" });
// Older than the seven days a finished show stays fresh, so a refresh is attempted and can fail.
const prior = () => ({ canon: [1, 3, 4], filler: [2, 5], mixed: [], anime_canon: [], totalEpisodes: 28, schemaVersion: 3, cachedAt: NOW - 8 * DAY, _source: "afl" });

// One isolated worker per case: the Jikan circuit and the slug cache live in the global scope.
function worker({ afl = "ok", jikan = "ok", ua = "iPhone", seed = {}, siteAccess = null } = {}) {
  const store = structuredClone(seed), calls = { aflIndex: 0, aflShow: 0, jikan: 0, offline: 0 }, timers = [], alarms = [], listeners = {};
  const mode = { afl, jikan, jikanEpisodes: 28, siteAccess };
  // The browser's own connectivity flag, which the worker reads as navigator.onLine. Flip it to cut the connection.
  const nav = { userAgent: ua, platform: ua, onLine: true };
  let time = NOW, writes = 0, runaway = false;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } }
  for (const [slug, title] of SHOWS) if (!(`animeinfo_${slug}` in store)) store[`animeinfo_${slug}`] = info(title);
  const c = vm.createContext({
    Date: Clock, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, AbortController, Response,
    navigator: nav,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    setTimeout(fn, ms) { timers.push(ms); return setTimeout(fn, 0); }, clearTimeout,
    bgStorageGet: async (keys) => structuredClone(keys === null ? store : Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]))),
    // A loop that keeps rewriting storage would starve every timer; stop it so a regression fails instead of hanging.
    bgStorageSet: async (patch) => { if (++writes > 2000) { runaway = true; throw new Error("runaway storage writes"); } Object.assign(store, structuredClone(patch)); },
    bgStorageRemove: async (keys) => keys.forEach((k) => delete store[k]),
    fetch(url, options = {}) {
      if (nav.onLine === false) { calls.offline++; return Promise.reject(new TypeError("Load failed")); }
      const hang = () => new Promise((_, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (options.signal?.aborted) abort(); else options.signal?.addEventListener("abort", abort, { once: true });
      });
      const blocked = () =>
        mode.afl === "down" ? Promise.reject(new TypeError("Load failed"))
          : mode.afl === "403" ? Promise.resolve(new Response("", { status: 403 }))
            : mode.afl === "challenge" ? Promise.resolve(new Response("<title>Just a moment...</title>", { status: 403, headers: { "cf-mitigated": "challenge", server: "cloudflare" } }))
              : mode.afl === "503" ? Promise.resolve(new Response("", { status: 503, headers: { server: "cloudflare" } }))
                : null;
      if (url === "https://www.animefillerlist.com/shows") {
        calls.aflIndex++;
        return blocked() || Promise.resolve(new Response(INDEX_HTML));
      }
      if (url.startsWith("https://www.animefillerlist.com/shows/")) {
        calls.aflShow++;
        return blocked() || Promise.resolve(new Response(showPage(28)));
      }
      if (url.startsWith("https://api.jikan.moe/")) {
        calls.jikan++;
        if (mode.jikan === "hang") return hang();
        if (mode.jikan === "down") return Promise.reject(new TypeError("Load failed"));
        if (mode.jikan === "listed") {
          // MAL knows every show: the search echoes the title, and every seventh episode is filler.
          const query = url.match(/anime\?q=([^&]+)/);
          if (query) return Promise.resolve(new Response(JSON.stringify({ data: [{ mal_id: 900, title: decodeURIComponent(query[1]) }] })));
          const page = Number(url.match(/page=(\d+)/)[1]), first = (page - 1) * 100, total = mode.jikanEpisodes || 28;
          const data = Array.from({ length: Math.max(0, Math.min(100, total - first)) }, (_, i) => ({ mal_id: first + i + 1, filler: (first + i + 1) % 7 === 0, recap: false }));
          return Promise.resolve(new Response(JSON.stringify({ data, pagination: { has_next_page: first + 100 < total } })));
        }
        return Promise.resolve(new Response(JSON.stringify({ data: [] })));
      }
      return Promise.reject(new Error("unexpected request " + url));
    },
    chrome: {
      // siteAccess false plays a browser where the user has not allowed the extension on AnimeFillerList.
      // mode.siteAccess can change mid-test, as when the user allows the extension in Safari's settings.
      ...(siteAccess === null ? {} : { permissions: { contains: (request, callback) => callback(mode.siteAccess), onAdded: { addListener: (fn) => (listeners.permissionAdded ||= []).push(fn) } } }),
      runtime: { getManifest: () => ({ version: "8.2.1" }) }, alarms: { create: (name, options) => alarms.push({ name, options }), clear: async () => true }, tabs: { query: async () => [] } },
    dlog() {},
  });
  c.self = c;
  for (const file of ["src/common/utils.js", "src/common/data/title-match.js", "src/common/data/cache-policy.js", "src/common/data/merge-utils.js"]) vm.runInContext(read(file), c);
  vm.runInContext("const isLikelyMovieSlug = AnimeTrackerMergeUtils.isLikelyMovieSlug;", c);
  for (const file of ["src/background/fetchers/filler-discovery.js", "src/background/jobs/metadata-repair.js", "src/background/anime-resolver.js"]) vm.runInContext(read(file), c);
  const resolve = (slug, options = {}) => c.AnimeTrackerAnimeResolver.resolve(slug, { title: Object.fromEntries(SHOWS)[slug] || slug, includeEpisodeTypes: true, ...options });
  // The connection comes back: the flag flips and the worker gets the same online event a browser sends.
  const goOnline = () => { nav.onLine = true; for (const fn of listeners.online || []) fn(); };
  // The user allows the extension on the filler sites: the browser grants it and fires permissions.onAdded.
  const grantAccess = () => { mode.siteAccess = true; for (const fn of listeners.permissionAdded || []) fn({ origins: ["https://www.animefillerlist.com/*"] }); };
  return { c, store, calls, timers, mode, nav, alarms, resolve, goOnline, grantAccess, writes: () => writes, runaway: () => runaway, advance: (ms) => { time += ms; } };
}

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log("PASS " + name); } catch (error) { failures++; console.error("FAIL " + name + ": " + error.message); }
}
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(setImmediate); };
const until = async (done) => { for (let i = 0; i < 800 && !(await done()); i++) await new Promise(setImmediate); };
const library = () => Object.fromEntries(SHOWS.slice(0, 4).map(([slug, title]) => [slug, { title, episodes: [{ number: 1, watchedAt: "2026-10-01T10:00:00Z", duration: 1400 }] }]));
const missEntries = (store) => Object.entries(store).filter(([key, value]) => (key.startsWith("episodeTypes_") || key.startsWith("fillerslug_")) && value?.notFound);

(async () => {
  await test("an unreachable index fails every show retryably after one request, and an empty Jikan answer is no 'no filler'", async () => {
    const seed = { episodeTypes_bleach: prior() };
    const h = worker({ afl: "down", seed });
    const results = [];
    for (const [slug] of SHOWS) results.push(await h.resolve(slug));
    assert.equal(h.calls.aflIndex, 1, "the index is requested once for the whole sweep");
    assert.equal(h.calls.jikan, SHOWS.length - 1, "Jikan is asked once per show with no data of its own, never for bleach");
    for (const result of results) {
      assert.equal(result.fillerResult.status, "failed");
      assert.match(result.fillerResult.error, /^afl_index_unavailable: Load failed$/);
    }
    assert.deepEqual(missEntries(h.store), [], "nothing is cached as 'not listed'");
    assert.deepEqual(h.store.episodeTypes_bleach.filler, [2, 5], "prior filler data is kept");
    assert.equal(h.store.episodeTypes_bleach.retryable, true);
    assert.ok(h.store.episodeTypes_noragami.retryable === true && h.store.episodeTypes_noragami.retryAfterAt - NOW === 2 * MINUTE, "retried after the failure memory expires");
  });

  await test("a blocked index reports its HTTP status as the reason", async () => {
    const h = worker({ afl: "403" });
    const result = await h.resolve("noragami");
    assert.match(result.fillerResult.error, /^afl_index_unavailable: HTTP 403$/);
    assert.deepEqual(missEntries(h.store), []);
  });

  await test("the index failure is remembered for two minutes, then the index is requested again", async () => {
    const h = worker({ afl: "down" });
    await h.resolve("noragami");
    h.advance(2 * MINUTE - 1000);
    await h.resolve("dandadan", { forceFillerRefresh: true });
    assert.equal(h.calls.aflIndex, 1, "still inside the memory window");
    h.advance(2000);
    await h.resolve("black-clover", { forceFillerRefresh: true });
    assert.equal(h.calls.aflIndex, 2, "retried once the window has passed");
  });

  await test("a cached positive slug still resolves while the index is unreachable", async () => {
    const seed = { fillerslug_noragami: { slug: "noragami", score: 1, matchedVia: "Noragami", kind: "exact", needsOffset: false, indexVersion: 1, schemaVersion: 4, cachedAt: NOW } };
    const h = worker({ afl: "down", seed });
    const match = await h.c.discoverFillerSlug("noragami", "Noragami", { info: info("Noragami") });
    assert.equal(match.slug, "noragami");
  });

  await test("clearing the breakers lets an immediate retry succeed once the site is back", async () => {
    const h = worker({ afl: "down" });
    assert.equal((await h.resolve("noragami")).fillerResult.status, "failed");
    h.mode.afl = "ok";
    const stillBlocked = await h.resolve("noragami", { forceFillerRefresh: true });
    assert.equal(stillBlocked.fillerResult.status, "failed", "without a reset the remembered failure still applies");
    h.c.resetFillerFetchBreakers();
    const retried = await h.resolve("noragami", { forceFillerRefresh: true });
    assert.equal(retried.fillerResult.status, "fetched");
    assert.equal(retried.fillerResult.fillerCount, 5);
  });

  await test("clearing the breakers also closes an open Jikan circuit", async () => {
    const h = worker();
    vm.runInContext("globalThis.__jikanCircuitBroken = true; globalThis.__jikanCircuitBrokenUntil = Date.now() + 3600000;", h.c);
    h.c.resetFillerFetchBreakers();
    assert.equal(vm.runInContext("globalThis.__jikanCircuitBroken", h.c), false);
    assert.equal(vm.runInContext("globalThis.__jikanCircuitBrokenUntil", h.c), 0);
  });

  await test("a manual Fetch & Import run clears the failure memory and the Jikan circuit before it starts", async () => {
    const h = worker({ afl: "down" });
    await h.resolve("noragami");
    vm.runInContext("globalThis.__jikanCircuitBroken = true; globalThis.__jikanCircuitBrokenUntil = Date.now() + 3600000;", h.c);
    h.mode.afl = "ok";
    await h.c.startLibraryRepair({ origin: "manual" });
    assert.equal(vm.runInContext("globalThis.__jikanCircuitBroken", h.c), false, "the circuit is closed");
    const retried = await h.resolve("noragami", { forceFillerRefresh: true });
    assert.equal(retried.fillerResult.status, "fetched", "and the index is requested again straight away");
  });

  await test("an automatic run leaves an open circuit alone", async () => {
    const h = worker();
    vm.runInContext("globalThis.__jikanCircuitBroken = true; globalThis.__jikanCircuitBrokenUntil = Date.now() + 3600000;", h.c);
    await h.c.startLibraryRepair({ origin: "auto", auto: true });
    assert.equal(vm.runInContext("globalThis.__jikanCircuitBroken", h.c), true);
  });

  await test("a show that really is not listed is still recorded as having no filler when the index loaded", async () => {
    const h = worker({ afl: "ok", jikan: "ok" });
    const result = await h.resolve("totally-unlisted-show", { title: "Totally Unlisted Show" });
    assert.equal(result.fillerResult.status, "nofill");
    assert.equal(h.store["episodeTypes_totally-unlisted-show"].notFound, true);
  });

  await test("Jikan timeouts leave a phone streaming an episode room to answer, and desktop more than before", async () => {
    const phone = worker({ afl: "ok", jikan: "hang", ua: "iPhone" });
    await phone.resolve("totally-unlisted-show", { title: "Totally Unlisted Show" });
    assert.ok(phone.timers.includes(8000), "search allows 8 seconds");
    assert.ok(!phone.timers.includes(5000) && !phone.timers.includes(2500), "the old 2.5 and 5 second limits are gone");
    const desktop = worker({ afl: "ok", jikan: "hang", ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/130" });
    await desktop.resolve("totally-unlisted-show", { title: "Totally Unlisted Show" });
    assert.ok(desktop.timers.includes(5000) && !desktop.timers.includes(3500));
  });

  await test("one slow Jikan answer does not pause it; two in a row pause it for minutes, longer each time, and an answer resets the count", async () => {
    const h = worker({ jikan: "hang" });
    const breaker = () => vm.runInContext("({ open: globalThis.__jikanCircuitBroken === true, until: globalThis.__jikanCircuitBrokenUntil || 0, strikes: globalThis.__jikanTimeouts || 0 })", h.c);
    await h.resolve("totally-unlisted-show", { title: "Totally Unlisted Show" });
    assert.equal(breaker().open, false, "a single timeout leaves Jikan open");
    await h.resolve("totally-unlisted-show", { title: "Totally Unlisted Show", forceFillerRefresh: true });
    let state = breaker();
    assert.equal(state.open, true, "two in a row pause it");
    assert.equal(state.until - NOW, 2 * MINUTE, "for two minutes, not an hour");
    h.advance(2 * MINUTE + 1);
    await h.resolve("totally-unlisted-show", { title: "Totally Unlisted Show", forceFillerRefresh: true });
    state = breaker();
    assert.equal(state.until - (NOW + 2 * MINUTE + 1), 5 * MINUTE, "the next timeout pauses it longer");
    h.advance(5 * MINUTE + 1);
    h.mode.jikan = "listed";
    const answered = await h.resolve("totally-unlisted-show", { title: "Totally Unlisted Show", forceFillerRefresh: true });
    assert.equal(answered.fillerResult.status, "fetched");
    assert.equal(breaker().strikes, 0, "an answer resets the count");
  });

  await test("titles that differ only in word breaks match, and containment alone still does not", async () => {
    const h = worker();
    const T = h.c.AnimeTrackerTitleMatch;
    assert.equal(T.similarity("Dandadan", "DAN DA DAN"), 0.99);
    assert.equal(T.matchKind("Dandadan", "DAN DA DAN"), "variant");
    const dandadan = await h.c.discoverFillerSlug("dandadan", "Dandadan", { info: info("Dandadan") });
    assert.equal(dandadan?.slug, "dandadan", "found in the AnimeFillerList index");
    assert.equal(T.bestMatch(["Naruto"], [{ id: "naruto-shippuden", title: "Naruto Shippuden" }], 0.82), null);
    assert.ok(T.similarity("Dragon Ball", "Dragon Ball Z") < 1, "a sequel marker is still a different show");
    assert.ok(T.similarity("Ab C", "Abc") < 0.99, "titles under four letters are never merged by spacing");
  });

  await test("the row tells an unreachable site, a paused lookup and a plain failure apart", async () => {
    const h = worker();
    const detail = (error) => vm.runInContext("formatMetadataRepairDetail", h.c)({ status: "cached" }, { status: "failed", error });
    assert.equal(detail("afl_index_unavailable: HTTP 403"), "info cached • filler site unreachable (HTTP 403)");
    assert.equal(detail("afl_index_unavailable: Load failed"), "info cached • filler site unreachable (Load failed)");
    assert.equal(detail("jikan_circuit_open"), "info cached • filler paused, retry later");
    assert.equal(detail("Load failed"), "info cached • filler unavailable (Load failed)");
    assert.equal(detail("x".repeat(60)), "info cached • filler unavailable", "a long raw error is not squeezed into the row");
    assert.equal(detail("jikan_search_timeout"), "info cached • filler timed out");
    assert.equal(detail("jikan_rate_limited"), "info cached • filler rate limited");
  });

  await test("losing the connection leaves a cache entry exactly as it was", async () => {
    const h = worker({ seed: { episodeTypes_bleach: prior() } });
    h.nav.onLine = false;
    const result = await h.resolve("bleach");
    assert.equal(result.fillerResult.status, "failed");
    assert.deepEqual(h.store.episodeTypes_bleach, prior(), "no retry stamp and no change at all");
    assert.equal(h.store.animeinfo_bleach.retryable, undefined);
    assert.equal(h.calls.jikan, 0);
  });

  await test("an offline sweep waits for the connection instead of failing every show, then finishes by itself", async () => {
    const h = worker({ seed: { animeData: library() } });
    h.nav.onLine = false;
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(async () => (await h.c.getMetadataRepairState())?.waitingForNetwork === true);
    await settle();
    const paused = await h.c.getMetadataRepairState();
    assert.equal(paused.status, "running");
    assert.equal(paused.waitingForNetwork, true);
    assert.deepEqual([paused.processed, paused.queueIndex, paused.failed], [0, 0, 0], "the queue is exactly where it was");
    assert.equal(h.calls.aflIndex + h.calls.aflShow + h.calls.jikan + h.calls.offline, 0, "no request is made while offline");
    assert.deepEqual(missEntries(h.store), []);
    assert.ok(h.alarms.some((alarm) => alarm.name === "metadataRepairTick"), "an alarm is armed to try again");
    h.nav.onLine = true;
    await h.c.runMetadataRepairBatch();
    const done = await h.c.getMetadataRepairState();
    assert.equal(done.status, "completed");
    assert.notEqual(done.waitingForNetwork, true, "the waiting flag is cleared");
    assert.deepEqual([done.processed, done.fetched, done.failed], [4, 4, 0]);
  });

  await test("a connection lost in the middle of the queue stops at that show without counting it", async () => {
    const h = worker({ seed: { animeData: library() } });
    // Cut the connection as soon as the second show starts, so its request fails while the browser reports offline.
    let started = 0;
    const realFetch = h.c.fetch;
    h.c.fetch = (url, options) => { if (url.startsWith("https://www.animefillerlist.com/shows/") && ++started === 2) h.nav.onLine = false; return realFetch(url, options); };
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(async () => (await h.c.getMetadataRepairState())?.waitingForNetwork === true);
    await settle();
    const paused = await h.c.getMetadataRepairState();
    assert.equal(paused.status, "running");
    assert.equal(paused.failed, 0, "the interrupted show is not a failure");
    assert.equal(paused.queueIndex, paused.processed, "and it has not been consumed, so it runs again");
    assert.equal(paused.fetched, 1);
    assert.deepEqual(missEntries(h.store), []);
    h.nav.onLine = true;
    await h.c.runMetadataRepairBatch();
    const done = await h.c.getMetadataRepairState();
    assert.deepEqual([done.status, done.processed, done.fetched, done.failed], ["completed", 4, 4, 0]);
  });

  // Shows AnimeFillerList does not list go to Jikan. While the episode plays, Jikan answers slowly.
  const UNLISTED = [["unlisted-a", "Quiet Harbor Days"], ["unlisted-b", "Lantern Street Diaries"], ["unlisted-c", "Paper Moon Courier"], ["unlisted-d", "Glass Orchard Stories"]];
  const unlistedSeed = () => ({
    animeData: Object.fromEntries(UNLISTED.map(([slug, title]) => [slug, { title, episodes: [{ number: 1, watchedAt: "2026-10-01T10:00:00Z", duration: 1400 }] }])),
    ...Object.fromEntries(UNLISTED.map(([slug, title]) => [`animeinfo_${slug}`, info(title)])),
  });

  // The slow shows come first in the library, so a run that waited at them would finish nothing else.
  const mixedSeed = () => { const seed = unlistedSeed(); seed.animeData = { ...seed.animeData, ...library() }; return seed; };
  const state = (h) => h.c.getMetadataRepairState();
  const waitingForJikan = async (h) => { const s = await state(h); return s?.status === "completed" || Number(s?.waitingForJikanUntil) > vm.runInContext("Date.now()", h.c); };

  await test("a show Jikan is slow on goes to the end of the queue and every other show still finishes", async () => {
    const h = worker({ jikan: "hang", seed: mixedSeed() });
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(() => waitingForJikan(h));
    await settle();
    const paused = await state(h);
    assert.equal(paused.status, "running");
    assert.deepEqual([paused.processed, paused.fetched, paused.failed], [4, 4, 0], "the four AnimeFillerList shows finished while Jikan hung");
    const left = paused.items.slice(paused.queueIndex);
    assert.deepEqual(left.map((item) => item.slug), UNLISTED.map(([slug]) => slug), "the slow shows wait at the end, in their order");
    assert.ok(left.every((item) => item.jikanDeferrals === 1));
    assert.equal(paused.items.length, 8, "nothing is dropped or added");
    assert.equal(paused.waitingForJikanUntil, NOW + 2 * MINUTE, "only they wait, until Jikan reopens");
    assert.ok(h.alarms.some((alarm) => alarm.name === "metadataRepairTick" && alarm.options.when > paused.waitingForJikanUntil), "an alarm brings it back");
    // Woken early (the popup nudges it every few seconds), or by a restarted worker that forgot the pause: Jikan is not asked.
    const requests = h.calls.jikan;
    await h.c.runMetadataRepairBatch();
    vm.runInContext("globalThis.__jikanCircuitBroken = false; globalThis.__jikanCircuitBrokenUntil = 0;", h.c);
    await h.c.runMetadataRepairBatch();
    assert.equal(h.calls.jikan, requests);
    assert.equal((await state(h)).queueIndex, 4);
    // Jikan answers again once the wait is over.
    h.advance(2 * MINUTE + 1);
    h.mode.jikan = "listed";
    await h.c.runMetadataRepairBatch();
    await until(async () => (await state(h))?.status === "completed");
    const done = await state(h);
    assert.deepEqual([done.status, done.processed, done.fetched, done.failed], ["completed", 8, 8, 0]);
    assert.ok(!(done.waitingForJikanUntil > 0), "the wait is cleared");
  });

  await test("while Jikan stays down the run waits for it three times at most, then counts the shows left and ends", async () => {
    const h = worker({ jikan: "hang", seed: unlistedSeed() });
    await h.c.startLibraryRepair({ origin: "manual" });
    const waits = [];
    for (let round = 0; round < 6; round++) {
      await until(() => waitingForJikan(h));
      await settle();
      const s = await state(h);
      if (s.status === "completed") break;
      waits.push((s.waitingForJikanUntil - vm.runInContext("Date.now()", h.c)) / MINUTE);
      h.advance(s.waitingForJikanUntil - vm.runInContext("Date.now()", h.c) + 1000);
      await h.c.runMetadataRepairBatch();
    }
    const done = await state(h);
    assert.deepEqual(waits, [2, 5, 10], "three waits, each as long as Jikan's own pause");
    assert.deepEqual([done.status, done.processed, done.failed], ["completed", 4, 4]);
    assert.ok(done.items.every((item) => item.jikanDeferrals >= 1 && item.jikanDeferrals <= 5));
    assert.ok(done.logs.every((entry) => /filler/.test(entry.detail)), "each row names the filler lookup");
    assert.ok(h.calls.jikan <= 6, `a request or two per wait, not one per show each time (${h.calls.jikan})`);
  });

  await test("a show not yet tried runs before the ones waiting for Jikan, even when a reorder put it behind them", async () => {
    const items = [{ slug: "unlisted-a", title: "Quiet Harbor Days", jikanDeferrals: 1 }, { slug: "noragami", title: "Noragami" }];
    const seed = { ...unlistedSeed(), metadataRepairState: { runId: "reordered", status: "running", origin: "manual", uiMode: "modal",
      total: 2, fetchTotal: 2, queueIndex: 0, processed: 0, fetched: 0, cached: 0, skipped: 0, failed: 0, logs: [], items,
      jikanPausedUntil: NOW + 5 * MINUTE, options: { forceInfoRefresh: false, forceFillerRefresh: false } } };
    const h = worker({ jikan: "hang", seed });
    await h.c.runMetadataRepairBatch();
    const s = await state(h);
    assert.deepEqual(s.items.map((item) => item.slug), ["noragami", "unlisted-a"]);
    assert.deepEqual([s.status, s.processed, s.fetched, s.queueIndex], ["running", 1, 1, 1]);
    assert.equal(s.waitingForJikanUntil, NOW + 5 * MINUTE);
    assert.equal(h.calls.jikan, 0);
  });

  await test("a run 8.2.14 left waiting at its first show carries on at once after the update", async () => {
    const items = SHOWS.slice(0, 4).map(([slug, title]) => ({ slug, title }));
    const seed = { animeData: library(), metadataRepairState: { runId: "stuck", status: "running", origin: "manual", uiMode: "modal",
      total: 4, fetchTotal: 4, queueIndex: 0, processed: 0, fetched: 0, cached: 0, skipped: 0, failed: 0, logs: [], items,
      waitingForJikanUntil: NOW + 20 * MINUTE, jikanWaitIndex: 0, jikanWaits: 1, options: { forceInfoRefresh: false, forceFillerRefresh: true } } };
    const h = worker({ seed });
    await h.c.runMetadataRepairBatch();
    await until(async () => (await state(h))?.status === "completed");
    const done = await state(h);
    assert.deepEqual([done.status, done.processed, done.fetched, done.failed], ["completed", 4, 4, 0]);
  });

  await test("Fetch & Import pressed during a Jikan wait tries the waiting shows at once", async () => {
    const h = worker({ jikan: "hang", seed: unlistedSeed() });
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(() => waitingForJikan(h));
    await settle();
    assert.ok((await state(h)).waitingForJikanUntil > NOW);
    h.mode.jikan = "listed";
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(async () => (await state(h))?.status === "completed");
    const done = await state(h);
    assert.deepEqual([done.processed, done.fetched, done.failed], [4, 4, 0]);
  });

  await test("a run that is waiting for the connection is not restarted in a loop by a pending repair flag", async () => {
    const h = worker({ seed: { animeData: library() } });
    h.nav.onLine = false;
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(async () => (await h.c.getMetadataRepairState())?.waitingForNetwork === true);
    await settle();
    await h.c.bgStorageSet({ pendingBackgroundMetadataRepair: true });
    await h.c.runMetadataRepairBatch();
    await settle();
    const quiet = h.writes();
    await settle();
    await settle();
    assert.equal(h.runaway(), false, "storage is not being rewritten in a loop");
    assert.equal(h.writes(), quiet, "and it stays quiet until the alarm or the online event");
  });

  await test("a sweep with the site down keeps earlier data on disk and still reports every failure as a retry", async () => {
    const h = worker({ afl: "down", seed: { animeData: library(), episodeTypes_bleach: prior() } });
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(async () => (await h.c.getMetadataRepairState())?.status === "completed");
    const state = await h.c.getMetadataRepairState();
    assert.equal(state.failed, 4, "each failure stays a visible retry until it recovers");
    assert.deepEqual(h.store.episodeTypes_bleach.filler, [2, 5], "but bleach keeps the filler data it already had");
    assert.deepEqual(h.store.episodeTypes_bleach.canon, [1, 3, 4]);
    assert.equal(h.store.episodeTypes_bleach.retryable, true, "and is still due for a refresh later");
  });

  await test("after an update with no connection, fresh caches are neither fetched again nor touched", async () => {
    // What onInstalled('update') asks for: an unforced background sweep. Everything below is still fresh.
    const fresh = () => ({ canon: [1, 3, 4], filler: [2, 5], mixed: [], anime_canon: [], totalEpisodes: 28, schemaVersion: 3, cachedAt: NOW - HOUR, _source: "afl" });
    const seed = { animeData: library(), ...Object.fromEntries(SHOWS.slice(0, 4).map(([slug]) => [`episodeTypes_${slug}`, fresh()])) };
    const h = worker({ seed });
    const before = structuredClone(Object.fromEntries(Object.entries(h.store).filter(([key]) => key.startsWith("animeinfo_") || key.startsWith("episodeTypes_"))));
    h.nav.onLine = false;
    await h.c.bgStorageSet({ pendingBackgroundMetadataRepair: true });
    await h.c.maybeStartPendingMetadataRepair();
    await until(async () => (await h.c.getMetadataRepairState())?.status === "completed");
    const state = await h.c.getMetadataRepairState();
    assert.equal(state.status, "completed", "the sweep finishes at once, with nothing to wait for");
    assert.notEqual(state.waitingForNetwork, true);
    assert.deepEqual([state.fetched, state.failed], [0, 0]);
    assert.equal(h.calls.aflIndex + h.calls.aflShow + h.calls.jikan + h.calls.offline, 0, "no request is attempted");
    const after = Object.fromEntries(Object.entries(h.store).filter(([key]) => key.startsWith("animeinfo_") || key.startsWith("episodeTypes_")));
    assert.deepEqual(after, before, "every cached entry is exactly as it was");
  });

  await test("a Jikan request that hangs while the connection drops does not close Jikan for an hour", async () => {
    const circuit = (h) => vm.runInContext("globalThis.__jikanCircuitBroken === true", h.c);
    // The connection dies while the search is waiting for an answer, so the timeout fires with the browser offline.
    const dropped = worker({ jikan: "hang" });
    const realFetch = dropped.c.fetch;
    dropped.c.fetch = (url, options) => { const answer = realFetch(url, options); if (url.startsWith("https://api.jikan.moe/")) dropped.nav.onLine = false; return answer; };
    const result = await dropped.resolve("totally-unlisted-show", { title: "Totally Unlisted Show" });
    assert.equal(result.fillerResult.status, "failed");
    assert.equal(circuit(dropped), false, "the circuit stays closed");
    assert.equal(dropped.store["episodeTypes_totally-unlisted-show"], undefined, "and nothing is cached for the show");
    // Control: the same hang twice with the connection up is Jikan's own slowness and still pauses it.
    const slow = worker({ jikan: "hang" });
    await slow.resolve("totally-unlisted-show", { title: "Totally Unlisted Show" });
    await slow.resolve("totally-unlisted-show", { title: "Totally Unlisted Show", forceFillerRefresh: true });
    assert.equal(circuit(slow), true);
  });

  await test("failures are not retried while offline, and still are when online", async () => {
    const attemptsWith = async (onLine) => {
      const h = worker({ ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/130" });
      h.nav.onLine = onLine;
      let attempts = 0;
      await assert.rejects(h.c.runMetadataRepairWithRetry(async () => { attempts++; throw new Error("Load failed"); }, { attempts: 3, baseDelayMs: 1 }));
      return attempts;
    };
    assert.equal(await attemptsWith(false), 1, "offline: one attempt, no waiting between retries");
    assert.equal(await attemptsWith(true), 3);
  });

  // The phone loses signal: requests first hang (the Jikan circuit opens, the AnimeFillerList failure is
  // remembered), then the browser reports offline and the run pauses. When the signal is back, neither
  // memory may hold the run back, whichever way the worker finds out.
  const outage = async ({ online }) => {
    const h = worker({ afl: "down", seed: { animeData: library() } });
    // A show outside the library, so the failure is remembered without stamping a retry on a queued show.
    await h.resolve("one-piece");
    assert.equal(h.calls.aflIndex, 1);
    vm.runInContext("globalThis.__jikanCircuitBroken = true; globalThis.__jikanCircuitBrokenUntil = Date.now() + 3600000;", h.c);
    h.nav.onLine = false;
    await h.c.startLibraryRepair({ origin: "auto", auto: true });
    await until(async () => (await h.c.getMetadataRepairState())?.waitingForNetwork === true);
    await settle();
    h.mode.afl = "ok";
    await online(h);
    await until(async () => (await h.c.getMetadataRepairState())?.status === "completed");
    return { h, state: await h.c.getMetadataRepairState() };
  };

  await test("coming back online forgets failures from the outage and finishes the run straight away", async () => {
    const { h, state } = await outage({ online: async (h) => h.goOnline() });
    assert.deepEqual([state.status, state.processed, state.fetched, state.failed], ["completed", 4, 4, 0]);
    assert.equal(vm.runInContext("globalThis.__jikanCircuitBroken", h.c), false, "the Jikan circuit is closed");
    assert.deepEqual(missEntries(h.store), []);
  });

  await test("the same happens when the online event never reaches the worker and the alarm resumes the run", async () => {
    const { h, state } = await outage({ online: async (h) => { h.nav.onLine = true; await h.c.runMetadataRepairBatch(); } });
    assert.deepEqual([state.status, state.processed, state.fetched, state.failed], ["completed", 4, 4, 0]);
    assert.equal(vm.runInContext("globalThis.__jikanCircuitBroken", h.c), false);
  });

  await test("the online event alone closes a circuit opened during the outage, with no run in progress", async () => {
    // A lookup from the watch page, not from Fetch & Import, hung on the dying connection before it went offline.
    const h = worker({ jikan: "hang" });
    await h.resolve("totally-unlisted-show", { title: "Totally Unlisted Show" });
    await h.resolve("totally-unlisted-show", { title: "Totally Unlisted Show", forceFillerRefresh: true });
    assert.equal(vm.runInContext("globalThis.__jikanCircuitBroken", h.c), true);
    h.nav.onLine = false;
    h.mode.jikan = "ok";
    h.goOnline();
    await settle();
    assert.equal(vm.runInContext("globalThis.__jikanCircuitBroken", h.c), false);
    const retried = await h.resolve("totally-unlisted-show", { title: "Totally Unlisted Show", forceFillerRefresh: true });
    assert.equal(retried.fillerResult.status, "nofill", "the next lookup reaches Jikan again");
  });

  await test("a run that never waited for the connection leaves an open circuit alone", async () => {
    const h = worker({ seed: { animeData: library() } });
    vm.runInContext("globalThis.__jikanCircuitBroken = true; globalThis.__jikanCircuitBrokenUntil = Date.now() + 3600000;", h.c);
    await h.c.startLibraryRepair({ origin: "auto", auto: true });
    await until(async () => (await h.c.getMetadataRepairState())?.status === "completed");
    assert.equal(vm.runInContext("globalThis.__jikanCircuitBroken", h.c), true);
  });

  await test("a Jikan failure that slips through while offline is labelled as such", async () => {
    const h = worker();
    const detail = vm.runInContext("formatMetadataRepairDetail", h.c)({ status: "cached" }, { status: "failed", error: "jikan_offline" });
    assert.equal(detail, "info cached • filler offline, retry later");
  });

  await test("with AnimeFillerList unreachable, Jikan fills in filler data for a show that had none", async () => {
    const h = worker({ afl: "down", jikan: "listed" });
    const result = await h.resolve("noragami");
    assert.equal(result.fillerResult.status, "fetched");
    const entry = h.store.episodeTypes_noragami;
    assert.deepEqual(entry.filler, [7, 14, 21, 28]);
    assert.equal(entry._source, "jikan");
    assert.equal(entry.aflFallback, true, "marked so it moves back to AnimeFillerList later");
    assert.equal(entry.retryable, undefined);
    const detail = vm.runInContext("formatMetadataRepairDetail", h.c)(result.infoResult, result.fillerResult);
    assert.equal(detail, "info cached • 4 fillers / 28 eps");
  });

  await test("a Jikan answer with a different episode count is not used as a stand-in", async () => {
    // A 12-episode MAL entry for a 28-episode show is another season or another show: its marks would land on
    // the wrong episodes, which is worse than none.
    const h = worker({ afl: "down", jikan: "listed" });
    h.mode.jikanEpisodes = 12;
    const result = await h.resolve("noragami");
    assert.equal(result.fillerResult.status, "failed");
    assert.equal(result.fillerResult.error, "afl_index_unavailable: Load failed");
    assert.equal(h.store.episodeTypes_noragami._source, undefined);
    assert.deepEqual(missEntries(h.store), []);
  });

  await test("data already cached from AnimeFillerList is kept rather than replaced by Jikan", async () => {
    const h = worker({ afl: "down", jikan: "listed", seed: { episodeTypes_bleach: prior() } });
    const result = await h.resolve("bleach");
    assert.equal(result.fillerResult.status, "failed");
    assert.equal(h.calls.jikan, 0);
    assert.deepEqual(h.store.episodeTypes_bleach.filler, [2, 5]);
  });

  await test("a show page that cannot be read also falls back, and without Jikan data names the site", async () => {
    const slugHit = { fillerslug_noragami: { slug: "noragami", score: 1, matchedVia: "Noragami", kind: "exact", needsOffset: false, indexVersion: 1, schemaVersion: 4, cachedAt: NOW } };
    const listed = worker({ afl: "challenge", jikan: "listed", seed: slugHit });
    const fallback = await listed.resolve("noragami");
    assert.equal(fallback.fillerResult.status, "fetched");
    assert.equal(listed.store.episodeTypes_noragami._source, "jikan");
    const unlisted = worker({ afl: "challenge", seed: slugHit });
    const failed = await unlisted.resolve("noragami");
    assert.equal(failed.fillerResult.error, "afl_page_unavailable: blocked by Cloudflare");
    const detail = vm.runInContext("formatMetadataRepairDetail", unlisted.c)(failed.infoResult, failed.fillerResult);
    assert.equal(detail, "info cached • filler site unreachable (blocked by Cloudflare)");
    assert.deepEqual(missEntries(unlisted.store), []);
  });

  await test("when Jikan fails too, the row still names the AnimeFillerList failure", async () => {
    const h = worker({ afl: "403", jikan: "down" });
    const result = await h.resolve("noragami");
    assert.equal(result.fillerResult.error, "afl_index_unavailable: HTTP 403");
    assert.equal(h.store.episodeTypes_noragami.retryable, true);
  });

  await test("a Cloudflare challenge and a site the extension may not reach are named as such", async () => {
    const challenged = await worker({ afl: "challenge" }).resolve("noragami");
    assert.equal(challenged.fillerResult.error, "afl_index_unavailable: blocked by Cloudflare");
    // Control: a 503 passed through Cloudflare is the site being down, not a block.
    const down = await worker({ afl: "503" }).resolve("noragami");
    assert.equal(down.fillerResult.error, "afl_index_unavailable: HTTP 503");
    const noAccess = await worker({ afl: "down", siteAccess: false }).resolve("noragami");
    assert.equal(noAccess.fillerResult.error, "afl_index_unavailable: no site access");
    // Control: with access granted, a network failure is still reported as it came.
    const allowed = await worker({ afl: "down", siteAccess: true }).resolve("noragami");
    assert.equal(allowed.fillerResult.error, "afl_index_unavailable: Load failed");
  });

  await test("Jikan stand-in data is checked again after three days and replaced once AnimeFillerList answers", async () => {
    const h = worker({ afl: "down", jikan: "listed" });
    await h.resolve("noragami");
    const policy = h.c.AnimeTrackerCachePolicy;
    const finished = h.store.animeinfo_noragami;
    h.advance(3 * DAY - MINUTE);
    assert.equal(policy.isFillerFresh(h.store.episodeTypes_noragami, finished), true);
    h.advance(2 * MINUTE);
    assert.equal(policy.isFillerFresh(h.store.episodeTypes_noragami, finished), false, "stale after three days");
    assert.equal(policy.isFillerFresh({ ...h.store.episodeTypes_noragami, aflFallback: undefined, _source: "animefillerlist" }, finished), true, "AnimeFillerList data keeps its seven days");
    h.mode.afl = "ok";
    h.c.resetFillerFetchBreakers();
    const refreshed = await h.resolve("noragami");
    assert.equal(refreshed.fillerResult.status, "fetched");
    assert.equal(h.store.episodeTypes_noragami._source, "animefillerlist");
    assert.equal(h.store.episodeTypes_noragami.aflFallback, undefined);
  });

  await test("Jikan returns every episode of a very long series instead of stopping at 1000", async () => {
    const seed = { "animeinfo_one-piece": { ...info("One Piece"), totalEpisodes: 1150, latestEpisode: 1150 } };
    const h = worker({ afl: "down", jikan: "listed", seed });
    h.mode.jikanEpisodes = 1150;
    const result = await h.resolve("one-piece");
    assert.equal(result.fillerResult.status, "fetched", result.fillerResult.error);
    assert.equal(h.store["episodeTypes_one-piece"].totalEpisodes, 1150);
    assert.equal(h.calls.jikan, 1 + 12, "one search and twelve pages");
  });

  await test("a denied sweep waits without fetching and resumes the same queue when access is granted", async () => {
    const h = worker({ afl: "down", siteAccess: false, seed: { animeData: library() } });
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(async () => { const s = await h.c.getMetadataRepairState(); return s?.waitingForAccess || s?.status === "completed"; });
    const blocked = await h.c.getMetadataRepairState();
    assert.equal(blocked.waitingForAccess, true);
    assert.deepEqual([blocked.queueIndex, blocked.processed, blocked.failed], [0, 0, 0]);
    assert.equal(h.calls.aflIndex + h.calls.aflShow + h.calls.jikan, 0, "permission denial is checked before any request");
    assert.equal(h.store.episodeTypes_noragami, undefined, "no retry stamp was written");
    // The user taps Allow (or allows the extension in Settings), and runs Fetch & Import again at once.
    h.mode.afl = "ok";
    h.grantAccess();
    await until(async () => (await h.c.getMetadataRepairState())?.status === "completed");
    const after = await h.c.getMetadataRepairState();
    assert.equal(after.runId, blocked.runId, "continue the existing queue rather than restarting successful work");
    assert.deepEqual([after.fetched, after.failed], [4, 0], "nothing waits out a retry stamp");
    // Control: an ordinary network failure still earns its stamp.
    const network = worker({ afl: "down", siteAccess: true });
    await network.resolve("noragami");
    assert.equal(network.store.episodeTypes_noragami.retryable, true);
  });

  await test("startup resumes no network work without access and preserves saved progress and queue position", async () => {
    const state = { runId: "before-update", status: "running", origin: "manual", uiMode: "modal", total: 4, fetchTotal: 4,
      queueIndex: 2, processed: 2, fetched: 2, cached: 0, skipped: 0, failed: 0, logs: [],
      items: SHOWS.slice(0, 4).map(([slug, title]) => ({ slug, title })), options: { forceInfoRefresh: false, forceFillerRefresh: false } };
    const progress = { "bleach__episode-3": { currentTime: 360, duration: 1200 } };
    const h = worker({ siteAccess: false, seed: { metadataRepairState: state, videoProgress: progress, episodeTypes_bleach: prior() } });
    await h.c.resumeMetadataRepairIfNeeded();
    await until(async () => { const s = await h.c.getMetadataRepairState(); return s?.waitingForAccess || s?.status === "completed"; });
    assert.equal(h.calls.aflIndex + h.calls.aflShow + h.calls.jikan, 0);
    const paused = await h.c.getMetadataRepairState();
    assert.deepEqual([paused.runId, paused.queueIndex, paused.processed, paused.fetched, paused.failed], ["before-update", 2, 2, 2, 0]);
    assert.deepEqual(h.store.videoProgress, progress);
    assert.deepEqual(h.store.episodeTypes_bleach, prior());
    await h.c.bgStorageSet({ pendingBackgroundMetadataRepair: true });
    await h.c.runMetadataRepairBatch(); await settle();
    const quiet = h.writes(); await settle(); await settle();
    assert.equal(h.runaway(), false);
    assert.equal(h.writes(), quiet, "no pending-work restart loop while permission is withheld");
    h.nav.onLine = false;
    const alarmCount = h.alarms.length;
    await h.c.runMetadataRepairBatch();
    assert.equal(h.alarms.length, alarmCount, "a permission pause stays alarm-free if connectivity also drops");
    assert.equal((await h.c.getMetadataRepairState()).waitingForNetwork, undefined);
  });

  await test("access revoked between items pauses before the next request without adding a failure", async () => {
    const h = worker({ siteAccess: true, seed: { animeData: library() } });
    const fetch = h.c.fetch;
    h.c.fetch = (url, options) => { const response = fetch(url, options); if (url.startsWith("https://www.animefillerlist.com/shows/")) h.mode.siteAccess = false; return response; };
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(async () => { const s = await h.c.getMetadataRepairState(); return s?.waitingForAccess || s?.status === "completed"; });
    const paused = await h.c.getMetadataRepairState();
    assert.equal(paused.waitingForAccess, true);
    assert.deepEqual([paused.queueIndex, paused.fetched, paused.failed], [1, 1, 0]);
    assert.equal(h.calls.aflShow, 1);
  });

  await test("a legacy partially failed manual queue retries old failures once after consent", async () => {
    const items = SHOWS.slice(0, 4).map(([slug, title]) => ({ slug, title }));
    const state = { runId: "legacy-denied", status: "running", origin: "manual", uiMode: "modal", fetchTotal: 4, total: 4,
      processed: 2, queueIndex: 2, fetched: 0, cached: 0, skipped: 0, failed: 2, items, logs: [],
      failedItems: items.slice(0, 2).map(item => ({ slug: item.slug, name: item.title, type: "retry", at: NOW })),
      options: { retryFailures: true, forceInfoRefresh: false, forceFillerRefresh: false } };
    const h = worker({ siteAccess: false, seed: { animeData: library(), metadataRepairState: state,
      episodeTypes_noragami: { ...prior(), retryable: true, retryAt: NOW, retryError: "Load failed" },
      episodeTypes_dandadan: { ...prior(), retryable: true, retryAt: NOW, retryError: "Load failed" } } });
    await h.c.resumeMetadataRepairIfNeeded();
    await until(async () => (await h.c.getMetadataRepairState())?.waitingForAccess);
    h.grantAccess();
    await until(async () => { const s = await h.c.getMetadataRepairState(); return s?.status === "completed" && s.runId !== state.runId; });
    const after = await h.c.getMetadataRepairState();
    assert.notEqual(after.runId, state.runId, "the existing queue finishes before one follow-up retry");
    assert.equal(after.failed, 0);
    assert.equal(h.calls.aflShow, 4, "two remaining entries and two old failures, with no successful entry fetched twice");
    assert.equal(h.store.episodeTypes_noragami.retryable, undefined);
  });

  await test("promise-only permission checks pause and unknown answers cannot clear established denial", async () => {
    const h = worker({ seed: { animeData: library() } });
    h.c.browser = { permissions: { contains: async function(details) {
      assert.equal(arguments.length, 1); assert.equal(details.origins.length, 1); return false;
    } } };
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(async () => (await h.c.getMetadataRepairState())?.waitingForAccess);
    assert.equal((await h.c.getMetadataRepairState()).waitingForAccess, true);
    h.c.browser.permissions.contains = async () => { throw new Error("worker suspended"); };
    await h.c.runMetadataRepairBatch();
    assert.equal(h.calls.aflIndex + h.calls.aflShow + h.calls.jikan, 0);
    assert.equal((await h.c.getMetadataRepairState()).waitingForAccess, true);
  });

  await test("a native no-access failure during an item pauses on that item without counting it", async () => {
    const h = worker({ afl: "down", jikan: "down", siteAccess: true, seed: { animeData: library() } });
    const fetch = h.c.fetch;
    h.c.fetch = (url, options) => { if (url === "https://www.animefillerlist.com/shows") h.mode.siteAccess = false; return fetch(url, options); };
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(async () => { const s = await h.c.getMetadataRepairState(); return s?.waitingForAccess || s?.status === "completed"; });
    const paused = await h.c.getMetadataRepairState();
    assert.equal(paused.waitingForAccess, true);
    assert.deepEqual([paused.queueIndex, paused.processed, paused.failed], [0, 0, 0]);
    assert.equal(h.calls.aflIndex, 1, "a denial learned in flight must not walk the rest of the library");
  });

  await test("Jikan access revoked during fallback keeps the same item and avoids cache retry stamps", async () => {
    const h = worker({ afl: "down", jikan: "down", siteAccess: true, seed: { animeData: library() } });
    let jikanDenied = false;
    h.c.chrome.permissions.contains = (details, callback) => callback(!(jikanDenied && details.origins.includes("https://api.jikan.moe/*")));
    const fetch = h.c.fetch;
    h.c.fetch = (url, options) => { if (url.startsWith("https://api.jikan.moe/")) jikanDenied = true; return fetch(url, options); };
    await h.c.startLibraryRepair({ origin: "manual" });
    await until(async () => { const s = await h.c.getMetadataRepairState(); return s?.waitingForAccess || s?.status === "completed"; });
    const paused = await h.c.getMetadataRepairState();
    assert.equal(paused.waitingForAccess, true);
    assert.deepEqual([paused.queueIndex, paused.processed, paused.failed], [0, 0, 0]);
    assert.deepEqual(Array.from(paused.blockedOrigins), ["https://api.jikan.moe/*"]);
    assert.equal(h.store.episodeTypes_noragami, undefined, "the browser setting does not stamp a show with backoff");
  });

  await test("a granted permission clears the remembered failure for the next automatic run", async () => {
    const h = worker({ afl: "down", siteAccess: false });
    await h.resolve("noragami");
    h.mode.afl = "ok";
    h.mode.siteAccess = true;
    assert.equal((await h.resolve("noragami", { forceFillerRefresh: true })).fillerResult.status, "failed", "still remembered without the event");
    h.grantAccess();
    assert.equal((await h.resolve("noragami", { forceFillerRefresh: true })).fillerResult.status, "fetched");
  });

  process.exitCode = failures ? 1 : 0;
})();
