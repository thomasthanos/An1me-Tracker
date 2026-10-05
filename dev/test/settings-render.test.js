const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
let failures = 0;
function test(name, fn) { try { fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.stack}`); } }
// `notifications` false plays Safari, which gives extensions no notifications API.
function view(mobile, { notifications = true } = {}) {
  const attributes = new Map(); let rendered = false;
  const container = { innerHTML: '', removeAttribute: key => attributes.delete(key), setAttribute: (key, value) => attributes.set(key, value),
    querySelector: selector => rendered && selector === '.settings-view-inner' ? {} : null };
  const c = vm.createContext({ navigator: { userAgent: mobile ? 'iPhone' : 'Windows', platform: mobile ? 'iPhone' : 'Win32', maxTouchPoints: mobile ? 5 : 0 },
    document: { getElementById: id => id === 'settingsView' ? container : null },
    chrome: notifications ? { notifications: { create() {} } } : {},
    window: { AnimeTracker: { UIHelpers: { escapeHtml: value => String(value ?? '') } } } });
  vm.runInContext(read('src/common/utils.js'), c);
  vm.runInContext(read('src/popup/views/settings-view.js'), c);
  return { settings: c.window.AnimeTracker.SettingsView, container, attributes, rerender() { rendered = true; } };
}
test('the real Settings module renders its initial popup container without undeclared parameters', () => {
  const h = view(false);
  assert.match(h.container.innerHTML, /settings-view-inner/); assert.match(h.container.innerHTML, /settingsFetchFillers/);
  assert.equal(h.attributes.has('hidden'), true);
  h.settings.render(h.container); assert.equal(h.attributes.has('hidden'), false);
  h.rerender(); assert.doesNotThrow(() => h.settings.render(h.container, { user: { email: 'thomas@example.com' }, settings: { autoResume: true } }));
});
test('signed-in mobile Settings preserves disabled heavy toggles and hides the desktop password action', () => {
  const h = view(true);
  h.settings.render(h.container, { user: { email: 'thomas@example.com' }, settings: { auto4kServer: true, copyGuard: true, skiptimeHelper: true } });
  assert.match(h.container.innerHTML, /id="settingsAuto4kServer"[^>]*data-enabled="false"[^>]*aria-disabled="true"/);
  assert.match(h.container.innerHTML, /id="settingsCopyGuard"[^>]*data-enabled="false"[^>]*aria-disabled="true"/);
  assert.match(h.container.innerHTML, /id="settingsSkiptime"[^>]*data-enabled="false"[^>]*aria-disabled="true"/);
  assert.doesNotMatch(h.container.innerHTML, /id="settingsSetPassword"/);
});
test('without a notifications API the alerts switch is shown unavailable at once, not left looking live', () => {
  const safari = view(true, { notifications: false });
  safari.settings.render(safari.container, { user: { email: 'thomas@example.com' }, settings: { smartNotif: true } });
  assert.match(safari.container.innerHTML, /id="settingsSmartNotif"[^>]*data-enabled="false"[^>]*aria-disabled="true"/);
  assert.match(safari.container.innerHTML, /id="settingsSmartNotifSubtitle">Not available on this browser</);
  assert.equal(safari.settings.alertsUnavailable(), true);
  // Control: where the API exists the switch works and keeps the user's choice, on a phone too.
  const chrome = view(true);
  chrome.settings.render(chrome.container, { user: { email: 'thomas@example.com' }, settings: { smartNotif: true } });
  assert.match(chrome.container.innerHTML, /id="settingsSmartNotif"[^>]*data-enabled="true"/);
  assert.doesNotMatch(chrome.container.innerHTML, /id="settingsSmartNotif"[^>]*aria-disabled/);
});
process.exitCode = failures ? 1 : 0;
