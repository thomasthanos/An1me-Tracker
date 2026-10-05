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
function worker({ afl = "ok", jikan = "ok", ua = "iPhone", seed = {} } = {}) {
  const store = structuredClone(seed), calls = { aflIndex: 0, aflShow: 0, jikan: 0 }, timers = [];
  const mode = { afl, jikan };
  let time = NOW;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } }
  for (const [slug, title] of SHOWS) if (!(`animeinfo_${slug}` in store)) store[`animeinfo_${slug}`] = info(title);
  const c = vm.createContext({
    Date: Clock, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, AbortController, Response,
    navigator: { userAgent: ua, platform: ua },
    setTimeout(fn, ms) { timers.push(ms); return setTimeout(fn, 0); }, clearTimeout,
    bgStorageGet: async (keys) => structuredClone(keys === null ? store : Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]))),
    bgStorageSet: async (patch) => { Object.assign(store, structuredClone(patch)); },
    bgStorageRemove: async (keys) => keys.forEach((k) => delete store[k]),
    fetch(url, options = {}) {
      const hang = () => new Promise((_, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (options.signal?.aborted) abort(); else options.signal?.addEventListener("abort", abort, { once: true });
      });
      if (url === "https://www.animefillerlist.com/shows") {
        calls.aflIndex++;
        return mode.afl === "down" ? Promise.reject(new TypeError("Load failed")) : mode.afl === "403" ? Promise.resolve(new Response("", { status: 403 })) : Promise.resolve(new Response(INDEX_HTML));
      }
      if (url.startsWith("https://www.animefillerlist.com/shows/")) {
        calls.aflShow++;
        return mode.afl === "down" ? Promise.reject(new TypeError("Load failed")) : Promise.resolve(new Response(showPage(28)));
      }
      if (url.startsWith("https://api.jikan.moe/")) {
        calls.jikan++;
        return mode.jikan === "hang" ? hang() : Promise.resolve(new Response(JSON.stringify({ data: [] })));
      }
      return Promise.reject(new Error("unexpected request " + url));
    },
    chrome: { runtime: { getManifest: () => ({ version: "8.2.1" }) }, alarms: { create() {}, clear: async () => true }, tabs: { query: async () => [] } },
    dlog() {},
  });
  c.self = c;
  for (const file of ["src/common/utils.js", "src/common/data/title-match.js", "src/common/data/cache-policy.js", "src/common/data/merge-utils.js"]) vm.runInContext(read(file), c);
  vm.runInContext("const isLikelyMovieSlug = AnimeTrackerMergeUtils.isLikelyMovieSlug;", c);
  for (const file of ["src/background/fetchers/filler-discovery.js", "src/background/jobs/metadata-repair.js", "src/background/anime-resolver.js"]) vm.runInContext(read(file), c);
  const resolve = (slug, options = {}) => c.AnimeTrackerAnimeResolver.resolve(slug, { title: Object.fromEntries(SHOWS)[slug] || slug, includeEpisodeTypes: true, ...options });
  return { c, store, calls, timers, mode, resolve, advance: (ms) => { time += ms; } };
}

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log("PASS " + name); } catch (error) { failures++; console.error("FAIL " + name + ": " + error.message); }
}
const missEntries = (store) => Object.entries(store).filter(([key, value]) => (key.startsWith("episodeTypes_") || key.startsWith("fillerslug_")) && value?.notFound);

(async () => {
  await test("an unreachable index fails every show retryably after one request, with no Jikan lookups and no false 'no filler'", async () => {
    const seed = { episodeTypes_bleach: prior() };
    const h = worker({ afl: "down", seed });
    const results = [];
    for (const [slug] of SHOWS) results.push(await h.resolve(slug));
    assert.equal(h.calls.aflIndex, 1, "the index is requested once for the whole sweep");
    assert.equal(h.calls.jikan, 0, "the lookup is not handed to Jikan");
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
    assert.equal(h.calls.jikan, 0);
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

  await test("Jikan timeouts leave a phone on mobile data room to answer, and desktop is unchanged", async () => {
    const phone = worker({ afl: "ok", jikan: "hang", ua: "iPhone" });
    await phone.resolve("totally-unlisted-show", { title: "Totally Unlisted Show" });
    assert.ok(phone.timers.includes(5000), "search allows 5 seconds");
    assert.ok(!phone.timers.includes(2500), "the old 2.5 second limit is gone");
    const desktop = worker({ afl: "ok", jikan: "hang", ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/130" });
    await desktop.resolve("totally-unlisted-show", { title: "Totally Unlisted Show" });
    assert.ok(desktop.timers.includes(3500));
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

  process.exitCode = failures ? 1 : 0;
})();
