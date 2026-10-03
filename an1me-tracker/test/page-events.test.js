// Pins the shared content-script event bus in src/content/lib/page-events.js.
//
//   node test/page-events.test.js
//
// Every content script in a frame now shares one chrome.storage.onChanged listener and one
// MutationObserver. These cases check that each subscriber still sees only the changes it asked for,
// at its own pace, and that nothing stays attached once the last subscriber leaves.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");

function node(name, parent = null) {
  return {
    name,
    parent,
    contains(other) {
      for (let n = other; n; n = n.parent) if (n === this) return true;
      return false;
    },
  };
}

function createBus() {
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Map();
      observers.push(this);
    }
    observe(target, init) {
      this.targets.set(target, init);
    }
    disconnect() {
      this.targets.clear();
    }
    takeRecords() {
      return [];
    }
    fire(records) {
      this.callback(records);
    }
  }
  const storageListeners = new Set();
  const timers = [];
  const sandbox = {
    window: {},
    MutationObserver: FakeMutationObserver,
    chrome: {
      storage: {
        onChanged: {
          addListener: (fn) => storageListeners.add(fn),
          removeListener: (fn) => storageListeners.delete(fn),
        },
      },
    },
    setTimeout: (fn, ms) => {
      const timer = { fn, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      if (timer) timer.cleared = true;
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const rel = "src/content/lib/page-events.js";
  new vm.Script(fs.readFileSync(path.join(REPO, rel), "utf8"), { filename: rel }).runInContext(sandbox);
  const runTimers = () => {
    while (timers.some((t) => !t.cleared)) {
      const timer = timers.find((t) => !t.cleared);
      timer.cleared = true;
      timer.fn();
    }
  };
  const emitStorage = (changes, area = "local") => [...storageListeners].forEach((fn) => fn(changes, area));
  return { PageEvents: sandbox.window.AnimeTrackerContent.PageEvents, observers, storageListeners, timers, runTimers, emitStorage, sandbox };
}

let failures = 0;
function check(label, actual, expected) {
  try {
    // Values built inside the vm sandbox carry its prototypes; compare them as plain data.
    assert.deepStrictEqual(actual === undefined ? actual : JSON.parse(JSON.stringify(actual)), expected);
    console.log(`  PASS  ${label}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

{
  const bus = createBus();
  const seen = [];
  const offA = bus.PageEvents.onStorage(["animeData"], () => seen.push("a"));
  bus.PageEvents.onStorage("skiptimeHelperEnabled", () => seen.push("b"));
  bus.PageEvents.onStorage((key) => key.startsWith("animeinfo_"), () => seen.push("c"));
  check("one storage listener for every subscriber", bus.storageListeners.size, 1);
  bus.emitStorage({ animeData: {} });
  bus.emitStorage({ skiptimeHelperEnabled: {} });
  bus.emitStorage({ "animeinfo_one-piece": {} });
  bus.emitStorage({ animeData: {} }, "sync");
  bus.emitStorage({ unrelated: {} });
  check("each subscriber gets only its keys, local area only", seen, ["a", "b", "c"]);
  offA();
  bus.emitStorage({ animeData: {} });
  check("unsubscribed callback stops", seen, ["a", "b", "c"]);
}

{
  const bus = createBus();
  const off1 = bus.PageEvents.onStorage("x", () => {});
  const off2 = bus.PageEvents.onStorage("y", () => {});
  off1();
  off2();
  check("storage listener removed after the last unsubscribe", bus.storageListeners.size, 0);
}

{
  const bus = createBus();
  const doc = node("document");
  const head = node("head", doc);
  const body = node("body", doc);
  const list = node("list", body);
  const item = node("item", list);
  const calls = [];
  bus.PageEvents.observe(head, { childList: true }, () => calls.push("head"));
  bus.PageEvents.observe(body, { childList: true, subtree: true }, () => calls.push("body"));
  bus.PageEvents.observe(list, { attributes: true, attributeFilter: ["class"] }, () => calls.push("list-class"));
  check("one MutationObserver for every target", bus.observers.length, 1);
  const mo = bus.observers[0];
  check("each target observed with its own options", [...mo.targets.values()], [
    { childList: true, subtree: false },
    { childList: true, subtree: true },
    { childList: false, subtree: false, attributes: true, attributeFilter: ["class"] },
  ]);

  mo.fire([{ type: "childList", target: item }]);
  check("deep child change reaches only the subtree subscriber", calls, ["body"]);
  calls.length = 0;
  mo.fire([{ type: "childList", target: head }]);
  check("head change reaches the head subscriber only", calls, ["head"]);
  calls.length = 0;
  mo.fire([{ type: "attributes", target: list, attributeName: "style" }]);
  check("filtered attribute subscriber ignores other attributes", calls, []);
  mo.fire([{ type: "attributes", target: list, attributeName: "class" }]);
  check("filtered attribute subscriber sees its attribute", calls, ["list-class"]);
}

{
  const bus = createBus();
  const body = node("body");
  let count = 0;
  bus.PageEvents.observe(body, { childList: true, subtree: true }, () => count++, { throttleMs: 250 });
  const mo = bus.observers[0];
  mo.fire([{ type: "childList", target: body }]);
  mo.fire([{ type: "childList", target: body }]);
  mo.fire([{ type: "childList", target: body }]);
  check("throttled subscriber is not called synchronously", count, 0);
  check("a burst schedules one run", bus.timers.filter((t) => !t.cleared && t.ms === 250).length, 1);
  bus.runTimers();
  check("the scheduled run fires once", count, 1);
}

{
  const bus = createBus();
  const body = node("body");
  let count = 0;
  bus.PageEvents.observe(body, { childList: true }, () => count++, { timeoutMs: 15000 });
  const mo = bus.observers[0];
  bus.runTimers();
  mo.fire([{ type: "childList", target: body }]);
  check("subscription ends after timeoutMs", count, 0);
  check("observer disconnected once nothing is subscribed", mo.targets.size, 0);
}

{
  const bus = createBus();
  const body = node("body");
  const offA = bus.PageEvents.observe(body, { childList: true }, () => {});
  bus.PageEvents.observe(body, { attributes: true, attributeFilter: ["class"] }, () => {});
  bus.PageEvents.observe(body, { attributes: true, attributeFilter: ["hidden"] }, () => {});
  const mo = bus.observers[0];
  check("options for one target are merged", mo.targets.get(body), { childList: true, subtree: false, attributes: true, attributeFilter: ["class", "hidden"] });
  bus.PageEvents.observe(body, { attributes: true }, () => {});
  check("an unfiltered attribute subscriber drops the filter", mo.targets.get(body), { childList: true, subtree: false, attributes: true });
  offA();
  check("unsubscribing re-observes the rest", mo.targets.get(body).childList, false);
}

{
  const bus = createBus();
  const again = fs.readFileSync(path.join(REPO, "src/content/lib/page-events.js"), "utf8");
  const before = bus.sandbox.window.AnimeTrackerContent.PageEvents;
  new vm.Script(again).runInContext(bus.sandbox);
  check("loading the file twice keeps the first bus", bus.sandbox.window.AnimeTrackerContent.PageEvents === before, true);
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
