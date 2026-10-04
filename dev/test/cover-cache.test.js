const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const cover = (n) => `https://s4.anilist.co/file/cover-${n}.jpg`;
const flush = () => new Promise(setImmediate);
async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await flush();
  }
  assert.ok(predicate(), "asynchronous image body work must finish");
}
const imageResponse = () => new Response(new Blob(["cover-image"], { type: "image/jpeg" }), { headers: { "content-type": "image/jpeg" } });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// CacheStorage and extension messaging are external boundaries. Their test doubles
// keep real Response cloning/body consumption and controllable completion ordering.
function page({ putGate = false, matchGate = false, ignoreAbort = false, initial = [] } = {}) {
  const win = new EventTarget(), doc = new EventTarget();
  const requests = [], writes = [], reads = [], gateways = [], revoked = [];
  const stored = new Map(initial.map((url) => [url, imageResponse()]));
  const liveBlobs = new Map(), mounted = [], timers = new Set();
  let serial = 0;
  Object.assign(doc, { hidden: false, visibilityState: "visible", querySelectorAll: () => mounted });
  const cache = {
    async match(url) {
      const gate = deferred(); reads.push({ url, gate });
      if (matchGate) await gate.promise;
      return stored.get(url)?.clone();
    },
    async put(url, response) {
      const gate = deferred(); writes.push({ url, gate });
      const blob = await response.blob();
      if (putGate) await gate.promise;
      stored.set(url, new Response(blob));
    },
    async keys() { return [...stored.keys()].map((url) => new Request(url)); },
    async delete(request) { return stored.delete(typeof request === "string" ? request : request.url); },
  };
  class BlobUrl extends URL {}
  BlobUrl.createObjectURL = (blob) => { const url = `blob:cover-test-${++serial}`; liveBlobs.set(url, blob); return url; };
  BlobUrl.revokeObjectURL = (url) => { revoked.push(url); liveBlobs.delete(url); };
  const location = { href: "chrome-extension://test/popup.html", origin: "chrome-extension://test" };
  Object.assign(win, { location, AnimeTracker: {} });
  const context = vm.createContext({ window: win, document: doc, self: { caches: { open: async () => cache } }, location,
    URL: BlobUrl, Response, Blob, Request, AbortController, console,
    chrome: { runtime: { lastError: null, sendMessage(message, reply) { gateways.push({ message, reply }); } } },
    async fetch(url, options = {}) {
      if (url.startsWith("data:image/")) return imageResponse();
      const gate = deferred(); const request = { url, options, gate }; requests.push(request);
      if (!ignoreAbort) {
        if (options.signal?.aborted) gate.reject(new DOMException("Aborted", "AbortError"));
        else options.signal?.addEventListener("abort", () => gate.reject(new DOMException("Aborted", "AbortError")), { once: true });
      }
      return gate.promise;
    },
    setTimeout(fn, ms) { const timer = { fn, ms }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
  });
  vm.runInContext(read("src/popup/lib/cover-cache.js"), context);
  const api = win.AnimeTracker.CoverCache;
  return { api, win, doc, context, requests, writes, reads, gateways, stored, liveBlobs, revoked, mounted, timers,
    hide() { doc.hidden = true; doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange")); },
    show() { doc.hidden = false; doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange")); },
    close() { win.dispatchEvent(new Event("pagehide")); },
    finish(request) { request.gate.resolve(imageResponse()); },
  };
}

let failures = 0;
async function test(name, run) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.stack}`); }
}

(async () => {
  await test("a 120-cover warm starts at most three jobs and drains them in bounded batches", async () => {
    const h = page();
    const urls = Array.from({ length: 120 }, (_, n) => cover(n));
    const warming = h.api.warm(urls); await flush();
    assert.equal(h.requests.length, 3, "cold warm must not fan out across the library");
    let completed = 0;
    while (completed < 120) {
      const started = h.requests.length;
      assert.ok(started - completed <= 3);
      for (; completed < started; completed++) h.finish(h.requests[completed]);
      await flush();
    }
    await warming;
    assert.equal(h.stored.size, 120); assert.equal(h.liveBlobs.size, 120);
    assert.equal(h.timers.size, 0); h.close();
  });

  await test("a transfer keeps its slot until its cache write finishes", async () => {
    const h = page({ putGate: true });
    const warming = h.api.warm([0, 1, 2, 3, 4].map(cover)); await flush();
    h.requests.slice(0, 3).forEach(h.finish); await until(() => h.writes.length === 3);
    assert.equal(h.writes.length, 3);
    assert.equal(h.requests.length, 3, "an unfinished write still consumes its worker slot");
    h.writes[0].gate.resolve(); await until(() => h.requests.length === 4); assert.equal(h.requests.length, 4);
    h.close(); h.writes.forEach((write) => write.gate.resolve()); await warming;
  });

  await test("overlapping warm calls share the entire cache read and fetch job", async () => {
    const h = page({ matchGate: true });
    const first = h.api.warm([cover(1), cover(1)]), second = h.api.warm([cover(1)]); await flush();
    assert.equal(h.reads.length, 1, "deduplication begins before the async disk lookup");
    h.reads[0].gate.resolve(); await flush(); assert.equal(h.requests.length, 1);
    h.finish(h.requests[0]); await Promise.all([first, second]);
    assert.match(h.api.resolve(cover(1)), /^blob:/); h.close();
  });

  await test("gateway fetches use the same three slots until their replies finish", async () => {
    const h = page();
    const urls = [1, 2, 3, 4].map((n) => `https://an1me.to/covers/${n}.jpg`);
    const warming = h.api.warm(urls); await flush();
    assert.equal(h.gateways.length, 3);
    assert.deepEqual(h.requests, [], "an1me cover transfers must use the challenge-aware gateway");
    h.gateways[0].reply({ ok: true, dataUrl: "data:image/jpeg;base64,YQ==" }); await until(() => h.gateways.length === 4);
    assert.equal(h.gateways.length, 4);
    h.close(); h.gateways.forEach(({ reply }) => reply({ ok: true, dataUrl: "data:image/jpeg;base64,YQ==" }));
    await warming; assert.equal(h.liveBlobs.size, 0);
  });

  await test("hidden gateway transfers retain their slots until the background replies", async () => {
    const h = page();
    const urls = [1, 2, 3, 4].map((n) => `https://an1me.to/covers/${n}.jpg`);
    const first = h.api.warm(urls.slice(0, 3)); await flush(); h.hide(); await flush(); h.show();
    const next = h.api.warm([urls[3]]); await flush();
    assert.equal(h.gateways.length, 3, "abort cannot cancel an already dispatched gateway transfer");
    h.gateways[0].reply({ ok: true, dataUrl: "data:image/jpeg;base64,YQ==" }); await until(() => h.gateways.length === 4);
    h.close(); h.gateways.forEach(({ reply }) => reply({ ok: true, dataUrl: "data:image/jpeg;base64,YQ==" }));
    await Promise.all([first, next]); assert.equal(h.liveBlobs.size, 0);
  });

  await test("a response arriving after its timeout cannot enter memory or disk", async () => {
    const h = page({ ignoreAbort: true });
    const warming = h.api.warm([cover(1)]); await flush();
    [...h.timers][0].fn(); h.finish(h.requests[0]); await warming;
    assert.equal(h.stored.size, 0); assert.equal(h.liveBlobs.size, 0); h.close();
  });

  await test("showing the same cover retries a cancelled gateway job before resolving its source", async () => {
    const h = page(); const url = "https://an1me.to/covers/visible.jpg";
    const first = h.api.warm([url]); await flush(); h.hide(); h.show();
    const next = h.api.warm([url]);
    h.gateways[0].reply({ ok: true, dataUrl: "data:image/jpeg;base64,YQ==" });
    try {
      await until(() => h.gateways.length === 2);
      assert.equal(h.liveBlobs.size, 0, "the cancelled result cannot become a source");
      h.gateways[1].reply({ ok: true, dataUrl: "data:image/jpeg;base64,YQ==" });
      await Promise.all([first, next]); assert.match(h.api.resolve(url), /^blob:/);
    } finally { h.close(); h.gateways.forEach(({ reply }) => reply(null)); }
  });

  await test("retention is independent of the warmed viewport and excludes removed covers", async () => {
    const h = page(); h.api.retain?.([cover(1), cover(2)]);
    const first = h.api.warm([cover(1), cover(3)]); await flush();
    assert.deepEqual(h.requests.map(({ url }) => url), [cover(1)]);
    h.finish(h.requests[0]); await first;
    assert.equal(await h.api.prune(new Set([cover(1), cover(2)])), 0);
    const later = h.api.warm([cover(2)]); await flush();
    assert.equal(h.requests[1].url, cover(2), "an offscreen retained cover can warm after scrolling");
    h.finish(h.requests[1]); await later; h.close();
  });

  await test("pruning releases obsolete memory even below the disk prune threshold", async () => {
    const h = page({ initial: [cover(1)] }); await h.api.warm([cover(1)]);
    const blobUrl = h.api.resolve(cover(1)); assert.match(blobUrl, /^blob:/);
    await h.api.prune([]);
    assert.equal(h.api.resolve(cover(1)), cover(1)); assert.deepEqual(h.revoked, [blobUrl]); h.close();
  });

  await test("a removed mounted cover keeps its blob until the image is detached", async () => {
    const h = page({ initial: [cover(1)] }); await h.api.warm([cover(1)]);
    const blobUrl = h.api.resolve(cover(1));
    h.mounted.push({ src: blobUrl, getAttribute: (name) => name === "src" ? blobUrl : null });
    await h.api.prune([]);
    assert.equal(h.api.resolve(cover(1)), cover(1)); assert.equal(h.liveBlobs.has(blobUrl), true);
    h.mounted.length = 0; h.api.releaseUnused();
    assert.equal(h.liveBlobs.has(blobUrl), false); assert.deepEqual(h.revoked, [blobUrl]); h.close();
  });

  await test("a pending disk read cannot resurrect a pruned memory cover", async () => {
    const h = page({ initial: [cover(1)], matchGate: true });
    const warming = h.api.warm([cover(1)]); await flush();
    await h.api.prune([]); h.reads[0].gate.resolve(); await warming; await flush();
    assert.equal(h.api.resolve(cover(1)), cover(1)); assert.equal(h.liveBlobs.size, 0); assert.equal(h.requests.length, 0); h.close();
  });

  await test("a pending response cannot restore a cover removed during its transfer", async () => {
    const h = page({ ignoreAbort: true });
    const warming = h.api.warm([cover(1)]); await flush();
    await h.api.prune([]); h.finish(h.requests[0]); await warming; await flush();
    assert.equal(h.stored.has(cover(1)), false); assert.equal(h.liveBlobs.size, 0); h.close();
  });

  await test("a cache write finishing after prune removes its late disk insertion", async () => {
    const old = Array.from({ length: 41 }, (_, n) => cover(n + 100));
    const h = page({ putGate: true, initial: old });
    const warming = h.api.warm([cover(1)]); await flush(); h.finish(h.requests[0]); await until(() => h.writes.length === 1);
    await h.api.prune([]); h.writes[0].gate.resolve(); await warming; await flush();
    assert.equal(h.stored.size, 0); assert.equal(h.liveBlobs.size, 0); h.close();
  });

  await test("pagehide prevents queued starts and discards late responses even if abort is ignored", async () => {
    const h = page({ ignoreAbort: true });
    const warming = h.api.warm([1, 2, 3, 4, 5].map(cover)); await flush();
    const started = h.requests.length; h.close(); h.requests.forEach(h.finish);
    await warming; await h.api.warm([cover(6)]); await flush();
    assert.equal(h.requests.length, started); assert.equal(h.stored.size, 0); assert.equal(h.liveBlobs.size, 0);
    assert.equal(h.timers.size, 0);
  });

  await test("a hidden context skips warming and cancels queued work before it resumes", async () => {
    const h = page(); h.hide(); await h.api.warm([cover(0)]); await flush();
    assert.equal(h.requests.length, 0);
    h.show(); const warming = h.api.warm([1, 2, 3, 4].map(cover)); await flush();
    h.hide(); await warming; assert.equal(h.requests.length, 3); assert.equal(h.timers.size, 0);
    h.show(); const resumed = h.api.warm([cover(4)]); await flush();
    assert.equal(h.requests.length, 4); h.finish(h.requests[3]); await resumed; h.close();
  });

  await test("cover markup uses lazy loading while preserving cached src, classes, and alternative text", () => {
    const h = page(); h.win.AnimeTracker.CoverCache.resolve = () => "blob:cached-cover";
    vm.runInContext(read("src/popup/lib/ui-helpers.js"), h.context);
    const markup = h.win.AnimeTracker.UIHelpers.renderCoverFigure('A "title"', cover(1), { extraClass: "movie-cover", size: "small" });
    assert.match(markup, /loading="lazy"/);
    assert.match(markup, /class="at-cover at-cover--small movie-cover"/);
    assert.match(markup, /src="blob:cached-cover"/);
    assert.match(markup, /alt="A &quot;title&quot;"/);
    assert.match(markup, /data-at-cover-url="https:&#x2F;&#x2F;s4\.anilist\.co&#x2F;file&#x2F;cover-1\.jpg"/);
    assert.equal(h.win.AnimeTracker.UIHelpers.renderCoverFigure("Naruto", "https://untrusted.example/image.jpg"), '<div class="at-cover at-cover--default at-cover--placeholder">N</div>');
    h.close();
  });
  await test("library markup defers an uncached native request to the bounded loader", () => {
    const h = page(); h.win.AnimeTracker.LibraryCoverLoader = {};
    vm.runInContext(read("src/popup/lib/ui-helpers.js"), h.context);
    const helper = h.win.AnimeTracker.UIHelpers;
    const markup = helper.renderCoverFigure("Naruto", cover(1));
    assert.match(markup, /src="data:image&#x2F;gif;base64,/);
    assert.match(markup, /data-at-cover-url=/);
    delete h.win.AnimeTracker.LibraryCoverLoader;
    assert.match(helper.renderCoverFigure("Naruto", cover(1)), /src="https:&#x2F;&#x2F;s4\.anilist\.co/);
    h.close();
  });
  process.exitCode = failures ? 1 : 0;
})();
