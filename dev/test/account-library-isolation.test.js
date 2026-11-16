// One library per account plus a signed-out (guest) library. Account A never shows up for B or the guest,
// a half-finished switch recovers without loss, and installs that predate the split are attributed safely.
const assert = require("node:assert/strict");
const { cloudWorker } = require("./lib/cloud-worker-harness.js");
const flush = async () => { for (let i = 0; i < 25; i++) await new Promise(setImmediate); };
const epoch = Date.parse("2026-10-04T12:00:00Z");
const auth = (uid) => ({
  firebase_user: { uid, email: `${uid}@example.invalid` },
  firebase_tokens: { idToken: `token-${uid}`, refreshToken: `refresh-${uid}`, expiresAt: epoch + 3600000, version: 3 },
});
const entry = (title) => ({ title, episodes: [{ number: 1, watchedAt: "2026-10-01T10:00:00Z" }] });
const signIn = (w, uid) => w.call("bgMutateFirebaseAuth", { operation: "replace_session", ...{ user: auth(uid).firebase_user, tokens: auth(uid).firebase_tokens } });
const signOut = (w) => w.call("bgMutateFirebaseAuth", { operation: "clear_session" });
const addAnime = (w, slug, title) => w.call("runBgLibraryTransaction", ["animeData"], (latest) => ({
  data: { animeData: { ...(latest.animeData || {}), [slug]: entry(title) } },
}));
const slugs = (w) => Object.keys(w.store.animeData || {}).sort();

function signedInAs(uid, extra = {}) {
  return {
    ...auth(uid), legacySyncMigrationV1Complete: true, libraryOwner: `uid:${uid}`,
    animeData: { privateA: entry("Private A") }, videoProgress: { "privateA__episode-2": { currentTime: 300, duration: 1440 } },
    deletedAnime: {}, goalSettings: { weeklyEpisodes: 9 }, copyGuardEnabled: false, cachedStats: { totalAnime: 1 },
    userPreferences: { sort: "title", category: "all" },
    speedControlPreferences: { enabled: true, normalRate: 1.25, boostRate: 4 },
    ...extra,
  };
}

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test("A → sign-out → guest edits → B → sign-out → A: every library sees only its own data", async () => {
  const w = cloudWorker(signedInAs("account-a")); await flush();

  await signOut(w);
  assert.equal(w.store.libraryOwner, "guest");
  assert.deepEqual(slugs(w), [], "the guest library starts empty");
  assert.deepEqual(w.store.videoProgress, {});
  assert.equal(w.store.goalSettings && Object.keys(w.store.goalSettings).length, 0, "no goals of A");
  assert.equal(w.store.cachedStats, undefined, "no stats of A painted for the guest");
  assert.equal(w.store.copyGuardEnabled, undefined, "A's settings stay with A");
  assert.equal(w.store.userPreferences, undefined, "A's user preferences stay with A");
  assert.equal(w.store.speedControlPreferences, undefined, "A's speed control stays with A");
  assert.ok(w.store["librarySlot:uid:account-a"].data.animeData.privateA, "A's library is parked for A");
  assert.deepEqual(w.store["librarySlot:uid:account-a"].data.speedControlPreferences, { enabled: true, normalRate: 1.25, boostRate: 4 });

  await addAnime(w, "guestOnly", "Guest only");
  await signIn(w, "account-b");
  assert.equal(w.store.libraryOwner, "uid:account-b");
  assert.equal(w.store.firebase_user.uid, "account-b");
  assert.deepEqual(slugs(w), [], "B sees neither A's nor the guest's library");

  await addAnime(w, "bOnly", "B only");
  await signOut(w);
  assert.deepEqual(slugs(w), ["guestOnly"], "the guest library comes back unchanged");

  await signIn(w, "account-a");
  assert.deepEqual(slugs(w), ["privateA"], "A gets exactly A's library back");
  assert.ok(w.store.videoProgress["privateA__episode-2"]);
  assert.equal(w.store.goalSettings.weeklyEpisodes, 9);
  assert.equal(w.store.copyGuardEnabled, false);
  assert.deepEqual(w.store.userPreferences, { sort: "title", category: "all" }, "A gets user preferences back");
  assert.deepEqual(w.store.speedControlPreferences, { enabled: true, normalRate: 1.25, boostRate: 4 }, "A gets speed control back");
  assert.equal(w.store["librarySlot:uid:account-a"], undefined, "the active library is not also parked");
  assert.ok(w.store["librarySlot:uid:account-b"].data.animeData.bOnly);
  assert.ok(w.store["librarySlot:guest"].data.animeData.guestOnly);
  assert.equal(w.store.librarySwapJournal, undefined);
});

test("no storage write ever pairs account B with account A's library", async () => {
  const w = cloudWorker(signedInAs("account-a")); await flush();
  const local = w.context.chrome.storage.local;
  const set = local.set, remove = local.remove;
  const violations = [];
  let observed = 0;
  const check = () => {
    observed += 1;
    if (w.store.firebase_user?.uid === "account-b" && w.store.animeData?.privateA) violations.push("B next to A's library");
    if (w.store.libraryOwner === "uid:account-b" && w.store.animeData?.privateA) violations.push("owner B with A's library");
  };
  local.set = (...args) => { const result = set(...args); check(); return result; };
  local.remove = (...args) => { const result = remove(...args); check(); return result; };
  await signIn(w, "account-b"); await flush();
  local.set = set; local.remove = remove;
  assert.ok(observed >= 3, `the switch's storage writes were observed (${observed})`);
  assert.deepEqual(violations, []);
  assert.deepEqual(slugs(w), []);
});

test("re-signing into the same account keeps its library in place", async () => {
  const w = cloudWorker(signedInAs("account-a")); await flush();
  await signIn(w, "account-a");
  assert.deepEqual(slugs(w), ["privateA"]);
  assert.equal(w.store["librarySlot:uid:account-a"], undefined);
});

test("a change computed on A's library is refused after the switch instead of landing in B's", async () => {
  const w = cloudWorker(signedInAs("account-a")); await flush();
  const snapshot = await w.request("LIBRARY_MUTATION_SNAPSHOT", { keys: ["animeData"] });
  assert.equal(snapshot.owner, "uid:account-a");
  await signIn(w, "account-b");
  const stale = await w.request("LIBRARY_MUTATION_COMMIT", {
    expectedRevision: snapshot.revision, expectedOwner: snapshot.owner,
    data: { animeData: { ...snapshot.data.animeData, lateSample: entry("Late") } },
  });
  assert.equal(stale.success, false);
  const fresh = await w.request("LIBRARY_MUTATION_SNAPSHOT", { keys: ["animeData"] });
  const retried = await w.request("LIBRARY_MUTATION_COMMIT", {
    expectedRevision: fresh.revision, expectedOwner: snapshot.owner,
    data: { animeData: { lateSample: entry("Late") } },
  });
  assert.equal(retried.success, false);
  assert.equal(retried.ownerChanged, true, "a retry against another owner's library is refused");
  assert.deepEqual(slugs(w), []);
});

test("a switch interrupted after parking, or after activating, finishes without losing either library", async () => {
  const parked = { schema: 1, owner: "uid:account-a", data: { animeData: { privateA: entry("Private A") }, videoProgress: {} } };
  // Died after step 2: the active keys of A were already half removed.
  const w1 = cloudWorker({
    legacySyncMigrationV1Complete: true, libraryOwner: "uid:account-a", librarySwapJournal: { from: "uid:account-a", to: "guest" },
    "librarySlot:uid:account-a": parked, "librarySlot:guest": { schema: 1, owner: "guest", data: { animeData: { guestOnly: entry("Guest") } } },
    videoProgress: { stale: {} },
  });
  await flush();
  await w1.call("ensureBgLibraryOwner");
  assert.equal(w1.store.libraryOwner, "guest");
  assert.deepEqual(slugs(w1), ["guestOnly"]);
  assert.deepEqual(w1.store.videoProgress, {});
  assert.deepEqual(w1.store["librarySlot:uid:account-a"], parked, "A's parked library is untouched");
  assert.equal(w1.store.librarySwapJournal, undefined);

  // Died after step 3: the target is active, only the cleanup is missing.
  const w2 = cloudWorker({
    legacySyncMigrationV1Complete: true, libraryOwner: "guest", librarySwapJournal: { from: "uid:account-a", to: "guest" },
    "librarySlot:uid:account-a": parked, "librarySlot:guest": { schema: 1, owner: "guest", data: { animeData: { old: entry("Old") } } },
    animeData: { guestOnly: entry("Guest") },
  });
  await flush();
  await w2.call("ensureBgLibraryOwner");
  assert.deepEqual(slugs(w2), ["guestOnly"], "the already active library is kept");
  assert.equal(w2.store["librarySlot:guest"], undefined);
  assert.equal(w2.store.librarySwapJournal, undefined);
});

test("first run: the signed-in account keeps the shared library when the last sync was its own", async () => {
  const initial = { ...signedInAs("account-u"), "syncState.cloudStatus": { state: "synced", uid: "account-u" } };
  delete initial.libraryOwner;
  const w = cloudWorker(initial); await flush();
  await w.call("ensureBgLibraryOwner");
  assert.equal(w.store.libraryOwner, "uid:account-u");
  assert.deepEqual(slugs(w), ["privateA"]);
});

test("first run: a library last synced by another account is parked for that account, not shown to this one", async () => {
  const initial = { ...signedInAs("account-u"), "syncState.cloudStatus": { state: "synced", uid: "account-x" } };
  delete initial.libraryOwner;
  const w = cloudWorker(initial); await flush();
  await w.call("ensureBgLibraryOwner");
  assert.equal(w.store.libraryOwner, "uid:account-u");
  assert.deepEqual(slugs(w), []);
  assert.ok(w.store["librarySlot:uid:account-x"].data.animeData.privateA, "recoverable by signing into that account");
  await signIn(w, "account-x");
  assert.deepEqual(slugs(w), ["privateA"]);
});

test("first run signed out: no sync evidence keeps the data as the guest library", async () => {
  const initial = { legacySyncMigrationV1Complete: true, animeData: { localOnly: entry("Local") } };
  const w = cloudWorker(initial); await flush();
  await w.call("ensureBgLibraryOwner");
  assert.equal(w.store.libraryOwner, "guest");
  assert.deepEqual(slugs(w), ["localOnly"]);
});

test("first run signed out after syncing as X: the library is parked for X", async () => {
  const initial = { legacySyncMigrationV1Complete: true, animeData: { xData: entry("X") }, "syncState.cloudStatus": { uid: "account-x", state: "synced" } };
  const w = cloudWorker(initial); await flush();
  await w.call("ensureBgLibraryOwner");
  assert.equal(w.store.libraryOwner, "guest");
  assert.deepEqual(slugs(w), []);
  assert.ok(w.store["librarySlot:uid:account-x"].data.animeData.xData);
});

(async () => {
  const hold = setInterval(() => {}, 1000);
  const watchdog = setTimeout(() => { console.error("FAIL account isolation test timed out"); process.exit(1); }, 30000);
  try {
    let failures = 0;
    for (const { name, fn } of cases) {
      try { await fn(); console.log("PASS " + name); }
      catch (error) { failures++; console.error("FAIL " + name + ": " + error.stack); }
    }
    process.exitCode = failures ? 1 : 0;
  } finally { clearInterval(hold); clearTimeout(watchdog); }
})();
