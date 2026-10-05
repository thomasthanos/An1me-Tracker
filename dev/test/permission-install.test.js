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
