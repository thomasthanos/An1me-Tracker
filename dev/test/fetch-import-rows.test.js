// Checks that Fetch & Import rows can be read at phone and desktop popup sizes, in a real browser.
//
//   node dev/test/fetch-import-rows.test.js
//
// Each row is a title and a detail that says what happened ("info cached • filler site unreachable
// (no site access)"). The detail used to share one line with the title, capped at about half the width
// and cut with an ellipsis, so on an iPhone every reason ended as "info cached • filler site unr…" and
// the one part that tells the user what to do was never visible. These cases hold the replacement: the
// title stays beside its icon, the detail sits whole on the line below, and nothing scrolls sideways.
// AT_TEST_BROWSER selects Chromium; NODE_PATH can expose a bundled Playwright install.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  console.log("SKIP fetch import rows: install Playwright or expose it through NODE_PATH");
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
// Every stylesheet the popup loads, in its order, so the overlay is laid out exactly as in the extension.
const css = [...read("popup.html").matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => read(match[1])).join("\n");
const script = read("src/popup/lib/filler-fetch-ui.js");

const ROWS = [
  ["fetch", "Yani Neko", "info refreshed • 0 fillers / 12 eps"],
  ["retry", "Ore dake Level Up na Ken Season 2: Arise from the Shadow", "info cached • filler site unreachable (no site access)"],
  ["retry", "Captain Tsubasa Season 2: Junior Youth-hen", "info cached • filler site unreachable (blocked by Cloudflare)"],
  ["nofill", "Mushoku Tensei: Jobless Reincarnation Season 2 Part 2", "info cached • not listed"],
  ["retry", "Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season", "info cached • filler offline, retry later"],
];
const SIZES = {
  "an iPhone": { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  "a small iPhone": { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  "the desktop popup": { viewport: { width: 420, height: 600 }, deviceScaleFactor: 2 },
};

async function measure(browser, options) {
  const context = await browser.newContext(options);
  try {
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body></body></html>`);
    await page.addScriptTag({ content: script });
    return await page.evaluate(async (rows) => {
      const ui = window.AnimeTracker.FillerFetchUI;
      ui.createModal();
      await ui.open();
      for (const [type, name, detail] of rows) ui._log(type, name, detail);
      const log = document.getElementById(ui.IDS.logFeed);
      return {
        rows: [...log.querySelectorAll(".ffui-log-row")].map((row) => {
          const box = (name) => row.querySelector(".ffui-log-" + name).getBoundingClientRect();
          const detail = row.querySelector(".ffui-log-detail");
          return {
            name: row.querySelector(".ffui-log-name").textContent,
            detailWhole: detail.scrollWidth <= detail.clientWidth + 1 && detail.scrollHeight <= detail.clientHeight + 1,
            nameBesideIcon: Math.abs(box("icon").top - box("name").top) < 4,
            detailBelowName: box("detail").top >= box("name").bottom - 1,
            insideRow: box("detail").right <= row.getBoundingClientRect().right + 1,
          };
        }),
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        widest: [...document.querySelectorAll("body *")].map((el) => [el.className, Math.round(el.getBoundingClientRect().right)]).sort((a, b) => b[1] - a[1]).slice(0, 3),
        logHeight: log.getBoundingClientRect().height,
      };
    }, ROWS);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  let failures = 0;
  const test = async (name, fn) => {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failures++; console.error("FAIL " + name + ": " + error.message); }
  };
  try {
    const results = {};
    for (const [size, options] of Object.entries(SIZES)) results[size] = await measure(browser, options);
    for (const size of Object.keys(SIZES)) {
      await test(`every row's detail is shown whole on ${size}`, async () => {
        for (const row of results[size].rows) assert.equal(row.detailWhole, true, `${row.name}: detail is cut`);
      });
      await test(`titles stay beside their icon and details sit below them on ${size}`, async () => {
        for (const row of results[size].rows) {
          assert.equal(row.nameBesideIcon, true, `${row.name}: title moved off the icon's line`);
          assert.equal(row.detailBelowName, true, `${row.name}: detail is not below the title`);
          assert.equal(row.insideRow, true, `${row.name}: detail spills out of its row`);
        }
        assert.equal(results[size].sideways, false, "no horizontal scrolling: " + JSON.stringify(results[size].widest));
      });
    }
    await test("a phone shows more rows than the desktop popup, which keeps its height", async () => {
      assert.ok(results["an iPhone"].logHeight > results["the desktop popup"].logHeight, `${results["an iPhone"].logHeight} vs ${results["the desktop popup"].logHeight}`);
      assert.ok(results["the desktop popup"].logHeight <= 174, "the desktop feed is unchanged: " + results["the desktop popup"].logHeight);
    });
  } finally {
    await browser.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
