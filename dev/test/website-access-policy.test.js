const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../src/common/website-access.js'), 'utf8');
const A = 'https://api.jikan.moe/*', B = 'https://firestore.googleapis.com/*';
function policy({ blocked = [], promiseOnly = false, content = false, fetchImpl = async () => new Response('ok') } = {}) {
  const denied = new Set(blocked), added = new Set(), removed = new Set(), calls = [];
  const event = listeners => ({ addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) });
  const runtime = { getManifest: () => ({ version: 'test', host_permissions: [], optional_host_permissions: [A, B] }) };
  const permissions = { onAdded: event(added), onRemoved: event(removed), contains(details, callback) {
    calls.push(details.origins); const granted = details.origins.every(origin => !denied.has(origin));
    if (promiseOnly) { assert.equal(arguments.length, 1); return Promise.resolve(granted); }
    queueMicrotask(() => callback(granted));
  } };
  const context = vm.createContext({ console, URL, AbortController, Request, Response, ReadableStream, setTimeout, clearTimeout,
    fetch: fetchImpl, chrome: { runtime, ...(promiseOnly ? {} : { permissions }) },
    ...(promiseOnly ? { browser: { permissions, runtime } } : {}), ...(content ? { document: {} } : {}) });
  vm.runInContext(source, context);
  return { context, api: context.AnimeTrackerWebsiteAccess, calls, denied, added, removed,
    add(origins) { origins.forEach(origin => denied.delete(origin)); added.forEach(fn => fn({ origins })); },
    remove(origins) { origins.forEach(origin => denied.add(origin)); removed.forEach(fn => fn({ origins })); } };
}
test('all hosts must be granted with callback and promise-only APIs; partial grants remain paused', async () => {
  for (const promiseOnly of [false, true]) {
    const p = policy({ promiseOnly, blocked: [A, B] });
    assert.equal(await p.api.canRun(), false);
    await assert.rejects(p.context.fetch(A), { code: 'SITE_ACCESS_REQUIRED' });
    p.add([A]); await p.api.refresh(); assert.equal(await p.api.canRun(), false);
    p.add([B]); await p.api.refresh(); assert.equal(await p.api.canRun(), true);
    assert.equal(await (await p.context.fetch(B)).text(), 'ok');
  }
});
test('unrelated permissions and a grant while already allowed do not cancel valid requests', async () => {
  let signal;
  const p = policy({ fetchImpl: (_input, options) => { signal = options.signal; return new Promise(() => {}); } });
  await p.api.canRun(); void p.context.fetch(A); await new Promise(setImmediate);
  const before = p.calls.length;
  p.add(['https://unrelated.example/*']); p.remove(['https://other.example/*']);
  await p.api.refresh();
  assert.equal(signal.aborted, false);
  assert.equal(p.calls.length, before + 2, 'only the explicit refresh checks sites');
  p.add([A]); await p.api.refresh(); assert.equal(signal.aborted, false);
  p.remove([B]); assert.equal(signal.aborted, true);
});
test('Request input keeps caller cancellation and same-context loading is idempotent', async () => {
  let signal;
  const p = policy({ fetchImpl: (_input, options) => { signal = options.signal; return new Promise(() => {}); } });
  await p.api.canRun(); const controller = new AbortController();
  void p.context.fetch(new Request('https://api.jikan.moe/anime', { signal: controller.signal }));
  await new Promise(setImmediate); controller.abort(); assert.equal(signal.aborted, true);
  const wrapper = p.context.fetch;
  vm.runInContext(source, p.context);
  assert.equal(p.context.fetch, wrapper); assert.equal(p.added.size, 1); assert.equal(p.removed.size, 1);
});
test('revocation cancels an unfinished response body after headers have arrived', async () => {
  let signal;
  const p = policy({ fetchImpl: (_input, options) => {
    signal = options.signal;
    return Promise.resolve(new Response(new ReadableStream({ start(controller) {
      signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
    } })));
  } });
  await p.api.canRun(); const response = await p.context.fetch(A);
  const body = response.text(); p.remove([B]);
  assert.equal(signal.aborted, true); await assert.rejects(body);
});
test('stream wrapping preserves response metadata and cloned JSON body consumers', async () => {
  const p = policy({ fetchImpl: async () => {
    const response = new Response('{"progress":360}', { headers: { 'content-type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: 'https://api.jikan.moe/final' }); return response;
  } });
  await p.api.canRun(); const response = await p.context.fetch(A), clone = response.clone();
  assert.equal(response.url, 'https://api.jikan.moe/final');
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.deepEqual(await response.json(), { progress: 360 }); assert.deepEqual(await clone.json(), { progress: 360 });
});
test('unknown permission APIs fail closed and content scripts use a bounded worker check', async () => {
  const context = vm.createContext({ console, setTimeout, clearTimeout, document: {},
    chrome: { runtime: { getManifest: () => ({ version: 'test', optional_host_permissions: [A] }),
      sendMessage(message, callback) { assert.equal(message.type, 'GET_WEBSITE_ACCESS');
        queueMicrotask(() => callback({ state: { version: 'test', checking: false, allowed: false, blockedOrigins: [A] } })); } } } });
  vm.runInContext(source, context);
  assert.equal(await context.AnimeTrackerWebsiteAccess.canRun(), false);
  const p = policy(); await p.api.canRun(); p.context.chrome.permissions.contains = () => { throw Error('Unavailable'); };
  await p.api.refresh(); assert.equal(await p.api.canRun(), false);
});

test('a build that names only the all-websites pattern gates on it alone (8.2.11)', async () => {
  for (const broad of ['<all_urls>', '*://*/*']) {
    let granted = false;
    const event = { addListener() {}, removeListener() {} };
    const permissions = { onAdded: event, onRemoved: event,
      contains: (details, callback) => queueMicrotask(() => callback(details.origins.every(origin => origin !== broad || granted))) };
    const context = vm.createContext({ console, URL, AbortController, Request, Response, ReadableStream, setTimeout, clearTimeout,
      fetch: async () => new Response('ok'),
      chrome: { permissions, runtime: { getManifest: () => ({ version: 'test', host_permissions: ['https://an1me.to/*', 'https://*.an1me.to/*', broad] }) } } });
    vm.runInContext(source, context);
    const api = context.AnimeTrackerWebsiteAccess;
    assert.equal(api.enabled, true);
    assert.deepEqual([...api.origins], [broad]);
    assert.equal(await api.canRun(), false);
    await assert.rejects(context.fetch('https://api.jikan.moe/v4/anime'), { code: 'SITE_ACCESS_REQUIRED' });
    granted = true; await api.refresh();
    assert.equal(await api.canRun(), true);
    assert.equal(await (await context.fetch('https://api.jikan.moe/v4/anime')).text(), 'ok');
  }
});

test('the desktop manifest (named hosts, nothing optional) leaves the gate off', async () => {
  const context = vm.createContext({ console, setTimeout, clearTimeout, fetch: async () => new Response('ok'), Response,
    chrome: { runtime: { getManifest: () => JSON.parse(fs.readFileSync(path.join(__dirname, '../../manifest.json'), 'utf8')) } } });
  vm.runInContext(source, context);
  assert.equal(context.AnimeTrackerWebsiteAccess.enabled, false);
  assert.equal(await context.AnimeTrackerWebsiteAccess.canRun(), true);
});

test('the Safari build opens when every service is allowed from the tap, or when All Websites is on in Settings', async () => {
  const services = ['https://firestore.googleapis.com/*', 'https://api.jikan.moe/*'];
  for (const route of ['services', 'all-websites']) {
    const granted = new Set(['https://an1me.to/*']);
    const event = { addListener() {}, removeListener() {} };
    const permissions = { onAdded: event, onRemoved: event,
      contains: (details, callback) => queueMicrotask(() => callback(details.origins.every(origin => granted.has(origin) || granted.has('<all_urls>')))) };
    const context = vm.createContext({ console, URL, AbortController, Request, Response, ReadableStream, setTimeout, clearTimeout,
      fetch: async () => new Response('ok'),
      chrome: { permissions, runtime: { getManifest: () => ({ version: 'test', host_permissions: ['https://an1me.to/*', 'https://*.an1me.to/*'],
        optional_host_permissions: [...services, '<all_urls>'] }) } } });
    vm.runInContext(source, context);
    const api = context.AnimeTrackerWebsiteAccess;
    assert.deepEqual([...api.origins], services, 'the gate is the services, not the tracking site or the switch');
    assert.equal(api.broad, '<all_urls>');
    assert.equal(await api.canRun(), false);
    assert.deepEqual([...api.getState().blockedOrigins], services);
    granted.add(services[0]); await api.refresh();
    assert.equal(await api.canRun(), false, 'one service is not enough');
    if (route === 'services') granted.add(services[1]); else granted.add('<all_urls>');
    await api.refresh();
    assert.equal(await api.canRun(), true, route);
    assert.equal(await (await context.fetch('https://api.jikan.moe/v4/anime')).text(), 'ok');
  }
});
