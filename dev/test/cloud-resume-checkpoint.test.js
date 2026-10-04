const assert = require("node:assert/strict");
const { cloudWorker } = require("./lib/cloud-worker-harness.js");
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(setImmediate); };
const epoch = Date.parse("2026-10-04T12:00:00Z");
const id = "example__episode-3";
const initial = () => ({ firebase_user: { uid: "test-user", email: "test@example.com" },
  firebase_tokens: { idToken: "test-token", refreshToken: "test-refresh", expiresAt: epoch + 3600000 },
  animeData: { example: { title: "Example", episodes: [] } }, videoProgress: {}, deletedAnime: {} });
function sample(worker, currentTime, sequence) { return { uniqueId: id, currentTime, duration: 1440,
  context: { sampledAt: new Date(worker.now()).toISOString(), sampleSession: "phone", sampleSequence: sequence }, sync: true }; }
const cases = [];
const test = (name, fn) => cases.push({ name, fn });
test("mobile pause checkpoints at 3 and 6 minutes publish the final 6-minute Resume", async () => {
  const w = cloudWorker(initial()); await flush();
  assert.equal((await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 180, 1))).saved, true); await flush();
  assert.equal(w.remote.videoProgress?.[id]?.currentTime, 180);
  w.advance(3 * 60000);
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 360, 2)); await flush();
  assert.equal(w.store.videoProgress[id].currentTime, 360, "final position remains safe locally");
  assert.equal(w.remote.videoProgress[id].currentTime, 360, "the next PC pull must receive the final sample");
  assert.equal(w.requests.filter(request => request.method === "PATCH").length, 2);
});
test("repeated pause events keep a bounded checkpoint deadline and preserve the newest sample", async () => {
  const w = cloudWorker(initial()); await flush();
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 180, 1)); await flush();
  for (let i = 1; i <= 3; i++) { w.advance(5000); await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 180 + i * 5, i + 1)); await flush(); }
  assert.equal(w.requests.filter(request => request.method === "PATCH").length, 1);
  assert.equal(w.store.videoProgress[id].currentTime, 195);
  assert.ok(w.store["syncState.pendingProgressFlush"]);
  assert.equal(w.alarms.get("progressSyncDebounce").scheduledTime, epoch + 35000);
  w.advance(20000); await w.call("syncProgressOnly", "test:checkpoint-deadline"); await flush();
  assert.equal(w.remote.videoProgress[id].currentTime, 195);
});
test("a consumer pull revalidates fresh cached 3-minute progress and receives remote 6-minute progress", async () => {
  const snapshot = initial(), old = { currentTime: 180, duration: 1440, savedAt: "2026-10-04T11:59:00Z", percentage: 12 };
  snapshot.videoProgress[id] = old;
  const cached = { animeData: snapshot.animeData, videoProgress: { [id]: old }, lastUpdated: "2026-10-04T11:59:00Z" };
  snapshot._bgCloudDocCachePersisted = { uid: "test-user", doc: cached, cachedAt: epoch - 60000 };
  const remote = { ...cached, videoProgress: { [id]: { ...old, currentTime: 360, percentage: 25, savedAt: "2026-10-04T12:00:00Z" } }, lastUpdated: "2026-10-04T12:00:00Z" };
  const w = cloudWorker(snapshot, remote); await flush();
  await w.request("WAKE_AND_POLL_CLOUD", { reason: "popup:open" }); await flush();
  assert.equal(w.store.videoProgress[id].currentTime, 360);
  assert.ok(w.requests.some(request => request.url.includes("mask.fieldPaths=lastUpdated")), "first check only the lightweight revision field");
});
test("unchanged cloud revisions avoid library downloads and repeated consumer pulls keep their rate limit", async () => {
  const snapshot = initial(), doc = { animeData: snapshot.animeData, videoProgress: {}, lastUpdated: "2026-10-04T11:59:00Z" };
  snapshot._bgCloudDocCachePersisted = { uid: "test-user", doc, cachedAt: epoch - 60000 };
  const w = cloudWorker(snapshot, doc); await flush();
  await w.request("WAKE_AND_POLL_CLOUD"); await flush();
  assert.equal(w.requests.length, 1);
  assert.ok(w.requests[0].url.includes("mask.fieldPaths=lastUpdated"));
  w.advance(60000);
  assert.equal((await w.request("WAKE_AND_POLL_CLOUD")).skipped, true);
  assert.equal(w.requests.length, 1);
});
test("periodic sync keeps its longer interval while a final unload may flush within 30 seconds", async () => {
  const w = cloudWorker(initial()); await flush();
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 180, 1)); await flush();
  w.advance(10000);
  const finalSample = sample(w, 190, 2);
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", { ...finalSample, sync: false }); await flush();
  assert.equal((await w.request("SYNC_PROGRESS_ONLY")).queued, true);
  assert.equal(w.requests.filter(request => request.method === "PATCH").length, 1);
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", { ...finalSample, forceSync: true }); await flush();
  assert.equal(w.remote.videoProgress[id].currentTime, 190);
  assert.equal(w.requests.filter(request => request.method === "PATCH").length, 2);
  w.advance(30000);
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", { ...sample(w, 190, 3), context: finalSample.context }); await flush();
  assert.equal(w.requests.filter(request => request.method === "PATCH").length, 2, "unchanged samples do not write again");
});
test("a failed checkpoint keeps local progress and a durable pending marker for a later retry", async () => {
  const w = cloudWorker(initial()); await flush();
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 180, 1)); await flush();
  w.advance(3 * 60000); w.failNextPatch();
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 360, 2)); await flush();
  assert.equal(w.store.videoProgress[id].currentTime, 360);
  assert.equal(w.remote.videoProgress[id].currentTime, 180);
  assert.ok(w.store["syncState.pendingProgressFlush"]);
  const result = await w.call("syncProgressOnly", "test:network-restored"); await flush();
  assert.equal(result.success, true);
  assert.equal(w.remote.videoProgress[id].currentTime, 360);
  assert.equal(w.store["syncState.pendingProgressFlush"], undefined);
});
test("a delayed older phone sample cannot lower a newer remote Resume position", async () => {
  const savedAt = "2026-10-04T11:59:00Z";
  const w = cloudWorker(initial(), { videoProgress: { [id]: { currentTime: 360, duration: 1440, percentage: 25, savedAt } }, lastUpdated: savedAt }); await flush();
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 180, 1)); await flush();
  assert.equal(w.store.videoProgress[id].currentTime, 360);
  assert.equal(w.remote.videoProgress[id].currentTime, 360);
});
test("repeated failed pause checkpoints honor retry backoff, including after worker restart", async () => {
  let w = cloudWorker(initial()); await flush();
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 180, 1)); await flush();
  w.advance(30000); w.failPatches(true);
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 210, 2)); await flush();
  const retryAt = w.alarms.get("progressSyncRetry").scheduledTime;
  for (let i = 1; i <= 3; i++) { w.advance(5000); await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 210 + i * 5, i + 2)); await flush(); }
  assert.equal(w.requests.filter(request => request.method === "PATCH").length, 2, "one failed attempt, no early retries");
  assert.equal(w.alarms.get("progressSyncRetry").scheduledTime, retryAt, "pauses do not postpone the pending retry");
  assert.equal(w.store.videoProgress[id].currentTime, 225);
  w = cloudWorker(w.store, w.remote, { now: w.now(), alarms: [...w.alarms] }); await flush();
  w.advance(5000); await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 230, 6)); await flush();
  assert.equal(w.requests.length, 0, "a worker wake reuses the persisted retry alarm");
  w.advance(retryAt - w.now());
  await w.request("SYNC_PROGRESS_ONLY", { checkpoint: true }); await flush();
  assert.equal(w.remote.videoProgress[id].currentTime, 230);
});
test("automatic deferred flushes honor backoff but final page exit can explicitly flush immediately", async () => {
  const w = cloudWorker(initial()); await flush();
  w.failNextPatch();
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", sample(w, 180, 1)); await flush();
  await w.call("armProgressSyncAlarmNoLater", 0.5);
  await w.call("flushPendingProgressSync"); await flush();
  assert.equal(w.requests.filter(request => request.method === "PATCH").length, 1);
  w.advance(5000);
  await w.request("SAVE_PROGRESS_BEFORE_UNLOAD", { ...sample(w, 185, 2), forceSync: true }); await flush();
  assert.equal(w.remote.videoProgress[id].currentTime, 185);
  assert.equal(w.alarms.has("progressSyncRetry"), false, "a successful forced upload cancels old backoff");
});
// Local Resume ahead of the cloud copy: a library with the same anime on both sides, so progress is the only difference.
function aheadOfCloud() {
  const snapshot = initial(), email = "test@example.com", savedAt = "2026-10-04T11:58:00Z";
  const cloudEntry = { currentTime: 180, duration: 1440, savedAt, percentage: 12 };
  snapshot.videoProgress[id] = { ...cloudEntry, currentTime: 300, percentage: 20, savedAt: "2026-10-04T11:59:30Z" };
  const doc = { email, animeData: snapshot.animeData, videoProgress: { [id]: cloudEntry }, deletedAnime: {}, lastUpdated: savedAt };
  return { snapshot, doc };
}
test("a pull that only finds local Resume ahead leaves the upload to the progress alarm and still delivers it", async () => {
  const { snapshot, doc } = aheadOfCloud();
  snapshot._bgCloudDocCachePersisted = { uid: "test-user", doc, cachedAt: epoch - 60000 };
  const w = cloudWorker(snapshot, doc); await flush();
  await w.request("WAKE_AND_POLL_CLOUD", { reason: "popup:refresh" }); await flush();
  assert.equal(w.requests.filter(request => request.method === "PATCH").length, 0, "a poll does not upload the library for a Resume gap");
  assert.equal(w.store.videoProgress[id].currentTime, 300, "local Resume is untouched");
  assert.ok(w.store["syncState.pendingProgressFlush"], "the position stays marked as not yet uploaded");
  assert.ok(w.alarms.get("progressSyncDebounce").scheduledTime <= w.now() + 5 * 60000, "and the progress alarm owns its upload");
  w.advance(5 * 60000); w.alarms.delete("progressSyncDebounce");
  await w.call("syncProgressOnly", "alarm:progress", { respectRetry: true }); await flush();
  assert.equal(w.remote.videoProgress[id].currentTime, 300, "the position reaches the cloud when the alarm fires");
  assert.equal(w.store["syncState.pendingProgressFlush"], undefined);
});
test("a pull that finds the library out of sync with the cloud still runs the full verify-merge sync", async () => {
  const { snapshot, doc } = aheadOfCloud();
  snapshot.animeData = { ...snapshot.animeData, extra: { title: "Extra", episodes: [] } };
  snapshot._bgCloudDocCachePersisted = { uid: "test-user", doc, cachedAt: epoch - 60000 };
  const w = cloudWorker(snapshot, doc); await flush();
  await w.request("WAKE_AND_POLL_CLOUD", { reason: "popup:refresh" }); await flush();
  assert.equal(w.requests.filter(request => request.method === "PATCH").length, 1);
  assert.ok(w.remote.animeData.extra, "a local library change is never left waiting for an alarm");
  assert.equal(w.remote.videoProgress[id].currentTime, 300, "the same full sync carries the newest Resume");
});
test("a worker restart leaves pending Resume to a future progress alarm, and that alarm still delivers it", async () => {
  const { snapshot, doc } = aheadOfCloud();
  snapshot["syncState.pendingProgressFlush"] = epoch - 30000;
  const w = cloudWorker(snapshot, doc, { alarms: [["progressSyncDebounce", { scheduledTime: epoch + 120000 }]] }); await flush();
  assert.equal(w.requests.length, 0, "the armed alarm survives the restart, so the boot does not upload again");
  assert.equal(w.store.videoProgress[id].currentTime, 300);
  assert.ok(w.store["syncState.pendingProgressFlush"]);
  w.advance(120000); w.alarms.delete("progressSyncDebounce");
  await w.call("syncProgressOnly", "alarm:progress", { respectRetry: true }); await flush();
  assert.equal(w.remote.videoProgress[id].currentTime, 300);
});
test("pending Resume with no armed alarm, or only an overdue one, is still recovered immediately on boot", async () => {
  for (const alarms of [[], [["progressSyncDebounce", { scheduledTime: epoch - 1000 }]]]) {
    const { snapshot, doc } = aheadOfCloud();
    snapshot["syncState.pendingProgressFlush"] = epoch - 30000;
    const w = cloudWorker(snapshot, doc, { alarms }); await flush();
    assert.equal(w.remote.videoProgress[id].currentTime, 300, "an unowned pending position is never left stranded");
    assert.equal(w.requests.filter(request => request.method === "PATCH").length, 1);
    assert.equal(w.store["syncState.pendingProgressFlush"], undefined);
  }
});
(async () => {
  const watchdog = setTimeout(() => { console.error("FAIL worker test timed out"); process.exit(1); }, 10000);
  try { let failures = 0; for (const { name, fn } of cases) { try { await fn(); console.log("PASS " + name); }
    catch (error) { failures++; console.error("FAIL " + name + ": " + error.stack); } } process.exitCode = failures ? 1 : 0;
  } finally { clearTimeout(watchdog); }
})();
