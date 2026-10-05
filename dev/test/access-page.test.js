// The website access page the worker opens after an install or update (src/setup/access.html), loaded as the
// extension serves it, with the Safari build's manifest and permission API at the boundary.
//
//   node dev/test/access-page.test.js
//
// AT_TEST_BROWSER selects Chromium; NODE_PATH can expose a bundled Playwright install.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  console.log("SKIP access page: install Playwright or expose it through NODE_PATH");
  process.exit(0);
}
const root = path.resolve(__dirname, "../..");
execFileSync(process.execPath, [path.join(root, "dev/scripts/package.js"), "--target", "safari"]);
const dist = path.join(root, "dist/an1me-tracker-safari");
const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
const pageUrl = pathToFileURL(path.join(dist, "src/setup/access.html")).href;
const executablePath = [process.env.AT_TEST_BROWSER,
  ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap((dir) => [path.join(dir, "Microsoft/Edge/Application/msedge.exe"), path.join(dir, "Google/Chrome/Application/chrome.exe")]),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium", "/usr/bin/google-chrome",
].filter(Boolean).find((file) => fs.existsSync(file));
const PHONE = { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1" };

// `grant`: true grants what is asked, false refuses, "noop" answers yes and grants nothing (what the iPhone did).
async function open(browser, { grant = true } = {}) {
  const context = await browser.newContext(PHONE);
  await context.addInitScript(({ manifest, grant }) => {
    const granted = new Set(manifest.host_permissions);
    const listeners = new Set();
    window.__requests = [];
    window.__removed = [];
    window.chrome = {
      runtime: { getManifest: () => manifest, lastError: undefined, sendMessage: () => Promise.resolve(null) },
      permissions: {
        onAdded: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) },
        onRemoved: { addListener() {}, removeListener() {} },
        contains: (details) => Promise.resolve(details.origins.every((origin) => granted.has(origin))),
        request: (details) => {
          window.__requests.push({ origins: details.origins, gesture: navigator.userActivation.isActive });
          if (grant === true) details.origins.forEach((origin) => granted.add(origin));
          return Promise.resolve(grant !== false);
        },
      },
      tabs: { getCurrent: (callback) => callback({ id: 42 }), remove: (id) => window.__removed.push(id) },
    };
    window.__allowInSettings = () => manifest.optional_host_permissions.forEach((origin) => granted.add(origin));
  }, { manifest, grant });
  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.waitForTimeout(150);
  const view = () => page.evaluate(() => {
    const shown = (selector) => { const el = document.querySelector(selector); return !!el && !el.hidden && el.getClientRects().length > 0; };
    return { card: shown("#setupAccess"), done: shown("#setupDone"), checking: shown("#setupChecking"), button: shown("#setupAccess .site-access-btn"),
      steps: shown("#setupAccess .site-access-steps"), link: shown("#setupAccess .site-access-link"), requests: window.__requests,
      overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  return { context, page, view };
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  let failures = 0;
  const test = async (name, fn) => {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failures++; console.error("FAIL " + name + ": " + error.message); }
  };
  try {
    await test("the page offers the one tap first, fits the phone and asks nothing by itself", async () => {
      const p = await open(browser);
      const state = await p.view();
      assert.equal(state.checking, false);
      assert.equal(state.card, true);
      assert.equal(state.button, true);
      assert.equal(state.steps, false, "Settings comes second while the prompt may work");
      assert.equal(state.done, false);
      assert.equal(state.overflow, false, "no sideways scrolling at 375px");
      assert.deepEqual(state.requests, []);
      const box = await p.page.locator("#setupAccess .site-access-btn").boundingBox();
      assert.ok(box.height >= 44 && box.x >= 16 && box.x + box.width <= 375 - 16);
      await p.context.close();
    });

    await test("allowing from the tap switches the page to done, and Close this tab closes it", async () => {
      const p = await open(browser, { grant: true });
      await p.page.click("#setupAccess .site-access-btn");
      await p.page.waitForTimeout(150);
      const state = await p.view();
      assert.equal(state.requests.length, 1);
      assert.equal(state.requests[0].gesture, true);
      assert.deepEqual(state.requests[0].origins, manifest.optional_host_permissions);
      assert.equal(state.card, false);
      assert.equal(state.done, true);
      await p.page.click("#setupClose");
      assert.deepEqual(await p.page.evaluate(() => window.__removed), [42]);
      await p.context.close();
    });

    await test("a yes that leaves the websites on Ask leads to Settings, and coming back from it finishes", async () => {
      const p = await open(browser, { grant: "noop" });
      await p.page.click("#setupAccess .site-access-btn");
      await p.page.waitForTimeout(150);
      let state = await p.view();
      assert.equal(state.done, false);
      assert.equal(state.steps, true);
      assert.equal(state.link, true);
      assert.equal(await p.page.getAttribute("#setupAccess .site-access-link", "href"), "an1metracker://safari-settings");
      // The user allows them in Settings, which sends no event, and returns to the tab.
      await p.page.evaluate(() => { window.__allowInSettings(); document.dispatchEvent(new Event("visibilitychange")); });
      await p.page.waitForTimeout(150);
      state = await p.view();
      assert.equal(state.card, false);
      assert.equal(state.done, true);
      await p.context.close();
    });
  } finally {
    await browser.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
