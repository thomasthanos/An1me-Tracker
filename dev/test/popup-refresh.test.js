const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const src = fs.readFileSync(path.join(__dirname, "../../src/popup/main.js"), "utf8");
const body = src.slice(src.indexOf("  function flushDeferredListRefresh()"), src.indexOf("  function normalizeCategory("));
let failures = 0;
function test(name, fn) { try { fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.message}`); } }
function popup({ hidden = false, mouse = false, hover = false } = {}) {
  const timers = new Set(); let renders = 0;
  const c = vm.createContext({ document: { hidden }, window: { matchMedia: () => ({ matches: mouse }) },
    elements: { animeList: { matches: () => hover } }, renderAnimeList: () => renders++, updateStats() {}, getActiveFilter: () => "naruto",
    setTimeout(fn) { const t = { fn }; timers.add(t); return t; }, clearTimeout: t => timers.delete(t) });
  vm.runInContext("let deferredListRefresh = null;\n" + body, c);
  return { c, timers, renders: () => renders, tick() { for (const t of [...timers]) { timers.delete(t); t.fn(); } } };
}
test("a touch screen's sticky hover never postpones the updated library", () => {
  const h = popup({ hover: true }); h.c.scheduleDeferredListRefresh(); h.tick(); assert.equal(h.renders(), 1); assert.equal(h.timers.size, 0);
});
test("a hidden library keeps changes pending without timer polling and flushes once shown", () => {
  const h = popup({ hidden: true }); h.c.scheduleDeferredListRefresh(); h.tick(); assert.equal(h.renders(), 0); assert.equal(h.timers.size, 0);
  h.c.document.hidden = false; h.c.flushDeferredListRefresh(); assert.equal(h.renders(), 1);
});
test("mouse hover defers until mouseleave without scheduling an 800ms polling loop", () => {
  const h = popup({ mouse: true, hover: true }); h.c.scheduleDeferredListRefresh(); h.tick();
  assert.equal(h.renders(), 0); assert.equal(h.timers.size, 0);
  h.c.elements.animeList.matches = () => false; h.c.flushDeferredListRefresh(); assert.equal(h.renders(), 1);
});
process.exitCode = failures ? 1 : 0;
