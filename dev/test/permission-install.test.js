const assert = require("node:assert/strict");
const { test } = require("node:test");
const { cloudWorker } = require("./lib/cloud-worker-harness.js");

for (const reason of ["install", "update"]) {
  test(`${reason} does not request website access without a user gesture or erase progress`, async () => {
    const seed = { animeData: { bleach: { title: "Bleach", episodes: [{ number: 1 }] } },
      videoProgress: { "bleach__episode-2": { currentTime: 360, duration: 1440 } } };
    const h = cloudWorker(seed);
    let prompts = 0;
    h.context.chrome.runtime.getManifest = () => ({ version: "8.2.7", optional_host_permissions: ["https://www.animefillerlist.com/*", "https://api.jikan.moe/*"] });
    h.context.chrome.permissions = { contains: async () => false, request: async () => { prompts++; return true; } };
    for (const listener of h.installedListeners) listener({ reason, previousVersion: "8.2.6" });
    await new Promise(setImmediate);
    assert.equal(prompts, 0, "Safari requires a tap in the popup; install/update cannot prompt");
    assert.deepEqual(h.store.animeData, seed.animeData);
    assert.deepEqual(h.store.videoProgress, seed.videoProgress);
  });
}

const SAFARI_DENIED = ["https://firestore.googleapis.com/*", "https://www.animefillerlist.com/*"];
const setupPage = "chrome-extension://test/src/setup/access.html";

for (const reason of ["install", "update"]) {
  test(`${reason} with websites still on Ask opens the access page once for this version, without prompting`, async () => {
    const h = cloudWorker({}, {}, { safariDenied: SAFARI_DENIED });
    const created = [];
    let prompts = 0;
    h.context.chrome.tabs = { create: async (info) => { created.push(info.url); return { id: created.length }; } };
    h.context.chrome.permissions.request = async () => { prompts++; return true; };
    for (const listener of h.installedListeners) listener({ reason, previousVersion: "8.2.9" });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(created, [setupPage]);
    assert.equal(prompts, 0);
    // The same version updating again (or the worker replaying the event) does not open it a second time.
    for (const listener of h.installedListeners) listener({ reason: "update", previousVersion: "8.2.9" });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(created, [setupPage]);
  });
}

test("with every website allowed, or on Chrome, an install or update opens no page", async () => {
  for (const options of [{ safariDenied: [] }, {}]) {
    const h = cloudWorker({}, {}, options);
    const created = [];
    h.context.chrome.tabs = { create: async (info) => { created.push(info.url); return { id: 1 }; } };
    for (const listener of h.installedListeners) listener({ reason: "update", previousVersion: "8.2.9" });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(created, [], JSON.stringify(options));
  }
});
