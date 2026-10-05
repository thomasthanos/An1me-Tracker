// Checks the Fetch & Import panel's answer to a browser that keeps the extension off the filler sites.
//
//   node dev/test/fetch-import-access.test.js
//
// On an iPhone, Safari let the extension reach an1me.to but not AnimeFillerList or Jikan, and every show
// ended as "filler site unreachable (no site access)" with nothing the user could do from the panel. The
// panel now says so and offers Allow access, which must ask the browser from the tap itself (permission
// prompts need a user gesture), restart the import once allowed, and fall back to the Settings path.
// AT_TEST_BROWSER selects Chromium; NODE_PATH can expose a bundled Playwright install.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  console.log("SKIP fetch import access: install Playwright or expose it through NODE_PATH");
  process.exit(0);
}
const root = path.resolve(__dirname, "../..");
const candidates = [process.env.AT_TEST_BROWSER,
  ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap((dir) => [path.join(dir, "Microsoft/Edge/Application/msedge.exe"), path.join(dir, "Google/Chrome/Application/chrome.exe")]),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium", "/usr/bin/google-chrome",
].filter(Boolean);
const executablePath = candidates.find((file) => fs.existsSync(file));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const css = [...read("popup.html").matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => read(match[1])).join("\n");
const scripts = ["src/common/utils.js", "src/popup/lib/filler-fetch-ui.js"].map(read);
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" };
const DESKTOP = { viewport: { width: 420, height: 600 } };

// `access`: what permissions.contains answers (null: no permissions API). `grant`: what request answers.
async function panel(browser, device, { access, grant = true }) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body></body></html>`);
  await page.evaluate(({ access, grant }) => {
    window.__requests = [];
    window.__granted = 0;
    window.chrome = access === null ? {} : {
      permissions: {
        contains: (request, callback) => setTimeout(() => callback(access)),
        // Answers through both the callback and a promise, as Safari can.
        request: (request, callback) => {
          window.__requests.push({ origins: request.origins, gesture: navigator.userActivation?.isActive === true });
          setTimeout(() => callback(grant));
          return Promise.resolve(grant);
        },
      },
    };
  }, { access, grant });
  for (const content of scripts) await page.addScriptTag({ content });
  await page.evaluate(async () => {
    const ui = window.AnimeTracker.FillerFetchUI;
    ui.init();
    ui.onAccessGranted = () => window.__granted++;
    await ui.open();
  });
  await page.waitForTimeout(150);
  const view = () => page.evaluate(() => {
    const banner = document.querySelector(".ffui-access");
    const visible = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
    return { banner: visible(banner), path: visible(banner.querySelector(".ffui-access-path")), requests: window.__requests, granted: window.__granted };
  });
  return { page, context, view };
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  let failures = 0;
  const test = async (name, fn) => {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failures++; console.error("FAIL " + name + ": " + error.message); }
  };
  try {
    await test("without access the panel says so, with the Settings path on a phone", async () => {
      const p = await panel(browser, PHONE, { access: false });
      const state = await p.view();
      assert.equal(state.banner, true);
      assert.equal(state.path, true);
      await p.context.close();
    });

    await test("Allow access asks for both filler sites from the tap, then restarts the import", async () => {
      const p = await panel(browser, PHONE, { access: false, grant: true });
      await p.page.click(".ffui-access-btn");
      await p.page.waitForTimeout(100);
      const state = await p.view();
      assert.equal(state.requests.length, 1);
      assert.deepEqual(state.requests[0].origins, ["https://www.animefillerlist.com/*", "https://api.jikan.moe/*"]);
      assert.equal(state.requests[0].gesture, true, "asked while the tap still counts as a user gesture");
      assert.equal(state.granted, 1, "the import is started again, once");
      assert.equal(state.banner, false);
      await p.context.close();
    });

    await test("a refused prompt keeps the notice and shows the Settings path, on desktop too", async () => {
      const p = await panel(browser, DESKTOP, { access: false, grant: false });
      assert.equal((await p.view()).path, false, "desktop does not start with the iPhone path");
      await p.page.click(".ffui-access-btn");
      await p.page.waitForTimeout(100);
      const state = await p.view();
      assert.equal(state.banner, true);
      assert.equal(state.path, true);
      assert.equal(state.granted, 0);
      await p.context.close();
    });

    await test("with access the panel shows no notice", async () => {
      const p = await panel(browser, PHONE, { access: true });
      assert.equal((await p.view()).banner, false);
      await p.context.close();
    });

    await test("a row that failed for lack of access shows the notice even without a permissions API", async () => {
      const p = await panel(browser, PHONE, { access: null });
      assert.equal((await p.view()).banner, false);
      await p.page.evaluate(() => window.AnimeTracker.FillerFetchUI.applyBackgroundState({
        status: "running", total: 3, processed: 1, queueIndex: 1, failed: 1,
        logs: [{ at: 1, type: "retry", slug: "noragami", name: "Noragami", detail: "info cached • filler site unreachable (no site access)" }],
      }));
      assert.equal((await p.view()).banner, true);
      await p.context.close();
    });
  } finally {
    await browser.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
