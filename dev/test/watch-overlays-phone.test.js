// Checks that the overlays the tracker puts on a watch page stay on a phone's screen, in a real browser.
//
//   node dev/test/watch-overlays-phone.test.js
//
// The completion card was a fixed 340px card 30px from the right edge, and the Resume prompt was at least
// 280px plus padding. On a narrow phone, or an iPhone with Safari's page zoom up (125% leaves about 300
// CSS pixels), both started off-screen. Each overlay below must sit inside the viewport at 390px and 320px.
// AT_TEST_BROWSER selects Chromium; NODE_PATH can expose a bundled Playwright install.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  console.log("SKIP watch overlays: install Playwright or expose it through NODE_PATH");
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
// The scripts the manifest injects on a watch page, in order.
const manifest = JSON.parse(read("manifest.json"));
const watchScripts = manifest.content_scripts.find((cs) => cs.matches.some((match) => match.includes("/watch/"))).js.map(read);

const TITLE = "Ore dake Level Up na Ken Season 2: Arise from the Shadow";
const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${TITLE} Episode 3</title>
<style>body{margin:0;background:#111;color:#eee;font-family:sans-serif}</style></head><body>
<div class="art-video-player" style="position:relative;width:100%;aspect-ratio:16/9;background:#000"><video class="art-video" playsinline></video></div></body></html>`;
const OVERLAYS = {
  "the Resume prompt": ["#anime-tracker-resume-prompt",
    (AT) => AT.Notifications.showResumePrompt({ currentTime: 754, duration: 1420, percentage: 53, savedAt: new Date().toISOString() }, () => {}, () => {})],
  "the episode-complete card": [".at-notification-item",
    (AT, title) => AT.Notifications.showCompletion({ animeTitle: title, episodeNumber: 3, animeSlug: "solo-leveling-season-2" })],
  "the missed-episodes prompt": [".at-backlog-prompt", (AT, title) => AT.Notifications.showBacklogPrompt(title, [1, 2], () => {}, () => {})],
};

async function boxesAt(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });
  try {
    const p = await context.newPage();
    await p.route("**/*", (route) => route.request().url().startsWith("https://an1me.to/watch/") ? route.fulfill({ contentType: "text/html", body: page }) : route.abort());
    await p.addInitScript(() => {
      const empty = () => Promise.resolve({});
      window.chrome = {
        runtime: { id: "test", lastError: null, getURL: (x) => x, getManifest: () => ({ version: "0" }),
          sendMessage: (m, cb) => { if (typeof cb === "function") setTimeout(() => cb({ success: true })); return Promise.resolve({ success: true }); },
          onMessage: { addListener() {} } },
        storage: { local: { get: (k, cb) => { if (cb) setTimeout(() => cb({})); return empty(); }, set: (o, cb) => { if (cb) setTimeout(cb); return empty(); }, remove: empty },
          onChanged: { addListener() {}, removeListener() {} } },
      };
    });
    await p.goto("https://an1me.to/watch/solo-leveling-season-2-episode-3");
    for (const content of watchScripts) await p.addScriptTag({ content });
    // The watch page initialises about a second after load and clears any overlay; show them after that.
    await p.waitForTimeout(1500);
    const result = {};
    for (const [name, [selector, show]] of Object.entries(OVERLAYS)) {
      await p.evaluate(([source, title]) => { window.AnimeTrackerContent.Notifications.cleanup(); (0, eval)(`(${source})`)(window.AnimeTrackerContent, title); }, [show.toString(), TITLE]);
      await p.waitForSelector(selector);
      await p.waitForTimeout(700); // entry animations
      result[name] = await p.$eval(selector, (el) => {
        const b = el.getBoundingClientRect();
        return { left: b.left, right: b.right, viewport: document.documentElement.clientWidth };
      });
    }
    return result;
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  let failures = 0;
  try {
    for (const width of [390, 320]) {
      const boxes = await boxesAt(browser, width);
      for (const [name, box] of Object.entries(boxes)) {
        try {
          assert.ok(box.left >= 0, `starts off the left edge (${Math.round(box.left)})`);
          assert.ok(box.right <= box.viewport, `ends past the right edge (${Math.round(box.right)} > ${box.viewport})`);
          console.log(`PASS ${name} is on screen at ${width}px`);
        } catch (error) {
          failures++;
          console.error(`FAIL ${name} is on screen at ${width}px: ${error.message}`);
        }
      }
    }
  } finally {
    await browser.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
