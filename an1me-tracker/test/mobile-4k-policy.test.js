const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const source = read('src/content/main.js');
const selector = source.slice(source.indexOf('  function maybeAutoSelect4kServer()'), source.indexOf('  function maybeFallbackInvalidActiveServer()'));
let failures = 0;
for (const mobile of [true, false]) {
  try {
    let clicks = 0, watchers = 0;
    const target = { textContent: '4K', click() { clicks++; } };
    const c = vm.createContext({ navigator: { userAgent: mobile ? 'iPhone' : 'Windows', platform: mobile ? 'iPhone' : 'Win32' },
      AT: { CONFIG: { SELECTORS: { EMBED: '[data-embed-id]' } } }, isValidEmbedPayload: () => true,
      runServerSelectionWatcher(_, fn) { watchers++; fn({ querySelectorAll: () => [target] }, { textContent: '1080p' }, () => {}, { info() {}, debug() {}, warn() {} }); } });
    c.self = c;
    vm.runInContext(read('src/common/utils.js'), c);
    vm.runInContext(selector, c);
    if (c.AnimeTrackerUtils.auto4kEnabled(true)) c.maybeAutoSelect4kServer();
    assert.equal(clicks, mobile ? 0 : 1);
    assert.equal(watchers, mobile ? 0 : 1);
    console.log('PASS ' + (mobile ? 'mobile' : 'desktop') + ' stored 4K preference respects device policy');
  } catch (error) { failures++; console.error('FAIL ' + (mobile ? 'mobile' : 'desktop') + ': ' + error.message); }
}
process.exitCode = failures ? 1 : 0;
