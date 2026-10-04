const assert = require('node:assert/strict');
const vm = require('node:vm');
const { cloudWorker } = require('./lib/cloud-worker-harness');
(async () => {
  const worker = cloudWorker({ animeData: { stable: { episodes: [] } }, videoProgress: { stable: { currentTime: 360 } },
    libraryMutationRevision: 17, fillerCache: { stable: [1, 2] } });
  await new Promise(resolve => setTimeout(resolve, 10)); // unrelated worker bootstrap migrations
  const before = JSON.stringify(worker.store);
  let writes = 0;
  const storageSet = worker.context.chrome.storage.local.set;
  worker.context.chrome.storage.local.set = (...args) => { writes++; return storageSet(...args); };
  assert.equal(vm.runInContext('typeof messageHandlers.UPDATE_SPEED_CONTROL_PREFERENCES', worker.context), 'function', 'worker exposes the local preference writer');
  const [rate, audio] = await Promise.all([
    worker.request('UPDATE_SPEED_CONTROL_PREFERENCES', { patch: { normalRate: 1.5 }, mobile: false }),
    worker.request('UPDATE_SPEED_CONTROL_PREFERENCES', { patch: { defaultVolume: .4, defaultMuted: false }, mobile: false }),
  ]);
  assert.equal(rate.success, true); assert.equal(audio.success, true);
  assert.equal(worker.store.speedControlPreferences.normalRate, 1.5);
  assert.equal(worker.store.speedControlPreferences.defaultVolume, .4, 'concurrent partial edits merge');
  const afterUpdates = writes;
  await worker.request('UPDATE_SPEED_CONTROL_PREFERENCES', { patch: { normalRate: 1.5 }, mobile: false });
  assert.equal(writes, afterUpdates, 'same value produces no storage write');
  const invalid = await worker.request('UPDATE_SPEED_CONTROL_PREFERENCES', { patch: { normalRate: 8 }, mobile: true });
  assert.equal(invalid.success, false);
  assert.equal(writes, afterUpdates, 'invalid value produces no storage write');
  const mobile = await worker.request('UPDATE_SPEED_CONTROL_PREFERENCES', { patch: { normalRate: 1.25 }, mobile: true });
  assert.equal(mobile.preferences.boostRate, 2); assert.equal(mobile.preferences.defaultVolume, null);
  const { speedControlPreferences, ...rest } = worker.store;
  assert.equal(JSON.stringify(rest), before, 'no library revision, progress or cache writes');
  assert.equal(worker.requests.length, 0, 'no network requests');
  console.log('PASS serialized local speed preferences, mobile validation and protected data');
})().catch(error => { console.error(error); process.exitCode = 1; });
