const assert = require('node:assert/strict');
const { test } = require('node:test');
const { cloudWorker } = require('./lib/cloud-worker-harness.js');
const vm = require('node:vm');
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

test('pause and exit checkpoints still save the latest six-minute Resume locally and upload on grant', async () => {
  const initial = seed(); initial.videoProgress = {};
  const h = cloudWorker(initial, {}, { safariDenied: [CLOUD] });
  await settle();
  for (const [sequence, currentTime] of [[1, 180], [2, 360]]) {
    h.advance(180000);
    const result = await h.request('SAVE_PROGRESS_BEFORE_UNLOAD', {
      uniqueId: 'bleach__episode-2', currentTime, duration: 1200, sync: true,
      context: { sampledAt: new Date(h.now()).toISOString(), sampleSession: 'phone', sampleSequence: sequence },
    });
    assert.equal(result.saved, true);
  }
  await settle();
  assert.equal(h.requests.length, 0);
  assert.equal(h.store.videoProgress['bleach__episode-2'].currentTime, 360);
  assert.ok(h.store['syncState.pendingProgressFlush']);
  h.grantWebsiteAccess(); await settle();
  assert.equal(h.remote.videoProgress['bleach__episode-2'].currentTime, 360);
  assert.equal(h.store['syncState.pendingProgressFlush'], undefined);
});

test('mid-flight cloud denial stays a pause without error status or a new retry alarm', async () => {
  for (const message of ['SYNC_PROGRESS_ONLY', 'SYNC_TO_FIREBASE_IMMEDIATE']) {
    let h;
    h = cloudWorker(seed(), {}, { safariDenied: [], beforeRequest: async () => {
      h.revokeWebsiteAccess(CLOUD); throw h.context.AnimeTrackerWebsiteAccess.deniedError();
    } });
    await settle();
    const outcome = await h.request(message, { force: true }); await settle();
    assert.equal(outcome.paused, true);
    assert.notEqual(h.store.cloudSyncStatus?.state, 'error');
    assert.equal(h.alarms.has('progressSyncRetry'), false); assert.equal(h.alarms.has('fullSyncRetry'), false);
    assert.equal(h.alarms.has('progressSyncDebounce'), false);
    assert.equal(h.store.videoProgress['bleach__episode-2'].currentTime, 360);
  }
});
test('denial while metadata is being fetched never stamps the prior usable cache with backoff', async () => {
  const initial = seed(); initial.animeinfo_bleach = { title: 'Bleach', cachedAt: 100, siteAnimeId: 42 };
  const h = cloudWorker(initial, {}, { safariDenied: [] }); await settle();
  let reject, started;
  const ready = new Promise(resolve => started = resolve);
  h.context.fetchAnimePageInfo = () => { started(); return new Promise((_resolve, fail) => reject = fail); };
  const repair = h.call('repairAnimeInfoCache', 'bleach', true);
  await ready; h.revokeWebsiteAccess(CLOUD); reject(h.context.AnimeTrackerWebsiteAccess.deniedError());
  await assert.rejects(repair, { code: 'SITE_ACCESS_REQUIRED' }); await settle();
  assert.deepEqual(h.store.animeinfo_bleach, initial.animeinfo_bleach);
});
test('a gateway denied mid-request cannot retry or open a fallback tab', async () => {
  let h, tabs = 0;
  h = cloudWorker(seed(), {}, { safariDenied: [], beforeRequest: async () => {
    h.revokeWebsiteAccess(CLOUD); throw h.context.AnimeTrackerWebsiteAccess.deniedError();
  } });
  h.context.chrome.tabs = { query: async () => [], create: async () => { tabs++; return { id: 12 }; } };
  await settle();
  await assert.rejects(h.call('an1meFetch', 'https://an1me.to/anime/bleach/'), { code: 'SITE_ACCESS_REQUIRED' });
  assert.equal(tabs, 0); assert.equal(h.requests.length, 1);
});
test('permission grant restores enabled notification and desktop AniList schedules', async () => {
  const initial = seed(); initial.smartNotificationsEnabled = true;
  initial.anilist_auth = { accessToken: 'test-token', expiresAt: NOW + 3600000 };
  const h = cloudWorker(initial, {}, { safariDenied: [CLOUD] }); await settle();
  assert.equal(h.alarms.has('smartNotifCheck'), false); assert.equal(h.alarms.has('anilistPushPeriodic'), false);
  h.grantWebsiteAccess(); await settle();
  assert.equal(h.alarms.has('smartNotifCheck'), true); assert.equal(h.alarms.has('anilistPushPeriodic'), true);
});
test('paused watchlist deletes are durable across worker restart and applied after access returns', async () => {
  let h = cloudWorker(seed(), {}, { safariDenied: [CLOUD] }); await settle();
  await h.request('WATCHLIST_SYNC', { animeId: 42, watchlistType: 'watching', animeSlug: 'bleach' });
  await h.request('WATCHLIST_SYNC', { animeId: 42, watchlistType: 'remove', animeSlug: 'bleach' }); await settle();
  assert.equal(h.store.pendingWebsiteWatchlist?.['42']?.type, 'remove');
  h = cloudWorker(h.store, {}, { safariDenied: [CLOUD] }); await settle();
  const sent = [];
  h.context.chrome.tabs = { query: async () => [{ id: 1 }],
    sendMessage: (_id, message, callback) => { sent.push(message); callback({ success: true }); } };
  h.grantWebsiteAccess(); await settle();
  assert.equal(sent.length, 1); assert.equal(sent[0].watchlistType, 'remove');
  assert.deepEqual(h.store.pendingWebsiteWatchlist || {}, {});
});
test('a worker start with every website allowed does not park a running Fetch & Import while the check is still running', async () => {
  // Every Safari worker start begins "checking". Read as a denial, it cleared every retry alarm and parked a running
  // Fetch & Import as waiting for access, on each restart iOS makes.
  const initial = seed();
  initial.metadataRepairState = { runId: 'boot', status: 'running', origin: 'manual', uiMode: 'modal', total: 1, fetchTotal: 1,
    queueIndex: 0, processed: 0, fetched: 0, cached: 0, skipped: 0, failed: 0, logs: [], items: [{ slug: 'bleach', title: 'Bleach' }], options: {} };
  const h = cloudWorker(initial, {}, { safariDenied: [], alarms: [['progressSyncRetry', { name: 'progressSyncRetry', scheduledTime: NOW + 60000 }]] });
  const pauses = [];
  h.context.pauseMetadataRepairForAccess = (...args) => { pauses.push(args); };
  await settle();
  assert.deepEqual(pauses, [], 'a check that has not answered yet is not a denial');
  assert.equal(h.alarms.has('progressSyncRetry'), true, 'retry alarms survive the start');
});
