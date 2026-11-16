// R01/R02: cloud work belongs to the session that started it. A response that arrives after sign-out or an
// account switch is dropped; a sync that captured a token stops before writing and never reports "synced".
const assert = require("node:assert/strict");
const { cloudWorker } = require("./lib/cloud-worker-harness.js");
const flush = async () => { for (let i = 0; i < 25; i++) await new Promise(setImmediate); };
const epoch = Date.parse("2026-10-04T12:00:00Z");
const auth = (uid) => ({
  firebase_user: { uid, email: `${uid}@example.invalid` },
  firebase_tokens: { idToken: `token-${uid}`, refreshToken: `refresh-${uid}`, expiresAt: epoch + 3600000, version: 3 },
});
const base = (uid) => ({ ...auth(uid), legacySyncMigrationV1Complete: true, animeData: {}, videoProgress: {}, deletedAnime: {} });
const sample = { currentTime: 120, duration: 1440, savedAt: "2026-10-04T12:00:00Z", percentage: 8 };
const patches = (w) => w.requests.filter((request) => request.method === "PATCH");
const switchTo = (w, uid) => w.call("bgMutateFirebaseAuth", {
  operation: "replace_session", user: auth(uid).firebase_user, tokens: auth(uid).firebase_tokens,
});
const signOut = (w) => w.call("bgMutateFirebaseAuth", { operation: "clear_session" });

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test("a late poll response for account A is not applied after switching to account B", async () => {
  let w, switched = false;
  w = cloudWorker(base("account-a"), {
    animeData: { privateA: { title: "Private A", episodes: [] } }, videoProgress: {}, lastUpdated: "2026-10-04T11:59:00Z",
  }, { beforeRequest: async (_url, options) => {
    if (!switched && !options.method) { switched = true; await switchTo(w, "account-b"); }
  } });
  await flush();
  await w.call("pollCloudData", "test", { force: true }); await flush();
  assert.equal(w.store.firebase_user.uid, "account-b");
  assert.equal(w.store.animeData.privateA, undefined, "account A's library must never land under account B");
  assert.notEqual(w.store._bgCloudDocCachePersisted?.uid, "account-a", "no cached A document under B");
  assert.equal(patches(w).length, 0);
});

test("a full sync whose read finishes after sign-out sends no PATCH and never reports synced", async () => {
  let w, cleared = false;
  const initial = base("account-a"); initial.animeData.example = { title: "Example", episodes: [] };
  w = cloudWorker(initial, {}, { beforeRequest: async (_url, options) => {
    if (!cleared && !options.method) { cleared = true; await signOut(w); }
  } });
  await flush();
  const outcome = await w.call("syncToFirebase", "test"); await flush();
  assert.equal(w.store.firebase_user, undefined);
  assert.equal(patches(w).length, 0, "no write may leave after the session ended");
  assert.notEqual(w.store["syncState.cloudStatus"]?.state, "synced");
  assert.equal(outcome.success, false);
  assert.equal(outcome.error, "session_changed");
});

test("a progress sync interrupted by sign-out before its PATCH sends nothing", async () => {
  let w, cleared = false;
  const initial = base("account-a");
  initial.animeData.example = { title: "Example", episodes: [] };
  initial.videoProgress["example__episode-1"] = sample;
  w = cloudWorker(initial, { animeData: initial.animeData, videoProgress: {}, lastUpdated: "2026-10-04T11:59:00Z" }, {
    beforeRequest: async (_url, options) => { if (!cleared && !options.method) { cleared = true; await signOut(w); } },
  });
  await flush();
  const outcome = await w.call("syncProgressOnly", "test"); await flush();
  assert.equal(patches(w).length, 0);
  assert.equal(outcome.success, false);
  assert.notEqual(w.store["syncState.cloudStatus"]?.state, "synced");
});

test("a PATCH response that arrives after an account switch is not acknowledged or cached for the new account", async () => {
  let w, switched = false;
  const initial = base("account-a");
  initial.animeData.example = { title: "Example", episodes: [] };
  initial.videoProgress["example__episode-1"] = sample;
  w = cloudWorker(initial, { animeData: initial.animeData, videoProgress: {}, lastUpdated: "2026-10-04T11:59:00Z" }, {
    beforeRequest: async (_url, options) => { if (!switched && options.method === "PATCH") { switched = true; await switchTo(w, "account-b"); } },
  });
  await flush();
  const outcome = await w.call("syncProgressOnly", "test"); await flush();
  assert.equal(outcome.success, false, "the stale write must not count as a success");
  assert.notEqual(w.store["syncState.cloudStatus"]?.state, "synced");
  assert.notEqual(w.store._bgCloudDocCachePersisted?.uid, "account-a");
});

test("signing in again to the same account keeps the session epoch; another account bumps it", async () => {
  const w = cloudWorker(base("account-a")); await flush();
  await w.call("AnimeTrackerSessionContext.hydrate");
  const start = w.call("AnimeTrackerSessionContext.current");
  await switchTo(w, "account-a");
  assert.equal(w.call("AnimeTrackerSessionContext.current"), start, "same account: same epoch");
  await switchTo(w, "account-b");
  assert.equal(w.call("AnimeTrackerSessionContext.current"), start + 1);
  await signOut(w);
  assert.equal(w.call("AnimeTrackerSessionContext.current"), start + 2);
  assert.equal(w.store.authSessionEpoch, start + 2, "the epoch is durable across worker restarts");
});

test("a poll for the current account still applies normally", async () => {
  const w = cloudWorker(base("account-b"), {
    animeData: { mine: { title: "Mine", episodes: [] } }, videoProgress: {}, lastUpdated: "2026-10-04T11:59:00Z",
  });
  await flush();
  await w.call("pollCloudData", "test", { force: true });
  await new Promise((resolve) => setTimeout(resolve, 700)); await flush();
  assert.ok(w.store.animeData.mine, "an undisturbed poll still merges the account's own library");
});

(async () => {
  const hold = setInterval(() => {}, 1000);
  const watchdog = setTimeout(() => { console.error("FAIL session fence test timed out"); process.exit(1); }, 20000);
  try {
    let failures = 0;
    for (const { name, fn } of cases) {
      try { await fn(); console.log("PASS " + name); }
      catch (error) { failures++; console.error("FAIL " + name + ": " + error.stack); }
    }
    process.exitCode = failures ? 1 : 0;
  } finally { clearInterval(hold); clearTimeout(watchdog); }
})();
