// R06: library maps change only through transactions computed from the latest snapshot. A whole map
// built from an earlier read can no longer replace a newer one; single settings values still write.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { cloudWorker } = require("./lib/cloud-worker-harness.js");
const flush = async () => { for (let i = 0; i < 25; i++) await new Promise(setImmediate); };
const root = path.resolve(__dirname, "../..");
const base = () => ({ legacySyncMigrationV1Complete: true, animeData: { original: { title: "Original", episodes: [] } } });

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test("a stale whole-map write cannot erase a change another producer committed in between", async () => {
  const w = cloudWorker(base()); await flush();
  const stale = await w.call("getLibraryMutationSnapshot", ["animeData"]);
  await w.call("runBgLibraryTransaction", ["animeData"], (latest) => ({
    data: { animeData: { ...latest.animeData, otherProducer: { title: "Added in between", episodes: [] } } },
  }));
  await assert.rejects(
    w.call("bgStorageSet", { animeData: { ...stale.data.animeData, staleProducer: { title: "Stale", episodes: [] } } }),
    /library_map_requires_transaction/,
  );
  assert.ok(w.store.animeData.otherProducer, "the change made in between survives");
  assert.equal(w.store.animeData.staleProducer, undefined);
});

test("the blind LIBRARY_MUTATION_WRITE message refuses library maps but still writes single settings", async () => {
  const w = cloudWorker(base()); await flush();
  const before = Number(w.store.libraryMutationRevision) || 0;
  const rejected = await w.request("LIBRARY_MUTATION_WRITE", { data: { videoProgress: {} } });
  assert.equal(rejected.success, false);
  assert.equal(rejected.error, "library_map_requires_transaction");
  const accepted = await w.request("LIBRARY_MUTATION_WRITE", { data: { copyGuardEnabled: false } });
  assert.equal(accepted.success, true);
  assert.equal(w.store.copyGuardEnabled, false);
  assert.equal(w.store.libraryMutationRevision, before + 1, "a settings write still advances the library revision");
});

test("a commit based on an old revision is refused and leaves the newer data intact", async () => {
  const w = cloudWorker(base()); await flush();
  const stale = await w.call("getLibraryMutationSnapshot", ["animeData"]);
  await w.call("runBgLibraryTransaction", ["animeData"], (latest) => ({
    data: { animeData: { ...latest.animeData, newer: { title: "Newer", episodes: [] } } },
  }));
  const result = await w.request("LIBRARY_MUTATION_COMMIT", {
    expectedRevision: stale.revision, data: { animeData: { ...stale.data.animeData, staleEdit: { title: "Stale", episodes: [] } } },
  });
  assert.equal(result.success, false);
  assert.equal(result.conflict, true);
  assert.ok(w.store.animeData.newer);
  assert.equal(w.store.animeData.staleEdit, undefined);
});

test("delivering the same commit twice applies it once", async () => {
  const w = cloudWorker(base()); await flush();
  const snapshot = await w.call("getLibraryMutationSnapshot", ["animeData"]);
  const message = { expectedRevision: snapshot.revision, data: { animeData: { ...snapshot.data.animeData, once: { title: "Once", episodes: [] } } } };
  const first = await w.request("LIBRARY_MUTATION_COMMIT", message);
  const second = await w.request("LIBRARY_MUTATION_COMMIT", message);
  assert.equal(first.success, true);
  assert.equal(second.success, false, "the redelivered commit is a revision conflict, not a second write");
  assert.equal(w.store.libraryMutationRevision, first.revision);
});

test("popup and content facades refuse whole-map writes and the popup has no commit(data) shortcut", () => {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  for (const file of ["src/popup/lib/storage.js", "src/content/lib/storage.js"]) {
    assert.match(read(file), /writesLibraryMap\(data\)\) throw new Error\(AnimeTrackerLibraryKeys\.BLIND_MAP_WRITE_ERROR\)/, file);
  }
  assert.doesNotMatch(read("src/popup/services/library-mutation-service.js"), /\n\s+commit,\n/);
  assert.doesNotMatch(read("src/popup/main.js"), /LibraryMutations\.commit\(/);
});

test("every library map key is a mutation key", () => {
  const sandbox = {};
  require("node:vm").runInNewContext(fs.readFileSync(path.join(root, "src/common/data/library-keys.js"), "utf8"), { globalThis: sandbox, self: sandbox });
  const keys = sandbox.AnimeTrackerLibraryKeys;
  for (const key of keys.MAP_MUTATION_KEYS) assert.ok(keys.MUTATION_KEYS.includes(key), key);
  assert.equal(keys.writesLibraryMap({ copyGuardEnabled: true }), false);
  assert.equal(keys.writesLibraryMap({ goalSettings: {} }), true);
});

(async () => {
  const hold = setInterval(() => {}, 1000);
  const watchdog = setTimeout(() => { console.error("FAIL library command test timed out"); process.exit(1); }, 20000);
  try {
    let failures = 0;
    for (const { name, fn } of cases) {
      try { await fn(); console.log("PASS " + name); }
      catch (error) { failures++; console.error("FAIL " + name + ": " + error.stack); }
    }
    process.exitCode = failures ? 1 : 0;
  } finally { clearInterval(hold); clearTimeout(watchdog); }
})();
