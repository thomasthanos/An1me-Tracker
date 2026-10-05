// Checks the Fetch & Import panel's answer to a browser that keeps the extension off the filler sites.
//
//   node dev/test/fetch-import-access.test.js
//
// Safari can request optional hosts from a tap. Older builds with required hosts need Settings instructions.
// A pending or refused prompt must not start a fetch that could record avoidable failures. The panel must
// also keep its layout with the notice in it: 8.2.5 lost a CSS rule and the progress spilled out of its box.
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
const scripts = ["src/common/utils.js", "src/popup/lib/site-access.js", "src/popup/lib/filler-fetch-ui.js"].map(read);
const FILLER = ["https://www.animefillerlist.com/*", "https://api.jikan.moe/*"];
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" };
const DESKTOP = { viewport: { width: 420, height: 600 } };

// `access`: what permissions.contains answers: true, false, a list of the allowed origins, or null for no
// permissions API. `grant`: what request answers. `optional`: the manifest's optional_host_permissions (the
// Safari build declares its supporting services there).
async function panel(browser, device, { access, grant = true, optional = null }) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body></body></html>`);
  await page.evaluate(({ access, grant, optional }) => {
    window.__requests = [];
    window.__granted = 0;
    window.chrome = access === null ? {} : {
      runtime: { getManifest: () => (optional ? { optional_host_permissions: optional } : {}) },
      permissions: {
        contains: (request, callback) => setTimeout(() => callback(Array.isArray(access) ? request.origins.every((o) => access.includes(o)) : access)),
        // Answers through both the callback and a promise, as a browser can.
        request: (request, callback) => {
          window.__requests.push({ origins: request.origins, gesture: navigator.userActivation?.isActive === true });
          if (grant === "pending") return new Promise(resolve => { window.__answer = answer => { callback(answer); resolve(answer); }; });
          setTimeout(() => callback(grant));
          return Promise.resolve(grant);
        },
      },
    };
  }, { access, grant, optional });
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
    return {
      banner: visible(banner), text: banner.textContent, button: visible(banner.querySelector(".site-access-btn")),
      path: visible(banner.querySelector(".site-access-path")), steps: [...banner.querySelectorAll(".site-access-steps li")].map((li) => li.textContent),
      requests: window.__requests, granted: window.__granted,
    };
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
    await test("on a phone the notice is the Settings steps naming the filler sites, with no button", async () => {
      const p = await panel(browser, PHONE, { access: false });
      const state = await p.view();
      assert.equal(state.banner, true);
      assert.equal(state.button, false, "asking from the extension changed nothing on an iPhone");
      assert.deepEqual(state.steps, [
        "Open Settings → Apps → Safari → Extensions → An1me.to Tracker (the Safari Settings button in the An1me Tracker app opens it).",
        "Under Permissions, tap animefillerlist.com and api.jikan.moe and choose Allow for each.",
        "Come back and run Fetch & Import again.",
      ]);
      assert.doesNotMatch(state.text, /All Websites/, "there is no such switch for this extension");
      assert.doesNotMatch(state.text, /firestore|identitytoolkit|securetoken|sync/i, "sync works on Ask and is not flagged");
      await p.context.close();
    });

    await test("on a phone with the filler sites optional (the Safari build), Allow access asks Safari for them", async () => {
      const p = await panel(browser, PHONE, { access: false, grant: true, optional: FILLER });
      const before = await p.view();
      assert.equal(before.button, true);
      assert.equal(before.steps.length, 3, "the steps are there as the fallback");
      assert.equal(await p.page.$eval(".site-access-steps", (el) => el.hidden), true, "but hidden while the prompt can do it");
      await p.page.click(".site-access-btn");
      await p.page.waitForTimeout(100);
      const after = await p.view();
      assert.deepEqual(after.requests[0].origins, FILLER);
      assert.equal(after.granted, 1);
      assert.equal(after.banner, false);
      await p.context.close();
    });

    await test("on a phone a refused prompt brings up the Settings steps", async () => {
      const p = await panel(browser, PHONE, { access: false, grant: false, optional: FILLER });
      await p.page.click(".site-access-btn");
      await p.page.waitForTimeout(100);
      assert.equal(await p.page.$eval(".site-access-steps", (el) => el.hidden), false);
      assert.equal((await p.view()).banner, true);
      await p.context.close();
    });
    await test("the existing Allow access notice shows pending feedback and can retry after denial", async () => {
      const p = await panel(browser, PHONE, { access: false, grant: "pending", optional: FILLER });
      await p.page.click(".site-access-btn");
      assert.equal(await p.page.locator(".site-access-btn").isDisabled(), true);
      assert.match(await p.page.locator(".site-access-btn").innerText(), /waiting/i);
      await p.page.evaluate(() => window.__answer(false));
      assert.equal(await p.page.locator(".site-access-btn").isEnabled(), true);
      assert.equal(await p.page.$eval(".site-access-steps", el => el.hidden), false);
      await p.context.close();
    });

    await test("tapping Fetch & Import asks for the optional filler sites, and asks for nothing where they are required", async () => {
      const ask = async (optional) => {
        const p = await panel(browser, PHONE, { access: true, optional });
        await p.page.evaluate(() => new Promise((resolve) => window.AnimeTracker.SiteAccess.askIfOptional((granted) => { window.__answer = granted; resolve(); })));
        const result = { requests: (await p.view()).requests, answer: await p.page.evaluate(() => window.__answer) };
        await p.context.close();
        return result;
      };
      const safari = await ask(FILLER);
      assert.deepEqual(safari.requests.map((r) => r.origins), [FILLER]);
      assert.equal(safari.answer, true);
      const chrome = await ask(null);
      assert.deepEqual(chrome.requests, [], "no prompt where the sites are required");
      assert.equal(chrome.answer, true);
    });

    await test("the mobile Allow access button requests every declared optional service in one gesture", async () => {
      const optional = [...FILLER, "https://firestore.googleapis.com/*", "https://api.aniskip.com/*", "https://cdn.myanimelist.net/*"];
      const p = await panel(browser, PHONE, { access: false, optional });
      await p.page.click(".site-access-btn");
      await p.page.waitForTimeout(80);
      const state = await p.view();
      assert.deepEqual(state.requests.map(r => r.origins), [optional]);
      assert.equal(state.requests[0].gesture, true);
      assert.equal(state.granted, 1);
      await p.context.close();
    });

    await test("Fetch & Import waits for consent and does not fetch after refusal", async () => {
      const source = read("src/popup/main.js");
      const start = source.indexOf('      if (e.target.closest("#settingsFetchFillers")) {');
      const end = source.indexOf("\n    });", start);
      assert.ok(start >= 0 && end > start, "production delegated click handler found");
      for (const answer of [false, true]) {
        const p = await panel(browser, PHONE, { access: false, optional: FILLER, grant: "pending" });
        await p.page.evaluate(block => {
          window.__fetches = 0; window.__toasts = [];
          const AT = window.AnimeTracker;
          AT.FillerFetchUI.close();
          AT.UIHelpers = { showToast: text => window.__toasts.push(text) };
          const PopupLogger = { error: () => {} };
          // Only the slow batch/network boundary is replaced; permission UI and production click code run.
          const fetchAllFillers = async () => { window.__fetches++; };
          const handler = eval(`(async e => { ${block} })`);
          const button = document.createElement("button");
          button.id = "settingsFetchFillers"; button.textContent = "Fetch & Import";
          document.body.append(button); button.addEventListener("click", handler);
        }, source.slice(start, end));
        await p.page.click("#settingsFetchFillers");
        await p.page.waitForTimeout(1700);
        assert.equal(await p.page.evaluate(() => window.__fetches), 0, "no fetch while Safari is waiting for consent");
        await p.page.evaluate(answer => window.__answer(answer), answer);
        await p.page.waitForTimeout(80);
        assert.equal(await p.page.evaluate(() => window.__fetches), answer ? 1 : 0);
        if (!answer) assert.ok((await p.page.evaluate(() => window.__toasts)).length > 0, "refusal gives actionable feedback");
        await p.context.close();
      }
    });

    await test("only the filler sites still blocked are named", async () => {
      const p = await panel(browser, PHONE, { access: ["https://api.jikan.moe/*"] });
      assert.equal((await p.view()).steps[1], "Under Permissions, tap animefillerlist.com and choose Allow for each.");
      await p.context.close();
    });

    await test("on desktop Allow access asks for the blocked sites from the click, then restarts the import once", async () => {
      const p = await panel(browser, DESKTOP, { access: false, grant: true });
      await p.page.click(".site-access-btn");
      await p.page.waitForTimeout(100);
      const state = await p.view();
      assert.equal(state.requests.length, 1);
      assert.deepEqual(state.requests[0].origins, FILLER);
      assert.equal(state.requests[0].gesture, true, "asked while the click still counts as a user gesture");
      assert.equal(state.granted, 1);
      assert.equal(state.banner, false);
      await p.context.close();
    });

    await test("a refused prompt keeps the notice and says where to allow the sites", async () => {
      const p = await panel(browser, DESKTOP, { access: false, grant: false });
      assert.equal((await p.view()).path, false);
      await p.page.click(".site-access-btn");
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
      const state = await p.view();
      assert.equal(state.banner, true);
      assert.match(state.text, /set animefillerlist\.com and api\.jikan\.moe to Allow\./);
      await p.context.close();
    });

    await test("with the notice up and a long title, the panel keeps its layout on a phone", async () => {
      const p = await panel(browser, PHONE, { access: false });
      await p.page.evaluate(() => window.AnimeTracker.FillerFetchUI.applyBackgroundState({
        status: "running", total: 101, processed: 31, queueIndex: 31, fetched: 1, cached: 3, skipped: 15, failed: 30,
        currentTitle: "One Piece Movie 08: Episode of Alabasta - Sabaku no Oujo to Kaizoku-tachi",
        logs: [{ at: 1, type: "retry", slug: "vinland-saga", name: "Vinland Saga", detail: "info cached • filler site unreachable (no site access)" }],
      }));
      await p.page.waitForTimeout(100);
      const box = await p.page.evaluate(() => {
        const rect = (el) => el.getBoundingClientRect();
        const body = rect(document.querySelector(".ffui-body"));
        const wrap = rect(document.querySelector(".ffui-progress-wrap"));
        const pct = rect(document.querySelector(".ffui-pct"));
        const stats = rect(document.querySelector(".ffui-stats"));
        const tiles = [...document.querySelectorAll(".ffui-stat")].map(rect);
        const banner = rect(document.querySelector(".ffui-access"));
        const pad = parseFloat(getComputedStyle(document.querySelector(".ffui-body")).paddingLeft) * 2;
        return { bodyInner: body.width - pad, wrap, pct, stats, tiles, banner };
      });
      assert.ok(Math.abs(box.wrap.width - box.bodyInner) <= 1, `progress spans the panel (${box.wrap.width} of ${box.bodyInner})`);
      assert.ok(box.pct.right <= box.wrap.right && box.pct.width > 0, "the percentage stays visible inside the progress box");
      for (const tile of box.tiles) {
        assert.ok(tile.top >= box.stats.top - 1 && tile.bottom <= box.stats.bottom + 1, "each stat sits inside the stats row");
      }
      assert.ok(box.banner.top >= box.stats.bottom, "the notice starts below the stats, not over them");
      await p.context.close();
    });
  } finally {
    await browser.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
