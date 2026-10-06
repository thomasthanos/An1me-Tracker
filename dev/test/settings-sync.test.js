const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
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

(async () => {
  await test("AnimeTrackerUtils mobile detection and device-scoped toggles", () => {
    // Desktop context
    const desktopCtx = vm.createContext({
      navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", platform: "Win32", maxTouchPoints: 0 },
    });
    desktopCtx.globalThis = desktopCtx;
    vm.runInContext(read("src/common/utils.js"), desktopCtx);
    const desktopUtils = desktopCtx.AnimeTrackerUtils;

    assert.equal(desktopUtils.isMobileDevice(), false);
    assert.equal(desktopUtils.auto4kEnabled(undefined), true);
    assert.equal(desktopUtils.auto4kEnabled(false), false);
    assert.equal(desktopUtils.auto4kEnabled(true), true);
    assert.equal(desktopUtils.copyGuardEnabled(undefined), true);
    assert.equal(desktopUtils.copyGuardEnabled(false), false);
    assert.equal(desktopUtils.copyGuardEnabled(true), true);
    assert.equal(desktopUtils.skiptimeHelperEnabled(undefined), false);
    assert.equal(desktopUtils.skiptimeHelperEnabled(true), true);

    // Mobile context (iPhone)
    const mobileCtx = vm.createContext({
      navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", platform: "iPhone", maxTouchPoints: 5 },
    });
    mobileCtx.globalThis = mobileCtx;
    vm.runInContext(read("src/common/utils.js"), mobileCtx);
    const mobileUtils = mobileCtx.AnimeTrackerUtils;

    assert.equal(mobileUtils.isMobileDevice(), true);
    assert.equal(mobileUtils.auto4kEnabled(undefined), false, "Auto4K default must be false on mobile");
    assert.equal(mobileUtils.auto4kEnabled(false), false);
    assert.equal(mobileUtils.auto4kEnabled(true), false, "Saved desktop 4K must not enable the mobile player");
    assert.equal(mobileUtils.copyGuardEnabled(undefined), false, "CopyGuard default must be false on mobile");
    assert.equal(mobileUtils.copyGuardEnabled(false), false);
    assert.equal(mobileUtils.copyGuardEnabled(true), true);
    assert.equal(mobileUtils.skiptimeHelperEnabled(undefined), false, "SkiptimeHelper default must be false on mobile");
    assert.equal(mobileUtils.skiptimeHelperEnabled(false), false);
    assert.equal(mobileUtils.skiptimeHelperEnabled(true), true);
  });

  await test("applyCloudPlaybackSettings preserves desktop settings on mobile without enabling heavy features locally", async () => {
    const store = {
      adGuardEnabled: true,
      copyGuardEnabled: true, // Previously had desktop true
      auto4kServerEnabled: true,
      skiptimeHelperEnabled: true,
    };
    const storageArea = {
      get: (keys, cb) => {
        const res = {};
        for (const k of (Array.isArray(keys) ? keys : [keys])) res[k] = store[k];
        cb(res);
      },
      set: (data, cb) => {
        Object.assign(store, data);
        if (cb) cb();
      },
    };

    const c = vm.createContext({
      console,
      navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 },
      chrome: {
        storage: { local: storageArea },
        runtime: { lastError: null },
      },
      dlog: () => {},
      LIBRARY_MUTATION_KEY_SET: new Set(),
      runBgLibraryTransaction: async (keys, fn) => {
        const snap = {};
        for (const k of keys) snap[k] = store[k];
        const res = await fn(snap);
        if (res?.data) Object.assign(store, res.data);
        return res?.result || res;
      },
    });
    c.globalThis = c;
    c.self = c;

    vm.runInContext(read("src/common/utils.js"), c);

    // Extract applyCloudPlaybackSettings and constants from background.js
    const bgSrc = read("background.js");
    const bgStorageGetDef = "async function bgStorageGet(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }\n";
    const applyDef = bgSrc.slice(bgSrc.indexOf("const BG_PLAYBACK_FIELD_MAP = {"), bgSrc.indexOf("const BG_ANILIST_AUTH_KEY ="));

    vm.runInContext(bgStorageGetDef + applyDef, c);

    // Cloud has 4K ON, Skiptime ON, CopyGuard ON, SmartNotif ON, AdGuard OFF
    const cloudPayload = {
      copyGuard: true,
      skiptimeHelper: true,
      auto4kServer: true,
      smartNotif: true,
      adGuard: false,
      autoResume: true,
      updatedAt: "2026-10-03T18:00:00.000Z",
    };

    const changed = await c.applyCloudPlaybackSettings(cloudPayload);
    assert.equal(changed, true);

    // Verify local storage: on mobile, heavy features MUST be turned OFF
    assert.equal(store.copyGuardEnabled, false, "Local copyGuard must be forced to false on mobile");
    assert.equal(store.skiptimeHelperEnabled, false, "Local skiptimeHelper must be forced to false on mobile");
    assert.equal(store.auto4kServerEnabled, false, "Local auto4kServer must be forced to false on mobile");

    // But shared playback features MUST be synced from cloud
    assert.equal(store.smartNotificationsEnabled, true);
    assert.equal(store.adGuardEnabled, false);
    assert.equal(store.autoResumeEnabled, true);

    // Desktop settings must be cached in cloud_desktop_playback_settings
    assert.equal(store.cloud_desktop_playback_settings?.copyGuard, true);
    assert.equal(store.cloud_desktop_playback_settings?.skiptimeHelper, true);
    assert.equal(store.cloud_desktop_playback_settings?.auto4kServer, true);
  });

  await test("queueStoredPlaybackSettings on mobile does not downgrade desktop preferences in cloud payload", async () => {
    const store = {
      copyGuardEnabled: false,
      skiptimeHelperEnabled: false,
      auto4kServerEnabled: false,
      smartNotificationsEnabled: true,
      autoSkipFillers: true,
      adGuardEnabled: true,
      autoResumeEnabled: true,
      playbackSettingsUpdatedAt: "2026-10-03T18:30:00.000Z",
      cloud_desktop_playback_settings: {
        copyGuard: true,
        skiptimeHelper: true,
        auto4kServer: true,
      },
    };

    let queuedPayload = null;
    const c = vm.createContext({
      console,
      navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 },
      bgStorageGet: async (keys) => {
        const res = {};
        for (const k of keys) res[k] = store[k];
        return res;
      },
      bgStorageSet: async (data) => Object.assign(store, data),
      queueSidecarSync: async (kind, payload) => {
        queuedPayload = payload;
        return { success: true };
      },
    });
    c.globalThis = c;
    c.self = c;

    vm.runInContext(read("src/common/utils.js"), c);

    const bgSrc = read("background.js");
    const queueDef = bgSrc.slice(bgSrc.indexOf("async function queueStoredPlaybackSettings() {"), bgSrc.indexOf("function enqueueSidecarSync("));

    vm.runInContext(
      'const BG_PLAYBACK_UPDATED_AT_KEY = "playbackSettingsUpdatedAt";\nconst BG_CLOUD_DESKTOP_PLAYBACK_KEY = "cloud_desktop_playback_settings";\n' +
      queueDef,
      c
    );

    await c.queueStoredPlaybackSettings();
    assert.ok(queuedPayload, "A sidecar payload must be queued");

    // The cloud payload must preserve PC's desktop settings!
    assert.equal(queuedPayload.copyGuard, true, "Desktop copyGuard must not be downgraded to false");
    assert.equal(queuedPayload.skiptimeHelper, true, "Desktop skiptimeHelper must not be downgraded to false");
    assert.equal(queuedPayload.auto4kServer, true, "Desktop auto4kServer must not be downgraded to false");

    // Mobile's actual changes to shared settings must be present
    assert.equal(queuedPayload.smartNotif, true);
    assert.equal(queuedPayload.autoSkipFiller, true);
  });

  await test("copy-guard and skiptime content scripts do not install on mobile devices", () => {
    let copyListenersAdded = 0;
    const documentMock = {
      documentElement: { classList: { add() {} } },
      addEventListener: (type) => {
        if (["copy", "cut", "selectstart", "dragstart", "contextmenu"].includes(type)) {
          copyListenersAdded++;
        }
      },
      head: {},
      getElementById: () => null,
      readyState: "complete",
    };

    const c = vm.createContext({
      document: documentMock,
      window: {
        AnimeTrackerUtils: { isMobileDevice: () => true },
        AnimeTrackerContent: { PageEvents: { onStorage() {} } },
      },
      navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 },
      chrome: {
        storage: { local: { get() {} } },
        runtime: { lastError: null },
      },
    });
    c.globalThis = c;

    // Run copy-guard
    vm.runInContext(read("src/content/page/copy-guard.js"), c);
    assert.equal(copyListenersAdded, 0, "No copy guard event listeners should be attached on mobile");
  });

  await test("SettingsView renders mobile subtitles and marks heavy toggles disabled on mobile", () => {
    const mobileCtx = vm.createContext({
      navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 },
      document: {
        getElementById: () => null,
        documentElement: { classList: { add() {} } },
      },
    });
    mobileCtx.globalThis = mobileCtx;
    vm.runInContext(read("src/common/utils.js"), mobileCtx);

    const settingsSrc = read("src/popup/views/settings-view.js");
    mobileCtx.window = { AnimeTracker: { UIHelpers: { escapeHtml: s => s } } };
    vm.runInContext(settingsSrc, mobileCtx);

    const SettingsView = mobileCtx.window.AnimeTracker.SettingsView;
    assert.equal(SettingsView.toggleSubtitle("settingsCopyGuard", true), "Disabled on mobile (prevents touch lag)");
    assert.equal(SettingsView.toggleSubtitle("settingsAuto4kServer", true), "Disabled on mobile (prevents overheating)");
    assert.equal(SettingsView.toggleSubtitle("settingsSkiptime", true), "Disabled on mobile (desktop only)");
    // Non-mobile-specific toggles should still have their normal subtitles
    assert.equal(SettingsView.toggleSubtitle("settingsSmartNotif", true), "You will be notified of new episodes");
  });

  // Shared context for the playback-settings push/pull pair: the field map plus the payload builder and
  // the equality check the full sync uses to decide whether the cloud needs another write.
  function playbackContext(store) {
    const storageArea = {
      get: (keys, cb) => {
        const res = {};
        for (const k of (Array.isArray(keys) ? keys : [keys])) res[k] = store[k];
        cb(res);
      },
      set: (data, cb) => {
        Object.assign(store, data);
        if (cb) cb();
      },
    };
    const c = vm.createContext({
      console,
      navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 },
      chrome: { storage: { local: storageArea }, runtime: { lastError: null } },
      dlog: () => {},
      LIBRARY_MUTATION_KEY_SET: new Set(),
      runBgLibraryTransaction: async (keys, fn) => {
        const snap = {};
        for (const k of keys) snap[k] = store[k];
        const res = await fn(snap);
        if (res?.data) Object.assign(store, res.data);
        return res?.result || res;
      },
      bgStorageGet: async (keys) => {
        const res = {};
        for (const k of keys) res[k] = store[k];
        return res;
      },
      bgStorageSet: async (data) => Object.assign(store, data),
      queueSidecarSync: async (kind, payload) => ({ success: true, kind, payload }),
    });
    c.globalThis = c;
    c.self = c;
    vm.runInContext(read("src/common/utils.js"), c);

    const bgSrc = read("background.js");
    const applyDef = bgSrc.slice(bgSrc.indexOf("const BG_PLAYBACK_FIELD_MAP = {"), bgSrc.indexOf("const BG_ANILIST_AUTH_KEY ="));
    const payloadDef = bgSrc.slice(
      bgSrc.indexOf("async function queueStoredPlaybackSettings() {"),
      bgSrc.indexOf("function enqueueSidecarSync("),
    );
    vm.runInContext(applyDef + "\n" + payloadDef, c);
    return c;
  }

  await test("a reinstall adopts the account's playback settings instead of stamping its own defaults over them", async () => {
    const store = {}; // empty storage, exactly what an uninstall leaves behind
    const c = playbackContext(store);

    const cloud = {
      copyGuard: false, smartNotif: true, autoSkipFiller: true, skiptimeHelper: true,
      auto4kServer: false, adGuard: false, autoResume: true,
      userPreferences: { sort: "name", category: "movies" },
      updatedAt: "2026-10-05T10:00:00.000Z",
    };
    assert.equal(await c.applyCloudPlaybackSettings(cloud), true, "the cloud copy is applied on a fresh install");
    assert.equal(store.copyGuardEnabled, false);
    assert.equal(store.smartNotificationsEnabled, true);
    assert.equal(store.autoSkipFillers, true);
    assert.equal(store.skiptimeHelperEnabled, true);
    assert.equal(store.auto4kServerEnabled, false);
    assert.equal(store.adGuardEnabled, false);
    assert.equal(store.autoResumeEnabled, true);
    assert.equal(store.userPreferences.sort, "name", "UI preferences travel with the same payload");
    assert.equal(store.playbackSettingsUpdatedAt, cloud.updatedAt, "the cloud stamp is adopted, not a fresh local one");

    const payload = await c.buildStoredPlaybackSettings();
    assert.equal(payload.copyGuard, false);
    assert.equal(payload.auto4kServer, false);
    assert.equal(payload.adGuard, false);
    assert.equal(payload.updatedAt, cloud.updatedAt, "the payload keeps the change time it adopted");
    assert.equal(c.playbackSettingsEqual(cloud, payload), true, "adopting the cloud copy leaves nothing to push");
  });

  await test("a device whose preferences are newer keeps them and pushes them over the cloud", async () => {
    const store = { copyGuardEnabled: false, playbackSettingsUpdatedAt: "2026-10-06T10:00:00.000Z" };
    const c = playbackContext(store);

    const cloud = {
      copyGuard: true, smartNotif: false, autoSkipFiller: false, skiptimeHelper: false,
      auto4kServer: true, adGuard: true, autoResume: false,
      updatedAt: "2026-10-05T10:00:00.000Z",
    };
    assert.equal(await c.applyCloudPlaybackSettings(cloud), false, "an older cloud copy is ignored");
    assert.equal(store.copyGuardEnabled, false, "the local choice stands");

    const payload = await c.buildStoredPlaybackSettings();
    assert.equal(payload.copyGuard, false);
    assert.equal(payload.updatedAt, store.playbackSettingsUpdatedAt, "the push keeps the local change time");
    assert.equal(c.playbackSettingsEqual(cloud, payload), false, "the newer local copy is pushed");
  });

  await test("the full library sync carries playback settings in both directions", () => {
    const bgSrc = read("background.js");
    const start = bgSrc.indexOf("async function performFullSync(");
    const fullSync = bgSrc.slice(start, bgSrc.indexOf("let fullSyncRunPromise", start));
    assert.ok(start > 0 && fullSync.length > 0, "performFullSync is present");
    assert.match(fullSync, /applyCloudPlaybackSettings\(cloudDoc\.playbackSettings\)/, "a full sync applies the cloud copy");
    assert.match(fullSync, /fieldPaths\.push\("playbackSettings"\)/, "a full sync pushes the local copy");
    assert.match(fullSync, /playbackDiffers/, "an unchanged copy earns no extra write");
  });

  process.exitCode = failures ? 1 : 0;
})();
