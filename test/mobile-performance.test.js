const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { failures++; console.error(`FAIL ${name}: ${e.message}`); }
}
const classes = () => ({ add() {}, remove() {}, toggle() {}, contains() { return false; } });

function library() {
  const rendered = [];
  const listeners = {};
  const list = {
    childNodes: [], classList: classes(),
    get firstChild() { return this.childNodes[0] || null; },
    get markup() { return this.childNodes.map(node => node.nodeValue).join(""); },
    querySelectorAll: () => [], querySelector: () => null, closest: () => null,
    addEventListener: (event, fn) => { listeners[event] = fn; }, contains: () => true,
    replaceChildren(fragment) { this.childNodes = []; for (const node of fragment?.childNodes || []) this.insertBefore(node, null); },
    insertBefore(node, before) {
      node.remove();
      const index = before ? this.childNodes.indexOf(before) : this.childNodes.length;
      this.childNodes.splice(index, 0, node); node.parentNode = this; this.onCommit?.();
    },
  };
  function fragment(html) {
    let value = html;
    const node = { nodeType: 3, parentNode: null,
      get nodeValue() { return value; }, set nodeValue(next) { value = next; this.parentNode?.onCommit?.(); },
      get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null; },
      remove() { if (this.parentNode) { const siblings = this.parentNode.childNodes; siblings.splice(siblings.indexOf(this), 1); this.parentNode = null; } },
    };
    return { childNodes: [node], querySelectorAll: () => [] };
  }
  const state = { animeData: {}, videoProgress: {}, currentCategory: "all", currentSort: "date",
    currentCompactStatus: "airing", currentCompactStatusOpen: false, libraryLoaded: true };
  for (const status of ["WATCHING", "AIRING", "COMPLETED", "DROPPED", "ON_HOLD"]) {
    for (let i = 0; i < 200; i++) state.animeData[`${status}-${i}`] = { title: `${status} ${i}`, status, episodes: [] };
  }
  const AT = {
    PopupState: state, StatusService: { AnimeStatus: Object.fromEntries(["WATCHING", "AIRING", "COMPLETED", "DROPPED", "ON_HOLD"].map(k => [k,k])), getStatus: (_, a) => a.status },
    AnimeActions: {}, AddAnimeDialog: {}, ProgressManager: { getInProgressAnime: () => [] },
    SeasonGrouping: { groupByBase(entries) { return new Map(entries.map(e => { const v = Array.isArray(e) ? { slug: e[0], anime: e[1] } : e; return [v.slug, [v]]; })); }, isMovieDisplay: () => true, isMovieGroup: () => false, hasMultipleSeasons: () => false },
    AnimeCardRenderer: { createAnimeCard(slug) { rendered.push(slug); return `<div>${slug}</div>`; }, createInProgressGroup: () => "" },
  };
  const context = vm.createContext({ window: { AnimeTracker: AT }, document: { querySelector: () => null,
    createRange: () => ({ selectNodeContents() {}, createContextualFragment: fragment }) }, requestAnimationFrame: fn => fn() });
  vm.runInContext(source("src/popup/app/render-list.js"), context);
  AT.RenderList._init({ elements: { animeList: list, emptyState: { classList: classes() } }, _ipPatch() {}, getActiveFilter: () => "",
    normalizeCompactStatus: v => v, updateStats() {} });
  return { AT, state, list, rendered, listeners, doc: context.document };
}

function monitor() {
  const timers = new Set();
  const doc = new EventTarget(); doc.visibilityState = "visible";
  const win = new EventTarget();
  let resolvePref;
  let saved = [];
  let prompts = 0;
  const AT = { Logger: { debug() {}, error() {}, success() {}, warn() {} },
    CONFIG: { MIN_PROGRESS_TO_SAVE: 10, PROGRESS_SAVE_INTERVAL: 5000 }, PlayerDom: { isVideoActive: () => true },
    ProgressTracker: { getSavedProgress: async () => ({ currentTime: 100 }), saveVideoProgress: (...args) => saved.push(args) },
    Notifications: { showResumePrompt: () => prompts++ }, PageEvents: { onStorage: () => () => {} } };
  win.AnimeTrackerContent = AT;
  const context = vm.createContext({ window: win, document: doc, chrome: { storage: { local: { get: () => new Promise(r => resolvePref = r) } } },
    setInterval(fn) { const t = { fn }; timers.add(t); return t; }, clearInterval: t => timers.delete(t),
    setTimeout(fn) { const t = { fn }; timers.add(t); return t; }, clearTimeout: t => timers.delete(t) });
  vm.runInContext(source("src/content/player/video-monitor.js"), context);
  const video = new EventTarget(); Object.assign(video, { currentTime: 25, duration: 1200, paused: true, readyState: 2, play: async () => {} });
  const handlers = { handleVisibilityChange() {}, handleBeforeUnload() {} };
  return { m: AT.VideoMonitor, video, doc, timers, handlers, preference: () => resolvePref({}), saved, prompts: () => prompts };
}

(async () => {
  await test("a 1000-entry library builds only the visible watching cards when compact lists are closed", () => {
    const h = library(); h.AT.RenderList.renderAnimeList();
    assert.equal(h.rendered.length, 200);
    assert.match(h.list.markup, /data-compact-status="completed"/);
  });
  await test("opening one compact list builds its cards without building the other three lists", () => {
    const h = library(); h.state.currentCompactStatusOpen = true; h.AT.RenderList.renderAnimeList();
    assert.equal(h.rendered.length, 400);
    assert.equal(h.rendered.filter(s => s.startsWith("AIRING")).length, 200);
    h.rendered.length = 0; h.state.currentCompactStatus = "completed"; h.AT.RenderList.renderAnimeList();
    assert.equal(h.rendered.length, 400);
    assert.equal(h.rendered.filter(s => s.startsWith("COMPLETED")).length, 200);
  });
  await test("a paused video owns no progress interval, play starts one, pause stops it", async () => {
    const h = monitor(); const p = h.m.setupVideoMonitoring(h.video, null, h.handlers); await p;
    assert.equal(h.timers.size, 0);
    h.video.paused = false; h.video.dispatchEvent(new Event("play")); assert.equal(h.timers.size, 1);
    [...h.timers][0].fn(); assert.equal(h.saved.length, 0); // no anime identity
    h.video.paused = true; h.video.dispatchEvent(new Event("pause")); assert.equal(h.timers.size, 0);
    h.m.cleanup(); assert.equal(h.timers.size, 0);
  });
  await test("an unchanged library refresh also wakes its visible countdowns", () => {
    const h = library(); let refreshes = 0;
    h.AT.AiringCountdown = { refresh() { refreshes++; } };
    h.AT.RenderList.renderAnimeList(); h.AT.RenderList.renderAnimeList();
    assert.equal(refreshes, 2);
  });
  await test("the movies-only completed list can stay collapsed after being closed", () => {
    const h = library(); h.state.currentCategory = "movies";
    h.state.animeData = { movie: { title: "Movie", status: "COMPLETED", episodes: [] } };
    h.AT.RenderList.renderAnimeList();
    h.state.currentCompactStatusOpen = false; h.rendered.length = 0;
    h.AT.RenderList.renderAnimeList(); assert.equal(h.rendered.length, 0);
  });
  await test("status rerenders preserve keyboard focus on the selected chip", () => {
    const h = library(); let focused = false;
    h.doc.activeElement = { dataset: { compactStatus: "airing" }, closest() { return this; } };
    h.list.querySelector = selector => selector === '[data-compact-status="airing"]' ? { focus: () => focused = true } : null;
    h.AT.RenderList.renderAnimeList(); assert.equal(focused, true);
  });
  await test("expanded compact cards survive switching away and back without keeping hidden nodes", () => {
    const h = library(); let domStatus = "", expanded = false;
    const card = { querySelector: () => ({ dataset: { slug: "COMPLETED-0" } }), classList: { add: () => expanded = true }, setAttribute() {} };
    h.list.querySelectorAll = selector => {
      if (domStatus !== "completed") return [];
      if (selector === ".anime-card") return [card];
      if (selector === ".anime-card.expanded" && expanded) return [card];
      return [];
    };
    h.list.querySelector = selector => selector === `[data-compact-section="${domStatus}"]` ? h.list : null;
    h.list.onCommit = () => { domStatus = h.state.currentCompactStatus; expanded = false; };
    h.state.currentCompactStatus = "completed"; h.state.currentCompactStatusOpen = true; h.AT.RenderList.renderAnimeList(); expanded = true;
    h.state.currentCompactStatus = "airing"; h.AT.RenderList.renderAnimeList();
    h.state.currentCompactStatus = "completed"; h.AT.RenderList.renderAnimeList(); assert.equal(expanded, true);
  });
  await test("navigation during an awaited resume preference cannot resurrect old video work", async () => {
    const h = monitor(); const p = h.m.setupVideoMonitoring(h.video, { uniqueId: "old__episode-1" }, h.handlers);
    h.m.cleanup(); h.preference(); await p;
    assert.equal(h.timers.size, 0); assert.equal(h.prompts(), 0); assert.equal(h.m.videoElement, null);
  });
  await test("iPad desktop user agents block 4K even with an old enabled setting", () => {
    const c = vm.createContext({ navigator: { userAgent: "Mozilla/5.0 Macintosh", platform: "MacIntel", maxTouchPoints: 5 } });
    vm.runInContext(source("src/common/utils.js"), c);
    assert.equal(c.AnimeTrackerUtils.isMobileDevice(), true);
    assert.equal(c.AnimeTrackerUtils.auto4kEnabled(undefined), false);
    assert.equal(c.AnimeTrackerUtils.auto4kEnabled(true), false);
    assert.equal(c.AnimeTrackerUtils.auto4kEnabled(false), false);
    c.navigator.maxTouchPoints = 0;
    assert.equal(c.AnimeTrackerUtils.auto4kEnabled(undefined), true);
    assert.equal(c.AnimeTrackerUtils.auto4kEnabled(true), true);
  });
  process.exitCode = failures ? 1 : 0;
})();
