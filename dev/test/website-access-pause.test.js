const assert = require('node:assert/strict');
const { test } = require('node:test');
const { cloudWorker } = require('./lib/cloud-worker-harness.js');
const NOW = Date.parse('2026-10-04T12:00:00Z');
const IMAGE = 'https://cdn.myanimelist.net/*';
const CLOUD = 'https://firestore.googleapis.com/*';
const seed = () => ({
  firebase_user: { uid: 'phone', email: 'test@example.invalid' },
  firebase_tokens: { idToken: 'test-token', refreshToken: 'test-refresh', expiresAt: NOW + 3600000, authSchemaVersion: 3 },
  animeData: { bleach: { title: 'Bleach', episodes: [{ number: 1, watchedAt: '2026-10-04T11:00:00Z' }] } },
  videoProgress: { 'bleach__episode-2': { currentTime: 360, duration: 1200, updatedAt: '2026-10-04T12:00:00Z' } },
  episodeTypes_bleach: { filler: [3], canon: [1, 2], totalEpisodes: 3, cachedAt: NOW, schemaVersion: 3 },
});
const settle = async () => { for (let i = 0; i < 60; i++) await new Promise(setImmediate); };

for (const origin of [IMAGE, CLOUD, 'https://api.aniskip.com/*', 'https://securetoken.googleapis.com/*']) {
  test(`missing ${origin} pauses all cloud and metadata work while preserving local data`, async () => {
    const initial = seed();
    const h = cloudWorker(initial, {}, { safariDenied: [origin] });
    await settle();
    const sync = await h.request('SYNC_TO_FIREBASE_IMMEDIATE', { reason: 'permissions-test' });
    const progress = await h.request('SYNC_PROGRESS_ONLY', { force: true });
    await h.call('startLibraryRepair', { origin: 'manual', forceInfoRefresh: false, forceFillerRefresh: false });
    await settle();
    assert.equal(h.requests.length, 0, 'a missing image/skip/cloud permission stops every outgoing task');
    assert.equal(sync.paused, true);
    assert.equal(progress.paused, true);
    assert.equal(h.store.metadataRepairState.waitingForAccess, true);
    assert.deepEqual(Array.from(h.store.metadataRepairState.blockedOrigins), [origin]);
    assert.equal(h.store.metadataRepairState.queueIndex, 0);
    assert.deepEqual(h.store.videoProgress, initial.videoProgress);
    assert.deepEqual(h.store.episodeTypes_bleach, initial.episodeTypes_bleach);
    const networkNames = [...h.alarms.keys()].filter(name => !/cleanup|idleClose/i.test(name));
    assert.deepEqual(networkNames, [], 'no network retry/periodic alarms survive a permission pause');
  });
}

test('grant resumes durable pending progress without resetting it, and revocation pauses again', async () => {
  const initial = seed();
  const h = cloudWorker(initial, {}, { safariDenied: [IMAGE] });
  await settle();
  await h.request('SYNC_PROGRESS_ONLY', { force: true });
  assert.equal(h.requests.length, 0);
  assert.ok(h.store['syncState.pendingProgressFlush']);
  h.grantWebsiteAccess();
  await settle();
  assert.equal((await h.request('SYNC_PROGRESS_ONLY', { force: true })).success, true);
  assert.equal(h.remote.videoProgress['bleach__episode-2'].currentTime, 360);
  h.revokeWebsiteAccess(CLOUD);
  await settle();
  const previous = h.requests.length;
  const paused = await h.request('SYNC_PROGRESS_ONLY', { force: true });
  assert.equal(paused.paused, true);
  assert.equal(h.requests.length, previous);
  assert.deepEqual(h.store.videoProgress, initial.videoProgress);
});
