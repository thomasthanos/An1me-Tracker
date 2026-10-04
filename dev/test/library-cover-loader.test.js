const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = p => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const settle = () => new Promise(setImmediate);
function fixture() {
  const calls = [], listeners = {}, observers = [], releases = [];
  const images = ['near','far'].map(key => ({ dataset: { atCoverUrl: 'https://images.example/' + key + '.png' }, isConnected: true,
    src: 'data:image/gif;base64,placeholder', getAttribute(name) { return name === 'src' ? this.src : null; }, getClientRects: () => [{}] }));
  const scrollRoot = {}, root = { querySelectorAll: () => images.filter(img => img.isConnected), closest: () => scrollRoot };
  let complete;
  const AT = { CoverCache: { resolve: url => 'blob:' + url, releaseUnused: () => releases.push(1), warm: urls => { calls.push([...urls]); return new Promise(resolve => complete = resolve); } } };
  const doc = { hidden: false, visibilityState: 'visible', querySelector: () => scrollRoot, addEventListener: (name, fn) => listeners[name] = fn };
  class Observer { constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); observers.push(this); }
    observe(img) { this.observed.add(img); } unobserve(img) { this.observed.delete(img); } disconnect() { this.observed.clear(); } }
  const win = { AnimeTracker: AT, addEventListener: (name, fn) => listeners[name] = fn };
  const c = vm.createContext({ window: win, document: doc, IntersectionObserver: Observer, console });
  vm.runInContext(read('src/popup/lib/library-cover-loader.js'), c);
  return { AT, doc, images, root, calls, observers, listeners, releases, complete: () => complete?.() };
}
let failures = 0;
async function test(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message); } }
(async () => {
  await test('only near images warm and resolve through the cache without starting offscreen sources', async () => {
    const h = fixture(); h.AT.LibraryCoverLoader.observe(h.root);
    assert.equal(h.calls.length, 0); assert.equal(h.observers[0].options.root, h.root.closest());
    h.observers[0].callback([{ target: h.images[0], isIntersecting: true }, { target: h.images[1], isIntersecting: false }]);
    assert.deepEqual(h.calls, [['https://images.example/near.png']]);
    h.complete(); await settle(); assert.equal(h.images[0].src, 'blob:https://images.example/near.png');
    assert.match(h.images[1].src, /^data:/);
    h.AT.LibraryCoverLoader.observe(h.root); assert.equal(h.calls.length, 1, 'unchanged loaded images keep their source');
  });
  await test('a detached or repurposed image never receives a late source', async () => {
    const h = fixture(); h.AT.LibraryCoverLoader.observe(h.root); h.observers[0].callback([{ target: h.images[0], isIntersecting: true }]);
    h.images[0].dataset.atCoverUrl = 'https://images.example/new.png'; h.complete(); await settle(); assert.match(h.images[0].src, /^data:/);
    h.images[0].isConnected = false; h.AT.LibraryCoverLoader.observe(h.root); assert.equal(h.observers[0].observed.has(h.images[0]), false);
  });
  await test('hide blocks late assignments and show re-observes still-unloaded images', async () => {
    const h = fixture(); h.AT.LibraryCoverLoader.observe(h.root); h.observers[0].callback([{ target: h.images[0], isIntersecting: true }]);
    h.doc.hidden = true; h.doc.visibilityState = 'hidden'; h.listeners.visibilitychange(); h.complete(); await settle();
    assert.match(h.images[0].src, /^data:/);
    h.doc.hidden = false; h.doc.visibilityState = 'visible'; h.listeners.visibilitychange();
    assert.ok(h.observers.at(-1).observed.has(h.images[0]));
    h.observers.at(-1).callback([{ target: h.images[0], isIntersecting: true }]); h.complete(); await settle();
    assert.equal(h.images[0].src, 'blob:https://images.example/near.png');
  });
  await test('pagehide permanently stops loading in the departing popup', async () => {
    const h = fixture(); h.AT.LibraryCoverLoader.observe(h.root); h.listeners.pagehide();
    h.AT.LibraryCoverLoader.observe(h.root); h.observers[0].callback([{ target: h.images[0], isIntersecting: true }]); assert.equal(h.calls.length, 0);
  });
  await test('library hydration retains all covers but starts no network warm before rendering', async () => {
    const main = read('src/popup/main.js'), start = main.indexOf('  async function warmCoverCache()'), end = main.indexOf('\n  }', start) + 4;
    const warmed = [], retained = [], pruned = [];
    const c = vm.createContext({ window: { AnimeTracker: { groupCoverImages: { closed: 'https://images.example/closed.png' } } },
      AT: { CoverCache: { warm: async urls => warmed.push([...urls]), retain: urls => retained.push([...urls]), prune: async urls => { pruned.push([...urls]); return 0; } }, UIHelpers: { sanitizeImageUrl: url => url } },
      animeData: { visible: { coverImage: 'https://images.example/visible.png' }, hidden: { coverImage: 'https://images.example/hidden.png' } }, PopupLogger: { debug() {} } });
    vm.runInContext(main.slice(start, end), c); await c.warmCoverCache();
    assert.equal(warmed.length, 0); assert.deepEqual(retained[0], ['https://images.example/visible.png','https://images.example/hidden.png','https://images.example/closed.png']);
    assert.deepEqual(pruned[0], retained[0]);
  });
  process.exitCode = failures ? 1 : 0;
})();
