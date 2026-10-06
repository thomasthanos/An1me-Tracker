const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "../..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
let failures = 0;
async function test(name, fn) { try { await fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.message}`); } }
// `env` adds globals such as a navigator, to play a phone or a browser that is offline.
function worker(responses, initial = {}, env = {}) {
  let now = Date.now(), calls = 0;
  class Clock extends Date { static now() { return now; } }
  const store = structuredClone(initial);
  const c = vm.createContext({ Date: Clock, console, AbortController, setTimeout, clearTimeout, ...env,
    fetch: async () => { calls++; const result = responses.shift(); if (result instanceof Error) throw result; if (!result) throw Error("unexpected fetch"); return result; },
    bgStorageGet: async () => store, bgStorageSet: async data => Object.assign(store, structuredClone(data)),
  });
  c.self = c;
  vm.runInContext(read("src/common/utils.js"), c);
  vm.runInContext(read("src/common/data/title-match.js"), c);
  vm.runInContext(read("src/common/data/cache-policy.js"), c);
  vm.runInContext(read("src/background/fetchers/aniskip.js"), c);
  const s = read("src/background/fetchers/filler-discovery.js");
  // The Jikan section, with the request helpers it shares with the AnimeFillerList code above it.
  const helpers = s.slice(s.indexOf("// A request of the show Fetch & Import is working on"), s.indexOf("// False only when the browser says"));
  vm.runInContext("const FILLER_MATCH_THRESHOLD = 0.82;\n" + helpers + s.slice(s.indexOf("const JIKAN_MOBILE_SEARCH_TIMEOUT_MS"), s.indexOf("try {\n  globalThis.fillerStats")), c);
  return { c, store, calls: () => calls, advance: ms => now += ms };
}
const response = (status, data) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => data });
const match = response(200, { data: [{ mal_id: 20, title: "Naruto" }] });
(async () => {
  for (const status of [429, 503]) await test(`Jikan search ${status} is retryable instead of a three-day absence`, async () => {
    const h = worker([response(status)]); await assert.rejects(h.c.fetchJikanEpisodes("Naruto"));
  });
  await test("failed Jikan pagination preserves failure rather than an incomplete negative result", async () => {
    const h = worker([response(503)]); await assert.rejects(h.c.fetchJikanEpisodes("Naruto", { malId: 20 }));
  });
  await test("network failure is retryable; a genuine empty search remains a miss", async () => {
    const h = worker([Error("offline"), response(200, { data: [] })]);
    await assert.rejects(h.c.fetchJikanEpisodes("Naruto")); assert.equal(await h.c.fetchJikanEpisodes("Naruto"), null);
  });
  await test("malformed successful search JSON is not cached as absence", async () => {
    const h = worker([response(200, {})]); await assert.rejects(h.c.fetchJikanEpisodes("Naruto"));
  });
  await test("MAL transient failures use short backoff and recover without an hour-long miss", async () => {
    const h = worker([response(503), match]);
    assert.equal(await h.c.getMalIdForSlug("naruto", "Naruto"), null);
    assert.equal(await h.c.getMalIdForSlug("naruto", "Naruto"), null); assert.equal(h.calls(), 1);
    h.advance(5 * 60 * 1000 + 1);
    assert.equal(await h.c.getMalIdForSlug("naruto", "Naruto"), 20); assert.equal(h.calls(), 2);
  });
  await test("legacy MAL HTTP misses are rechecked while confirmed matches retain their cache", async () => {
    const h = worker([match], { malIdForSlugBundle: {
      naruto: { malId: null, httpMiss: true, cachedAt: Date.now() },
      bleach: { malId: 30, matched: true, cachedAt: Date.now() },
    } });
    assert.equal(await h.c.getMalIdForSlug("bleach", "Bleach"), 30); assert.equal(h.calls(), 0);
    assert.equal(await h.c.getMalIdForSlug("naruto", "Naruto"), 20);
  });
  const DAY = 24 * 60 * 60 * 1000;
  const expiredBleach = () => ({ malIdForSlugBundle: { bleach: { malId: 30, matched: true, cachedAt: Date.now() - 31 * DAY } } });
  await test("an expired MAL id survives a failed re-check instead of being replaced by a miss", async () => {
    for (const failure of [Error("Load failed"), response(503)]) {
      const h = worker([failure], expiredBleach());
      assert.equal(await h.c.getMalIdForSlug("bleach", "Bleach"), 30);
      assert.equal(h.calls(), 1, "the re-check was attempted");
      assert.equal(h.store.malIdForSlugBundle.bleach.malId, 30, "and the stored id is untouched");
    }
  });
  await test("a re-check that matches the title still replaces an expired MAL id", async () => {
    const h = worker([response(200, { data: [{ mal_id: 269, title: "Bleach" }] })], expiredBleach());
    assert.equal(await h.c.getMalIdForSlug("bleach", "Bleach"), 269);
    assert.equal(h.store.malIdForSlugBundle.bleach.malId, 269);
  });
  await test("a re-check that finds no match keeps the confirmed MAL id for another full period", async () => {
    const h = worker([match], expiredBleach());
    assert.equal(await h.c.getMalIdForSlug("bleach", "Bleach"), 30);
    assert.equal(await h.c.getMalIdForSlug("bleach", "Bleach"), 30);
    assert.equal(h.calls(), 1, "not searched again on the next episode");
  });
  await test("a phone keeps using an expired MAL id it cannot re-check", async () => {
    const h = worker([], expiredBleach(), { navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", onLine: true } });
    assert.equal(await h.c.getMalIdForSlug("bleach", "Bleach"), 30);
    assert.equal(await h.c.getMalIdForSlug("naruto", "Naruto"), null, "an id it never had is still not looked up");
    assert.equal(h.calls(), 0);
  });
  await test("offline, a show with no MAL id yet is not cached as a miss", async () => {
    const h = worker([Error("Load failed")], {}, { navigator: { userAgent: "", onLine: false } });
    assert.equal(await h.c.getMalIdForSlug("naruto", "Naruto"), null);
    assert.equal(h.store.malIdForSlugBundle?.naruto, undefined, "nothing written");
  });
  const outroCache = (outroStart) => ({
    malIdForSlugBundle: { bleach: { malId: 30, matched: true, cachedAt: Date.now() } },
    aniSkipOutroBundle: { "30:5": { outroStart, cachedAt: Date.now() - 91 * DAY } },
  });
  await test("an expired outro time keeps Skip Outro working when AniSkip cannot be reached", async () => {
    for (const failure of [Error("Load failed"), response(503), response(429)]) {
      const h = worker([failure], outroCache(1300));
      assert.equal(await h.c.fetchAniSkipOutroStart("bleach", "Bleach", 5, 1440), 1300);
      assert.equal(h.store.aniSkipOutroBundle["30:5"].outroStart, 1300, "the cached time is not replaced");
    }
  });
  await test("a 404 from AniSkip is still a confirmed miss", async () => {
    const h = worker([response(404)], outroCache(1300));
    assert.equal(await h.c.fetchAniSkipOutroStart("bleach", "Bleach", 5, 1440), null);
    assert.equal(h.store.aniSkipOutroBundle["30:5"].outroStart, null);
  });
  await test("Jikan requests wait for their turn, about one a second", async () => {
    const h = worker([match, response(200, { data: [{ mal_id: 1 }, { mal_id: 2, filler: true }], pagination: { has_next_page: false } })]);
    const sentAt = [];
    const send = h.c.fetch;
    h.c.fetch = (...args) => { sentAt.push(performance.now()); return send(...args); };
    const types = await h.c.fetchJikanEpisodes("Naruto");
    assert.deepEqual([...types.filler], [2]);
    assert.equal(sentAt.length, 2, "a search, then the episode page");
    assert.ok(sentAt[1] - sentAt[0] >= 950, `the episode page waited ${Math.round(sentAt[1] - sentAt[0])}ms`);
  });
  await test("only legacy negative filler caches expire; valid episode data stays warm", () => {
    const h = worker([]); const p = h.c.AnimeTrackerCachePolicy;
    const old = { schemaVersion: p.EPISODE_TYPES_SCHEMA_VERSION, cachedAt: Date.now() };
    assert.equal(p.isFillerFresh({ ...old, notFound: true }), false);
    assert.equal(p.isFillerFresh({ ...old, canon: [1], filler: [] }), true);
  });
  await test("retrying a negative filler cache after a transient failure uses 15-minute backoff", () => {
    const h = worker([]); const p = h.c.AnimeTrackerCachePolicy;
    const entry = { notFound: true, retryable: true, negativeCacheVersion: 1, schemaVersion: p.EPISODE_TYPES_SCHEMA_VERSION, cachedAt: Date.now(), retryAt: Date.now() };
    assert.equal(p.isFillerFresh(entry), true); h.advance(16 * 60 * 1000); assert.equal(p.isFillerFresh(entry), false);
  });
  process.exitCode = failures ? 1 : 0;
})();
