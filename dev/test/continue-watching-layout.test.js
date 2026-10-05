// Checks where the Continue Watching shelf lands on a phone-sized homepage, in a real browser.
//
//   node dev/test/continue-watching-layout.test.js
//
// The shelf is a full-width block, but it is mounted next to the site's own widgets. When that anchor
// (the share widget or the hero) sits in a flex row or a grid, the shelf used to become one more column
// beside it: squeezed to about two thirds of the screen, offset to the right and pushed to the top of
// the page next to the hero. Each layout below must put it directly under the hero at full width.
// AT_TEST_BROWSER selects Chromium; NODE_PATH can expose a bundled Playwright install.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  console.log("SKIP continue watching layout: install Playwright or expose it through NODE_PATH");
  process.exit(0);
}
const root = path.resolve(__dirname, "../..");
const candidates = [process.env.AT_TEST_BROWSER,
  ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap((dir) => [path.join(dir, "Microsoft/Edge/Application/msedge.exe"), path.join(dir, "Google/Chrome/Application/chrome.exe")]),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium", "/usr/bin/google-chrome",
].filter(Boolean);
const executablePath = candidates.find((file) => fs.existsSync(file));
const scripts = ["src/content/lib/page-events.js", "src/common/data/multipart-mappings.js", "src/content/page/continue-watching.js"]
  .map((file) => fs.readFileSync(path.join(root, file), "utf8"));

const hero = `<div class="spotlight" style="min-width:0;background:#4a1d2b;color:#fff;padding:16px;height:300px;overflow:hidden"><b>#1 Spotlight</b><h2>One Piece</h2><p>Long description that wraps in a narrow column</p></div>`;
const share = `<div id="mainShare" style="background:#222;color:#aaa;padding:8px">Share this site</div>`;
const rails = `<div style="height:420px;background:#1b1b3a;margin-top:16px">Latest episodes</div><div style="height:300px;background:#202040;margin-top:16px">Top airing</div>`;
const layouts = {
  "the share widget in a flex row beside the hero": `<main><section style="display:flex">${hero}${share}</section>${rails}</main>`,
  "the share widget in a two-column grid with the hero": `<main><section style="display:grid;grid-template-columns:240px 1fr">${hero}${share}</section>${rails}</main>`,
  "the hero in a flex row, with no share widget": `<main><section style="display:flex">${hero.replace('class="spotlight"', 'class="spotlight hero"')}<aside style="flex:1;background:#123;color:#fff">Side</aside></section>${rails}</main>`,
  "the share widget nested two rows deep": `<main><section style="display:flex"><div style="display:flex;flex:1">${hero}${share}</div><aside style="width:40px;background:#123"></aside></section>${rails}</main>`,
  "everything in normal block flow": `<main>${hero}${share}${rails}</main>`,
  "a share widget that the site adds after the shelf mounted": `<main><section style="display:flex">${hero}<div id="slot"></div></section>${rails}</main>`,
};
const state = {
  animeData: {
    "yani-neko": { title: "Yani Neko", episodes: [{ number: 10, watchedAt: "2026-10-04T10:00:00Z", duration: 1400 }], totalEpisodes: 12 },
    "captain-tsubasa": { title: "Captain Tsubasa", episodes: [{ number: 30, watchedAt: "2026-10-04T09:00:00Z", duration: 1400 }], totalEpisodes: 52 },
  },
  videoProgress: {
    "yani-neko__episode-11": { currentTime: 800, duration: 1400, percentage: 57, savedAt: "2026-10-04T10:30:00Z" },
    "captain-tsubasa__episode-31": { currentTime: 300, duration: 1400, percentage: 21, savedAt: "2026-10-04T09:30:00Z" },
  },
};

async function layoutOf(browser, markup, { lateShare = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });
  try {
    const page = await context.newPage();
    await page.route("https://an1me.to/**", (route) => route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#1a1a2e;font-family:sans-serif}*{box-sizing:border-box}</style></head><body>${markup}</body></html>`,
    }));
    await page.addInitScript((snapshot) => {
      window.chrome = {
        runtime: { id: "test", lastError: null, sendMessage: (message, callback) => callback && callback({}), onMessage: { addListener() {} } },
        storage: {
          local: { get: (keys, callback) => callback(Object.fromEntries([].concat(keys).filter((key) => key in snapshot).map((key) => [key, snapshot[key]]))) },
          onChanged: { addListener() {}, removeListener() {} },
        },
      };
    }, state);
    await page.goto("https://an1me.to/");
    for (const content of scripts) await page.addScriptTag({ content });
    await page.waitForSelector("#at-continue-watching", { timeout: 3000 });
    if (lateShare) {
      await page.evaluate(() => { document.getElementById("slot").outerHTML = '<div id="mainShare" style="background:#222;color:#aaa;padding:8px;width:150px">Share this site</div>'; });
    }
    await page.waitForTimeout(400);
    return await page.evaluate(() => {
      const shelf = document.getElementById("at-continue-watching");
      const spotlight = document.querySelector(".spotlight").getBoundingClientRect();
      const box = shelf.getBoundingClientRect();
      return {
        left: Math.round(box.left), width: Math.round(box.width), viewport: document.documentElement.clientWidth,
        top: Math.round(box.top + scrollY), heroBottom: Math.round(spotlight.bottom + scrollY),
        shareLeft: !!document.getElementById("mainShare"),
        overflowsPage: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  let failures = 0;
  try {
    for (const [name, markup] of Object.entries(layouts)) {
      try {
        const box = await layoutOf(browser, markup, { lateShare: name.includes("adds after") });
        assert.equal(box.left, 12, "left margin matches the rest of the page");
        assert.equal(box.width, box.viewport - 24, "full width minus its margins");
        assert.ok(box.top >= box.heroBottom - 1, `sits below the hero (top ${box.top}, hero bottom ${box.heroBottom})`);
        assert.equal(box.shareLeft, false, "the site's own share widget is still replaced");
        assert.equal(box.overflowsPage, false, "no horizontal scrolling");
        console.log("PASS shelf is full width under the hero: " + name);
      } catch (error) {
        failures++;
        console.error("FAIL shelf is full width under the hero: " + name + ": " + error.message);
      }
    }
  } finally {
    await browser.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
