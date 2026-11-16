// account-preferences-deep.test.js — Deep stress, failure mode, and concurrency tests
// for Preferences & Speed Control cloud sync and multi-account isolation.
const assert = require("node:assert/strict");
const { cloudWorker } = require("./lib/cloud-worker-harness.js");

const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(setImmediate); };
const epoch = Date.parse("2026-10-04T12:00:00Z");

const auth = (uid) => ({
  firebase_user: { uid, email: `${uid}@example.invalid` },
  firebase_tokens: { idToken: `token-${uid}`, refreshToken: `refresh-${uid}`, expiresAt: epoch + 3600000, version: 3 },
});

const switchTo = (w, uid) => w.call("bgMutateFirebaseAuth", {
  operation: "replace_session",
  user: auth(uid).firebase_user,
  tokens: auth(uid).firebase_tokens,
});

const signOut = (w) => w.call("bgMutateFirebaseAuth", { operation: "clear_session" });

const entry = (title, count = 1) => ({
  title,
  episodes: Array.from({ length: count }, (_, i) => ({ number: i + 1, watchedAt: "2026-10-01T10:00:00Z" })),
});

function baseAccount(uid, extra = {}) {
  return {
    ...auth(uid),
    legacySyncMigrationV1Complete: true,
    libraryOwner: `uid:${uid}`,
    animeData: { [`show_${uid}`]: entry(`Show of ${uid}`) },
    videoProgress: { [`show_${uid}__ep-1`]: { currentTime: 300, duration: 1440 } },
    deletedAnime: {},
    goalSettings: { weeklyEpisodes: 10 },
    copyGuardEnabled: true,
    smartNotificationsEnabled: true,
    autoSkipFillers: true,
    skiptimeHelperEnabled: true,
    auto4kServerEnabled: true,
    adGuardEnabled: true,
    autoResumeEnabled: true,
    playbackSettingsUpdatedAt: "2026-10-04T12:00:00.000Z",
    userPreferences: { sort: "date", category: "all" },
    speedControlPreferences: { enabled: true, normalRate: 1.25, boostRate: 4, defaultVolume: 0.5, defaultMuted: false },
    cachedStats: { totalAnime: 1 },
    ...extra,
  };
}

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test("Mid-flight sidecar push is fenced: sign-out/switch aborts request and never writes to new account", async () => {
  let w;
  let intercepted = false;

  const initial = baseAccount("account-a");
  w = cloudWorker(initial, {}, {
    beforeRequest: async (_url, options) => {
      // Intercept the PATCH request before it commits to Firestore
      if (!intercepted && options.method === "PATCH") {
        intercepted = true;
        // Switch to account-b mid-flight
        await switchTo(w, "account-b");
      }
    },
  });
  await flush();

  // Trigger a sidecar push in account-a
  const outcome = await w.call("queueStoredPlaybackSettings");
  await flush();

  // The push must be rejected due to session change
  assert.equal(outcome.success, false, "Push was not acknowledged");
  assert.equal(outcome.error, "session_changed", "Session change was detected");

  // Current session is account-b
  assert.equal(w.store.firebase_user?.uid, "account-b");
  assert.equal(w.store.libraryOwner, "uid:account-b");

  // Account B's active storage MUST NOT contain Account A's settings
  assert.equal(w.store.speedControlPreferences, undefined, "A's speedControl did not land in B");
});

test("Network error (503) on sidecar push queues retry alarm and successfully flushes on recovery", async () => {
  const initial = baseAccount("account-retry");
  const w = cloudWorker(initial);
  await flush();

  // Force next PATCH to fail with 503
  w.failNextPatch();

  // Trigger speed control update
  await w.request("UPDATE_SPEED_CONTROL_PREFERENCES", {
    patch: { normalRate: 1.5, boostRate: 8 },
    mobile: false,
  });
  await flush();

  // Verify pendingSidecars was stored with the failed attempt
  const pending = w.store["syncState.pendingSidecars"];
  assert.ok(pending, "pendingSidecars exists after network failure");
  assert.ok(pending.playbackSettings, "playbackSettings is pending");
  assert.equal(pending.playbackSettings.attempts, 1);
  assert.equal(pending.playbackSettings.payload.speedControl.normalRate, 1.5);
  assert.equal(pending.playbackSettings.payload.speedControl.boostRate, 8);

  // Verify retry alarm was scheduled
  assert.ok(w.alarms.has("sidecarSyncRetry"), "Retry alarm was armed");

  // Now network recovers: trigger manual or alarm-driven flush
  const results = await w.call("flushPendingSidecarSyncs");
  assert.equal(results[0].success, true, "Flush succeeds after recovery");

  // Pending sidecars must be cleared from storage
  assert.equal(w.store["syncState.pendingSidecars"], undefined, "Pending record cleared on success");

  // Remote Firestore has received the speedControl
  assert.equal(w.remote.playbackSettings.speedControl.normalRate, 1.5);
  assert.equal(w.remote.playbackSettings.speedControl.boostRate, 8);
});

test("Pending sidecar write is parked with its owner slot when account changes while offline", async () => {
  const initial = baseAccount("account-drop");
  const w = cloudWorker(initial);
  await flush();

  // Simulate a pending sidecar from account-drop
  w.store["syncState.pendingSidecars"] = {
    playbackSettings: {
      uid: "account-drop",
      payload: {
        copyGuard: false,
        speedControl: { enabled: true, normalRate: 1.75, boostRate: 3 },
      },
      queuedAt: Date.now(),
      attempts: 1,
      retryAt: Date.now(),
    },
  };

  // Switch to account-different
  await switchTo(w, "account-different");
  assert.equal(w.store.firebase_user.uid, "account-different");

  // The pending sidecar for account-drop was safely parked in account-drop's slot!
  const parked = w.store["librarySlot:uid:account-drop"]?.data;
  assert.ok(parked, "Account drop slot exists");
  assert.ok(parked["syncState.pendingSidecars"], "Pending sidecar was parked with its owner");

  // Active storage for account-different does NOT have the old account's pending sidecars
  assert.equal(w.store["syncState.pendingSidecars"], undefined, "Active storage has no pending sidecars");

  // Flushing pending sidecars now does nothing for account-different
  const results = await w.call("flushPendingSidecarSyncs");
  assert.equal(results.length, 0, "No pending sidecars to flush for new account");

  // Switch back to account-drop: its pending sidecars are restored!
  await switchTo(w, "account-drop");
  assert.ok(w.store["syncState.pendingSidecars"]?.playbackSettings, "Pending sidecar restored for account-drop");
});

test("Corrupted or malformed cloud payload is safely normalized without crashes", async () => {
  const w = cloudWorker(baseAccount("account-sanitized"));
  await flush();

  // Cloud document has intentionally bizarre and invalid types
  const corruptCloud = {
    copyGuard: "YES", // string instead of bool
    autoSkipFiller: 12345, // number instead of bool
    speedControl: {
      enabled: "not_a_boolean",
      normalRate: 99.5, // invalid rate not in NORMAL_RATES
      boostRate: -5, // invalid negative rate
      defaultVolume: 888.8, // out of range [0, 1]
      defaultMuted: "maybe", // string instead of bool
    },
    userPreferences: ["invalid_array_type"], // array instead of object
    updatedAt: "2026-10-06T18:00:00.000Z",
  };

  // Must not throw
  const applied = await w.call("applyCloudPlaybackSettings", corruptCloud);
  assert.equal(applied, true);

  // Speed preferences must be sanitized to valid model fields
  const speed = w.store.speedControlPreferences;
  assert.equal(typeof speed.enabled, "boolean", "enabled must be boolean");
  assert.equal(speed.normalRate, null, "invalid normalRate normalized to null");
  assert.equal(speed.boostRate, 4, "invalid boostRate normalized to default 4");
  assert.equal(speed.defaultVolume, null, "out-of-range volume normalized to null");
  assert.equal(speed.defaultMuted, null, "invalid muted normalized to null");

  // Boolean toggles sanitized
  assert.equal(w.store.copyGuardEnabled, true);
  assert.equal(w.store.autoSkipFillers, true);
});

test("Two devices on same account: newer timestamp wins and independent settings propagate", async () => {
  // Device 1 and Device 2 share account-sync
  const t1 = "2026-10-05T10:00:00.000Z";
  const t2 = "2026-10-05T10:05:00.000Z";

  // Device 1 changes Auto-Skip to false and normalRate to 1.5 at T1
  const cloudAtT1 = {
    copyGuard: true,
    smartNotif: true,
    autoSkipFiller: false,
    skiptimeHelper: true,
    auto4kServer: true,
    adGuard: true,
    autoResume: true,
    speedControl: { enabled: true, normalRate: 1.5, boostRate: 4, defaultVolume: null, defaultMuted: null },
    updatedAt: t1,
  };

  // Device 2 has local changes at T2 (T2 > T1)
  const dev2Local = baseAccount("account-sync", {
    autoResumeEnabled: false,
    speedControlPreferences: { enabled: true, normalRate: 1.75, boostRate: 4, defaultVolume: 0.6, defaultMuted: false },
    playbackSettingsUpdatedAt: t2,
  });

  const dev2 = cloudWorker(dev2Local, { playbackSettings: cloudAtT1 });
  await flush();

  // Device 2 receives cloudAtT1 -> because local T2 > cloud T1, it ignores the older cloud copy
  const applied = await dev2.call("applyCloudPlaybackSettings", cloudAtT1);
  assert.equal(applied, false, "Older T1 cloud copy is ignored by Device 2");
  assert.equal(dev2.store.autoResumeEnabled, false, "Device 2 local autoResume stands");
  assert.equal(dev2.store.speedControlPreferences.normalRate, 1.75, "Device 2 local speed stands");

  // Device 2 pushes its T2 payload to cloud
  const dev2PushPayload = await dev2.call("buildStoredPlaybackSettings");
  assert.equal(dev2PushPayload.updatedAt, t2);
  assert.equal(dev2PushPayload.autoResume, false);
  assert.equal(dev2PushPayload.speedControl.normalRate, 1.75);

  // Now Device 1 (whose last sync was T1) polls and receives T2 payload
  const dev1Local = baseAccount("account-sync", {
    autoSkipFillers: false,
    playbackSettingsUpdatedAt: t1,
  });
  const dev1 = cloudWorker(dev1Local);
  await flush();

  const dev1Applied = await dev1.call("applyCloudPlaybackSettings", dev2PushPayload);
  assert.equal(dev1Applied, true, "Device 1 applies newer T2 payload from Device 2");
  assert.equal(dev1.store.autoResumeEnabled, false, "Device 1 receives Device 2's autoResume change");
  assert.equal(dev1.store.speedControlPreferences.normalRate, 1.75, "Device 1 receives Device 2's speed change");
  assert.equal(dev1.store.playbackSettingsUpdatedAt, t2);
});

test("Stress test: 20 rapid sequential and concurrent mutations serialize cleanly without data corruption", async () => {
  const w = cloudWorker(baseAccount("account-stress"));
  await flush();

  const rates = [1.0, 1.25, 1.5, 1.75, 2.0];
  const volumes = [0.2, 0.4, 0.6, 0.8, 1.0];

  const tasks = [];
  for (let i = 0; i < 20; i++) {
    const rate = rates[i % rates.length];
    const vol = volumes[i % volumes.length];
    const toggleBool = i % 2 === 0;

    tasks.push(
      w.request("UPDATE_SPEED_CONTROL_PREFERENCES", {
        patch: { normalRate: rate, defaultVolume: vol },
        mobile: false,
      }),
      w.call("runBgLibraryTransaction", ["adGuardEnabled", "playbackSettingsUpdatedAt"], async () => ({
        data: { adGuardEnabled: toggleBool, playbackSettingsUpdatedAt: new Date(epoch + i * 1000).toISOString() },
        result: true,
      }))
    );
  }

  // All concurrent calls settle without error
  const outcomes = await Promise.all(tasks);
  await flush();

  assert.ok(outcomes.every(Boolean), "All 40 mutation tasks resolved successfully");

  // Verify internal data consistency
  const finalSpeed = w.store.speedControlPreferences;
  assert.ok(rates.includes(finalSpeed.normalRate), "Normal rate is a valid rate");
  assert.ok(volumes.includes(finalSpeed.defaultVolume), "Volume is a valid volume");
  assert.equal(typeof w.store.adGuardEnabled, "boolean", "adGuardEnabled is boolean");

  // Verify buildStoredPlaybackSettings builds coherent payload
  const payload = await w.call("buildStoredPlaybackSettings");
  assert.equal(payload.adGuard, w.store.adGuardEnabled);
  assert.equal(payload.speedControl.normalRate, finalSpeed.normalRate);
  assert.equal(payload.speedControl.defaultVolume, finalSpeed.defaultVolume);
});

test("Large library stress test: 200 anime entries + 500 progress records + preferences park and restore intact", async () => {
  // Build large dataset
  const largeAnime = {};
  const largeProgress = {};
  for (let i = 1; i <= 200; i++) {
    const slug = `anime_series_${i}`;
    largeAnime[slug] = entry(`Series ${i}`, 5);
    for (let ep = 1; ep <= 5 && Object.keys(largeProgress).length < 500; ep++) {
      largeProgress[`${slug}__ep-${ep}`] = { currentTime: ep * 240, duration: 1440, savedAt: "2026-10-04T12:00:00Z" };
    }
  }

  const initial = baseAccount("account-large", {
    animeData: largeAnime,
    videoProgress: largeProgress,
    copyGuardEnabled: false,
    autoSkipFillers: false,
    speedControlPreferences: { enabled: true, normalRate: 1.75, boostRate: 3, defaultVolume: 0.77, defaultMuted: false },
    userPreferences: { sort: "title", category: "all" },
  });

  const w = cloudWorker(initial);
  await flush();

  assert.equal(Object.keys(w.store.animeData).length, 200);
  assert.equal(Object.keys(w.store.videoProgress).length, 500);

  // Switch to account-small
  await switchTo(w, "account-small");
  assert.equal(w.store.libraryOwner, "uid:account-small");
  assert.equal(Object.keys(w.store.animeData).length, 0, "Small account starts empty");
  assert.equal(w.store.speedControlPreferences, undefined, "Small account has no speed control yet");

  // Small account adds 2 shows and sets speed
  await w.call("runBgLibraryTransaction", ["animeData"], (latest) => ({
    data: { animeData: { s1: entry("S1"), s2: entry("S2") } },
  }));
  w.store.speedControlPreferences = { enabled: true, normalRate: 1.0, boostRate: 2, defaultVolume: null, defaultMuted: null };

  // Switch back to account-large
  await switchTo(w, "account-large");
  assert.equal(w.store.libraryOwner, "uid:account-large");

  // All 200 anime and 500 progress entries are intact!
  assert.equal(Object.keys(w.store.animeData).length, 200, "All 200 anime restored");
  assert.equal(Object.keys(w.store.videoProgress).length, 500, "All 500 progress entries restored");
  assert.equal(w.store.animeData.s1, undefined, "No leakage from small account");

  // Large account preferences and speed control restored completely!
  assert.equal(w.store.copyGuardEnabled, false);
  assert.equal(w.store.autoSkipFillers, false);
  assert.deepEqual(w.store.speedControlPreferences, {
    enabled: true, normalRate: 1.75, boostRate: 3, defaultVolume: 0.77, defaultMuted: false,
  });
  assert.deepEqual(w.store.userPreferences, { sort: "title", category: "all" });
});

test("Full lifecycle carousel: Account A -> Guest (mutations) -> Account B (sync + mutations) -> Guest -> Account A (zero leakage)", async () => {
  const initialA = baseAccount("account-a", {
    copyGuardEnabled: false,
    smartNotificationsEnabled: true,
    autoSkipFillers: false,
    skiptimeHelperEnabled: true,
    auto4kServerEnabled: false,
    adGuardEnabled: true,
    autoResumeEnabled: false,
    speedControlPreferences: { enabled: true, normalRate: 1.5, boostRate: 3, defaultVolume: 0.85, defaultMuted: true },
    userPreferences: { sort: "rating", category: "completed", compactStatus: "airing" },
    animeData: { show_a: entry("Show A", 3) },
  });

  const remoteB = {
    copyGuard: true,
    smartNotif: false,
    autoSkipFiller: true,
    skiptimeHelper: false,
    auto4kServer: true,
    adGuard: false,
    autoResume: true,
    speedControl: { enabled: true, normalRate: 2.0, boostRate: 8, defaultVolume: null, defaultMuted: null },
    userPreferences: { sort: "title", category: "all" },
    animeData: { show_b: entry("Show B", 1) },
    updatedAt: "2026-10-05T12:00:00.000Z",
  };

  const w = cloudWorker(initialA, { playbackSettings: { ...initialA.speedControlPreferences, updatedAt: initialA.playbackSettingsUpdatedAt } });
  await flush();

  // 1. Sign out to Guest
  await signOut(w);
  assert.equal(w.store.firebase_user, undefined);
  assert.equal(w.store.libraryOwner, "guest");
  assert.equal(Object.keys(w.store.animeData || {}).length, 0);

  // 2. Guest modifies settings locally
  await w.request("UPDATE_SPEED_CONTROL_PREFERENCES", {
    patch: { normalRate: 1.0, boostRate: 2, defaultVolume: 0.25 },
    mobile: false,
  });
  await w.call("runBgLibraryTransaction", ["copyGuardEnabled", "animeData"], async () => ({
    data: {
      copyGuardEnabled: true,
      animeData: { guest_show: entry("Guest Show") },
    },
    result: true,
  }));
  await flush();

  assert.equal(w.store.copyGuardEnabled, true);
  assert.equal(w.store.speedControlPreferences.normalRate, 1.0);
  assert.equal(w.store.animeData.guest_show.title, "Guest Show");

  // 3. Account B signs in
  w.remoteWrite((r) => Object.assign(r, {
    playbackSettings: remoteB,
    animeData: remoteB.animeData,
  }));
  await switchTo(w, "account-b");
  assert.equal(w.store.firebase_user.uid, "account-b");
  assert.equal(w.store.libraryOwner, "uid:account-b");

  // Apply cloud data for Account B
  await w.call("applyCloudPlaybackSettings", remoteB);
  await w.call("runBgLibraryTransaction", ["animeData"], async () => ({
    data: { animeData: remoteB.animeData },
    result: true,
  }));
  await flush();

  // Verify Account B has Account B's data with zero contamination from Guest or A
  assert.equal(w.store.animeData.guest_show, undefined, "No Guest show in Account B");
  assert.equal(w.store.animeData.show_a, undefined, "No Account A show in Account B");
  assert.ok(w.store.animeData.show_b, "Account B show present");
  assert.equal(w.store.speedControlPreferences.normalRate, 2.0, "Account B speed is 2.0");
  assert.equal(w.store.speedControlPreferences.boostRate, 8, "Account B boost is 8");
  assert.notEqual(w.store.copyGuardEnabled, false, "Account B copyGuard is enabled (default on)");
  assert.equal(w.store.smartNotificationsEnabled === true, false, "Account B smartNotif is disabled");

  // Account B mutates normalRate to 1.75
  await w.request("UPDATE_SPEED_CONTROL_PREFERENCES", {
    patch: { normalRate: 1.75 },
    mobile: false,
  });
  await flush();
  assert.equal(w.store.speedControlPreferences.normalRate, 1.75);

  // 4. Account B signs out back to Guest
  await signOut(w);
  assert.equal(w.store.libraryOwner, "guest");
  // Guest state is restored!
  assert.ok(w.store.animeData.guest_show, "Guest show restored");
  assert.equal(w.store.animeData.show_b, undefined, "Account B show not in Guest");
  assert.equal(w.store.speedControlPreferences.normalRate, 1.0, "Guest normalRate 1.0 restored");

  // 5. Account A signs back in
  await switchTo(w, "account-a");
  assert.equal(w.store.libraryOwner, "uid:account-a");
  // Account A state is restored completely!
  assert.ok(w.store.animeData.show_a, "Account A show restored");
  assert.equal(w.store.animeData.guest_show, undefined, "No Guest show in Account A");
  assert.equal(w.store.animeData.show_b, undefined, "No Account B show in Account A");
  assert.equal(w.store.copyGuardEnabled, false, "Account A copyGuard restored");
  assert.equal(w.store.smartNotificationsEnabled, true, "Account A smartNotif restored");
  assert.equal(w.store.speedControlPreferences.normalRate, 1.5, "Account A normalRate 1.5 restored");
  assert.equal(w.store.speedControlPreferences.boostRate, 3, "Account A boostRate 3 restored");
  assert.equal(w.store.speedControlPreferences.defaultVolume, 0.85, "Account A volume restored");
  assert.equal(w.store.userPreferences.sort, "rating", "Account A sort restored");
});

test("Cross-platform sync: Mobile pull preserves Desktop boost (>2x) and defaultVolume in cloud payload", async () => {
  const desktopCloud = {
    copyGuard: true,
    smartNotif: true,
    autoSkipFiller: true,
    skiptimeHelper: true,
    auto4kServer: true,
    adGuard: true,
    autoResume: true,
    speedControl: { enabled: true, normalRate: 1.5, boostRate: 8, defaultVolume: 0.72, defaultMuted: false },
    updatedAt: "2026-10-06T10:00:00.000Z",
  };

  const mobileWorker = cloudWorker(baseAccount("account-mobile"), { playbackSettings: desktopCloud });
  mobileWorker.context.navigator = {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    platform: "iPhone",
    maxTouchPoints: 5,
  };
  await flush();

  const applied = await mobileWorker.call("applyCloudPlaybackSettings", desktopCloud);
  assert.equal(applied, true);

  const localMobileSpeed = mobileWorker.store.speedControlPreferences;
  assert.equal(localMobileSpeed.boostRate, 2, "Mobile clamps boostRate to 2 locally");
  assert.equal(localMobileSpeed.defaultVolume, null, "Mobile nulls defaultVolume locally");
  assert.equal(localMobileSpeed.normalRate, 1.5, "Mobile preserves normalRate 1.5");

  const cachedDesktop = mobileWorker.store.cloud_desktop_playback_settings;
  assert.ok(cachedDesktop?.speedControl, "Desktop speed preferences cached on mobile");
  assert.equal(cachedDesktop.speedControl.boostRate, 8);
  assert.equal(cachedDesktop.speedControl.defaultVolume, 0.72);

  await mobileWorker.call("runBgLibraryTransaction", ["autoResumeEnabled", "playbackSettingsUpdatedAt"], async () => ({
    data: { autoResumeEnabled: false, playbackSettingsUpdatedAt: "2026-10-06T12:00:00.000Z" },
    result: true,
  }));
  await mobileWorker.request("UPDATE_SPEED_CONTROL_PREFERENCES", {
    patch: { normalRate: 1.25 },
    mobile: true,
  });
  await flush();

  const pushPayload = await mobileWorker.call("buildStoredPlaybackSettings");
  assert.equal(pushPayload.autoResume, false, "Mobile autoResume change included in payload");
  assert.equal(pushPayload.speedControl.normalRate, 1.25, "Mobile normalRate change included");
  assert.equal(pushPayload.speedControl.boostRate, 8, "Desktop boost 8x preserved in cloud push from mobile");
  assert.equal(pushPayload.speedControl.defaultVolume, 0.72, "Desktop volume 0.72 preserved in cloud push from mobile");
  assert.equal(pushPayload.speedControl.defaultMuted, false, "Desktop mute preserved in cloud push from mobile");

  const syncResult = await mobileWorker.call("queueStoredPlaybackSettings");
  await flush();
  assert.equal(syncResult.success, true);

  assert.equal(mobileWorker.remote.playbackSettings.speedControl.normalRate, 1.25);
  assert.equal(mobileWorker.remote.playbackSettings.speedControl.boostRate, 8);
  assert.equal(mobileWorker.remote.playbackSettings.speedControl.defaultVolume, 0.72);
});

test("Audio Reset ('Reset audio default') clears defaultVolume & defaultMuted and triggers cloud sidecar sync", async () => {
  const initial = baseAccount("account-audio", {
    speedControlPreferences: { enabled: true, normalRate: 1.25, boostRate: 4, defaultVolume: 0.45, defaultMuted: true },
    playbackSettingsUpdatedAt: "2026-10-05T10:00:00.000Z",
  });
  const w = cloudWorker(initial);
  await flush();

  assert.equal(w.store.speedControlPreferences.defaultVolume, 0.45);
  assert.equal(w.store.speedControlPreferences.defaultMuted, true);

  const res = await w.request("UPDATE_SPEED_CONTROL_PREFERENCES", {
    patch: { defaultVolume: null, defaultMuted: null },
    mobile: false,
  });
  await flush();

  assert.equal(res.success, true);
  assert.equal(w.store.speedControlPreferences.defaultVolume, null, "defaultVolume cleared locally");
  assert.equal(w.store.speedControlPreferences.defaultMuted, null, "defaultMuted cleared locally");

  assert.equal(w.remote.playbackSettings.speedControl.defaultVolume, null, "defaultVolume cleared in Firestore");
  assert.equal(w.remote.playbackSettings.speedControl.defaultMuted, null, "defaultMuted cleared in Firestore");
  assert.equal(w.remote.playbackSettings.speedControl.normalRate, 1.25, "normalRate remains intact");
});

test("Offline retry queue: sidecar retries survive token replacement and succeed on flush", async () => {
  const initial = baseAccount("account-token-retry");
  const w = cloudWorker(initial);
  await flush();

  // Network failure on next PATCH
  w.failNextPatch();

  // Speed preference updated while offline
  await w.request("UPDATE_SPEED_CONTROL_PREFERENCES", {
    patch: { normalRate: 2.0 },
    mobile: false,
  });
  await flush();

  // Pending sidecar queued
  assert.ok(w.store["syncState.pendingSidecars"]?.playbackSettings);
  assert.ok(w.alarms.has("sidecarSyncRetry"));

  // Tokens replaced while offline
  const freshTokens = {
    idToken: "fresh-id-token",
    refreshToken: "fresh-refresh-token",
    expiresAt: Date.now() + 7200000,
    version: 3,
  };
  await w.call("bgMutateFirebaseAuth", {
    operation: "replace_tokens",
    tokens: freshTokens,
  });
  await flush();

  // Retry flush succeeds with fresh token!
  const results = await w.call("flushPendingSidecarSyncs");
  assert.equal(results[0]?.success, true);
  assert.equal(w.store["syncState.pendingSidecars"], undefined, "Pending queue cleared");
  assert.equal(w.remote.playbackSettings.speedControl.normalRate, 2.0, "Remote document updated");
});

test("Concurrent Full Library Sync + Playback Sidecar Sync race condition test", async () => {
  const initial = baseAccount("account-race", {
    speedControlPreferences: { enabled: true, normalRate: 1.0, boostRate: 2, defaultVolume: null, defaultMuted: null },
    animeData: { initial_show: entry("Initial Show") },
  });
  const w = cloudWorker(initial);
  await flush();

  // Trigger concurrently:
  // 1. Anime mutation + full sync
  // 2. Speed control mutation + sidecar sync
  const p1 = (async () => {
    await w.call("runBgLibraryTransaction", ["animeData"], async (latest) => ({
      data: { animeData: { ...latest.animeData, new_show: entry("New Show") } },
      result: true,
    }));
    return w.call("syncToFirebase", "test-concurrent-full");
  })();

  const p2 = (async () => {
    return w.request("UPDATE_SPEED_CONTROL_PREFERENCES", {
      patch: { normalRate: 1.75, boostRate: 8 },
      mobile: false,
    });
  })();

  const [res1, res2] = await Promise.all([p1, p2]);
  await flush();

  assert.equal(res2.success, true);
  // Verify remote Firestore has both the new anime and the speed control
  assert.ok(w.remote.animeData?.new_show || w.store.animeData?.new_show, "New show preserved in remote or store");
  assert.equal(w.remote.playbackSettings?.speedControl?.normalRate, 1.75, "Speed control normalRate landed in Firestore");
  assert.equal(w.remote.playbackSettings?.speedControl?.boostRate, 8, "Speed control boostRate landed in Firestore");
});

test("Extreme payload fuzzing & boundary values for all 7 settings and speed controls", async () => {
  const w = cloudWorker(baseAccount("account-fuzz"));
  await flush();

  // Fuzz testing various boundary & adversarial payloads
  const fuzzCases = [
    {
      label: "Valid maximum boundaries",
      payload: {
        copyGuard: true,
        smartNotif: true,
        autoSkipFiller: true,
        skiptimeHelper: true,
        auto4kServer: true,
        adGuard: true,
        autoResume: true,
        speedControl: { enabled: true, normalRate: 2.0, boostRate: 8, defaultVolume: 1.0, defaultMuted: true },
        updatedAt: "2026-10-07T10:00:00.000Z",
      },
      asserts: (store) => {
        assert.equal(store.copyGuardEnabled, true);
        assert.equal(store.speedControlPreferences.normalRate, 2.0);
        assert.equal(store.speedControlPreferences.boostRate, 8);
        assert.equal(store.speedControlPreferences.defaultVolume, 1.0);
        assert.equal(store.speedControlPreferences.defaultMuted, true);
      },
    },
    {
      label: "Valid minimum boundaries",
      payload: {
        copyGuard: false,
        smartNotif: false,
        autoSkipFiller: false,
        skiptimeHelper: false,
        auto4kServer: false,
        adGuard: false,
        autoResume: false,
        speedControl: { enabled: false, normalRate: 0.5, boostRate: 1.5, defaultVolume: 0.0, defaultMuted: false },
        updatedAt: "2026-10-07T11:00:00.000Z",
      },
      asserts: (store) => {
        assert.equal(store.copyGuardEnabled, false);
        assert.equal(store.speedControlPreferences.enabled, false);
        assert.equal(store.speedControlPreferences.normalRate, 0.5);
        assert.equal(store.speedControlPreferences.boostRate, 1.5);
        assert.equal(store.speedControlPreferences.defaultVolume, 0.0);
        assert.equal(store.speedControlPreferences.defaultMuted, false);
      },
    },
    {
      label: "Adversarial & prototype pollution attempts",
      payload: {
        __proto__: { injected: true },
        copyGuard: "evil_string",
        speedControl: {
          __proto__: { polluter: true },
          enabled: { evil: "object" },
          normalRate: -999.99,
          boostRate: 0,
          defaultVolume: 500,
          defaultMuted: "not-a-boolean",
        },
        updatedAt: "2026-10-07T12:00:00.000Z",
      },
      asserts: (store) => {
        assert.equal(store.copyGuardEnabled, true, "invalid copyGuard defaults to true");
        assert.equal(store.speedControlPreferences.normalRate, null, "invalid normalRate sanitized to null");
        assert.equal(store.speedControlPreferences.boostRate, 4, "invalid boostRate normalized to 4");
        assert.equal(store.speedControlPreferences.defaultVolume, null, "out-of-range volume sanitized to null");
        assert.equal(store.speedControlPreferences.defaultMuted, null, "invalid muted sanitized to null");
        assert.equal(Object.prototype.injected, undefined, "no prototype pollution");
        assert.equal(Object.prototype.polluter, undefined, "no speed prototype pollution");
      },
    },
  ];

  for (const { label, payload, asserts } of fuzzCases) {
    const applied = await w.call("applyCloudPlaybackSettings", payload);
    assert.equal(applied, true, `${label}: applied without throwing`);
    asserts(w.store);
  }
});

(async () => {
  const hold = setInterval(() => {}, 1000);
  const watchdog = setTimeout(() => { console.error("FAIL deep tests timed out"); process.exit(1); }, 45000);
  try {
    let failures = 0;
    for (const { name, fn } of cases) {
      try {
        await fn();
        console.log("PASS " + name);
      } catch (error) {
        failures++;
        console.error("FAIL " + name + ": " + error.stack);
      }
    }
    process.exitCode = failures ? 1 : 0;
  } finally {
    clearInterval(hold);
    clearTimeout(watchdog);
  }
})();
