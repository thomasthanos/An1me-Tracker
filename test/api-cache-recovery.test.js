const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
let failures = 0;
async function test(name, fn) { try { await fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.message}`); } }
function worker(responses, initial = {}) {
  let now = Date.now(), calls = 0;
  class Clock extends Date { static now() { return now; } }
  const store = structuredClone(initial);
  const c = vm.createContext({ Date: Clock, console, AbortController, setTimeout, clearTimeout,
    fetch: async () => { calls++; const result = responses.shift(); if (result instanceof Error) throw result; if (!result) throw Error("unexpected fetch"); return result; },
    bgStorageGet: async () => store, bgStorageSet: async data => Object.assign(store, structuredClone(data)),
  });
  c.self = c;
  vm.runInContext(read("src/common/utils.js"), c);
  vm.runInContext(read("src/common/data/title-match.js"), c);
  vm.runInContext(read("src/common/data/cache-policy.js"), c);
  vm.runInContext(read("src/background/fetchers/aniskip.js"), c);
  const s = read("src/background/fetchers/filler-discovery.js");
  vm.runInContext("const FILLER_MATCH_THRESHOLD = 0.82;\n" + s.slice(s.indexOf("async function fetchJikanEpisodes"), s.indexOf("try {\n  globalThis.fillerStats")), c);
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
