const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
let failures = 0;
async function test(name, fn) { try { await fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.stack}`); } }

// A small DOM adapter for exercising the production shelf and fetch log, without browser dependencies.
class Node extends EventTarget {
  constructor(tag = "div") {
    super(); this.tagName = tag; this.children = []; this.parentNode = null; this.dataset = {}; this.style = { setProperty() {} };
    this.className = ""; this.textContent = ""; this.attributes = {}; this.scrollLeft = 0; this.scrollTop = 0;
    this.classList = {
      add: (...names) => this.className = [...new Set([...this.className.split(/\s+/), ...names])].filter(Boolean).join(" "),
      remove: (...names) => this.className = this.className.split(/\s+/).filter(n => !names.includes(n)).join(" "),
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, on) => (on ?? !this.classList.contains(name)) ? this.classList.add(name) : this.classList.remove(name),
    };
  }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; return node; }
  insertBefore(node, before) { if (!before) return this.appendChild(node); node.remove(); this.children.splice(this.children.indexOf(before), 0, node); node.parentNode = this; return node; }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  replaceWith(node) { const parent = this.parentNode; parent.insertBefore(node, this); this.remove(); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  get firstChild() { return this.children[0] || null; }
  get lastElementChild() { return this.children.at(-1) || null; }
  set innerHTML(value) {
    this.children.forEach(child => child.parentNode = null); this.children = [];
    for (const match of value.matchAll(/<span[^>]*>([^<]*)<\/span>/g)) { const span = new Node("span"); span.textContent = match[1]; this.appendChild(span); }
  }
  querySelectorAll(selector) {
    const parts = selector.split(/\s+/);
    const matches = (node, part) => part.startsWith(".") ? node.classList.contains(part.slice(1)) : part.startsWith("#") ? node.id === part.slice(1) : node.tagName === part;
    const found = [];
    const visit = node => {
      for (const child of node.children) {
        if (matches(child, parts.at(-1))) {
          let ancestor = child.parentNode, index = parts.length - 2;
          while (ancestor && index >= 0) { if (matches(ancestor, parts[index])) index--; ancestor = ancestor.parentNode; }
          if (index < 0) found.push(child);
        }
        visit(child);
      }
    }; visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function dom() {
  const body = new Node("body");
  return { body, visibilityState: "visible", createElement: tag => new Node(tag),
    getElementById: id => body.querySelector(`#${id}`), querySelector: selector => body.querySelector(selector) };
}
function shelf() {
  const document = dom();
  const c = vm.createContext({ document, location: { pathname: "/" }, isContextValid: () => true,
    setTimeout() {}, clearTimeout() {}, injectStyles() {}, suppressShareIfPresent() {}, startShareWatcher() {}, stopShareWatcher() {},
    mountSection: section => document.body.appendChild(section), CONTAINER_ID: "shelf" });
  const src = read("src/content/page/continue-watching.js");
  vm.runInContext("let dismissed = false, renderGeneration = 0, renderDebounce = null, trackResizeObserver = null;\n" +
    src.slice(src.indexOf("  function buildCard("), src.indexOf("  function findShareAnchor(")) +
    src.slice(src.indexOf("  const canRender ="), src.indexOf("  function collectAnimeInfoKeys(")), c);
  return { c, document };
}
const item = { slug: "naruto", episode: 1, percentage: 20, title: "Naruto", subline: "Ep 1 · 20 min left", cover: "https://example.com/cover.jpg", url: "https://an1me.to/watch/naruto-episode-1", isStart: false };
function progress() {
  let now = 1000000;
  class Clock extends Date { static now() { return now; } }
  const timers = new Map(); let nextTimer = 1;
  const AT = { CONFIG: { MIN_PROGRESS_TO_SAVE: 10, COMPLETED_PERCENTAGE: 85, MAX_SAVED_PROGRESS_ENTRIES: 100,
    PROGRESS_WRITE_THROTTLE_MS: 45000, PAUSE_WRITE_THROTTLE_MS: 15000, MAX_SAVE_QUEUE_SIZE: 10, MAX_PROGRESS_ENTRIES: 100 },
    Logger: new Proxy({}, { get: () => () => {} }), PageEvents: { onStorage() {} }, AnimeParser: { extractCoverImage: () => "" } };
  const c = vm.createContext({ window: { AnimeTrackerContent: AT, location: { pathname: "/watch/naruto-episode-1" } }, document: { visibilityState: "visible" }, Date: Clock,
    setTimeout(fn, ms) { const id = nextTimer++; timers.set(id, { fn, due: now + ms }); return id; }, clearTimeout: id => timers.delete(id) });
  vm.runInContext(read("src/content/player/progress-tracker.js"), c);
  return { c, AT, p: AT.ProgressTracker, timers, now: () => now, advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); }
  } };
}
function repair(responses) {
  const store = {}, calls = [];
  const c = vm.createContext({ console, bgStorageGet: async () => store,
    bgStorageSet: async data => Object.assign(store, data),
    discoverFillerSlug: async () => null, fetchJikanEpisodes: async () => {
      calls.push(1); const next = responses.shift(); if (next instanceof Error) throw next; return next;
    } });
  c.self = c;
  vm.runInContext(read("src/common/utils.js"), c); c.AnimeTrackerUtils = { ...c.AnimeTrackerUtils, sleep: async () => {} };
  vm.runInContext(read("src/common/data/cache-policy.js"), c);
  const src = read("src/background/jobs/metadata-repair.js");
  vm.runInContext(src.slice(0, src.indexOf("async function finalizeMetadataRepair(")), c);
  c.isLikelyMovieSlug = () => false; c.collectFillerMatchKeys = () => [];
  return { c, store, calls };
}
(async () => {
  await test("shelf updates actual progress, episode links and covers instead of stale field names", () => {
    const h = shelf(); h.c.render([item]);
    h.c.render([{ ...item, percentage: 40, subline: "Ep 1 · 15 min left", cover: "https://example.com/new.jpg", url: "https://an1me.to/watch/naruto-episode-2", episode: 2 }]);
    const card = h.document.body.querySelector(".at-cw-card");
    assert.equal(card.querySelector(".at-cw-bar-fill").style.width, "40%");
    assert.equal(card.querySelector(".at-cw-sub").textContent, "Ep 1 · 15 min left");
    assert.equal(card.querySelector(".at-cw-resume").href, "https://an1me.to/watch/naruto-episode-2");
    assert.equal(card.querySelector(".at-cw-img").src, "https://example.com/new.jpg");
    const thumb = card.querySelector(".at-cw-thumb");
    assert.ok(thumb.children.indexOf(card.querySelector(".at-cw-img")) < thumb.children.indexOf(card.querySelector(".at-cw-bar")), "cover must paint below the progress overlay");
  });
  await test("metadata and progress updates retain the shelf, image node and horizontal position", () => {
    const h = shelf(); h.c.render([item]);
    const section = h.document.getElementById("shelf"), card = section.querySelector(".at-cw-card"), img = card.querySelector(".at-cw-img");
    const track = section.querySelector(".at-cw-track"); track.scrollLeft = 90;
    h.c.render([{ ...item, title: "Naruto refreshed", percentage: 45, subline: "Ep 1 · 10 min left" }]);
    assert.equal(h.document.getElementById("shelf"), section); assert.equal(section.querySelector(".at-cw-card"), card);
    assert.equal(card.querySelector(".at-cw-img"), img); assert.equal(track.scrollLeft, 90);
    assert.equal(card.querySelector(".at-cw-bar-fill").style.width, "45%");
  });
  await test("continuous playback persists the latest sample at the throttle deadline", () => {
    const h = progress(), saved = []; h.p.performSaveProgress = async (...args) => saved.push(args);
    h.p.saveVideoProgress("naruto__episode-1", 100, 1200);
    for (let i = 1; i <= 8; i++) { h.advance(5000); h.p.saveVideoProgress("naruto__episode-1", 100 + i * 5, 1200); }
    assert.equal(h.timers.size, 1); h.advance(5000);
    assert.equal(saved.length, 2); assert.equal(saved[1][1], 140);
  });
  await test("a pause shortens an existing deferred save to the pause deadline", () => {
    const h = progress(), saved = []; h.p.performSaveProgress = async (...args) => saved.push(args);
    h.p.saveVideoProgress("naruto__episode-1", 100, 1200); h.advance(5000);
    h.p.saveVideoProgress("naruto__episode-1", 105, 1200); h.advance(5000);
    h.p.saveVideoProgress("naruto__episode-1", 110, 1200, true); h.advance(5000);
    assert.equal(saved.length, 2); assert.equal(saved[1][1], 110);
  });
  await test("a progress write waiting behind completion cannot recreate a completed episode's resume point", async () => {
    const h = progress(); let committed = false;
    h.AT.Storage = { isContextValid: () => true, isAbortResult: () => false,
      get: async () => ({ animeData: {}, videoProgress: {} }),
      mutate: async (keys, fn) => { const data = { animeData: { naruto: { episodes: [{ number: 1, durationSource: "video" }] } }, videoProgress: {} };
        if (fn(data) !== false) committed = true; return data; } };
    await h.p.performSaveProgress("naruto__episode-1", 100, 1200); assert.equal(committed, false);
  });
  await test("fetch progress updates retain unchanged log rows instead of replaying their animations", () => {
    const document = dom(), log = new Node(); log.id = "filler-fetch-ui-log"; document.body.appendChild(log);
    const c = vm.createContext({ window: {}, document }); vm.runInContext(read("src/popup/lib/filler-fetch-ui.js"), c);
    const ui = c.window.AnimeTracker.FillerFetchUI, entries = [{ type: "fetch", slug: "naruto", name: "Naruto", detail: "info refreshed", at: 1 }];
    ui._renderLogs(entries); const row = log.firstChild;
    ui._renderLogs(entries); assert.equal(log.firstChild, row);
    ui._renderLogs([...entries, { type: "movie", name: "Movie", at: 2 }]); assert.equal(log.firstChild, row); assert.equal(log.children.length, 2);
  });
  await test("a filler timeout remains a visible retry outcome even when anime info succeeded", () => {
    const c = vm.createContext({ AnimeTrackerUtils: { isMobileDevice: () => true } });
    const src = read("src/background/jobs/metadata-repair.js"); vm.runInContext(src.slice(0, src.indexOf("function collectFillerMatchKeys(")), c);
    const log = c.buildMetadataRepairLog("naruto", "Naruto", { status: "fetched" }, { status: "failed", error: "jikan_search_http_504" });
    assert.equal(c.countMetadataRepairOutcome(log).failed, 1); assert.match(log.detail, /timed out/);
  });
  await test("transient filler failures reach the bounded retry and can recover on its second attempt", async () => {
    const h = repair([Error("jikan_search_http_504"), { filler: [2], canon: [1], totalEpisodes: 2 }]);
    const result = await h.c.runMetadataRepairWithRetry(attempt => h.c.repairEpisodeTypesCache("naruto", "Naruto", attempt > 1));
    assert.equal(h.calls.length, 2); assert.equal(result.status, "fetched"); assert.equal(result.entry.filler[0], 2);
  });
  await test("retryable filler backoff retains the original HTTP failure instead of inventing a timeout", async () => {
    const h = repair([Error("jikan_search_http_429")]);
    await assert.rejects(h.c.repairEpisodeTypesCache("naruto", "Naruto", true), /http_429/);
    assert.equal(h.store.episodeTypes_naruto.retryable, true); assert.match(h.store.episodeTypes_naruto.error, /http_429/);
  });
  await test("permanent Jikan client errors are not retried as transient service errors", async () => {
    const h = repair([Error("jikan_search_http_400")]);
    await assert.rejects(h.c.runMetadataRepairWithRetry(() => h.c.repairEpisodeTypesCache("naruto", "Naruto", true)), /http_400/);
    assert.equal(h.calls.length, 1);
  });
  process.exitCode = failures ? 1 : 0;
})();
