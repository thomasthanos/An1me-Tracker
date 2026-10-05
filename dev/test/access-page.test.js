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

const CORE = ["https://an1me.to/*", "https://*.an1me.to/*"];

// Safari's answers at the boundary: an1me.to already allowed on its own row (as on the user's phone), All Websites
// still on Ask until the test turns it on "in Settings".
async function open(browser) {
  const context = await browser.newContext(PHONE);
  await context.addInitScript(({ manifest, CORE }) => {
    const granted = new Set(CORE);
    window.__requests = [];
    window.__removed = [];
    window.chrome = {
      runtime: { getManifest: () => manifest, lastError: undefined, sendMessage: () => Promise.resolve(null) },
      permissions: {
        onAdded: { addListener() {}, removeListener() {} },
        onRemoved: { addListener() {}, removeListener() {} },
        contains: (details) => Promise.resolve(details.origins.every((origin) => granted.has(origin))),
        request: (details) => { window.__requests.push(details.origins); return Promise.resolve(false); },
      },
      tabs: { getCurrent: (callback) => callback({ id: 42 }), remove: (id) => window.__removed.push(id) },
    };
    window.__allowAllWebsites = () => granted.add("<all_urls>");
  }, { manifest, CORE });
  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.waitForTimeout(150);
  const view = () => page.evaluate(() => {
    const shown = (selector) => { const el = document.querySelector(selector); return !!el && !el.hidden && el.getClientRects().length > 0; };
    return { card: shown("#setupAccess"), done: shown("#setupDone"), checking: shown("#setupChecking"), button: shown("#setupAccess .site-access-btn"),
      steps: [...document.querySelectorAll("#setupAccess .site-access-steps li")].map((li) => li.textContent),
      link: shown("#setupAccess .site-access-link"), requests: window.__requests,
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
    await test("the page leads straight to the one All Websites switch, fits the phone and asks nothing by itself", async () => {
      assert.deepEqual(manifest.host_permissions, [...CORE, "<all_urls>"]);
      const p = await open(browser);
      const state = await p.view();
      assert.equal(state.checking, false);
      assert.equal(state.card, true);
      assert.equal(state.done, false);
      assert.equal(state.button, false, "there is no prompt that can allow All Websites");
      assert.equal(state.link, true);
      assert.equal(state.steps[1], "Under Permissions, set All Websites to Allow.");
      assert.equal(await p.page.getAttribute("#setupAccess .site-access-link", "href"), "an1metracker://safari-settings");
      assert.equal(state.overflow, false, "no sideways scrolling at 375px");
      assert.deepEqual(state.requests, []);
      const box = await p.page.locator("#setupAccess .site-access-link").boundingBox();
      assert.ok(box.height >= 44 && box.x >= 16 && box.x + box.width <= 375 - 16);
      await p.context.close();
    });

    await test("coming back with All Websites allowed shows All set, and Close this tab closes it", async () => {
      const p = await open(browser);
      // The user flips the switch in Settings, which sends no event, and returns to the tab.
      await p.page.evaluate(() => { window.__allowAllWebsites(); document.dispatchEvent(new Event("visibilitychange")); });
      await p.page.waitForTimeout(150);
      const state = await p.view();
      assert.equal(state.card, false);
      assert.equal(state.done, true);
      await p.page.click("#setupClose");
      assert.deepEqual(await p.page.evaluate(() => window.__removed), [42]);
      await p.context.close();
    });
  } finally {
    await browser.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
