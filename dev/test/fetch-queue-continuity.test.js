const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
const flush = async () => { for (let i = 0; i < 15; i++) await new Promise(setImmediate); };
let failures = 0;
async function test(name, fn) { try { await fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.stack}`); } }
const now = Date.now();
const info = () => ({ schemaVersion: 5, status: 'FINISHED', title: 'Naruto', totalEpisodes: 12, latestEpisode: 12, cachedAt: now });
const filler = () => ({ schemaVersion: 3, filler: [2], canon: [1], totalEpisodes: 12, cachedAt: now });

function worker(store, sleep = async () => {}) {
  const calls = [], alarms = [];
  const c = vm.createContext({ console, setTimeout, clearTimeout, isLikelyMovieSlug: () => false,
    chrome: { alarms: { create: (...args) => alarms.push(args), clear: async () => {} }, tabs: { query: async () => [] } },
    bgStorageGet: async () => structuredClone(store), bgStorageSet: async data => Object.assign(store, structuredClone(data)),
  }); c.self = c;
  vm.runInContext(read('src/common/utils.js'), c);
  c.AnimeTrackerUtils = { ...c.AnimeTrackerUtils, sleep, isMobileDevice: () => true };
  vm.runInContext(read('src/common/data/cache-policy.js'), c);
  vm.runInContext(read('src/background/jobs/metadata-repair.js'), c);
  c.AnimeTrackerAnimeResolver = { resolve: async (slug, options) => { calls.push({ slug, options });
    store[`animeinfo_${slug}`] = info(); store[`episodeTypes_${slug}`] = filler();
    return { infoResult: { status: options.forceInfoRefresh ? 'fetched' : 'cached', entry: info() },
      fillerResult: { status: 'fetched', entry: filler(), fillerCount: 1, totalEpisodes: 12 } };
  } };
  const src = read('background.js');
  vm.runInContext(src.slice(src.indexOf('const messageHandlers ='), src.indexOf('chrome.runtime.onMessage.addListener')) + '\nglobalThis.handlers = messageHandlers;', c);
  return { c, calls, alarms };
}

function popup(store, send) {
  const timers = [], listeners = {}, rendered = [];
  const doc = { visibilityState: 'visible', addEventListener: (name, fn) => listeners[name] = fn };
  const AT = { PopupState: {}, Storage: { get: async () => structuredClone(store) }, CachePolicy: null,
    AnilistService: { cache: {} }, FillerService: { episodeTypesCache: {}, KNOWN_FILLERS: {}, updateFromEpisodeTypes() {} },
    FillerFetchUI: { state: { isOpen: true }, close() {}, open: async () => {}, applyBackgroundState: s => rendered.push(s) },
    SyncStatusController: { init() {}, setActivity() {}, clearActivity() {}, refreshCloudStatus() {} } };
  const c = vm.createContext({ console, document: doc, window: { AnimeTracker: AT, addEventListener: (name, fn) => listeners[name] = fn },
    setTimeout(fn, ms) { const t = { fn, ms }; timers.push(t); return t; }, clearTimeout(t) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    PopupLogger: { error() {}, warn() {} } });
  vm.runInContext(read('src/common/utils.js'), c); vm.runInContext(read('src/common/data/cache-policy.js'), c);
  vm.runInContext(read('src/popup/app/metadata-repair.js'), c);
  AT.MetadataRepair._init({ elements: {}, sendRuntimeMessage: send, scheduleDeferredListRefresh() {}, updateStats: async () => {} });
  return { AT, timers, listeners, doc, rendered };
}

function installedWorker(local, sync) {
  let listener;
  const pick = (store, keys) => structuredClone(Object.fromEntries((keys === null ? Object.keys(store) : keys).filter(key => key in store).map(key => [key, store[key]])));
  const area = store => ({ get(keys, cb) { cb(pick(store, keys)); }, set(data, cb) { Object.assign(store, structuredClone(data)); cb(); },
    remove(keys, cb) { for (const key of keys) delete store[key]; cb(); } });
  const c = vm.createContext({ console, dlog() {}, setTimeout, clearTimeout, chrome: { storage: { local: area(local), sync: area(sync) },
    runtime: { getManifest: () => ({ version: '7.5.5' }), onInstalled: { addListener: fn => listener = fn } } } }); c.self = c;
  vm.runInContext(read('src/common/utils.js'), c); vm.runInContext(read('src/common/data/library-keys.js'), c);
  const src = read('background.js');
  vm.runInContext(src.slice(src.indexOf('const LIBRARY_MUTATION_REVISION_KEY'), src.indexOf('function stampBgSyncStorageWrite')) +
    src.slice(src.indexOf('function isBenignSwLifecycleError'), src.indexOf('function bgStorageRemove')) +
    src.slice(src.indexOf('async function migrateFromSyncToLocal'), src.indexOf('function normalizeTrackedDuration')) +
    src.slice(src.indexOf('chrome.runtime.onInstalled.addListener'), src.indexOf('chrome.runtime.onStartup.addListener')), c);
  return { install: details => listener({ reason: 'install', ...details }), c };
}

(async () => {
  await test('manual Fetch retries failed entries immediately while preserving warm successful caches', async () => {
    const store = { animeData: { naruto: { title: 'Naruto' }, bleach: { title: 'Bleach' }, good: { title: 'Good' } },
      animeinfo_naruto: info(), episodeTypes_naruto: { ...filler(), retryable: true, retryAt: now, retryError: 'jikan_search_http_504' },
      animeinfo_bleach: { ...info(), retryable: true, retryAt: now, retryError: 'http 503' }, episodeTypes_bleach: filler(),
      animeinfo_good: info(), episodeTypes_good: filler() };
    const preserved = structuredClone([store.animeinfo_good, store.episodeTypes_good]);
    const w = worker(store); await w.c.startLibraryRepair({ origin: 'manual', auto: false }); await flush();
    assert.deepEqual(w.calls.map(c => c.slug), ['naruto', 'bleach']);
    assert.equal(w.calls[0].options.forceInfoRefresh, false); assert.equal(w.calls[0].options.forceFillerRefresh, true);
    assert.equal(w.calls[1].options.forceInfoRefresh, true); assert.equal(w.calls[1].options.forceFillerRefresh, false);
    assert.equal(store.metadataRepairState.status, 'completed'); assert.equal(store.metadataRepairState.failed, 0);
    assert.deepEqual([store.animeinfo_good, store.episodeTypes_good], preserved);
  });
  await test('overlapping startup and manual Fetch requests share one queue instead of stranding it after one item', async () => {
    const store = { animeData: { one: {}, two: {}, three: {} } }, w = worker(store);
    await Promise.all([w.c.startLibraryRepair({ origin: 'background', auto: false }), w.c.startLibraryRepair({ origin: 'manual', auto: false })]);
    await flush();
    assert.equal(store.metadataRepairState.status, 'completed');
    assert.deepEqual(w.calls.map(c => c.slug), ['one', 'two', 'three']);
    assert.equal(store.metadataRepairState.failed, 0);
  });
  await test('automatic refresh keeps transient failure backoff instead of issuing a fetch storm', async () => {
    const store = { animeData: { naruto: {} }, animeinfo_naruto: info(),
      episodeTypes_naruto: { ...filler(), retryable: true, retryAt: now, retryError: '504' } };
    const w = worker(store); await w.c.startLibraryRepair({ origin: 'background', auto: true }); await flush();
    assert.equal(w.calls.length, 0); assert.equal(store.metadataRepairState.failed, 1);
  });
  await test('manual Fetch during an automatic sweep finishes it and retries skipped failures exactly once', async () => {
    const store = { animeData: { naruto: {}, two: {}, three: {} }, animeinfo_naruto: info(),
      episodeTypes_naruto: { ...filler(), retryable: true, retryAt: now, retryError: '504' } };
    let release;
    const w = worker(store, () => new Promise(resolve => release = resolve));
    await w.c.startLibraryRepair({ origin: 'background', auto: true }); await flush();
    await w.c.startLibraryRepair({ origin: 'manual', auto: false });
    await w.c.startLibraryRepair({ origin: 'manual', auto: false });
    release(); await flush();
    assert.deepEqual(w.calls.map(c => c.slug), ['two', 'three', 'naruto']);
    assert.equal(store.metadataRepairState.status, 'completed'); assert.equal(store.metadataRepairState.failed, 0);
    assert.equal(store.metadataRepairState.options.retryFailures, true);
  });
  await test('real cache repair clears retry markers after a successful manual recovery', async () => {
    const nativeInfo = { ...info(), episodeTypesSource: 'an1me', canonEpisodes: [1], fillerEpisodes: [2] };
    const store = { animeData: { naruto: {}, bleach: {} }, animeinfo_naruto: nativeInfo,
      episodeTypes_naruto: { ...filler(), retryable: true, retryAt: now, retryError: '504' },
      animeinfo_bleach: { ...nativeInfo, retryable: true, retryAt: now, retryError: '503' }, episodeTypes_bleach: filler() };
    const w = worker(store), fetched = [];
    vm.runInContext(read('src/background/anime-resolver.js'), w.c);
    w.c.fetchAnimePageInfo = async slug => { fetched.push(slug); return nativeInfo; };
    await w.c.startLibraryRepair({ origin: 'manual', auto: false }); await flush();
    assert.deepEqual(fetched, ['bleach']);
    assert.equal(store.metadataRepairState.failed, 0);
    for (const key of ['animeinfo_naruto', 'animeinfo_bleach', 'episodeTypes_naruto', 'episodeTypes_bleach']) {
      assert.equal(store[key].retryable, undefined, key); assert.equal(store[key].retryError, undefined, key);
    }
  });
  await test('a worker suspended after one item resumes the remaining queue automatically from a visible popup', async () => {
    const store = { animeData: { one: {}, two: {}, three: {} } };
    const first = worker(store, () => new Promise(() => {}));
    await first.c.startLibraryRepair({ origin: 'manual', auto: false }); await flush();
    assert.equal(store.metadataRepairState.queueIndex, 1);
    const resumed = worker(store); let requests = 0;
    const p = popup(store, message => { requests++; return new Promise(resolve => resumed.c.handlers[message.type](message, {}, resolve)); });
    await p.AT.MetadataRepair.applyMetadataRepairState(store.metadataRepairState);
    assert.equal(p.timers.length, 1, 'a running job needs an automatic wake-up even without storage events');
    await p.timers.shift().fn(); await flush();
    assert.equal(requests, 1); assert.deepEqual(resumed.calls.map(c => c.slug), ['two', 'three']);
    assert.equal(store.metadataRepairState.status, 'completed'); assert.equal(store.metadataRepairState.processed, 3);
    // With no storage events delivered at all, the next bounded wake-up also
    // reconciles completion and stops itself.
    if (p.timers.length) await p.timers.shift().fn();
    assert.equal(p.timers.length, 0, 'completion must stop polling');
  });
  await test('queue wake-ups pause while hidden, resume on visibility, and stop when the popup closes', async () => {
    const store = { metadataRepairState: { runId: 'running', status: 'running', origin: 'manual', uiMode: 'modal', updatedAt: new Date().toISOString(), total: 3, processed: 1 } };
    let requests = 0;
    const p = popup(store, async () => { requests++; return { success: true, state: store.metadataRepairState }; });
    await p.AT.MetadataRepair.applyMetadataRepairState(store.metadataRepairState); assert.equal(p.timers.length, 1);
    p.doc.visibilityState = 'hidden'; p.listeners.visibilitychange(); assert.equal(p.timers.length, 0);
    p.doc.visibilityState = 'visible'; p.listeners.visibilitychange(); await flush(); assert.equal(requests, 1);
    p.listeners.pagehide(); assert.equal(p.timers.length, 0);
  });
  await test('a delayed wake-up response cannot replace completion or restart a finished job', async () => {
    const store = { metadataRepairState: { runId: 'running', status: 'running', origin: 'manual', uiMode: 'modal', total: 3, processed: 1 } };
    let respond;
    const p = popup(store, () => new Promise(resolve => respond = resolve));
    await p.AT.MetadataRepair.applyMetadataRepairState(store.metadataRepairState);
    const wake = p.timers.shift().fn();
    store.metadataRepairState = { ...store.metadataRepairState, status: 'completed', processed: 3 };
    await p.AT.MetadataRepair.applyMetadataRepairState(store.metadataRepairState);
    respond({ success: true, state: { status: 'running', processed: 1 } }); await wake;
    assert.equal(p.AT.PopupState.lastMetadataRepairState.status, 'completed'); assert.equal(p.timers.length, 0);
    const w = worker(store); await new Promise(resolve => w.c.handlers.RESUME_LIBRARY_REPAIR({}, {}, resolve)); await flush();
    assert.equal(w.calls.length, 0); assert.equal(store.metadataRepairState.status, 'completed');
  });
  await test('automatic observation continues through a pending retry handoff without storage events', async () => {
    const store = { metadataRepairState: { runId: 'old', status: 'running', origin: 'manual', uiMode: 'modal', total: 3, processed: 2 } };
    const p = popup(store, async () => ({ success: true, state: store.metadataRepairState }));
    await p.AT.MetadataRepair.applyMetadataRepairState(store.metadataRepairState);
    store.metadataRepairState = { ...store.metadataRepairState, status: 'completed', processed: 3, followUpPending: true };
    await p.timers.shift().fn(); assert.equal(p.timers.length, 1);
    store.metadataRepairState = { ...store.metadataRepairState, runId: 'retry', status: 'running', followUpPending: false, total: 1, processed: 0 };
    await p.timers.shift().fn(); assert.equal(p.AT.PopupState.lastMetadataRepairState.runId, 'retry');
    store.metadataRepairState = { ...store.metadataRepairState, status: 'completed', processed: 1 };
    await p.timers.shift().fn(); assert.equal(p.timers.length, 0);
  });
  await test('a wake-up restarts a pending manual handoff after its worker is suspended', async () => {
    const store = { animeData: { naruto: {} }, animeinfo_naruto: info(), episodeTypes_naruto: { ...filler(), retryable: true, retryAt: now },
      pendingBackgroundMetadataRepair: true,
      metadataRepairState: { runId: 'old', status: 'completed', followUpPending: true, pendingManualRetry: true, uiMode: 'modal' } };
    const w = worker(store); await w.c.resumeLibraryRepair(); await flush();
    assert.deepEqual(w.calls.map(c => c.slug), ['naruto']); assert.equal(store.metadataRepairState.failed, 0);
    assert.equal(store.metadataRepairState.status, 'completed'); assert.equal(store.metadataRepairState.followUpPending, false);
  });
  await test('historical warnings clear after their caches recover without hiding unresolved failures', async () => {
    const failedAt = now - 10000;
    const store = { metadataRepairState: { status: 'completed', origin: 'manual', uiMode: 'modal', total: 2, processed: 2, failed: 2, cached: 0,
      logs: ['naruto', 'bleach'].map(slug => ({ type: 'retry', slug, name: slug, detail: 'info cached • filler timed out', at: failedAt })) },
      animeinfo_naruto: info(), episodeTypes_naruto: filler(), animeinfo_bleach: info(),
      episodeTypes_bleach: { ...filler(), retryable: true, retryAt: now, retryError: '504' } };
    const p = popup(store, async () => {}); await p.AT.MetadataRepair.syncMetadataRepairStateFromStorage({ ensureOpen: true });
    const displayed = p.rendered.at(-1); assert.equal(displayed.failed, 1);
    assert.equal(displayed.logs[0].type, 'cached'); assert.equal(displayed.logs[1].type, 'retry');
    assert.equal(store.metadataRepairState.failed, 2, 'UI reconciliation cannot overwrite a newer background job');
  });
  await test('an already-visible failure report recovers when fresh metadata arrives later', async () => {
    const store = { metadataRepairState: { runId: 'old', status: 'completed', origin: 'manual', uiMode: 'modal', total: 1, processed: 1, failed: 1,
      logs: [{ type: 'retry', slug: 'naruto', name: 'Naruto', detail: 'filler timed out', at: now - 10000 }] },
      animeinfo_naruto: info(), episodeTypes_naruto: { ...filler(), retryable: true, retryAt: now, retryError: '504' } };
    const p = popup(store, async () => {}); await p.AT.MetadataRepair.syncMetadataRepairStateFromStorage({ ensureOpen: true });
    assert.equal(p.rendered.at(-1).failed, 1);
    store.episodeTypes_naruto = filler(); p.AT.MetadataRepair.applyEpisodeTypesCacheChange('episodeTypes_naruto', store.episodeTypes_naruto);
    assert.equal(p.timers.length, 1); await p.timers.shift().fn(); await flush();
    assert.equal(p.rendered.at(-1).failed, 0); assert.equal(p.timers.length, 0);
  });
  await test('late historical reconciliation cannot replace a newly started import', async () => {
    const old = { runId: 'old', status: 'completed', origin: 'manual', uiMode: 'modal', failed: 1,
      logs: [{ type: 'retry', slug: 'naruto', at: now - 10000 }] };
    const store = { metadataRepairState: old, animeinfo_naruto: info(), episodeTypes_naruto: { ...filler(), retryable: true } };
    const p = popup(store, async () => {}); await p.AT.MetadataRepair.applyMetadataRepairState(old);
    let release; p.AT.Storage.get = () => new Promise(resolve => release = resolve);
    p.AT.MetadataRepair.applyEpisodeTypesCacheChange('episodeTypes_naruto', filler());
    const refresh = p.timers.shift().fn();
    await p.AT.MetadataRepair.applyMetadataRepairState({ runId: 'new', status: 'running', uiMode: 'modal', origin: 'manual' });
    release({ metadataRepairState: old }); await refresh;
    assert.equal(p.AT.PopupState.lastMetadataRepairState.runId, 'new'); assert.equal(p.timers.length, 1);
  });
  await test('failure identities survive the sixty-row log limit so every recovered warning can clear', async () => {
    const store = { animeData: {} };
    for (let i = 0; i < 61; i++) {
      store.animeData[`show${i}`] = {};
      store[`animeinfo_show${i}`] = info(); store[`episodeTypes_show${i}`] = { ...filler(), retryable: true, retryAt: now, retryError: '504' };
    }
    const w = worker(store); await w.c.startLibraryRepair({ origin: 'background', auto: true }); await flush();
    assert.equal(store.metadataRepairState.failed, 61); assert.equal(store.metadataRepairState.logs.length, 60);
    for (let i = 0; i < 61; i++) store[`episodeTypes_show${i}`] = { ...filler(), cachedAt: Date.now() + 1000 };
    const p = popup(store, async () => {}); await p.AT.MetadataRepair.syncMetadataRepairStateFromStorage({ ensureOpen: true });
    assert.equal(p.rendered.at(-1).failed, 0);
  });
  await test('legacy reports with truncated logs clear after every queued snapshot recovers', async () => {
    const store = { metadataRepairState: { status: 'completed', origin: 'manual', uiMode: 'modal', failed: 61, total: 61, processed: 61,
      completedAt: new Date(now - 10000).toISOString(), items: [], logs: [] } };
    for (let i = 0; i < 61; i++) {
      const slug = `show${i}`; store.metadataRepairState.items.push({ slug });
      if (i > 0) store.metadataRepairState.logs.push({ type: 'retry', slug, name: slug, at: now - 10000 });
      store[`animeinfo_${slug}`] = info(); store[`episodeTypes_${slug}`] = filler();
    }
    const p = popup(store, async () => {}); await p.AT.MetadataRepair.syncMetadataRepairStateFromStorage({ ensureOpen: true });
    assert.equal(p.rendered.at(-1).failed, 0);
    store.episodeTypes_show0 = { ...filler(), retryable: true, retryAt: now, retryError: '504' };
    await p.AT.MetadataRepair.syncMetadataRepairStateFromStorage({ ensureOpen: true }); assert.equal(p.rendered.at(-1).failed, 1);
  });
  await test('install defaults cannot overwrite a legacy library migrated from sync storage', async () => {
    const local = { animeinfo_naruto: info(), settings: { watchThreshold: 0.9 } };
    const sync = { animeData: { naruto: { episodes: [{ number: 1 }] } }, videoProgress: { episode: { currentTime: 30 } } };
    const expected = structuredClone(sync);
    const w = installedWorker(local, sync); w.install(); await flush();
    assert.deepEqual(local.animeData, expected.animeData); assert.deepEqual(local.videoProgress, expected.videoProgress);
    assert.equal(local.settings.watchThreshold, 0.9); assert.deepEqual(local.animeinfo_naruto, info());
    assert.equal(Object.keys(sync).length, 0);
  });
  await test('an access-paused queue shows its counters without wake polling or stale restart messages', async () => {
    const state = { runId: 'paused-access', status: 'running', uiMode: 'modal', origin: 'manual', waitingForAccess: true,
      fetchTotal: 119, queueIndex: 48, processed: 48, failed: 34, updatedAt: new Date(now - 600000).toISOString() };
    const messages = [];
    const p = popup({ metadataRepairState: state }, async message => { messages.push(message); });
    await p.AT.MetadataRepair.syncMetadataRepairStateFromStorage({ autoOpenRunning: true });
    assert.equal(p.rendered.at(-1).queueIndex, 48);
    assert.equal(p.timers.length, 0, 'no periodic wake while the user must grant access');
    assert.deepEqual(messages, [], 'a stale timestamp is not a reason to resume without permission');
  });
  await test('an install or update event preserves an existing library, settings, progress and metadata cache', async () => {
    for (const reason of ['install', 'update']) {
      const store = { animeData: { naruto: { episodes: [1] } }, videoProgress: { episode: { currentTime: 30 } }, settings: { watchThreshold: 0.9 },
        animeinfo_naruto: info(), episodeTypes_naruto: filler() }, original = structuredClone(store);
      const w = installedWorker(store, {}); w.install({ reason, previousVersion: '7.5.4' }); await flush();
      for (const key of Object.keys(original)) assert.deepEqual(store[key], original[key], `${reason} changed ${key}`);
    }
  });
  await test('Stop ends a running queue where it is, drops the item in flight and nothing restarts it', async () => {
    const store = { animeData: { one: {}, two: {}, three: {} } };
    const w = worker(store);
    let release;
    w.c.AnimeTrackerAnimeResolver = { resolve: async slug => { w.calls.push({ slug }); await new Promise(resolve => { release = resolve; });
      return { infoResult: { status: 'fetched', entry: info() }, fillerResult: { status: 'fetched', entry: filler() } }; } };
    await w.c.startLibraryRepair({ origin: 'manual', auto: false }); await flush();
    assert.equal(w.calls.length, 1, 'the first item is in flight');
    const response = await new Promise(resolve => w.c.handlers.STOP_LIBRARY_REPAIR({}, {}, resolve));
    assert.equal(response.success, true);
    assert.equal(response.state.status, 'completed'); assert.equal(response.state.stopped, true);
    release(); await flush();
    assert.deepEqual(w.calls.map(c => c.slug), ['one'], 'no item after Stop');
    assert.equal(store.metadataRepairState.stopped, true);
    assert.equal(store.metadataRepairState.processed, 0, 'the item in flight is not counted into a stopped run');
    assert.equal(store.pendingBackgroundMetadataRepair, false);
    await w.c.resumeLibraryRepair({ checkAccess: true }); await w.c.maybeStartPendingMetadataRepair(); await flush();
    assert.deepEqual(w.calls.map(c => c.slug), ['one'], 'a later wake-up or grant does not restart it');
  });
  await test('Stop also ends a queue paused for website access, so a later grant does not resume it', async () => {
    const store = { metadataRepairState: { runId: 'paused-access', status: 'running', uiMode: 'modal', origin: 'manual', waitingForAccess: true,
      blockedOrigins: ['https://www.animefillerlist.com/*'], pendingManualRetry: true, items: [{ slug: 'one' }, { slug: 'two' }],
      fetchTotal: 2, queueIndex: 0, processed: 0, failed: 0, updatedAt: new Date().toISOString() }, pendingBackgroundMetadataRepair: true };
    const w = worker(store);
    const response = await new Promise(resolve => w.c.handlers.STOP_LIBRARY_REPAIR({}, {}, resolve));
    assert.equal(response.state.status, 'completed');
    assert.equal(response.state.waitingForAccess, false); assert.equal(response.state.pendingManualRetry, false);
    await w.c.resumeLibraryRepair({ checkAccess: true }); await w.c.maybeStartPendingMetadataRepair(); await flush();
    assert.deepEqual(w.calls, []);
  });
  await test('the popup Stop asks the worker and shows the stopped run', async () => {
    const store = { animeData: { one: {}, two: {} } };
    const w = worker(store, () => new Promise(() => {}));
    await w.c.startLibraryRepair({ origin: 'manual', auto: false }); await flush();
    const p = popup(store, message => new Promise(resolve => w.c.handlers[message.type](message, {}, resolve)));
    await p.AT.MetadataRepair.stopFetch();
    assert.equal(p.rendered.at(-1).stopped, true);
    assert.equal(p.rendered.at(-1).status, 'completed');
  });
  await test('a run the user hid is not thrown back up when the popup opens again', async () => {
    const state = { runId: 'hidden-run', status: 'running', uiMode: 'modal', origin: 'manual', fetchTotal: 9, queueIndex: 2, processed: 2,
      updatedAt: new Date().toISOString() };
    for (const hidden of [false, true]) {
      const p = popup({ metadataRepairState: state }, async () => ({ success: true }));
      let opened = 0;
      Object.assign(p.AT.FillerFetchUI, { state: { isOpen: false }, open: async () => { opened++; }, isHiddenRun: runId => hidden && runId === 'hidden-run' });
      await p.AT.MetadataRepair.syncMetadataRepairStateFromStorage({ autoOpenRunning: true });
      assert.equal(opened, hidden ? 0 : 1);
    }
  });
  process.exitCode = failures ? 1 : 0;
})();
