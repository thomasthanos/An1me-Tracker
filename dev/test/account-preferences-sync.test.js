// account-preferences-sync.test.js — Comprehensive verification of Preferences & Speed Control
// synchronization with Firebase Firestore and isolation per account.
const assert = require("node:assert/strict");
const { cloudWorker } = require("./lib/cloud-worker-harness.js");

const flush = async () => { for (let i = 0; i < 25; i++) await new Promise(setImmediate); };
const epoch = Date.parse("2026-10-04T12:00:00Z");

const auth = (uid) => ({
  firebase_user: { uid, email: `${uid}@example.invalid` },
  firebase_tokens: { idToken: `token-${uid}`, refreshToken: `refresh-${uid}`, expiresAt: epoch + 3600000, version: 3 },
});

const signIn = (w, uid) => w.call("bgMutateFirebaseAuth", {
  operation: "replace_session",
  user: auth(uid).firebase_user,
  tokens: auth(uid).firebase_tokens,
});

const signOut = (w) => w.call("bgMutateFirebaseAuth", { operation: "clear_session" });

const entry = (title) => ({ title, episodes: [{ number: 1, watchedAt: "2026-10-01T10:00:00Z" }] });

function signedInAs(uid, extra = {}) {
  return {
    ...auth(uid),
    legacySyncMigrationV1Complete: true,
    libraryOwner: `uid:${uid}`,
    animeData: { [`show_${uid}`]: entry(`Show of ${uid}`) },
    videoProgress: { [`show_${uid}__ep-1`]: { currentTime: 300, duration: 1440 } },
    deletedAnime: {},
    goalSettings: { weeklyEpisodes: 10 },
    copyGuardEnabled: false,
    smartNotificationsEnabled: true,
    autoSkipFillers: true,
    skiptimeHelperEnabled: true,
    auto4kServerEnabled: false,
    adGuardEnabled: false,
    autoResumeEnabled: true,
    playbackSettingsUpdatedAt: "2026-10-04T12:00:00.000Z",
    userPreferences: { sort: "rating", category: "airing", compactStatus: "watching", compactStatusOpen: true },
    speedControlPreferences: { enabled: true, normalRate: 1.75, boostRate: 3, defaultVolume: 0.85, defaultMuted: false },
    cachedStats: { totalAnime: 1 },
    ...extra,
  };
}

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test("Account A, Account B and guest keep separate preferences and speed control without leaking or losing data", async () => {
  const w = cloudWorker(signedInAs("account-a"));
  await flush();

  // 1. Sign out to guest
  await signOut(w);
  assert.equal(w.store.libraryOwner, "guest");
  // Active settings should not leak Account A's configuration
  assert.equal(w.store.speedControlPreferences, undefined, "Guest does not inherit A's speed control");
  assert.equal(w.store.userPreferences, undefined, "Guest does not inherit A's user preferences");
  assert.equal(w.store.copyGuardEnabled, undefined, "Guest does not inherit A's copy guard");
  assert.equal(w.store.autoResumeEnabled, undefined, "Guest does not inherit A's auto resume");
  assert.equal(w.store.adGuardEnabled, undefined, "Guest does not inherit A's ad guard");

  // Account A's state is safely parked in its slot
  const parkedA = w.store["librarySlot:uid:account-a"]?.data;
  assert.ok(parkedA, "Account A's slot exists");
  assert.equal(parkedA.copyGuardEnabled, false);
  assert.equal(parkedA.smartNotificationsEnabled, true);
  assert.equal(parkedA.autoSkipFillers, true);
  assert.equal(parkedA.skiptimeHelperEnabled, true);
  assert.equal(parkedA.auto4kServerEnabled, false);
  assert.equal(parkedA.adGuardEnabled, false);
  assert.equal(parkedA.autoResumeEnabled, true);
  assert.deepEqual(parkedA.speedControlPreferences, { enabled: true, normalRate: 1.75, boostRate: 3, defaultVolume: 0.85, defaultMuted: false });
  assert.deepEqual(parkedA.userPreferences, { sort: "rating", category: "airing", compactStatus: "watching", compactStatusOpen: true });

  // 2. Guest configures its own local settings
  w.store.speedControlPreferences = { enabled: false, normalRate: 1.0, boostRate: 4, defaultVolume: null, defaultMuted: null };
  w.store.autoResumeEnabled = false;

  // 3. Sign in to Account B
  await signIn(w, "account-b");
  assert.equal(w.store.libraryOwner, "uid:account-b");
  // Account B does not have any parked settings yet, so it starts fresh
  assert.equal(w.store.speedControlPreferences, undefined, "B starts fresh without Guest's speed control");
  assert.equal(w.store.autoResumeEnabled, undefined, "B starts fresh without Guest's auto resume");

  // Account B sets completely distinct preferences
  w.store.copyGuardEnabled = true;
  w.store.smartNotificationsEnabled = false;
  w.store.autoSkipFillers = false;
  w.store.skiptimeHelperEnabled = false;
  w.store.auto4kServerEnabled = true;
  w.store.adGuardEnabled = true;
  w.store.autoResumeEnabled = false;
  w.store.speedControlPreferences = { enabled: true, normalRate: 1.25, boostRate: 8, defaultVolume: 0.4, defaultMuted: true };
  w.store.userPreferences = { sort: "episodes", category: "completed", compactStatus: "airing", compactStatusOpen: false };

  // 4. Sign out from B
  await signOut(w);
  assert.equal(w.store.libraryOwner, "guest");
  // Guest settings are restored from guest slot
  assert.deepEqual(w.store.speedControlPreferences, { enabled: false, normalRate: 1.0, boostRate: 4, defaultVolume: null, defaultMuted: null }, "Guest restored");
  assert.equal(w.store.autoResumeEnabled, false, "Guest autoResume restored");

  // Account B's state is safely parked in its slot
  const parkedB = w.store["librarySlot:uid:account-b"]?.data;
  assert.ok(parkedB, "Account B's slot exists");
  assert.equal(parkedB.copyGuardEnabled, true);
  assert.equal(parkedB.autoSkipFillers, false);
  assert.equal(parkedB.auto4kServerEnabled, true);
  assert.deepEqual(parkedB.speedControlPreferences, { enabled: true, normalRate: 1.25, boostRate: 8, defaultVolume: 0.4, defaultMuted: true });
  assert.deepEqual(parkedB.userPreferences, { sort: "episodes", category: "completed", compactStatus: "airing", compactStatusOpen: false });

  // 5. Sign back into Account A
  await signIn(w, "account-a");
  assert.equal(w.store.libraryOwner, "uid:account-a");
  // ALL 7 Preferences, Speed Control, and User Preferences restored for A
  assert.equal(w.store.copyGuardEnabled, false);
  assert.equal(w.store.smartNotificationsEnabled, true);
  assert.equal(w.store.autoSkipFillers, true);
  assert.equal(w.store.skiptimeHelperEnabled, true);
  assert.equal(w.store.auto4kServerEnabled, false);
  assert.equal(w.store.adGuardEnabled, false);
  assert.equal(w.store.autoResumeEnabled, true);
  assert.deepEqual(w.store.speedControlPreferences, { enabled: true, normalRate: 1.75, boostRate: 3, defaultVolume: 0.85, defaultMuted: false });
  assert.deepEqual(w.store.userPreferences, { sort: "rating", category: "airing", compactStatus: "watching", compactStatusOpen: true });
  assert.equal(w.store["librarySlot:uid:account-a"], undefined, "Active library is not parked");

  // 6. Sign back into Account B
  await signIn(w, "account-b");
  assert.equal(w.store.libraryOwner, "uid:account-b");
  assert.equal(w.store.copyGuardEnabled, true);
  assert.equal(w.store.autoSkipFillers, false);
  assert.equal(w.store.auto4kServerEnabled, true);
  assert.deepEqual(w.store.speedControlPreferences, { enabled: true, normalRate: 1.25, boostRate: 8, defaultVolume: 0.4, defaultMuted: true });
  assert.deepEqual(w.store.userPreferences, { sort: "episodes", category: "completed", compactStatus: "airing", compactStatusOpen: false });
});

test("Speed Control update in background worker queues playback settings sync to Firestore with speedControl payload", async () => {
  const w = cloudWorker(signedInAs("account-a"));
  await flush();

  // Update speed preferences through worker message handler
  const res = await w.request("UPDATE_SPEED_CONTROL_PREFERENCES", {
    patch: { normalRate: 1.5, boostRate: 4, defaultVolume: 0.7, defaultMuted: false },
    mobile: false,
  });
  assert.equal(res.success, true);
  assert.equal(w.store.speedControlPreferences.normalRate, 1.5);
  assert.equal(w.store.speedControlPreferences.boostRate, 4);
  assert.equal(w.store.speedControlPreferences.defaultVolume, 0.7);
  await flush();

  // Verify that a sidecar PATCH request was sent to Firestore
  const sidecarPatch = w.requests.find(
    (req) => req.method === "PATCH" && req.url.includes("updateMask.fieldPaths=playbackSettings")
  );
  assert.ok(sidecarPatch, "Firestore PATCH for playbackSettings was sent");
  const parsedBody = JSON.parse(sidecarPatch.body);
  const fields = w.call("fromFSDoc", parsedBody);
  assert.ok(fields.playbackSettings, "playbackSettings field is present in PATCH");
  assert.equal(fields.playbackSettings.speedControl.normalRate, 1.5);
  assert.equal(fields.playbackSettings.speedControl.boostRate, 4);
  assert.equal(fields.playbackSettings.speedControl.defaultVolume, 0.7);
  assert.equal(fields.playbackSettings.speedControl.defaultMuted, false);
});

test("Clean reinstall or new device restores all 7 preferences and speedControl from cloud document", async () => {
  const cloud = {
    playbackSettings: {
      copyGuard: false,
      smartNotif: true,
      autoSkipFiller: true,
      skiptimeHelper: true,
      auto4kServer: false,
      adGuard: false,
      autoResume: true,
      userPreferences: { sort: "name", category: "movies", compactStatus: "airing", compactStatusOpen: true },
      speedControl: { enabled: true, normalRate: 1.75, boostRate: 3, defaultVolume: 0.65, defaultMuted: false },
      updatedAt: "2026-10-05T14:00:00.000Z",
    },
  };

  // Fresh empty storage
  const w = cloudWorker({ ...auth("account-new"), legacySyncMigrationV1Complete: true, libraryOwner: "uid:account-new" }, cloud);
  await flush();

  // Apply cloud playback settings
  const changed = await w.call("applyCloudPlaybackSettings", cloud.playbackSettings);
  assert.equal(changed, true, "Settings applied on fresh device");

  // Check storage values
  assert.equal(w.store.copyGuardEnabled, false);
  assert.equal(w.store.smartNotificationsEnabled, true);
  assert.equal(w.store.autoSkipFillers, true);
  assert.equal(w.store.skiptimeHelperEnabled, true);
  assert.equal(w.store.auto4kServerEnabled, false);
  assert.equal(w.store.adGuardEnabled, false);
  assert.equal(w.store.autoResumeEnabled, true);
  assert.deepEqual(w.store.userPreferences, { sort: "name", category: "movies", compactStatus: "airing", compactStatusOpen: true });
  assert.deepEqual(w.store.speedControlPreferences, { enabled: true, normalRate: 1.75, boostRate: 3, defaultVolume: 0.65, defaultMuted: false });
  assert.equal(w.store.playbackSettingsUpdatedAt, cloud.playbackSettings.updatedAt);

  // Check buildStoredPlaybackSettings equality
  const built = await w.call("buildStoredPlaybackSettings");
  assert.equal(w.call("playbackSettingsEqual", cloud.playbackSettings, built), true, "Payload matches cloud copy exactly");
});

test("Mobile device sync preserves Desktop 4K, Skiptime, Copy Guard and Desktop boost/volume without downgrade", async () => {
  const desktopCloudPlayback = {
    copyGuard: true,
    smartNotif: true,
    autoSkipFiller: true,
    skiptimeHelper: true,
    auto4kServer: true,
    adGuard: true,
    autoResume: false,
    speedControl: { enabled: true, normalRate: 1.5, boostRate: 4, defaultVolume: 0.8, defaultMuted: false },
    updatedAt: "2026-10-05T10:00:00.000Z",
  };

  const w = cloudWorker(signedInAs("account-m"));
  await flush();

  // Mock mobile device
  w.context.navigator = { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 };

  // Mobile applies cloud settings
  await w.call("applyCloudPlaybackSettings", desktopCloudPlayback);

  // On mobile device locally: heavy features are disabled
  assert.equal(w.store.copyGuardEnabled, false, "Copy guard disabled locally on mobile");
  assert.equal(w.store.skiptimeHelperEnabled, false, "Skiptime helper disabled locally on mobile");
  assert.equal(w.store.auto4kServerEnabled, false, "4K auto-pick disabled locally on mobile");
  // Mobile normalized boost to 2 and dropped volume
  assert.equal(w.store.speedControlPreferences.boostRate, 2, "Mobile normalized boost to 2");
  assert.equal(w.store.speedControlPreferences.defaultVolume, null, "Mobile audio null");

  // Mobile changes a setting (e.g. autoResume) and builds stored payload to push back
  w.store.autoResumeEnabled = true;
  const mobilePushPayload = await w.call("buildStoredPlaybackSettings");

  // The push payload MUST preserve Desktop settings!
  assert.equal(mobilePushPayload.copyGuard, true, "Preserved desktop copyGuard in cloud payload");
  assert.equal(mobilePushPayload.skiptimeHelper, true, "Preserved desktop skiptimeHelper in cloud payload");
  assert.equal(mobilePushPayload.auto4kServer, true, "Preserved desktop auto4kServer in cloud payload");
  assert.equal(mobilePushPayload.speedControl.boostRate, 4, "Preserved desktop boostRate 4 in cloud payload");
  assert.equal(mobilePushPayload.speedControl.defaultVolume, 0.8, "Preserved desktop defaultVolume in cloud payload");
  assert.equal(mobilePushPayload.speedControl.defaultMuted, false, "Preserved desktop defaultMuted in cloud payload");
  // Mobile's own toggle changed
  assert.equal(mobilePushPayload.autoResume, true);
});

test("Older cloud payload does not overwrite newer local preferences or speed control", async () => {
  const local = signedInAs("account-a", {
    copyGuardEnabled: false,
    speedControlPreferences: { enabled: true, normalRate: 2.0, boostRate: 4, defaultVolume: 0.9, defaultMuted: false },
    playbackSettingsUpdatedAt: "2026-10-06T12:00:00.000Z",
  });
  const w = cloudWorker(local);
  await flush();

  const olderCloud = {
    copyGuard: true,
    speedControl: { enabled: true, normalRate: 1.0, boostRate: 2, defaultVolume: null, defaultMuted: null },
    updatedAt: "2026-10-05T12:00:00.000Z", // Older than local
  };

  const changed = await w.call("applyCloudPlaybackSettings", olderCloud);
  assert.equal(changed, false, "Older cloud copy was not applied");
  assert.equal(w.store.copyGuardEnabled, false, "Local copyGuard kept");
  assert.equal(w.store.speedControlPreferences.normalRate, 2.0, "Local normalRate kept");
});

test("Interrupted account switch recovers without losing parked preferences or speed control", async () => {
  const parkedA = {
    schema: 1,
    owner: "uid:account-a",
    savedAt: Date.now(),
    data: {
      animeData: { privateA: entry("Private A") },
      videoProgress: {},
      copyGuardEnabled: false,
      autoResumeEnabled: true,
      speedControlPreferences: { enabled: true, normalRate: 1.75, boostRate: 3, defaultVolume: 0.5, defaultMuted: false },
      userPreferences: { sort: "rating" },
    },
  };

  // Died after step 2 (active keys half removed)
  const w = cloudWorker({
    legacySyncMigrationV1Complete: true,
    libraryOwner: "uid:account-a",
    librarySwapJournal: { from: "uid:account-a", to: "guest" },
    "librarySlot:uid:account-a": parkedA,
    "librarySlot:guest": {
      schema: 1,
      owner: "guest",
      savedAt: Date.now(),
      data: {
        animeData: {},
        speedControlPreferences: { enabled: false, normalRate: 1.0, boostRate: 2, defaultVolume: null, defaultMuted: null },
      },
    },
  });
  await flush();

  // Recovery executes on boot/ensureBgLibraryOwner
  await w.call("ensureBgLibraryOwner");
  assert.equal(w.store.libraryOwner, "guest");
  assert.equal(w.store.speedControlPreferences.enabled, false);
  assert.equal(w.store.speedControlPreferences.normalRate, 1.0);
  assert.equal(w.store.librarySwapJournal, undefined, "Journal cleared after recovery");

  // A's parked slot is intact
  assert.deepEqual(w.store["librarySlot:uid:account-a"].data.speedControlPreferences, {
    enabled: true, normalRate: 1.75, boostRate: 3, defaultVolume: 0.5, defaultMuted: false,
  });

  // When A signs back in, recovery ensures A gets full preferences back
  await signIn(w, "account-a");
  assert.equal(w.store.libraryOwner, "uid:account-a");
  assert.equal(w.store.copyGuardEnabled, false);
  assert.equal(w.store.autoResumeEnabled, true);
  assert.deepEqual(w.store.speedControlPreferences, {
    enabled: true, normalRate: 1.75, boostRate: 3, defaultVolume: 0.5, defaultMuted: false,
  });
  assert.deepEqual(w.store.userPreferences, { sort: "rating" });
});

test("Speed Control partial patch operations (rate change, audio reset, toggle off) preserve untouched settings", async () => {
  const w = cloudWorker(signedInAs("account-a"));
  await flush();

  // 1. Initial speedControl
  assert.deepEqual(w.store.speedControlPreferences, {
    enabled: true, normalRate: 1.75, boostRate: 3, defaultVolume: 0.85, defaultMuted: false,
  });

  // 2. Patch only boostRate -> normalRate and audio stay intact
  await w.request("UPDATE_SPEED_CONTROL_PREFERENCES", { patch: { boostRate: 4 }, mobile: false });
  assert.deepEqual(w.store.speedControlPreferences, {
    enabled: true, normalRate: 1.75, boostRate: 4, defaultVolume: 0.85, defaultMuted: false,
  });

  // 3. Audio reset -> defaultVolume & defaultMuted become null, rates stay intact
  await w.request("UPDATE_SPEED_CONTROL_PREFERENCES", { patch: { defaultVolume: null, defaultMuted: null }, mobile: false });
  assert.deepEqual(w.store.speedControlPreferences, {
    enabled: true, normalRate: 1.75, boostRate: 4, defaultVolume: null, defaultMuted: null,
  });

  // 4. Reset normalRate to player default (null) -> boostRate stays intact
  await w.request("UPDATE_SPEED_CONTROL_PREFERENCES", { patch: { normalRate: null }, mobile: false });
  assert.deepEqual(w.store.speedControlPreferences, {
    enabled: true, normalRate: null, boostRate: 4, defaultVolume: null, defaultMuted: null,
  });

  // 5. Toggle speed control off -> enabled is false, but boostRate 4 is remembered
  await w.request("UPDATE_SPEED_CONTROL_PREFERENCES", { patch: { enabled: false }, mobile: false });
  assert.equal(w.store.speedControlPreferences.enabled, false);
  assert.equal(w.store.speedControlPreferences.boostRate, 4);
});

test("First full sync of an account pushes playbackSettings (preferences + speedControl) to Firestore", async () => {
  const local = signedInAs("account-new-sync", {
    copyGuardEnabled: false,
    smartNotificationsEnabled: true,
    autoSkipFillers: true,
    skiptimeHelperEnabled: true,
    auto4kServerEnabled: false,
    adGuardEnabled: true,
    autoResumeEnabled: true,
    speedControlPreferences: { enabled: true, normalRate: 1.25, boostRate: 4, defaultVolume: 0.9, defaultMuted: false },
    userPreferences: { sort: "title", category: "all" },
  });
  // Empty remote cloud doc initially
  const w = cloudWorker(local, {}, { remoteMissing: true });
  await flush();

  // Perform full sync
  const outcome = await w.call("syncToFirebase", "initial-full-sync");
  assert.equal(outcome.success, true);

  // Verify that the created document has playbackSettings
  assert.ok(w.remote.playbackSettings, "remote.playbackSettings was created");
  assert.equal(w.remote.playbackSettings.copyGuard, false);
  assert.equal(w.remote.playbackSettings.adGuard, true);
  assert.equal(w.remote.playbackSettings.autoResume, true);
  assert.equal(w.remote.playbackSettings.speedControl.normalRate, 1.25);
  assert.equal(w.remote.playbackSettings.speedControl.boostRate, 4);
  assert.equal(w.remote.playbackSettings.speedControl.defaultVolume, 0.9);
  assert.equal(w.remote.playbackSettings.userPreferences.sort, "title");
});

test("Concurrent updates to preferences and speed control merge without race conditions", async () => {
  const w = cloudWorker(signedInAs("account-concurrent"));
  await flush();

  // Simulate updating a preference toggle and speed control in parallel
  await Promise.all([
    w.call("runBgLibraryTransaction", ["autoSkipFillers", "playbackSettingsUpdatedAt"], async () => ({
      data: { autoSkipFillers: false, playbackSettingsUpdatedAt: "2026-10-04T12:05:00.000Z" },
      result: true,
    })),
    w.request("UPDATE_SPEED_CONTROL_PREFERENCES", { patch: { normalRate: 1.5 }, mobile: false }),
  ]);
  await flush();

  assert.equal(w.store.autoSkipFillers, false, "Preference update landed");
  assert.equal(w.store.speedControlPreferences.normalRate, 1.5, "Speed control update landed");

  const built = await w.call("buildStoredPlaybackSettings");
  assert.equal(built.autoSkipFiller, false);
  assert.equal(built.speedControl.normalRate, 1.5);
});

(async () => {
  const hold = setInterval(() => {}, 1000);
  const watchdog = setTimeout(() => { console.error("FAIL preferences sync test timed out"); process.exit(1); }, 30000);
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
