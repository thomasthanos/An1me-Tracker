const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
test('paused auth refresh keeps the stored user and tokens without automatic warnings', async () => {
  const user = { uid: 'phone', email: 'test@example.invalid' };
  const tokens = { idToken: 'old', refreshToken: 'valid-refresh', expiresAt: 1 };
  const store = { firebase_user: user, firebase_tokens: tokens }, logs = [];
  const context = vm.createContext({ console, setTimeout, clearTimeout, Date,
    firebaseConfig: { apiKey: 'public-test-config' },
    chrome: { runtime: { getManifest: () => ({}) }, storage: { local: { get: async keys => Object.fromEntries(keys.map(key => [key, store[key]])) }, onChanged: { addListener() {} } } },
    AnimeTrackerAuthTokens: { migrateTokensIfNeeded: async () => {} },
    PopupLogger: { log() {}, warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    AnimeTracker: { AuthEnv: { getRedirectUrl: () => null },
      sendRuntimeRequest: async () => ({ success: false, paused: true, queued: true, error: 'SITE_ACCESS_REQUIRED', tokens: null }) } });
  context.window = context;
  vm.runInContext(source('src/popup/services/firebase-lib.js'), context);
  assert.deepEqual(await context.FirebaseLib.init(), user);
  assert.equal(await context.FirebaseLib.getIdToken(), null);
  assert.equal(logs.length, 0);
  assert.deepEqual(store.firebase_tokens, tokens); assert.deepEqual(store.firebase_user, user);
  assert.equal((await context.AnimeTracker.FirebaseSync.saveToCloud(null, true)).paused, true);
});
test('slug migration never consumes a cooldown while permission checks are paused or revoked mid-probe', async () => {
  for (const initiallyPaused of [true, false]) {
    const store = { animeData: { 'old-slug': { title: 'New Title', episodes: [] } }, animeinfo_old_slug: { notFound: true },
      'animeinfo_old-slug': { notFound: true } };
    let paused = initiallyPaused, calls = 0;
    const context = vm.createContext({ console: { log() {}, warn() {} }, setTimeout, clearTimeout, Date,
      AnimeTrackerUtils: { sleep: async () => {}, slugify: title => String(title || '').toLowerCase().replace(/ /g, '-') },
      AnimeTrackerWebsiteAccess: { isPaused: () => paused, canRun: async () => !paused,
        deniedError: () => Object.assign(new Error('Website access required'), { code: 'SITE_ACCESS_REQUIRED' }) },
      AnimeTracker: { Storage: { get: async keys => Object.fromEntries(keys.filter(key => key in store).map(key => [key, store[key]])),
        set: async patch => Object.assign(store, patch) } },
      chrome: { runtime: { sendMessage(_message, callback) { calls++; paused = true; callback({ paused: true, error: 'SITE_ACCESS_REQUIRED' }); } } } });
    context.window = context;
    vm.runInContext(source('src/common/data/slug-migration.js'), context);
    const result = await context.AnimeTrackerSlugMigration.migrate({ force: true });
    assert.equal(result.paused, true); assert.equal(calls, initiallyPaused ? 0 : 1);
    assert.equal(store._slugMigrationStateV1, undefined, 'permission denial is never a 24-hour/weekly retry stamp');
    assert.equal(store.animeData['old-slug'].title, 'New Title');
  }
});
