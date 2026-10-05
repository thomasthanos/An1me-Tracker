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

// Website access is one tap in the popup; an install or update opens no extra page, even with websites on Ask.
test("install and update open no page or tab, even with websites still on Ask", async () => {
  for (const options of [{ safariDenied: SAFARI_DENIED }, { safariDenied: [] }, {}]) {
    const h = cloudWorker({}, {}, options);
    const created = [];
    h.context.chrome.tabs = { create: async (info) => { created.push(info.url); return { id: 1 }; } };
    for (const reason of ["install", "update"]) {
      for (const listener of h.installedListeners) listener({ reason, previousVersion: "8.2.11" });
    }
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(created, [], JSON.stringify(options));
  }
});
