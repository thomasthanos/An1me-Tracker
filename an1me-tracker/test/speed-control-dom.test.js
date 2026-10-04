// Exercise real HTMLVideoElement rate/volume events, pointer cancellation and DOM cleanup.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; console.log('SKIP speed player DOM: expose Playwright via NODE_PATH'); process.exit(0); }
const root = path.resolve(__dirname, '..');
const modulePath = path.join(root, 'src/content/player/speed-control.js');
assert.ok(fs.existsSync(modulePath), 'SpeedControl module must exist');
const candidates = [process.env.AT_TEST_BROWSER,
  ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap(dir => [path.join(dir, 'Microsoft/Edge/Application/msedge.exe'), path.join(dir, 'Google/Chrome/Application/chrome.exe')]),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
const executablePath = candidates.find(file => fs.existsSync(file));
function setup(mobile) {
  window.testMobile = mobile; window.testWrites = []; window.testIntervals = 0;
  const interval = window.setInterval;
  window.setInterval = (...args) => { window.testIntervals++; return interval(...args); };
  window.testStore = {}; window.testStorageListeners = new Set(); window.testVideoSubscribers = new Set();
  window.testDeliveryQueue = [];
  const get = keys => Object.fromEntries(keys.filter(key => key in window.testStore).map(key => [key, structuredClone(window.testStore[key])]));
  window.chrome = { runtime: { lastError: null, sendMessage(message, callback) {
    window.testWrites.push(structuredClone(message));
    const deliver = () => {
    const preferences = window.AnimeTrackerSpeedPreferences.patch(window.testStore.speedControlPreferences, message.patch, message.mobile);
    const oldValue = window.testStore.speedControlPreferences; window.testStore.speedControlPreferences = preferences;
    for (const listener of window.testStorageListeners) listener({ speedControlPreferences: { oldValue, newValue: preferences } }, 'local');
    const result = { success: true, preferences }; if (callback) queueMicrotask(() => callback(result)); else return Promise.resolve(result);
    };
    if (window.testDelayWrites) { window.testDeliveryQueue.push(deliver); return; }
    return deliver();
  } }, storage: { local: { get(keys, callback) { const data = get(keys); if (callback) queueMicrotask(() => callback(data)); else return Promise.resolve(data); } },
    onChanged: { addListener: listener => window.testStorageListeners.add(listener), removeListener: listener => window.testStorageListeners.delete(listener) } } };
  window.AnimeTrackerUtils = { isMobileDevice: () => mobile };
  window.AnimeTrackerContent = { Storage: { get: async keys => get(keys) },
    PlayerObserver: { getVideo: () => window.testVideo, on(name, listener) {
      if (name !== 'video') throw Error('Use existing video subscription');
      window.testVideoSubscribers.add(listener); if (window.testVideo) listener(window.testVideo);
      return () => window.testVideoSubscribers.delete(listener);
    } } };
  window.testBind = video => { window.testVideo = video; for (const listener of window.testVideoSubscribers) listener(video); };
  window.testMakeVideo = () => {
    const host = document.createElement('div'); host.className = 'art-video-player'; host.style.cssText = 'position:relative;width:390px;height:240px';
    host.innerHTML = '<video class="art-video" style="width:100%;height:100%"></video><div class="art-controls-right"></div>';
    document.body.append(host); const video = host.querySelector('video');
    Object.defineProperty(video, 'readyState', { configurable: true, get: () => 1 });
    video.playbackRate = 1.25; video.volume = .7; video.muted = false; return video;
  };
  window.testBind(window.testMakeVideo());
}
async function exercise(mobile) {
  const S = window.AnimeTrackerContent.SpeedControl, results = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const equal = (a, b, message) => { if (a !== b) throw Error(`${message}: ${a} !== ${b}`); };
  const key = (type, code, repeat = false, target = document) => target.dispatchEvent(new KeyboardEvent(type, { key: code, code, repeat, bubbles: true, cancelable: true }));
  const pointer = (type, id = 1) => document.querySelector('.at-speed-button').dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', bubbles: true, cancelable: true }));
  const patch = async value => { await chrome.runtime.sendMessage({ type: 'UPDATE_SPEED_CONTROL_PREFERENCES', patch: value, mobile }); await wait(20); };
  async function test(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
  await test('new storage events beat an older pending initial read', async () => {
    const get = AnimeTrackerContent.Storage.get; let reply;
    AnimeTrackerContent.Storage.get = () => new Promise(resolve => { reply = resolve; });
    const starting = S.start();
    await patch({ normalRate: 2 });
    reply({ speedControlPreferences: { normalRate: 1.25 } }); await starting; await wait(20);
    equal(testVideo.playbackRate, 2, 'latest stored selection wins');
    S.stop(); AnimeTrackerContent.Storage.get = get; testStore.speedControlPreferences = undefined;
    testWrites.length = 0; testVideo.playbackRate = 1.25; await wait(20);
  });
  await S.start(); await wait(30);
  await test('initial defaults preserve player rate and audio without writing', async () => {
    equal(testVideo.playbackRate, 1.25, 'unset normal leaves player untouched'); equal(testWrites.length, 0, 'no default writes');
    equal(testVideo.volume, .7, 'native volume untouched'); equal(testIntervals, 0, 'no permanent polling');
    const rect = document.querySelector('.at-speed-button').getBoundingClientRect();
    equal(rect.width >= 44 && rect.height >= 44, true, '44px touch target');
    equal(!!document.querySelector('.at-speed-button svg'), true, 'vector icon');
  });
  if (!mobile) {
    await test('F7 repeat, F8 repeat and combined toggle restore precisely', async () => {
      key('keydown', 'F7'); key('keydown', 'F7', true); await wait(10); equal(testVideo.playbackRate, 4, 'held boost');
      key('keydown', 'F8'); key('keydown', 'F8', true); key('keyup', 'F7'); equal(testVideo.playbackRate, 4, 'toggle survives hold release');
      window.dispatchEvent(new Event('blur')); equal(testVideo.playbackRate, 4, 'intentional toggle survives blur');
      key('keydown', 'F8'); await wait(20); equal(testVideo.playbackRate, 1.25, 'normal restored'); equal(testWrites.length, 0, 'boost never stored');
      key('keydown', 'F7'); window.dispatchEvent(new Event('blur')); equal(testVideo.playbackRate, 1.25, 'blur cancels hold');
      const input = document.createElement('input'); document.body.append(input); key('keydown', 'F8', false, input); equal(testVideo.playbackRate, 1.25, 'typing does not toggle'); input.remove();
    });
    await test('real normal/audio changes save once and programmatic events do not echo', async () => {
      testVideo.playbackRate = 1.5; await wait(40); equal(testStore.speedControlPreferences.normalRate, 1.5, 'user rate persisted');
      await patch({ normalRate: 1 }); const count = testWrites.length; await wait(350); equal(testVideo.playbackRate, 1, 'saved 1x reapplied'); equal(testWrites.length, count, 'no storage echo');
      testVideo.volume = .45; testVideo.muted = true; await wait(380); equal(testStore.speedControlPreferences.defaultVolume, .45, 'volume persisted'); equal(testStore.speedControlPreferences.defaultMuted, true, 'mute persisted');
      const writes = testWrites.length; testVideo.dispatchEvent(new Event('volumechange')); await wait(380); equal(testWrites.length, writes, 'identical audio does not write');
    });
  } else {
    await test('short tap menu and long hold release/cancel keep actual normal speed', async () => {
      pointer('pointerdown'); pointer('pointerup'); document.querySelector('.at-speed-button').click();
      equal(document.querySelector('.at-speed-menu').hidden, false, 'short tap opens menu');
      const rates = [...document.querySelectorAll('[data-speed-rate]')].map(node => Number(node.dataset.speedRate));
      equal(JSON.stringify(rates), '[1,1.25,1.5,2]', 'mobile rates');
      document.querySelector('[data-speed-rate="1.5"]').click(); await wait(30); equal(testVideo.playbackRate, 1.5, 'normal selected');
      const before = testWrites.length; pointer('pointerdown'); await wait(340); equal(testVideo.playbackRate, 2, 'hold2x');
      pointer('pointerup'); await wait(20); equal(testVideo.playbackRate, 1.5, 'release returns1.5x'); equal(testWrites.length, before, 'temporary2x not stored');
      pointer('pointerdown'); await wait(340); pointer('pointercancel'); equal(testVideo.playbackRate, 1.5, 'cancel restores');
      pointer('pointerdown'); await wait(340); window.dispatchEvent(new Event('blur')); equal(testVideo.playbackRate, 1.5, 'blur restores');
      pointer('pointerdown'); await wait(340); pointer('lostpointercapture'); equal(testVideo.playbackRate, 1.5, 'next gesture works after interrupted hold');
      pointer('pointerdown'); await wait(340); testVideo.dispatchEvent(new Event('webkitbeginfullscreen')); equal(testVideo.playbackRate, 1.5, 'native fullscreen cancels temporary hold');
      equal(document.querySelector('.at-speed-control').hidden, true, 'native controls remain owned by Safari');
      testVideo.dispatchEvent(new Event('webkitendfullscreen')); equal(document.querySelector('.at-speed-control').hidden, false, 'inline control returns');
      testVideo.volume = .2; testVideo.muted = true; await wait(380); equal(testWrites.length, before, 'phone audio not persisted');
      key('keydown', 'F8'); equal(testVideo.playbackRate, 1.5, 'desktop shortcut absent on mobile');
    });
  }
  await test('server rebind drops previous video, restores boost and keeps one control', async () => {
    const previous = testVideo; const base = previous.playbackRate;
    if (!mobile) key('keydown', 'F7'); else { pointer('pointerdown'); await wait(340); }
    S.resetForServerSwitch(); equal(previous.playbackRate, base, 'old boost restored');
    previous.parentElement.remove(); const fresh = testMakeVideo(); testBind(fresh); await wait(30);
    equal(document.querySelectorAll('.at-speed-control').length, 1, 'one UI after server change');
    const before = testWrites.length; previous.playbackRate = 1.75; previous.volume = .1; await wait(380); equal(testWrites.length, before, 'old listeners removed');
    equal(fresh.playbackRate, testStore.speedControlPreferences.normalRate, 'preference applies to new video');
  });
  await test('rapid return to saved normal speed survives delayed writes', async () => {
    await patch({ normalRate: 1 }); testWrites.length = 0; window.testDelayWrites = true;
    const button = document.querySelector('.at-speed-button');
    button.click(); document.querySelector('[data-speed-rate="1.5"]').click();
    button.click(); document.querySelector('[data-speed-rate="1"]').click();
    equal(testDeliveryQueue.length, 2, 'latest choice queued even when it matches older confirmed speed');
    testDeliveryQueue.shift()(); await wait(20); equal(testVideo.playbackRate, 1, 'older acknowledgement cannot overwrite latest choice');
    testDeliveryQueue.shift()(); await wait(20); equal(testStore.speedControlPreferences.normalRate, 1, 'final saved1x');
    window.testDelayWrites = false;
    await patch({ normalRate: 1.5 });
  });
  await test('real same-element media load reset cannot overwrite normal preference', async () => {
    await patch({ normalRate: 1.5 }); const before = testWrites.length;
    delete testVideo.readyState; testVideo.load(); await wait(30);
    equal(testVideo.readyState, 0, 'real unloaded media element');
    equal(testStore.speedControlPreferences.normalRate, 1.5, 'browser load reset is not a user preference');
    equal(testWrites.length, before, 'loading reset produces no write');
    Object.defineProperty(testVideo, 'readyState', { configurable: true, get: () => 1 });
    testVideo.dispatchEvent(new Event('loadedmetadata')); await wait(20);
    equal(testVideo.playbackRate, 1.5, 'remembered speed restored when new source is ready');
    equal(testWrites.length, before, 'metadata application produces no echo');
  });
  await test('late controls and replaced control rows reuse the same widget', async () => {
    const host = testVideo.parentElement, widget = document.querySelector('.at-speed-control');
    host.querySelector('.art-controls-right').remove(); await wait(200);
    equal(widget.parentElement, host, 'fallback wrapper');
    const controls = document.createElement('div'); controls.className = 'art-controls-right'; host.append(controls); await wait(200);
    equal(widget.parentElement, controls, 'late player controls');
    controls.replaceChildren(); await wait(200); equal(widget.parentElement, controls, 'replacement controls remounted');
    equal(document.querySelectorAll('.at-speed-control').length, 1, 'no duplicate UI');
  });
  await test('rejected setter reports the actual rate and never stores rejected choice', async () => {
    const actual = testVideo.playbackRate, before = testWrites.length;
    Object.defineProperty(testVideo, 'playbackRate', { configurable: true, get: () => actual, set: () => { throw new DOMException('Rejected', 'NotSupportedError'); } });
    document.querySelector('.at-speed-button').click(); const option = document.querySelector('[data-speed-rate="2"]'); option.click(); await wait(30);
    equal(testVideo.playbackRate, actual, 'truthful actual rate'); equal(testWrites.length, before, 'rejected choice not stored');
    equal(document.querySelector('.at-speed-status').textContent.length > 0, true, 'visible feedback');
    delete testVideo.playbackRate;
  });
  await test('disabled and stopped modes remove controls, key/video listeners and observation', async () => {
    await patch({ enabled: false }); equal(document.querySelectorAll('.at-speed-control').length, 0, 'disabled removes UI');
    equal(AnimeTrackerContent.PageEvents.stats().domSubscribers, 0, 'disabled no DOM work');
    const rate = testVideo.playbackRate, before = testWrites.length; key('keydown', 'F8'); testVideo.volume = .3; await wait(380);
    equal(testVideo.playbackRate, rate, 'disabled keys do nothing'); equal(testWrites.length, before, 'disabled no preference writes');
    await patch({ enabled: true }); equal(document.querySelectorAll('.at-speed-control').length, 1, 'reenable current player');
    S.stop(); equal(document.querySelectorAll('.at-speed-control').length, 0, 'stop removes UI');
    equal(testVideoSubscribers.size, 0, 'no video subscriptions'); equal(AnimeTrackerContent.PageEvents.stats().storageSubscribers, 0, 'no storage subscriptions');
    equal(AnimeTrackerContent.PageEvents.stats().domSubscribers, 0, 'no DOM subscriptions'); equal(document.querySelectorAll('#at-speed-control-style').length, 0, 'style cleanup');
  });
  await test('accessible iframe owns its controls, shortcut and style cleanup', async () => {
    const previous = testVideo;
    const frame = document.createElement('iframe'); document.body.append(frame);
    const doc = frame.contentDocument;
    doc.body.innerHTML = '<div class="plyr" style="width:390px;height:240px"><video style="width:100%;height:100%"></video><div class="plyr__controls"></div></div>';
    const video = doc.querySelector('video'); Object.defineProperty(video, 'readyState', { get: () => 1 });
    video.playbackRate = 1.25; video.volume = .7; video.muted = false;
    testBind(video); await S.start(); await wait(30);
    equal(doc.querySelectorAll('.at-speed-control').length, 1, 'iframe UI mounted');
    equal(document.querySelectorAll('.at-speed-control').length, 0, 'top page has no duplicate');
    equal(doc.querySelector('.at-speed-control').parentElement.className, 'plyr__controls', 'Plyr control host');
    if (!mobile) { key('keydown', 'F7', false, doc); equal(video.playbackRate, 4, 'iframe shortcut'); key('keyup', 'F7', false, doc); }
    else { equal(video.volume, .7, 'iframe phone volume untouched'); equal(video.muted, false, 'iframe phone mute untouched'); }
    equal(video.playbackRate, testStore.speedControlPreferences.normalRate, 'iframe normal restored');
    S.stop(); equal(doc.querySelectorAll('.at-speed-control,#at-speed-control-style').length, 0, 'iframe cleanup');
    frame.remove(); testBind(previous);
  });
  return results;
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1180, height: 800 } }); const errors = [];
      page.on('pageerror', error => errors.push(error.message)); await page.setContent('<!doctype html><body>'); await page.evaluate(setup, mobile);
      for (const file of ['src/common/data/speed-preferences.js', 'src/content/lib/page-events.js', 'src/content/player/speed-control.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
      const results = await page.evaluate(exercise, mobile);
      for (const result of results) { console.log(`${result.passed ? 'PASS' : 'FAIL'} ${mobile ? 'mobile' : 'desktop'} ${result.name}`); if (!result.passed) console.error(result.error); }
      assert.equal(results.filter(result => !result.passed).length, 0); assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
