// Real Settings controls, storage events and the popup runtime request helper in Chromium.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  console.log("SKIP speed settings DOM integration: expose Playwright through NODE_PATH");
  process.exit(0);
}
const root = path.resolve(__dirname, "../..");
const main = fs.readFileSync(path.join(root, 'src/popup/main.js'), 'utf8');
const keyStart = main.indexOf('  document.addEventListener("keydown", (e) => {');
const keyEnd = main.indexOf('\n  window.addEventListener("beforeunload"', keyStart);
assert.ok(keyStart >= 0 && keyEnd > keyStart, 'production popup keyboard handler is available');
const mainKeyboardListener = main.slice(keyStart, keyEnd);
const candidates = [process.env.AT_TEST_BROWSER,
  ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap(dir => [path.join(dir, "Microsoft/Edge/Application/msedge.exe"), path.join(dir, "Google/Chrome/Application/chrome.exe")]),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium", "/usr/bin/google-chrome",
].filter(Boolean);
const executablePath = candidates.find(file => fs.existsSync(file));
const scripts = ["src/common/utils.js", "src/common/data/speed-preferences.js", "src/popup/lib/runtime-request.js",
  "src/popup/lib/ui-helpers.js", "src/popup/views/settings-view.js"];
function setup() {
  window.elements = {}; window.currentViewMode = 'settings';
  window.setViewMode = mode => { window.currentViewMode = mode; };
  window.AnimeTracker = {}; window.PopupLogger = { warn() {} };
  window.testMessages = []; window.testStorageListeners = new Set();
  window.testStore = { speedControlPreferences: { enabled: true, normalRate: 1.25, boostRate: 3, defaultVolume: .6, defaultMuted: false },
    animeData: { stable: { episodes: [{ number: 1 }] } }, videoProgress: { stable: { currentTime: 123 } }, cachedStats: { totalAnime: 1 }, copyGuardEnabled: true };
  window.testStorageChange = value => {
    const oldValue = window.testStore.speedControlPreferences;
    window.testStore.speedControlPreferences = value;
    for (const listener of window.testStorageListeners) listener({ speedControlPreferences: { oldValue, newValue: value } }, "local");
  };
  window.chrome = { storage: { local: { get: async keys => {
    const snapshot = structuredClone(Object.fromEntries(keys.map(key => [key, window.testStore[key]])));
    if (window.testHoldRead) return new Promise(resolve => { window.testReadReply = () => resolve(snapshot); });
    return snapshot;
  },
    set() { throw new Error("Popup must not write preferences directly"); } }, onChanged: { addListener: listener => window.testStorageListeners.add(listener) } },
    runtime: { lastError: null, sendMessage(message, callback) {
      window.testMessages.push(structuredClone(message));
      const respond = () => {
        if (window.testFailNext) { window.testFailNext = false; callback({ success: false, error: "test save failed" }); return; }
        try {
          const preferences = window.AnimeTrackerSpeedPreferences.patch(window.testStore.speedControlPreferences, message.patch, message.mobile);
          window.testStorageChange(preferences);
          if (window.testAfterSaveChange) { window.testStorageChange(window.testAfterSaveChange); window.testAfterSaveChange = null; }
          callback({ success: true, preferences });
        } catch (error) { callback({ success: false, error: error.message }); }
      };
      if (window.testHoldReply) window.testReply = respond;
      else respond();
    } } };
}
async function runInBrowser(mobile) {
  const AT = window.AnimeTracker;
  AT.Storage = { set() { throw new Error("Speed preferences must bypass the library coordinator"); } };
  const results = [];
  function equal(actual, expected, message) { if (actual !== expected) throw new Error(`${message}: ${actual} !== ${expected}`); }
  function required(id) { const node = document.getElementById(id); if (!node) throw new Error("Missing speed control: " + id); return node; }
  const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
  function change(id, value) { const node = required(id); node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); }
  async function test(name, fn) {
    try { await fn(); results.push({ name: `${mobile ? "mobile" : "desktop"}: ${name}`, passed: true }); }
    catch (error) { results.push({ name: `${mobile ? "mobile" : "desktop"}: ${name}`, passed: false, error: error.stack }); }
  }
  const stable = JSON.stringify([window.testStore.animeData, window.testStore.videoProgress, window.testStore.cachedStats]);
  if (!mobile) {
    await test("a pending initial read cannot overwrite a newer storage event", async () => {
      window.testHoldRead = true;
      const pending = AT.SettingsView.initializeSpeedControl?.();
      window.testStorageChange({ enabled:true, normalRate:2, boostRate:8, defaultVolume:.35, defaultMuted:true });
      window.testReadReply?.(); await pending;
      equal(required("settingsNormalSpeed").value, "2", "latest storage event wins over initial snapshot");
    });
    window.testHoldRead = false;
    window.testStorageChange({ enabled:true, normalRate:1.25, boostRate:3, defaultVolume:.6, defaultMuted:false });
  }
  await AT.SettingsView.initializeSpeedControl?.();
  await AT.SettingsView.initializeSpeedControl?.();
  AT.SettingsView.render(document.getElementById("settingsView"));
  await test("custom dropdown uses a bounded touch menu, selected SVG and keyboard navigation", async () => {
    const trigger = required("settingsNormalSpeed");
    equal(trigger.tagName, "BUTTON", "custom trigger replaces native select");
    equal(trigger.getAttribute("role"), "combobox", "accessible select-only combobox");
    trigger.click();
    const menu = required("settingsNormalSpeedMenu");
    equal(menu.hidden, false, "custom list opens");
    equal(menu.parentElement, document.body, "menu avoids card clipping");
    equal(menu.querySelector('[aria-selected="true"]').dataset.speedChoice, "1.25", "stored choice selected");
    equal(!!menu.querySelector('[aria-selected="true"] svg'), true, "selected checkmark is vector");
    const rect = menu.getBoundingClientRect();
    equal(rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth, true, "menu stays in popup viewport");
    equal(menu.querySelector('[role="option"]').getBoundingClientRect().height >= 44, true, "touch option target");
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    equal(menu.hidden, true, "Escape closes"); equal(document.activeElement, trigger, "focus restored");
    equal(window.currentViewMode, 'settings', 'Escape keeps Settings view open with production global shortcuts');
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    const before = window.testMessages.length;
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await settle();
    equal(window.testMessages.length, before + 1, "keyboard commits once");
    equal(trigger.value, "2", "End selected last normal rate"); equal(menu.hidden, true, "selection closes");
    trigger.click(); document.body.click(); equal(menu.hidden, true, "outside click closes");
    trigger.click(); trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); equal(menu.hidden, true, "Tab dismisses without trapping focus");
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    equal(window.currentViewMode, null, "closed menu keeps the global Escape shortcut available"); window.currentViewMode = 'settings';
    trigger.click(); document.dispatchEvent(new Event("scroll")); equal(menu.hidden, true, "page scrolling drops the anchored menu");
    if (!mobile) {
      trigger.click(); required("settingsBoostSpeed").click();
      equal(menu.hidden, true, "only one menu open");
      required("settingsBoostSpeedMenu").querySelector('[data-speed-choice="4"]').click(); await settle();
      equal(required("settingsBoostSpeed").value, "4", "touch boost selection");
    }
    window.testStorageChange({ enabled:true, normalRate:1.25, boostRate:3, defaultVolume:.6, defaultMuted:false });
  });
  if (mobile) {
    await test("exact four rates, fixed 2x hold hint and native fullscreen hint", async () => {
      const options = [...required("settingsNormalSpeedMenu").querySelectorAll('[role="option"]')].map(option => option.dataset.speedChoice);
      equal(JSON.stringify(options), '["","1","1.25","1.5","2"]', "mobile choices");
      equal(document.getElementById("settingsBoostSpeed"), null, "no configurable mobile boost");
      equal(document.getElementById("settingsSpeedAudioReset"), null, "no mobile audio override");
      equal(required("settingsSpeedHint").textContent.includes("2×"), true, "fixed hold boost explained");
      equal(required("settingsSpeedHint").textContent.toLowerCase().includes("fullscreen"), true, "native fullscreen explained");
    });
    await test("normal speed changes use the mobile runtime contract", async () => {
      change("settingsNormalSpeed", "1.5"); await settle();
      equal(JSON.stringify(window.testMessages.at(-1)), '{"type":"UPDATE_SPEED_CONTROL_PREFERENCES","patch":{"normalRate":1.5},"mobile":true}', "mobile write boundary");
      equal(window.testStore.speedControlPreferences.boostRate, 2, "fixed boost persisted");
      equal(window.testStore.speedControlPreferences.defaultVolume, null, "audio untouched on mobile");
    });
  } else {
    await test("stored normal, boost and audio preferences are reflected in real controls", async () => {
      equal(required("settingsNormalSpeed").value, "1.25", "stored normal speed");
      equal(required("settingsNormalSpeed").getClientRects().length > 0, true, "Settings controls are visible");
      equal(required("settingsBoostSpeed").value, "3", "stored boost");
      equal(required("settingsSpeedControl").getAttribute("aria-pressed"), "true", "default enabled");
      equal(required("settingsSpeedAudioInfo").textContent.includes("60%"), true, "remembered volume");
    });
    await test("speed changes send one worker patch and keep the controls attached", async () => {
      const node = required("settingsNormalSpeed"), count = window.testMessages.length;
      change("settingsNormalSpeed", "1.5"); await settle();
      equal(window.testMessages.length, count + 1, "initialization does not duplicate handlers");
      equal(JSON.stringify(window.testMessages.at(-1)), '{"type":"UPDATE_SPEED_CONTROL_PREFERENCES","patch":{"normalRate":1.5},"mobile":false}', "desktop write boundary");
      equal(required("settingsNormalSpeed"), node, "control identity retained");
      equal(required("settingsBoostSpeed").value, "3", "unselected boost retained");
    });
    await test("player default clears normal speed and audio reset leaves speed preferences intact", async () => {
      change("settingsNormalSpeed", ""); await settle();
      equal(window.testStore.speedControlPreferences.normalRate, null, "player default reset");
      required("settingsSpeedAudioReset").click(); await settle();
      equal(JSON.stringify(window.testMessages.at(-1).patch), '{"defaultVolume":null,"defaultMuted":null}', "audio-only reset");
      equal(window.testStore.speedControlPreferences.boostRate, 3, "audio reset preserves boost");
      equal(required("settingsSpeedAudioReset").disabled, true, "no remembered audio left to reset");
    });
    await test("external preference events update controls without writes or unrelated settings changes", async () => {
      const count = window.testMessages.length;
      window.testStorageChange({ enabled: true, normalRate: 2, boostRate: 8, defaultVolume: .35, defaultMuted: true });
      equal(required("settingsNormalSpeed").value, "2", "external normal speed");
      equal(required("settingsBoostSpeed").value, "8", "external boost");
      equal(required("settingsSpeedAudioInfo").textContent.includes("35%"), true, "external volume");
      equal(required("settingsSpeedAudioInfo").textContent.toLowerCase().includes("muted"), true, "external mute");
      equal(window.testMessages.length, count, "storage events do not write back");
      equal(required("settingsCopyGuard").dataset.enabled, "true", "other preference preserved");
    });
    await test("failed saves restore the confirmed selection and allow another attempt", async () => {
      window.testFailNext = true; change("settingsBoostSpeed", "4"); await settle();
      equal(required("settingsBoostSpeed").value, "8", "failed save restored");
      equal(required("settingsBoostSpeed").disabled, false, "control enabled after failure");
      equal(document.querySelector(".at-toast")?.textContent, "Could not save speed preference", "failure is visible");
      document.querySelector(".at-toast").remove();
    });
    await test("a delayed save reply cannot overwrite a newer preference event", async () => {
      window.testAfterSaveChange = { enabled:true, normalRate:1.75, boostRate:4, defaultVolume:.35, defaultMuted:true };
      change("settingsBoostSpeed", "3"); await settle();
      equal(required("settingsNormalSpeed").value, "1.75", "latest event normal speed");
      equal(required("settingsBoostSpeed").value, "4", "latest event boost wins over save reply");
    });
    await test("pending save prevents duplicate changes and restores enabled controls after reply", async () => {
      const count = window.testMessages.length; window.testHoldReply = true;
      change("settingsNormalSpeed", "1.25");
      equal(required("settingsNormalSpeed").disabled, true, "pending selector disabled");
      change("settingsNormalSpeed", "1.5");
      equal(window.testMessages.length, count + 1, "pending change ignored");
      window.testHoldReply = false; window.testReply(); await settle();
      equal(required("settingsNormalSpeed").value, "1.25", "confirmed selection");
      equal(required("settingsNormalSpeed").disabled, false, "selector restored");
    });
  }
  await test("OFF keeps the selectors present and disabled without changing the library", async () => {
    required("settingsSpeedControl").click(); await settle();
    equal(required("settingsSpeedControl").getAttribute("aria-pressed"), "false", "feature off");
    equal(required("settingsNormalSpeed").disabled, true, "normal control stays present and disabled");
    if (!mobile) equal(required("settingsBoostSpeed").disabled, true, "boost disabled");
    equal(JSON.stringify([window.testStore.animeData, window.testStore.videoProgress, window.testStore.cachedStats]), stable, "library and caches unchanged");
  });
  document.getElementById("results").textContent = JSON.stringify(results);
}
const styles = fs.readFileSync(path.join(root, "popup.html"), "utf8").match(/<head>([\s\S]*?)<\/head>/)[1];
function html(mobile) {
  return `<html><head>${styles}</head><body><div class="app settings-mode"><main class="main-content"><div id="settingsView" class="settings-view"></div></main></div>
    <pre id="results" hidden>pending</pre><script>(${setup.toString()})();${mainKeyboardListener}</script>
    ${scripts.map(file => `<script>${fs.readFileSync(path.join(root, file), "utf8").replace(/<\/script/gi, "<\\/script")}</script>`).join("")}
    <script>(${runInBrowser.toString()})(${mobile});</script></body></html>`;
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    let passed = true;
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: { width: mobile ? 390 : 420, height: 590 }, reducedMotion: "reduce",
        ...(mobile ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", isMobile: true, hasTouch: true } : {}) });
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://an1me.to") return route.abort();
        if (url.pathname === "/speed-settings-test") return route.fulfill({ contentType: "text/html", body: html(mobile) });
        const target = path.resolve(root, "." + url.pathname);
        const mime = { ".css": "text/css", ".woff2": "font/woff2", ".ttf": "font/ttf" }[path.extname(target)];
        if (!target.startsWith(root + path.sep) || !mime || !fs.existsSync(target)) return route.abort();
        return route.fulfill({ contentType: mime, body: fs.readFileSync(target) });
      });
      await page.goto("https://an1me.to/speed-settings-test");
      await page.waitForFunction(() => document.getElementById("results").textContent !== "pending");
      const outcomes = JSON.parse(await page.locator("#results").textContent());
      for (const outcome of outcomes) console.log(`${outcome.passed ? "PASS" : "FAIL"} ${outcome.name}${outcome.error ? "\n" + outcome.error : ""}`);
      assert.equal(errors.length, 0, errors.join("; "));
      passed = passed && outcomes.every(outcome => outcome.passed);
      await page.evaluate(() => { window.testStorageChange({enabled:true,normalRate:1.5,boostRate:4,defaultVolume:.6,defaultMuted:false}); });
      await page.locator("#settingsNormalSpeed").focus();
      const messageCount = await page.evaluate(() => window.testMessages.length);
      await page.keyboard.press("ArrowDown"); await page.keyboard.press("Escape");
      assert.equal(await page.evaluate(() => window.currentViewMode), 'settings', 'real Escape keeps Settings open');
      await page.keyboard.press("ArrowDown"); await page.keyboard.press("End"); await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.getElementById("settingsNormalSpeed").value === "2" && !document.getElementById("settingsNormalSpeed").disabled);
      assert.equal(await page.evaluate(() => window.testMessages.length), messageCount + 1, "real key presses commit once");
      assert.equal(await page.locator("#settingsNormalSpeed").getAttribute("aria-expanded"), "false", "Enter does not reopen through a native click");
      console.log(`PASS ${mobile ? "mobile" : "desktop"}: real keyboard activation does not duplicate or reopen`);
      if (process.env.AT_SPEED_SCREENSHOT_DIR && passed) {
        await page.evaluate(() => { window.testStorageChange({enabled:true,normalRate:1.5,boostRate:4,defaultVolume:.6,defaultMuted:false}); });
        await page.locator("#settingsSpeedSection").screenshot({ path: path.join(process.env.AT_SPEED_SCREENSHOT_DIR, `speed-settings-${mobile ? "mobile" : "desktop"}.png`) });
        await page.locator("#settingsNormalSpeed").click();
        await page.screenshot({ path: path.join(process.env.AT_SPEED_SCREENSHOT_DIR, `speed-dropdown-${mobile ? "mobile" : "desktop"}.png`) });
      }
      await context.close();
    }
    process.exitCode = passed ? 0 : 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
