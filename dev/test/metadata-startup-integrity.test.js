const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
const HOUR = 3600000, now = Date.UTC(2026, 9, 3, 16);
const background = read('background.js');
const cleanupStart = background.indexOf('async function sanitizeDiscontinuedJikanCaches()');
const cleanup = cleanupStart < 0 ? '' : background.slice(cleanupStart, background.indexOf('chrome.runtime.onInstalled.addListener'));
const installation = background.slice(background.indexOf('chrome.runtime.onInstalled.addListener'), background.indexOf('chrome.runtime.onStartup.addListener'));
const startup = background.slice(background.indexOf('chrome.runtime.onStartup.addListener'), background.indexOf('chrome.runtime.onConnect.addListener'));
const settle = async () => { for (let i = 0; i < 25; i++) await new Promise(setImmediate); };
function worker(initial = {}, response = 'abort') {
  const store = structuredClone(initial), calls = [], writes = [], timers = [], alarms = [], queued = new Set();
  let time = now, onStartup, onInstalled;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } }
  const c = vm.createContext({ Date: Clock, console, AbortController, navigator: { userAgent: 'iPhone', platform: 'iPhone' },
    setTimeout(fn, ms) { const token = {}; timers.push(ms); queued.add(token); queueMicrotask(() => { if (queued.delete(token)) fn(); }); return token; }, clearTimeout: token => queued.delete(token),
    bgStorageGet: async keys => structuredClone(keys === null ? store : Object.fromEntries(keys.filter(key => key in store).map(key => [key, store[key]]))),
    bgStorageSet: async patch => { writes.push(structuredClone(patch)); Object.assign(store, structuredClone(patch)); },
    bgStorageRemove: async keys => keys.forEach(key => delete store[key]),
    fetch(url, options) {
      // MyAnimeList, tried when Jikan fails, is down here too, so Jikan's failure is the one that stands.
      if (url.startsWith('https://myanimelist.net/')) return Promise.reject(new TypeError('Load failed'));
      calls.push(url); assert.ok(url.startsWith('https://api.jikan.moe/'), url);
      if (response === '503') return Promise.resolve({ ok: false, status: 503 });
      return new Promise((resolve, reject) => { const abort = () => { const error = Error('aborted'); error.name = 'AbortError'; reject(error); };
        if (options.signal.aborted) abort(); else options.signal.addEventListener('abort', abort, { once: true }); }); },
    chrome: { runtime: { onStartup: { addListener: fn => onStartup = fn }, onInstalled: { addListener: fn => onInstalled = fn }, getManifest: () => ({ version: '8.0.3' }) },
      alarms: { create: (name, options) => alarms.push({ name, options }), clear: async () => true }, tabs: { query: async () => [] } },
    dlog() {}, migrateFromSyncToLocal: async () => {}, reconcileSmartNotificationAlarm: async () => {}, ensureLibraryAutoRefreshAlarm() {}, ensureAiringScheduleAlarm() {},
    reapOrphanAn1meGatewayTab: async () => {}, LIBRARY_STARTUP_CATCHUP_ALARM: 'libraryStartupCatchup', getFirebaseUser: async () => null,
    websiteAccessAllowed: async () => true,
  }); c.self = c;
  for (const file of ['src/common/utils.js', 'src/common/data/title-match.js', 'src/common/data/cache-policy.js', 'src/common/data/merge-utils.js']) vm.runInContext(read(file), c);
  vm.runInContext('const isLikelyMovieSlug = AnimeTrackerMergeUtils.isLikelyMovieSlug;', c);
  for (const file of ['src/background/fetchers/filler-discovery.js', 'src/background/jobs/metadata-repair.js', 'src/background/anime-resolver.js']) vm.runInContext(read(file), c);
  vm.runInContext(cleanup + installation + startup, c);
  return { c, store, calls, writes, timers, alarms, startup: () => onStartup(), upgrade: () => onInstalled({ reason: 'update', previousVersion: '8.0.2' }), advance: ms => time += ms };
}
const info = title => ({ title, totalEpisodes: 28, latestEpisode: 12, status: 'RELEASING', schemaVersion: 5, cachedAt: now });
const prior = () => ({ canon: [1,3,4], filler: [2,5], mixed: [], anime_canon: [], totalEpisodes: 28, schemaVersion: 3, cachedAt: now - 25 * HOUR, _source: 'jikan' });
function seed() {
  const c = vm.createContext({ console }); c.self = c;
  vm.runInContext(read('src/common/utils.js'), c); vm.runInContext(read('src/background/fetchers/filler-discovery.js'), c);
  const shows = c.parseAflShowIndex(read('dev/test/fixtures/animefillerlist-shows.html'));
  return { afl_show_index: { schemaVersion: 1, cachedAt: now, shows }, animeinfo_sousou_no_frieren: info('Sousou no Frieren'),
    'animeinfo_sousou-no-frieren': info('Sousou no Frieren'), 'episodeTypes_sousou-no-frieren': prior(),
    animeinfo_audit_unlisted: info('Audit Unlisted Show'), episodeTypes_audit_unlisted: prior(), malIdForSlugBundle: {},
    animeData: { 'sousou-no-frieren': { title: 'Sousou no Frieren', episodes: [{ number: 1, duration: 1200, watchedAt: '2026-10-01T10:00:00Z' }] } },
    videoProgress: { 'sousou-no-frieren__episode-2': { currentTime: 321, duration: 1400, updatedAt: '2026-10-03T10:00:00Z' } } };
}
let failures = 0;
async function test(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message); } }
(async () => {
  for (const knownMal of [false, true]) await test((knownMal ? 'episode' : 'search') + ' timeout and circuit-open retain filler and watched/resume data', async () => {
    const initial = seed(); if (knownMal) initial.malIdForSlugBundle['sousou-no-frieren'] = { malId: 52991, matched: true, cachedAt: now };
    const h = worker(initial), progress = structuredClone({ animeData: initial.animeData, videoProgress: initial.videoProgress });
    const result = await h.c.AnimeTrackerAnimeResolver.resolve('sousou-no-frieren', { title: 'Sousou no Frieren', includeEpisodeTypes: true });
    assert.equal(result.fillerResult.status, 'failed'); assert.equal(result.errors.length, 1);
    assert.deepEqual(h.store['episodeTypes_sousou-no-frieren'].filler, [2,5]);
    assert.equal(h.store['episodeTypes_sousou-no-frieren'].notFound, undefined);
    assert.equal(h.store['episodeTypes_sousou-no-frieren'].retryable, true);
    // One timeout is the ordinary short retry, not a closed Jikan; a second in a row pauses Jikan for minutes.
    assert.equal(h.c.AnimeTrackerCachePolicy.fillerRefreshAt(h.store['episodeTypes_sousou-no-frieren']) - now, 15 * 60000);
    const second = await h.c.AnimeTrackerAnimeResolver.resolve('audit_unlisted', { title: 'Audit Unlisted Show', includeEpisodeTypes: true });
    assert.equal(second.fillerResult.status, 'failed'); assert.deepEqual(h.store.episodeTypes_audit_unlisted.filler, [2,5]);
    assert.equal(h.calls.length, 2, 'a single timeout does not stop the next lookup');
    const third = await h.c.AnimeTrackerAnimeResolver.resolve('sousou-no-frieren', { title: 'Sousou no Frieren', includeEpisodeTypes: true, forceFillerRefresh: true });
    assert.equal(third.fillerResult.status, 'failed'); assert.deepEqual(h.store['episodeTypes_sousou-no-frieren'].filler, [2,5]);
    assert.equal(h.calls.length, 2, 'two timeouts in a row pause Jikan: no further request');
    assert.deepEqual({ animeData: h.store.animeData, videoProgress: h.store.videoProgress }, progress);
  });
  for (const event of ['startup', 'upgrade']) await test(event + ' preserves transient positive caches and interrupted queue', async () => {
    const initial = seed(); initial['episodeTypes_sousou-no-frieren'] = { ...prior(), retryable: true, retryAt: now, retryError: 'jikan_search_http_503' };
    initial.metadataRepairState = { runId: 'manual:interrupted', status: 'running', origin: 'manual', uiMode: 'modal', total: 3, processed: 1, queueIndex: 1,
      failed: 0, fetched: 0, cached: 1, skipped: 0, logs: [], items: [{ slug: 'completed' }, { slug: 'pending-a', title: 'Pending A' }, { slug: 'pending-b', title: 'Pending B' }], updatedAt: new Date(now).toISOString() };
    const preserved = structuredClone(initial), h = worker(initial);
    h[event](); await settle();
    assert.deepEqual(h.store['episodeTypes_sousou-no-frieren'], preserved['episodeTypes_sousou-no-frieren']);
    assert.deepEqual(h.store.metadataRepairState, preserved.metadataRepairState);
    assert.deepEqual(h.store.animeData, preserved.animeData); assert.deepEqual(h.store.videoProgress, preserved.videoProgress);
    const resumed = [];
    h.c.AnimeTrackerAnimeResolver = { resolve: async slug => { resumed.push(slug); return { infoResult: { status: 'cached', entry: info(slug) }, fillerResult: { status: 'cached', entry: prior() } }; } };
    await h.c.resumeMetadataRepairIfNeeded(); await settle();
    assert.deepEqual(resumed, ['pending-a','pending-b']); assert.equal(h.store.metadataRepairState.runId, 'manual:interrupted');
    assert.equal(h.store.metadataRepairState.status, 'completed'); assert.equal(h.store.metadataRepairState.processed, 3);
    assert.deepEqual(h.store.animeData, preserved.animeData); assert.deepEqual(h.store.videoProgress, preserved.videoProgress);
  });
  await test('only uncertain old negative entries become stale; positive and confirmed new negatives stay fresh', () => {
    const h = worker(), p = h.c.AnimeTrackerCachePolicy;
    const base = { schemaVersion: 3, cachedAt: now };
    assert.equal(p.isFillerFresh({ ...base, notFound: true, negativeCacheVersion: 1 }), false);
    // 8.2.17 on an iPhone wrote "not listed" for shows whose MyAnimeList phone page it could not read.
    assert.equal(p.isFillerFresh({ ...base, notFound: true, negativeCacheVersion: 2 }), false);
    assert.equal(p.isFillerFresh({ ...base, notFound: true, negativeCacheVersion: 3 }), true);
    assert.equal(p.isFillerFresh({ ...base, canon: [1], filler: [] }), true);
  });
  process.exitCode = failures ? 1 : 0;
})();
