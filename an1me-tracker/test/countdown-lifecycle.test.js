const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../src/popup/lib/airing-countdown.js"), "utf8");
function page() {
  const document = new EventTarget(), window = new EventTarget(), timers = new Set();
  function element() {
    let text = "", children = [];
    return { className: "", setAttribute() {}, innerHTML: "",
      get textContent() { return children.length ? children.map(child => child.textContent).join("") : text; },
      set textContent(value) { text = value; children = []; },
      querySelector(selector) { return children.find(child => child.className === selector.slice(1)) || null; },
      replaceChildren(...value) { children = value; text = ""; } };
  }
  document.createElement = element;
  window.AnimeTracker = { UIHelpers: { createIcon: () => "<svg></svg>" } };
  let nodes = [];
  document.hidden = false;
  document.querySelectorAll = () => nodes;
  const context = vm.createContext({ document, window, setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn) });
  vm.runInContext(source, context);
  function node(at = Date.now() + 3600000) {
    const classes = new Set();
    const schedule = Object.assign(element(), { dataset: { nextAiringAt: String(at) }, isConnected: true, visible: true,
      getClientRects() { return this.visible ? [{}] : []; },
      classList: { toggle(name, value) { if (value) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) } });
    schedule.textContent = "stale";
    return schedule;
  }
  return { document, window, timers, context, countdown: window.AnimeTracker.AiringCountdown, node, setNodes(value) { nodes = value; } };
}
let failures = 0;
function test(name, fn) { try { fn(); console.log(`PASS ${name}`); } catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); } }
// Catch unconditional intervals, stale render hooks and stale hidden-tab labels.
test("an enabled empty library owns no countdown interval", () => {
  const h = page(); h.countdown.start(); assert.equal(h.timers.size, 0);
});
test("countdowns appear on render without duplicate timers and disappear with the last schedule", () => {
  const h = page(); h.countdown.start(); const schedule = h.node(); h.setNodes([schedule]);
  h.countdown.refresh(); assert.equal(h.timers.size, 1); assert.match(schedule.textContent, /^\d+[hm]/);
  h.countdown.refresh(); h.countdown.start(); assert.equal(h.timers.size, 1);
  h.setNodes([]); h.countdown.refresh(); assert.equal(h.timers.size, 0);
});
test("hidden schedule nodes and invalid timestamps do not keep the shared timer alive", () => {
  const h = page(), schedule = h.node(); schedule.visible = false;
  h.setNodes([schedule, h.node(0)]); h.countdown.start(); assert.equal(h.timers.size, 0);
  schedule.visible = true; h.countdown.refresh(); assert.equal(h.timers.size, 1);
  schedule.visible = false; [...h.timers][0](); assert.equal(h.timers.size, 0);
});
test("a hidden view does not tick when its author styles override the native hidden display rule", () => {
  const h = page(), schedule = h.node();
  schedule.closest = selector => selector === "[hidden]" ? {} : null;
  h.setNodes([schedule]); h.countdown.start(); assert.equal(h.timers.size, 0);
});
test("document visibility pauses the timer and refreshes the schedule immediately when shown", () => {
  const h = page(), schedule = h.node(); h.setNodes([schedule]); h.countdown.start(); assert.equal(h.timers.size, 1);
  h.document.hidden = true; h.document.dispatchEvent(new Event("visibilitychange")); assert.equal(h.timers.size, 0);
  schedule.dataset.nextAiringAt = String(Date.now() - 2 * 86400000);
  h.document.hidden = false; h.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(h.timers.size, 1); assert.equal(schedule.textContent, "delayed 2d");
  assert.equal(schedule.classList.contains("meta-time-eta-overdue"), true);
  h.countdown.stop(); h.countdown.refresh(); assert.equal(h.timers.size, 0);
});
test("pagehide releases countdown work until explicitly started again", () => {
  const h = page(); h.setNodes([h.node()]); h.countdown.start(); h.window.dispatchEvent(new Event("pagehide"));
  assert.equal(h.timers.size, 0); h.document.dispatchEvent(new Event("visibilitychange")); assert.equal(h.timers.size, 0);
});
test("returning from a secondary view restarts visible countdowns without a list rerender", () => {
  const h = page(), schedule = h.node(); h.setNodes([schedule]);
  const AT = h.window.AnimeTracker;
  AT.SETTING_KEYS = {}; AT.PopupState = {}; AT.ProgressInsights = { configure() {} };
  const flags = new Set();
  h.document.querySelector = selector => selector === ".app" ? { classList: { toggle(name, enabled) {
    if (enabled) flags.add(name); else flags.delete(name); schedule.visible = flags.size === 0;
  } } } : null;
  h.document.getElementById = () => null;
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/popup/app/stats-views.js"), "utf8"), h.context);
  AT.StatsViews._init({ elements: {} }); h.countdown.start(); assert.equal(h.timers.size, 1);
  AT.StatsViews.setViewMode("stats");
  if (h.timers.size) [...h.timers][0]();
  assert.equal(h.timers.size, 0);
  schedule.dataset.nextAiringAt = String(Date.now() - 2 * 86400000);
  AT.StatsViews.setViewMode(null);
  assert.equal(h.timers.size, 1); assert.equal(schedule.textContent, "delayed 2d");
});
process.exitCode = failures ? 1 : 0;
