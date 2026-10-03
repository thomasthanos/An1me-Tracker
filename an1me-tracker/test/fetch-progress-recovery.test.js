const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(setImmediate);
let failures = 0;
async function test(name, fn) { try { await fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.stack}`); } }

function player() {
  const store = { animeData: {}, videoProgress: {} }, timers = [], messages = [], syncs = [];
  const location = new URL('https://an1me.to/watch/naruto-part-2-episode-1');
  let cover = 'naruto.jpg', siteId = 111, get = async () => structuredClone(store);
  const AT = { CONFIG: { MIN_PROGRESS_TO_SAVE: 5, PROGRESS_WRITE_THROTTLE_MS: 20000, PAUSE_WRITE_THROTTLE_MS: 5000,
    MAX_SAVE_QUEUE_SIZE: 10, MAX_PROGRESS_ENTRIES: 200 }, Logger: new Proxy({}, { get: () => () => {} }),
    AnimeParser: { extractCoverImage: () => cover, extractSiteAnimeId: () => siteId }, PageEvents: { onStorage() {} },
    getWatchProgressContext: () => ({ uniqueId: siteId === 111 ? 'naruto__episode-13' : 'bleach__episode-5', url: location.href, coverImage: cover, siteAnimeId: siteId }),
    WatchlistSync: { getProgressFallbackType: () => 'watching', syncFromStorage: (...args) => syncs.push(args) },
    Storage: { isContextValid: () => true, isAbortResult: () => false, get: keys => get(keys), mutate: async (keys, fn) => {
      const snapshot = structuredClone(store); if (fn(snapshot) !== false) Object.assign(store, snapshot); return snapshot;
    } },
  };
  const c = vm.createContext({ URL, window: { AnimeTrackerContent: AT, location }, document: { visibilityState: 'visible' },
    chrome: { runtime: { sendMessage(message, callback) { messages.push(structuredClone(message)); callback?.({ success: true }); } } },
    setTimeout(fn, ms) { const t = { fn, ms }; timers.push(t); return t; }, clearTimeout(t) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } });
  vm.runInContext(read('src/content/player/progress-tracker.js'), c);
  return { c, AT, p: AT.ProgressTracker, store, timers, messages, syncs, setGet: fn => get = fn,
    navigate() { location.href = 'https://an1me.to/watch/bleach-episode-5'; cover = 'bleach.jpg'; siteId = 222; } };
}

function worker(initial, shared = false) {
  const store = shared ? initial : structuredClone(initial), syncSamples = [], syncRequests = [], fullSyncs = [];
  const c = vm.createContext({ console, dlog() {}, isPlaceholderDuration: () => false,
    runBgLibraryTransaction: async (keys, fn) => {
      const snapshot = structuredClone(Object.fromEntries(keys.map(key => [key, store[key]])));
      const outcome = await fn(snapshot); if (outcome?.data) Object.assign(store, structuredClone(outcome.data)); return outcome?.result;
    } });
  const src = read('background.js');
  vm.runInContext(src.slice(src.indexOf('function normalizeTrackedDuration('), src.indexOf('const messageHandlers =')) +
    src.slice(src.indexOf('const messageHandlers ='), src.indexOf('chrome.runtime.onMessage.addListener')) + '\nglobalThis.handlers = messageHandlers;', c);
  c.handlers.SYNC_PROGRESS_ONLY = message => { syncRequests.push(message); syncSamples.push(structuredClone(store.videoProgress)); };
  c.handlers.SYNC_TO_FIREBASE_IMMEDIATE = () => fullSyncs.push(structuredClone(store));
  return { c, store, syncSamples, syncRequests, fullSyncs };
}

function popup(send) {
  const rendered = [], state = { isOpen: false }, store = {};
  const AT = { PopupState: {}, Storage: { get: async () => structuredClone(store) },
    FillerFetchUI: { state, open: async () => state.isOpen = true, close: () => state.isOpen = false,
      showPendingStart() { state.isRunning = true; state.fetchDone = false; },
      applyBackgroundState(s) { rendered.push(s); state.isRunning = s?.status === 'running'; state.fetchDone = ['completed', 'error'].includes(s?.status); } },
    SyncStatusController: { init() {}, setActivity() {}, clearActivity() {}, refreshCloudStatus() {} } };
  const c = vm.createContext({ window: { AnimeTracker: AT }, PopupLogger: { error() {} }, AnimeTrackerUtils: { isMobileDevice: () => true } });
  vm.runInContext(read('src/popup/app/metadata-repair.js'), c);
  AT.MetadataRepair._init({ elements: {}, sendRuntimeMessage: message => send(message, store), scheduleDeferredListRefresh() {}, updateStats: async () => {} });
  return { AT, store, state, rendered };
}

function repair(initial) {
  const store = structuredClone(initial);
  const c = vm.createContext({ console, chrome: { alarms: { clear: async () => {} } }, bgStorageGet: async () => store,
    bgStorageSet: async data => Object.assign(store, structuredClone(data)), AnimeTrackerUtils: { isMobileDevice: () => true },
    isLikelyMovieSlug: () => false }); c.self = c;
  vm.runInContext(read('src/common/utils.js'), c);
  vm.runInContext(read('src/common/data/cache-policy.js'), c);
  vm.runInContext(read('src/background/jobs/metadata-repair.js'), c);
  return { c, store };
}

(async () => {
  await test('an awaiting save retains its original split-season URL, cover and site ID after navigation', async () => {
    const h = player(); let release;
    h.setGet(() => new Promise(resolve => release = resolve));
    const saving = h.p.performSaveProgress('naruto__episode-13', 200, 1200);
    h.navigate(); release(structuredClone(h.store)); await flush();
    // The optional watchlist read also uses the controlled storage boundary.
    release(structuredClone(h.store)); await saving;
    const entry = h.store.videoProgress['naruto__episode-13'];
    assert.equal(entry.pagePath, 'naruto-part-2-episode-1'); assert.equal(entry.coverImage, 'naruto.jpg');
    assert.equal(h.syncs[0][0], 111);
  });
  await test('a throttled sample captures context before its timer fires', async () => {
    const h = player(); h.p.lastSaveTime = Date.now();
    h.p.saveVideoProgress('naruto__episode-13', 100, 1200);
    h.navigate(); h.timers.shift().fn(); await flush();
    assert.equal(h.store.videoProgress['naruto__episode-13'].pagePath, 'naruto-part-2-episode-1');
    assert.equal(h.store.videoProgress['naruto__episode-13'].coverImage, 'naruto.jpg');
  });
  await test('a valid default watch page repairs a previously corrupted resume path', async () => {
    const h = player(); h.navigate();
    h.store.videoProgress['bleach__episode-5'] = { currentTime: 100, duration: 1200, pagePath: 'naruto-episode-1' };
    await h.p.performSaveProgress('bleach__episode-5', 110, 1200);
    assert.equal(h.store.videoProgress['bleach__episode-5'].pagePath, undefined);
  });
  await test('an old write cannot consume the new page watchlist sync after reset', async () => {
    const h = player(); let release;
    h.setGet(() => new Promise(resolve => release = resolve));
    const old = h.p.performSaveProgress('naruto__episode-13', 200, 1200);
    h.p.reset(); h.navigate(); h.setGet(async () => structuredClone(h.store));
    release(structuredClone(h.store)); await old;
    await h.p.performSaveProgress('bleach__episode-5', 130, 1200);
    assert.deepEqual(h.syncs.map(s => [s[0], s[1]]), [[222, 'bleach']]);
  });
  await test('urgent progress is handed off before a delayed local write and survives reset', async () => {
    const h = player(); let release;
    h.setGet(() => new Promise(resolve => release = resolve));
    const old = h.p.performSaveProgress('naruto__episode-13', 100, 1200);
    h.p.saveVideoProgress('naruto__episode-13', 400, 1200, true, true); h.p.reset();
    assert.equal(h.messages.length, 1, 'urgent sample must reach the worker synchronously');
    const w = worker(h.store, true);
    await new Promise(resolve => w.c.handlers.SAVE_PROGRESS_BEFORE_UNLOAD(h.messages[0], {}, resolve));
    assert.equal(w.store.videoProgress['naruto__episode-13'].currentTime, 400);
    h.setGet(async () => structuredClone(h.store)); release(structuredClone(h.store)); await old;
    assert.equal(h.store.videoProgress['naruto__episode-13'].currentTime, 400, 'the late local transaction must not overwrite the urgent sample');
  });
  await test('an older in-flight start-over sample cannot rewind past a newer urgent sample', async () => {
    const h = player(); const id = 'naruto__episode-13';
    h.store.videoProgress[id] = { currentTime: 500, duration: 1200, savedAt: new Date().toISOString() };
    h.p.allowRewind(id); let release;
    h.setGet(() => new Promise(resolve => release = resolve));
    const old = h.p.performSaveProgress(id, 30, 1200);
    h.p.saveVideoProgress(id, 60, 1200, true, true);
    const w = worker(h.store, true);
    await new Promise(resolve => w.c.handlers.SAVE_PROGRESS_BEFORE_UNLOAD(h.messages[0], {}, resolve));
    assert.equal(h.store.videoProgress[id].currentTime, 60);
    vm.runInContext(read('src/common/utils.js'), w.c);
    vm.runInContext(read('src/common/data/merge-utils.js'), w.c);
    h.store.videoProgress = structuredClone(w.c.AnimeTrackerMergeUtils.mergeVideoProgress(h.store.videoProgress, {
      [id]: { currentTime: 500, duration: 1200, savedAt: new Date(Date.now() - 60000).toISOString() },
    }));
    assert.equal(h.store.videoProgress[id].currentTime, 60, 'stale cloud progress must not undo Start over');
    h.store.videoProgress = structuredClone(w.c.AnimeTrackerMergeUtils.mergeVideoProgress(h.store.videoProgress, {
      [id]: { currentTime: 100, duration: 1200, sampleSession: 'another-device', sampleSequence: 7,
        savedAt: new Date(Date.now() + 10000).toISOString() },
    }));
    assert.equal(h.store.videoProgress[id].currentTime, 100);
    h.setGet(async () => structuredClone(h.store)); release(structuredClone(h.store)); await old;
    assert.equal(h.store.videoProgress[id].currentTime, 100, 'a different-session winner must still block the old rewind');
  });
  await test('cloud merge honors an explicit rewind while keeping forward progress and deletion rules', () => {
    const c = vm.createContext({}); vm.runInContext(read('src/common/utils.js'), c); vm.runInContext(read('src/common/data/merge-utils.js'), c);
    const pick = c.AnimeTrackerMergeUtils.selectProgressEntry;
    const previous = { currentTime: 500, savedAt: '2026-10-03T12:00:00Z' };
    const restarted = { currentTime: 30, savedAt: '2026-10-03T12:01:00Z', rewoundAt: '2026-10-03T12:00:55Z', sampleSession: 'player', sampleSequence: 1 };
    assert.equal(pick(previous, restarted), restarted); assert.equal(pick(restarted, previous), restarted);
    const later = { ...restarted, currentTime: 60, sampleSequence: 2 };
    assert.equal(pick(restarted, later), later); assert.equal(pick(later, restarted), later);
    const otherDevice = { currentTime: 100, savedAt: '2026-10-03T12:02:00Z' };
    const resumedElsewhere = pick(later, otherDevice);
    assert.equal(resumedElsewhere.currentTime, 100); assert.equal(resumedElsewhere.rewoundAt, restarted.rewoundAt);
    assert.equal(pick(resumedElsewhere, previous).currentTime, 100, 'subsequent cloud merges must retain the restart boundary');
    assert.equal(pick(previous, { currentTime: 100, savedAt: '2026-10-03T12:02:00Z' }), previous, 'ordinary stale lower progress still cannot rewind');
    const deleted = { deleted: true, deletedAt: '2026-10-03T12:03:00Z' };
    assert.equal(pick(later, deleted), deleted);
  });
  await test('worker progress commits before cloud sync, preserves newer samples and skips completed episodes', async () => {
    const w = worker({ animeData: {}, videoProgress: {} });
    assert.equal(typeof w.c.handlers.SAVE_PROGRESS_BEFORE_UNLOAD, 'function');
    const send = sample => new Promise(resolve => w.c.handlers.SAVE_PROGRESS_BEFORE_UNLOAD(sample, {}, resolve));
    const sample = { uniqueId: 'naruto__episode-1', currentTime: 110, duration: 1200, context: { coverImage: 'naruto.jpg' }, sync: true };
    assert.equal((await send(sample)).success, true); assert.equal(w.syncSamples[0][sample.uniqueId].currentTime, 110);
    await send({ ...sample, currentTime: 100 }); assert.equal(w.store.videoProgress[sample.uniqueId].currentTime, 110);
    w.store.animeData.naruto = { episodes: [{ number: 1, durationSource: 'video' }] }; w.store.videoProgress = {};
    await send(sample); assert.deepEqual(w.store.videoProgress, {});
  });
  await test('an urgent no-op still syncs already committed progress and preserves the force request', async () => {
    const w = worker({ animeData: {}, videoProgress: { 'naruto__episode-1': { currentTime: 110, duration: 1200 } } });
    const result = await new Promise(resolve => w.c.handlers.SAVE_PROGRESS_BEFORE_UNLOAD({
      uniqueId: 'naruto__episode-1', currentTime: 111, duration: 1200, sync: true, forceSync: true,
    }, {}, resolve));
    assert.equal(result.saved, false); assert.equal(w.syncSamples.length, 1);
    assert.equal(w.syncSamples[0]['naruto__episode-1'].currentTime, 110); assert.equal(w.syncRequests[0].force, true);
  });
  await test('unload completion requests full sync only after the completion transaction', async () => {
    const w = worker({ animeData: {}, deletedAnime: {}, videoProgress: { 'naruto__episode-1': { currentTime: 110, duration: 1200 } } });
    await new Promise(resolve => w.c.handlers.TRACK_BEFORE_UNLOAD({
      animeInfo: { animeSlug: 'naruto', episodeNumber: 1, uniqueId: 'naruto__episode-1' }, duration: 1200, sync: true,
    }, {}, resolve));
    assert.equal(w.fullSyncs.length, 1); assert.equal(w.fullSyncs[0].animeData.naruto.episodes[0].number, 1);
    assert.deepEqual(w.fullSyncs[0].videoProgress, {});
  });
  for (const response of ['reject', 'failure']) await test(`a ${response} starting fetch leaves a closable error instead of a locked spinner`, async () => {
    const h = popup(async () => { if (response === 'reject') throw Error('message channel closed'); return { success: false, error: 'worker unavailable' }; });
    await assert.rejects(h.AT.MetadataRepair.fetchAllFillers());
    assert.equal(h.state.isRunning, false); assert.equal(h.state.fetchDone, true); assert.equal(h.rendered.at(-1).status, 'error');
    assert.equal(h.store.metadataRepairState, undefined, 'a transport error must not overwrite worker state');
  });
  await test('a lost fetch response reconciles the real running job without reporting a false failure', async () => {
    const h = popup(async (_, store) => { store.metadataRepairState = { status: 'running', runId: 'real-job', updatedAt: new Date().toISOString(), total: 3 }; throw Error('response lost'); });
    const result = await h.AT.MetadataRepair.fetchAllFillers();
    assert.equal(result.runId, 'real-job'); assert.equal(h.state.isRunning, true); assert.equal(h.state.fetchDone, false);
  });
  for (const status of ['completed', 'error']) await test(`a lost resume response keeps the worker's authoritative ${status} outcome`, async () => {
    const h = popup(async (_, store) => { store.metadataRepairState = { status, runId: 'real-job', updatedAt: new Date().toISOString(),
      total: 3, processed: 3, errorMessage: 'real worker failure', logs: [{ type: 'error', detail: 'actual failure' }] }; throw Error('response lost'); });
    h.store.metadataRepairState = { status: 'running', runId: 'real-job', updatedAt: new Date().toISOString(), total: 3 };
    const result = await h.AT.MetadataRepair.fetchAllFillers();
    assert.equal(result.status, status); assert.equal(result.runId, 'real-job'); assert.equal(h.rendered.at(-1).logs[0].detail, 'actual failure');
  });
  for (const kind of ['info', 'filler']) await test(`an immediate repeat fetch keeps ${kind} backoff visible as needs retry without making HTTP calls`, async () => {
    const now = Date.now();
    const info = { schemaVersion: 5, status: 'FINISHED', totalEpisodes: 12, cachedAt: now };
    const filler = { schemaVersion: 3, filler: [], canon: [1], totalEpisodes: 12, cachedAt: now };
    const failure = { retryable: true, error: kind === 'info' ? 'http 503' : 'jikan_search_http_504', schemaVersion: 3, cachedAt: now, retryAt: now };
    const h = repair({ animeData: { naruto: { title: 'Naruto' } }, animeinfo_naruto: kind === 'info' ? failure : info, episodeTypes_naruto: kind === 'filler' ? failure : filler });
    const plan = await h.c.buildLibraryRepairPlan(h.store.animeData);
    assert.equal(plan.items.length, 0, 'backoff must still prevent a fetch storm');
    assert.equal(plan.failed, 1); assert.equal(plan.cached, 0);
    assert.equal(h.c.countMetadataRepairOutcome(plan.logs[0]).failed, 1);
    const state = await h.c.startLibraryRepair({ auto: false, origin: 'manual' });
    assert.equal(state.failed, 1); assert.equal(state.status, 'completed');
  });
  await test('a failed refresh preserves usable filler arrays and stamps the original retry error', async () => {
    const old = { schemaVersion: 3, filler: [2], canon: [1], cachedAt: Date.now() - 86400000 * 40 };
    const h = repair({ episodeTypes_naruto: old });
    h.c.collectFillerMatchKeys = () => [];
    h.c.discoverFillerSlug = async () => null;
    h.c.fetchJikanEpisodes = async () => { throw Error('jikan_search_http_504'); };
    await assert.rejects(h.c.repairEpisodeTypesCache('naruto', 'Naruto', true), /jikan_search_http_504/);
    const cached = h.store.episodeTypes_naruto;
    assert.equal(cached.retryable, true); assert.equal(cached.retryError, 'jikan_search_http_504');
    assert.deepEqual(cached.filler, [2]); assert.ok(h.c.AnimeTrackerCachePolicy.isFillerUsableSnapshot(cached));
  });
  process.exitCode = failures ? 1 : 0;
})();
