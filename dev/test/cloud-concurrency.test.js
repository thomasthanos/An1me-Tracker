// R03: a sync writes only onto the cloud document version it merged from. When another device writes in
// between, the write is refused, re-merged and retried, so neither device's change is lost.
const assert = require("node:assert/strict");
const { cloudWorker } = require("./lib/cloud-worker-harness.js");
const flush = async () => { for (let i = 0; i < 25; i++) await new Promise(setImmediate); };
const epoch = Date.parse("2026-10-04T12:00:00Z");
const auth = {
  firebase_user: { uid: "account-a", email: "a@example.invalid" },
  firebase_tokens: { idToken: "token-a", refreshToken: "refresh-a", expiresAt: epoch + 3600000, version: 3 },
};
const sample = (currentTime, savedAt) => ({ currentTime, duration: 1440, savedAt, percentage: Math.round((currentTime / 1440) * 100) });
const base = () => ({
  ...auth, legacySyncMigrationV1Complete: true, libraryOwner: "uid:account-a",
  animeData: { example: { title: "Example", episodes: [] } }, videoProgress: {}, deletedAnime: {},
});
const patches = (w) => w.requests.filter((request) => request.method === "PATCH");

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test("another device's Resume written between our read and our PATCH survives", async () => {
  const initial = base();
  initial.videoProgress["example__episode-1"] = sample(120, "2026-10-04T12:00:00Z");
  let injected = false, w;
  w = cloudWorker(initial, { animeData: initial.animeData, videoProgress: {}, lastUpdated: "2026-10-04T11:59:00Z" }, {
    beforeRequest: async (_url, options) => {
      if (options.method === "PATCH" && !injected) {
        injected = true;
        w.remoteWrite((remote) => { remote.videoProgress["example__episode-2"] = sample(240, "2026-10-04T12:00:01Z"); remote.lastUpdated = "2026-10-04T12:00:01Z"; });
      }
    },
  });
  await flush();
  const result = await w.call("syncProgressOnly", "test"); await flush();
  assert.equal(result.success, true);
  assert.deepEqual(Object.keys(w.remote.videoProgress).sort(), ["example__episode-1", "example__episode-2"]);
  assert.ok(w.store.videoProgress["example__episode-2"], "the other device's Resume is merged locally too");
  assert.equal(patches(w).length, 2, "one refused write, one write on the new version");
  assert.ok(patches(w).every((request) => request.url.includes("currentDocument.")), "every PATCH is conditional");
});

test("a newer position for the same episode from another device is not overwritten by an older local one", async () => {
  const initial = base();
  initial.videoProgress["example__episode-1"] = sample(120, "2026-10-04T12:00:00Z");
  let injected = false, w;
  w = cloudWorker(initial, { animeData: initial.animeData, videoProgress: {}, lastUpdated: "2026-10-04T11:59:00Z" }, {
    beforeRequest: async (_url, options) => {
      if (options.method === "PATCH" && !injected) {
        injected = true;
        w.remoteWrite((remote) => { remote.videoProgress["example__episode-1"] = sample(600, "2026-10-04T12:05:00Z"); });
      }
    },
  });
  await flush();
  await w.call("syncProgressOnly", "test"); await flush();
  assert.equal(w.remote.videoProgress["example__episode-1"].currentTime, 600);
});

test("a full sync keeps a title another device added while it was writing", async () => {
  const initial = base();
  initial.animeData.localNew = { title: "Local new", episodes: [{ number: 1, watchedAt: "2026-10-04T11:58:00Z" }] };
  let injected = false, w;
  w = cloudWorker(initial, { animeData: { example: initial.animeData.example }, videoProgress: {}, lastUpdated: "2026-10-04T11:59:00Z" }, {
    beforeRequest: async (_url, options) => {
      if (options.method === "PATCH" && !injected) {
        injected = true;
        w.remoteWrite((remote) => {
          remote.animeData = { ...remote.animeData, otherDevice: { title: "Other device", episodes: [{ number: 3, watchedAt: "2026-10-04T12:00:00Z" }] } };
          remote.lastUpdated = "2026-10-04T12:00:02Z";
        });
      }
    },
  });
  await flush();
  const result = await w.call("syncToFirebase", "test"); await flush();
  assert.equal(result.success, true);
  assert.ok(w.remote.animeData.localNew, "our change landed");
  assert.ok(w.remote.animeData.otherDevice, "the other device's change was not erased");
  assert.ok(w.store.animeData.otherDevice);
});

test("creating the cloud document loses no data when another device creates it first", async () => {
  const initial = base();
  initial.animeData.mine = { title: "Mine", episodes: [] };
  let injected = false, w;
  w = cloudWorker(initial, {}, {
    remoteMissing: true,
    beforeRequest: async (_url, options) => {
      if (options.method === "PATCH" && !injected) {
        injected = true;
        w.remoteWrite((remote) => { remote.animeData = { theirs: { title: "Theirs", episodes: [] } }; remote.videoProgress = {}; remote.lastUpdated = "2026-10-04T12:00:03Z"; });
      }
    },
  });
  await flush();
  const result = await w.call("syncToFirebase", "test"); await flush();
  assert.equal(result.success, true);
  assert.ok(patches(w)[0].url.includes("currentDocument.exists=false"));
  assert.ok(w.remote.animeData.mine);
  assert.ok(w.remote.animeData.theirs);
});

test("a document that keeps changing is never overwritten: the change stays pending after five attempts", async () => {
  const initial = base();
  initial.videoProgress["example__episode-1"] = sample(120, "2026-10-04T12:00:00Z");
  let n = 0, w;
  w = cloudWorker(initial, { animeData: initial.animeData, videoProgress: {}, lastUpdated: "2026-10-04T11:59:00Z" }, {
    beforeRequest: async (_url, options) => {
      if (options.method === "PATCH") {
        n += 1;
        w.remoteWrite((remote) => { remote.videoProgress[`other__episode-${n}`] = sample(60 * n, "2026-10-04T12:00:00Z"); });
      }
    },
  });
  await flush();
  const result = await w.call("syncProgressOnly", "test"); await flush();
  assert.equal(result.success, false);
  assert.equal(result.error, "cloud_conflict");
  assert.equal(patches(w).length, 5);
  assert.equal(w.remote.videoProgress["example__episode-1"], undefined, "no write landed on a version it did not read");
  assert.equal(Object.keys(w.remote.videoProgress).length, 5, "every write of the other device is intact");
  assert.ok(w.store["syncState.pendingProgressFlush"], "the local change stays pending for the retry alarm");
});

test("a write whose response was lost is not applied twice", async () => {
  const initial = base();
  initial.videoProgress["example__episode-1"] = sample(120, "2026-10-04T12:00:00Z");
  const w = cloudWorker(initial, { animeData: initial.animeData, videoProgress: {}, lastUpdated: "2026-10-04T11:59:00Z" });
  await flush();
  w.loseNextPatchResponse();
  const first = await w.call("syncProgressOnly", "test"); await flush();
  assert.equal(first.success, false, "the client cannot know the write landed");
  assert.ok(w.remote.videoProgress["example__episode-1"], "but it did");
  const versionAfterLostWrite = w.remoteVersion();
  const second = await w.call("syncProgressOnly", "test:retry"); await flush();
  assert.equal(second.success, true);
  assert.equal(second.wrote, false, "the retry sees its own write already in the cloud and writes nothing");
  assert.equal(w.remoteVersion(), versionAfterLostWrite);
});

(async () => {
  const hold = setInterval(() => {}, 1000);
  const watchdog = setTimeout(() => { console.error("FAIL cloud concurrency test timed out"); process.exit(1); }, 60000);
  try {
    let failures = 0;
    for (const { name, fn } of cases) {
      try { await fn(); console.log("PASS " + name); }
      catch (error) { failures++; console.error("FAIL " + name + ": " + error.stack); }
    }
    process.exitCode = failures ? 1 : 0;
  } finally { clearInterval(hold); clearTimeout(watchdog); }
})();
