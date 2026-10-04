// Pins how src/content/player/player-observer.js owns the episode's <video>.
//
//   node test/player-observer.test.js
//
// The progress tracker, the skip-time helper and the metadata hooks used to attach their own
// listeners to the video, and a server switch (the site swaps the <video> element) left the old
// element's listeners behind while the skip helper never saw the new one. One owner now binds one
// listener per media event and moves them to the new element.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");

class FakeVideo extends EventTarget {
  constructor(name) {
    super();
    this.name = name;
    this.isConnected = true;
    this.listenerCount = 0;
  }
  addEventListener(type, fn, opts) {
    this.listenerCount++;
    super.addEventListener(type, fn, opts);
  }
  removeEventListener(type, fn, opts) {
    this.listenerCount--;
    super.removeEventListener(type, fn, opts);
  }
}

function createObserver() {
  const timers = [];
  let available = null;
  const domSubscriptions = [];
  const sandbox = {
    window: {},
    document: { body: {} },
    setInterval: (fn, ms) => {
      const t = { fn, ms, kind: "interval", cleared: false };
      timers.push(t);
      return t;
    },
    clearInterval: (t) => t && (t.cleared = true),
    setTimeout: (fn, ms) => {
      const t = { fn, ms, kind: "timeout", cleared: false };
      timers.push(t);
      return t;
    },
    clearTimeout: (t) => t && (t.cleared = true),
  };
  sandbox.window.self = sandbox.window;
  sandbox.window.top = sandbox.window;
  sandbox.globalThis = sandbox;
  sandbox.window.AnimeTrackerContent = {
    CONFIG: { VIDEO_CHECK_INTERVAL: 1500, MAX_RETRIES: 60 },
    PlayerDom: { findVideo: () => available },
    PageEvents: {
      observe: (target, options, cb) => {
        const sub = { cb, active: true };
        domSubscriptions.push(sub);
        return () => (sub.active = false);
      },
    },
  };
  vm.createContext(sandbox);
  const rel = "src/content/player/player-observer.js";
  new vm.Script(fs.readFileSync(path.join(REPO, rel), "utf8"), { filename: rel }).runInContext(sandbox);
  return {
    PlayerObserver: sandbox.window.AnimeTrackerContent.PlayerObserver,
    setAvailable: (v) => (available = v),
    tickPoll: () => timers.filter((t) => t.kind === "interval" && !t.cleared).forEach((t) => t.fn()),
    expireBudget: () => timers.filter((t) => t.kind === "timeout" && !t.cleared).forEach((t) => t.fn()),
    mutate: () => domSubscriptions.filter((s) => s.active).forEach((s) => s.cb()),
    activeSearches: () => timers.filter((t) => t.kind === "interval" && !t.cleared).length + domSubscriptions.filter((s) => s.active).length,
  };
}

let failures = 0;
function check(label, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    console.log(`  PASS  ${label}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

{
  const { PlayerObserver, setAvailable } = createObserver();
  const first = new FakeVideo("first");
  setAvailable(first);
  const events = [];
  PlayerObserver.on("video", (v) => events.push(`video:${v.name}`));
  PlayerObserver.on("timeupdate", (v) => events.push(`timeupdate:${v.name}`));
  PlayerObserver.on("timeupdate", () => events.push("timeupdate:second-subscriber"));
  PlayerObserver.on("metadata", (v) => events.push(`metadata:${v.name}`));
  PlayerObserver.start();

  check("binds the available video and announces it", events, ["video:first"]);
  check("one listener per media event (7 media event types)", first.listenerCount, 7);

  events.length = 0;
  first.dispatchEvent(new Event("timeupdate"));
  first.dispatchEvent(new Event("durationchange"));
  check("one media listener fans out to every subscriber", events, ["timeupdate:first", "timeupdate:second-subscriber", "metadata:first"]);

  const second = new FakeVideo("second");
  first.isConnected = false;
  setAvailable(second);
  events.length = 0;
  PlayerObserver.rescan();
  check("server switch: the new element is bound and announced", events, ["video:second"]);
  check("server switch: the old element keeps no listeners", first.listenerCount, 0);
  check("server switch: the new element gets one listener per media event", second.listenerCount, 7);

  events.length = 0;
  first.dispatchEvent(new Event("timeupdate"));
  check("events from the replaced element are not forwarded", events, []);

  const late = [];
  PlayerObserver.on("video", (v) => late.push(v.name));
  check("a late video subscriber is told about the bound element", late, ["second"]);

  PlayerObserver.start();
  check("start() on a connected video changes nothing", second.listenerCount, 7);

  PlayerObserver.stop();
  check("stop() releases the element", [second.listenerCount, PlayerObserver.getVideo()], [0, null]);
}

{
  const { PlayerObserver, setAvailable, tickPoll, mutate, expireBudget, activeSearches } = createObserver();
  const seen = [];
  PlayerObserver.on("video", (v) => seen.push(v.name));
  PlayerObserver.start();
  check("no video yet: keeps searching (poll + DOM watch)", activeSearches(), 2);
  tickPoll();
  check("poll without a video binds nothing", seen, []);
  const v = new FakeVideo("late");
  setAvailable(v);
  mutate();
  check("a DOM change that brings the video binds it", seen, ["late"]);
  check("search stops once bound", activeSearches(), 0);

  PlayerObserver.stop();
  setAvailable(null);
  PlayerObserver.start();
  expireBudget();
  check("search gives up after its budget", activeSearches(), 0);
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
