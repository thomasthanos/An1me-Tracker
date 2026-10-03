const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(REPO, file), "utf8");

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}: ${e.stack}`);
  }
}

function createSyncEnvironment({ isMobile = false, initialStore = {} } = {}) {
  const store = structuredClone(initialStore);
  const alarms = new Map();
  const clearedAlarms = [];
  const pushCalls = [];
  let storageListener = null;
  let alarmListener = null;
  let messageListener = null;

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 123,
    clearInterval: () => {},
    AnimeTrackerUtils: {
      isMobileDevice: () => isMobile,
    },
    AniListCore: {
      AUTH_KEY: "anilist_auth",
      runPush: async (opts) => {
        pushCalls.push(opts);
        return { done: 1, total: 1, ok: 1, skipped: 0, failed: 0, retryableFailed: 0, truncated: false };
      },
    },
    bgStorageGet: async (keys) => {
      const result = {};
      for (const k of keys) {
        if (k in store) result[k] = structuredClone(store[k]);
      }
      return result;
    },
    bgStorageSet: async (data) => {
      Object.assign(store, structuredClone(data));
    },
    chrome: {
      alarms: {
        create: (name, options) => {
          alarms.set(name, options);
        },
        clear: async (name) => {
          alarms.delete(name);
          clearedAlarms.push(name);
        },
        get: async (name) => alarms.get(name) || null,
        onAlarm: {
          addListener: (fn) => {
            alarmListener = fn;
          },
        },
      },
      storage: {
        onChanged: {
          addListener: (fn) => {
            storageListener = fn;
          },
        },
      },
      runtime: {
        onMessage: {
          addListener: (fn) => {
            messageListener = fn;
          },
        },
      },
    },
  };
  sandbox.self = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(read("src/background/sync/anilist-sync.js"), ctx);

  return {
    store,
    alarms,
    clearedAlarms,
    pushCalls,
    fireAlarm: (name) => alarmListener?.({ name }),
    fireStorageChange: (changes) => storageListener?.(changes, "local"),
    sendMessage: (msg) => {
      let resp = null;
      messageListener?.(msg, {}, (r) => {
        resp = r;
      });
      return resp;
    },
  };
}

(async () => {
  await test("on mobile, auto-push alarms are not created and storage changes do not arm push", async () => {
    const env = createSyncEnvironment({
      isMobile: true,
      initialStore: {
        anilist_auth: { accessToken: "valid_token", expiresAt: Date.now() + 3600000 },
      },
    });

    // Wait microtasks for startup check
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(env.alarms.has("anilistPushPeriodic"), false, "periodic alarm must not be scheduled on mobile");

    // Simulate animeData change (e.g. user watched an episode on mobile)
    env.fireStorageChange({ animeData: { newValue: { naruto: { episodes: [1] } } } });
    assert.equal(env.alarms.has("anilistPush"), false, "push alarm must not be armed on mobile upon library change");

    // Periodic alarm fire attempt (if any) should be ignored
    await env.fireAlarm("anilistPushPeriodic");
    assert.equal(env.pushCalls.length, 0, "automatic push must not run on mobile");
  });

  await test("on mobile, a persisted running push becomes disabled without calling runPush", async () => {
    const env = createSyncEnvironment({
      isMobile: true,
      initialStore: {
        anilist_auth: { accessToken: "valid_token", expiresAt: Date.now() + 3600000 },
        anilist_sync_status: { state: "running" },
      },
    });

    await new Promise((r) => setTimeout(r, 20));

    // Alarm firing should not execute push
    await env.fireAlarm("anilistPush");
    assert.equal(env.pushCalls.length, 0, "runPush must not be called");
    assert.equal(env.store.anilist_sync_status.state, "disabled");
    assert.equal(env.store.anilist_sync_status.reason, "mobile");
  });

  await test("on mobile, manual sync is rejected and preserves desktop account credentials", async () => {
    const env = createSyncEnvironment({
      isMobile: true,
      initialStore: {
        anilist_auth: { accessToken: "valid_token", expiresAt: Date.now() + 3600000 },
      },
    });

    await new Promise((r) => setTimeout(r, 20));

    const response = env.sendMessage({ type: "ANILIST_SYNC_NOW" });
    assert.equal(response?.received, false);
    assert.equal(response?.disabled, true);

    // Wait for async execution
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(env.pushCalls.length, 0, "manual push must not run on mobile");
    assert.equal(env.store.anilist_auth.accessToken, "valid_token");
    assert.equal(env.store.anilist_sync_status.state, "disabled");
  });

  await test("on desktop, automatic periodic alarm is scheduled and storage change arms push", async () => {
    const env = createSyncEnvironment({
      isMobile: false,
      initialStore: {
        anilist_auth: { accessToken: "valid_token", expiresAt: Date.now() + 3600000 },
      },
    });

    await new Promise((r) => setTimeout(r, 20));

    assert.equal(env.alarms.has("anilistPushPeriodic"), true, "desktop must schedule periodic auto-push");

    // Simulate library change on PC
    env.fireStorageChange({ animeData: { newValue: { naruto: { episodes: [1] } } } });
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(env.alarms.has("anilistPush"), true, "desktop must arm push alarm on animeData change");
  });

  process.exitCode = failures ? 1 : 0;
})();
