// Pins how the background worker tells an iPad from a Mac.
//
//   node dev/test/ipad-worker.test.js
//
// Safari on an iPad reports itself as a Mac ("Macintosh; Intel Mac OS X", platform "MacIntel"), and pages
// tell the two apart by touch points. A service worker has no navigator.maxTouchPoints, so the background
// counted every iPad as a desktop: it opened hidden an1me.to tabs (which an iPad shows), kept AniList
// running and used desktop timeouts and retries. The worker now asks the extension runtime for the OS.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");

const IPAD_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

// A worker context: no document, no maxTouchPoints. `os` is what runtime.getPlatformInfo answers.
function worker({ os, userAgent = IPAD_SAFARI, platform = "MacIntel", promiseApi = false } = {}) {
  const stored = {};
  const runtime = {};
  const createdTabs = [];
  if (os !== undefined) {
    // The real answer arrives after every script has loaded, so anything decided at load time cannot see it.
    runtime.getPlatformInfo = promiseApi ? () => Promise.resolve({ os }) : (callback) => setTimeout(() => callback({ os }), 0);
  }
  const c = vm.createContext({
    console: { log() {}, warn() {}, error() {}, table() {} }, setTimeout, clearTimeout, AbortController,
    navigator: { userAgent, platform },
    chrome: {
      runtime,
      storage: { local: { get: () => Promise.resolve(stored) }, onChanged: { addListener() {} } },
      alarms: { create() {}, clear: async () => true },
      // Records each attempt to open a tab, then fails it, so nothing waits for a page that never loads.
      tabs: { query: async () => [], create: async (options) => { createdTabs.push(options); throw new Error("no tabs in this test"); },
        onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
      declarativeNetRequest: { getEnabledRulesets: async () => [] },
    },
  });
  c.self = c;
  vm.runInContext(read("src/common/utils.js"), c);
  vm.runInContext(read("src/background/fetchers/an1me-gateway.js"), c);
  c.createdTabs = createdTabs;
  return c;
}

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log("PASS " + name); } catch (error) { failures++; console.error("FAIL " + name + ": " + error.message); }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

(async () => {
  await test("an iPad's worker counts as mobile once the runtime reports iOS", async () => {
    for (const promiseApi of [false, true]) {
      const c = worker({ os: "ios", promiseApi });
      await settle();
      assert.equal(c.AnimeTrackerUtils.isMobileDevice(), true, promiseApi ? "promise API" : "callback API");
    }
  });

  await test("so it never opens a hidden an1me.to tab, which an iPad would show", async () => {
    const c = worker({ os: "ios" });
    await settle();
    assert.equal(await vm.runInContext("acquireAn1meTab()", c), null);
    assert.equal(c.createdTabs.length, 0, "no tab was opened");
    assert.equal((await c.an1meGatewayStats()).tabCreationAllowed, false);
  });

  await test("a Mac stays a desktop, and may still open its hidden tab", async () => {
    const c = worker({ os: "mac" });
    await settle();
    assert.equal(c.AnimeTrackerUtils.isMobileDevice(), false);
    await vm.runInContext("acquireAn1meTab()", c);
    assert.equal(c.createdTabs.length, 1, "the hidden tab was attempted");
    assert.equal(c.createdTabs[0].active, false);
  });

  await test("Fetch & Import uses the phone's single attempt and longer pause on an iPad", async () => {
    for (const [os, attempts] of [["ios", 1], ["mac", 2]]) {
      const c = worker({ os });
      vm.runInContext(read("src/background/jobs/metadata-repair.js"), c);
      await settle();
      assert.equal(vm.runInContext("metadataRepairMaxAttempts()", c), attempts, os);
    }
  });

  await test("an iPhone is mobile from its user agent alone, before or without the runtime's answer", async () => {
    const c = worker({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", platform: "iPhone" });
    assert.equal(c.AnimeTrackerUtils.isMobileDevice(), true);
    assert.equal((await c.an1meGatewayStats()).tabCreationAllowed, false);
  });

  await test("without the runtime API the old user-agent check still decides", async () => {
    const c = worker({});
    await settle();
    assert.equal(c.AnimeTrackerUtils.isMobileDevice(), false);
  });

  await test("a stored choice about hidden tabs still wins over the device default", async () => {
    const c = worker({ os: "ios" });
    await settle();
    // The storage listener applies a user's explicit opt-in; the default only fills in when there is none.
    vm.runInContext("_an1meTabOptIn = true;", c);
    assert.equal((await c.an1meGatewayStats()).tabCreationAllowed, true);
  });

  process.exitCode = failures ? 1 : 0;
})();
