// Places the speed button on an iPhone's ArtPlayer, upright and sideways, in a real browser.
//
//   node dev/test/speed-control-phone-layout.test.js
//
// The fixture copies an1me.to's player as measured on a phone (2026-10-06): a 38px control bar that does not wrap,
// inside .art-bottom, which clips whatever leaves it. Upright the bar is already full (back, play, forward, volume,
// the time, then quality, settings and fullscreen), and the button appended after fullscreen landed past the clipped
// edge, so it never showed. Sideways it showed after fullscreen, taller than the bar. These cases hold the
// replacement: in the bar before quality when it has room, otherwise in the player's top-right corner.
// AT_TEST_BROWSER selects Chromium; NODE_PATH can expose a bundled Playwright install.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  console.log("SKIP speed button phone layout: install Playwright or expose it through NODE_PATH");
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

// an1me.to's ArtPlayer, reduced to what decides where things land: the sizes and the rules that clip.
const PLAYER = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  body{margin:0;background:#111}
  .art-video-player{position:relative;width:100%;aspect-ratio:16/9;background:#000}
  .art-video{position:absolute;inset:0;width:100%;height:100%;z-index:10}
  .art-bottom{position:absolute;inset:0;z-index:60;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;pointer-events:none;padding:0 10px;opacity:0}
  .art-video-player.art-control-show .art-bottom,.art-video-player.art-hover .art-bottom{opacity:1}
  .art-controls{display:flex;height:38px;pointer-events:auto}
  .art-controls-left,.art-controls-right{display:flex}
  .art-controls-center{flex:1}
  .art-control{flex:none;display:flex;align-items:center;justify-content:center;height:38px;min-width:38px;color:#fff;font:13px sans-serif}
  .art-control-time{width:84px}.art-control-quality{width:48px}
  .art-settings{position:absolute;z-index:90}
</style></head><body>
<div class="artplayer-app"><div class="art-video-player art-mobile art-control-show">
  <video class="art-video" playsinline></video>
  <div class="art-bottom"><div class="art-progress"></div><div class="art-controls">
    <div class="art-controls-left"><div class="art-control art-control-seek-backward"></div><div class="art-control art-control-playAndPause"></div>
      <div class="art-control art-control-seek-forward"></div><div class="art-control art-control-volume"></div><div class="art-control art-control-time">00:00 / 23:25</div></div>
    <div class="art-controls-center"></div>
    <div class="art-controls-right"><div class="art-control art-control-quality">720p</div><div class="art-control art-control-setting"></div><div class="art-control art-control-fullscreen"></div></div>
  </div></div>
</div></div></body></html>`;

function stubs() {
  window.testStore = {};
  window.chrome = { runtime: { lastError: null, sendMessage(message, callback) { queueMicrotask(() => callback({ success: true })); } },
    storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {}, removeListener() {} } } };
  window.AnimeTrackerUtils = { isMobileDevice: () => true };
  const video = document.querySelector("video");
  Object.defineProperty(video, "readyState", { configurable: true, get: () => 1 });
  window.AnimeTrackerContent = { Storage: { get: async () => ({}) },
    PlayerObserver: { on(name, listener) { listener(video); return () => {}; } } };
}

// Where the button and the player's own controls are, relative to the player.
function measure() {
  const box = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
  };
  const widget = document.querySelector(".at-speed-control");
  const style = widget && getComputedStyle(widget);
  return {
    player: box(".art-video-player"), clip: box(".art-bottom"), bar: box(".art-controls"), widget: box(".at-speed-control"),
    button: box(".at-speed-button"), menu: box(".at-speed-menu"), quality: box(".art-control-quality"), fullscreen: box(".art-control-fullscreen"),
    parent: widget?.parentElement?.className || null,
    rightOrder: [...document.querySelector(".art-controls-right").children]
      .map((node) => node.classList.contains("at-speed-control") ? "at-speed-control" : node.className.split(" ").pop()),
    visible: !!style && style.visibility !== "hidden" && Number(style.opacity) > 0,
  };
}

const settle = (page) => page.waitForTimeout(300);
const inside = (inner, outer) => inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;

(async () => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  let failures = 0;
  const test = async (name, fn) => {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failures++; console.error("FAIL " + name + ": " + error.message); }
  };
  const open = async (width, height) => {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(PLAYER);
    const before = await page.evaluate(measure);
    await page.evaluate(stubs);
    for (const file of ["src/common/data/speed-preferences.js", "src/content/lib/page-events.js", "src/content/player/speed-control.js"]) {
      await page.addScriptTag({ content: read(file) });
    }
    await page.evaluate(() => window.AnimeTrackerContent.SpeedControl.start());
    await settle(page);
    return { context, page, before, errors };
  };
  const UPRIGHT = [375, 812], SIDEWAYS = [812, 375];
  try {
    await test("upright on a phone the button shows whole in the player's corner, and the player's controls stay where they were", async () => {
      const { context, page, before, errors } = await open(...UPRIGHT);
      const now = await page.evaluate(measure);
      assert.ok(now.widget, "the button is there");
      assert.ok(inside(now.widget, now.clip), `inside the player: ${JSON.stringify(now.widget)} in ${JSON.stringify(now.clip)}`);
      assert.ok(now.widget.top < now.bar.top, "in the corner above the control bar, not squeezed into it");
      assert.deepEqual([now.quality, now.fullscreen], [before.quality, before.fullscreen], "quality and fullscreen did not move");
      assert.ok(now.fullscreen.right <= now.clip.right, "fullscreen is still whole");
      assert.ok(now.button.bottom - now.button.top >= 44 && now.button.right - now.button.left >= 44, "a 44px touch target");
      assert.equal(now.visible, true);
      assert.deepEqual(errors, []);
      await context.close();
    });

    await test("sideways the button joins the control bar before quality, as tall as the bar, with fullscreen still last", async () => {
      const { context, page, errors } = await open(...SIDEWAYS);
      const now = await page.evaluate(measure);
      assert.equal(now.parent, "art-controls-right");
      assert.deepEqual(now.rightOrder, ["at-speed-control", "art-control-quality", "art-control-setting", "art-control-fullscreen"]);
      assert.deepEqual([now.widget.top, now.widget.bottom], [now.bar.top, now.bar.bottom], "as tall as the bar");
      assert.ok(inside(now.widget, now.clip) && now.fullscreen.right <= now.clip.right, "nothing pushed out of the player");
      assert.ok(now.button.right - now.button.left >= 44, "wide enough to tap");
      assert.deepEqual(errors, []);
      await context.close();
    });

    await test("turning the phone moves the button between the corner and the bar", async () => {
      const { context, page } = await open(...UPRIGHT);
      assert.equal((await page.evaluate(measure)).parent.includes("art-video-player"), true, "upright: the corner");
      await page.setViewportSize({ width: SIDEWAYS[0], height: SIDEWAYS[1] });
      await settle(page);
      assert.equal((await page.evaluate(measure)).parent, "art-controls-right", "sideways: the bar");
      await page.setViewportSize({ width: UPRIGHT[0], height: UPRIGHT[1] });
      await settle(page);
      const back = await page.evaluate(measure);
      assert.equal(back.parent.includes("art-video-player"), true, "upright again: the corner");
      assert.ok(inside(back.widget, back.clip));
      await context.close();
    });

    await test("the corner button hides with the player's controls, and stays while its menu is open", async () => {
      const { context, page } = await open(...UPRIGHT);
      const player = ".art-video-player";
      await page.evaluate((selector) => document.querySelector(selector).classList.remove("art-control-show"), player);
      assert.equal((await page.evaluate(measure)).visible, false, "hidden with the controls, so a tap cannot hit it unseen");
      await page.evaluate((selector) => document.querySelector(selector).classList.add("art-control-show"), player);
      assert.equal((await page.evaluate(measure)).visible, true);
      await page.evaluate(() => document.querySelector(".at-speed-button").click());
      await page.evaluate((selector) => document.querySelector(selector).classList.remove("art-control-show"), player);
      const open_ = await page.evaluate(measure);
      assert.equal(open_.visible, true, "an open menu is not hidden under the user's finger");
      await context.close();
    });

    await test("the speed menu fits inside the player, upright and sideways", async () => {
      for (const size of [UPRIGHT, SIDEWAYS]) {
        const { context, page } = await open(...size);
        await page.evaluate(() => document.querySelector(".at-speed-button").click());
        const now = await page.evaluate(measure);
        assert.ok(now.menu && inside(now.menu, now.player), `${size.join("x")}: ${JSON.stringify(now.menu)} in ${JSON.stringify(now.player)}`);
        await context.close();
      }
    });
  } finally {
    await browser.close();
  }
  process.exitCode = failures ? 1 : 0;
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
