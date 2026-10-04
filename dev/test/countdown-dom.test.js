// Exercises the real card renderer and countdown against an actual browser DOM.
// AT_TEST_BROWSER selects Chromium; NODE_PATH can expose a bundled Playwright install.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  console.log("SKIP countdown DOM integration: install Playwright or expose it through NODE_PATH");
  process.exit(0);
}
const root = path.resolve(__dirname, "../..");
const candidates = [process.env.AT_TEST_BROWSER,
  ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap(dir => [path.join(dir, "Microsoft/Edge/Application/msedge.exe"), path.join(dir, "Google/Chrome/Application/chrome.exe")]),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium", "/usr/bin/google-chrome",
].filter(Boolean);
const executablePath = candidates.find(file => fs.existsSync(file));
const scripts = ["src/common/utils.js", "src/common/data/multipart-mappings.js", "src/common/data/anime-identity.js",
  "src/common/data/franchise-seasons.js", "src/common/data/media-type.js", "src/common/data/entry-state.js",
  "src/popup/lib/config.js", "src/common/data/merge-utils.js", "src/common/data/cache-policy.js",
  "src/popup/lib/ui-helpers.js", "src/popup/services/filler-service.js", "src/popup/lib/anime-status.js",
  "src/popup/lib/airing-countdown.js", "src/popup/cards/anime-card.js"];

function runInBrowser() {
  const AT = window.AnimeTracker;
  const countdown = AT.AiringCountdown;
  const host = document.getElementById("cards");
  const timers = window.testTimers;
  const results = [];
  function equal(actual, expected, message) {
    if (actual !== expected) throw new Error(`${message}: ${actual} !== ${expected}`);
  }
  function test(name, fn) {
    countdown.stop(); host.replaceChildren();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    window.testNow = Date.parse("2026-10-04T10:00:00Z");
    try { fn(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.stack }); }
    countdown.stop();
  }
  AT.AnilistService = {
    getAuthoritativeInfo: () => ({ status: "RELEASING", latestEpisode: 5, totalEpisodes: 13 }),
    isInfoCompatibleWithEntry: () => true, getStatus: () => "RELEASING", getLatestEpisode: () => 5,
    getTotalEpisodes: () => 13, getMediaType: () => "TV",
    getNextEpisodeAt: () => new Date(window.testNow + 31 * 3600000).toISOString(),
    getAiringSchedule: () => ({ episode: 6 }),
  };
  function renderCard() {
    const anime = { title: "SVG Countdown Series", releaseStatus: "RELEASING", totalEpisodes: 13,
      lastWatched: "2026-09-15T12:00:00Z",
      episodes: [1, 2, 3].map(number => ({ number, watchedAt: "2026-09-15T12:00:00Z", duration: 1440 })) };
    const before = JSON.stringify(anime);
    host.innerHTML = AT.AnimeCardRenderer.createAnimeCard("svg-countdown-series", anime, {});
    equal(JSON.stringify(anime), before, "render keeps watched data unchanged");
    return host.querySelector("[data-next-airing-at]");
  }
  function preparedCountdown() {
    const node = renderCard();
    // Supply the new markup independently to catch replacing the whole node on a tick.
    node.innerHTML = `<span class="meta-time-icon" aria-hidden="true">${AT.UIHelpers.createIcon("time")}</span><span class="meta-time-label">1d 7h</span>`;
    return node;
  }
  test("real cards render decorative date and countdown SVGs before the first tick", () => {
    const node = renderCard();
    equal(!!host.querySelector(".meta-time .meta-time-icon svg"), true, "calendar SVG");
    equal(!!node.querySelector(".meta-time-icon svg"), true, "countdown SVG");
    equal(node.querySelector(".meta-time-icon").getAttribute("aria-hidden"), "true", "decorative icon");
    equal(node.querySelector(".meta-time-label").textContent, "1d 7h", "plain countdown label");
    equal(node.title.startsWith("Next episode (ep. 6):"), true, "schedule tooltip retained");
    equal(host.querySelector(".meta-time-progress-pct").textContent, "60%", "watched percentage");
    equal(host.querySelector(".meta-time-progress-fill").style.width, "60%", "progress width");
  });
  test("live countdown ticks keep the same SVG and label nodes with one shared timer", () => {
    const node = preparedCountdown();
    const icon = node.querySelector("svg"), label = node.querySelector(".meta-time-label");
    countdown.start(); countdown.start(); countdown.refresh();
    equal(timers.size, 1, "one shared interval");
    window.testNow += 90 * 60000;
    [...timers.values()][0]();
    equal(node.querySelector("svg"), icon, "icon remains attached after a live tick");
    equal(node.querySelector(".meta-time-label"), label, "label remains attached after a live tick");
    equal(label.textContent, "1d 5h", "tick catches up label");
    equal(timers.size, 1, "tick reuses timer");
  });
  test("hidden and re-shown countdowns preserve their SVG while catching up due and delayed labels", () => {
    const node = preparedCountdown(), icon = node.querySelector("svg");
    countdown.start();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    equal(timers.size, 0, "hidden document owns no timer");
    node.dataset.nextAiringAt = String(window.testNow - 2 * 86400000);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    equal(node.querySelector("svg"), icon, "icon survives re-show");
    equal(node.querySelector(".meta-time-label").textContent, "delayed 2d", "delayed state catches up");
    equal(node.classList.contains("meta-time-eta-overdue"), true, "delayed warning color");
    equal(timers.size, 1, "re-show owns one timer");
    node.dataset.nextAiringAt = String(window.testNow);
    [...timers.values()][0]();
    equal(node.querySelector(".meta-time-label").textContent, "due now", "due state remains visible");
    equal(node.classList.contains("meta-time-eta-overdue"), false, "due now clears overdue state");
    equal(node.querySelector("svg"), icon, "icon survives due transition");
    host.hidden = true; countdown.refresh();
    equal(timers.size, 0, "hidden view owns no timer");
    host.hidden = false; countdown.refresh();
    equal(timers.size, 1, "visible view restarts one timer");
    host.replaceChildren(); countdown.refresh();
    equal(timers.size, 0, "empty view owns no timer");
  });
  test("a legacy text countdown upgrades once and retains its icon on subsequent ticks", () => {
    const node = renderCard(); node.textContent = "🚀 stale";
    countdown.start();
    const icon = node.querySelector("svg");
    equal(!!icon, true, "legacy node gains SVG");
    equal(node.querySelector(".meta-time-label").textContent, "1d 7h", "legacy label refreshed");
    countdown.refresh(); [...timers.values()][0]();
    equal(node.querySelector("svg"), icon, "upgrade is performed once");
  });
  test("invalid timestamps cannot create a countdown or keep the shared timer running", () => {
    for (const at of ["", "NaN", "Infinity", "0", "-1"]) {
      const node = document.createElement("span"); node.dataset.nextAiringAt = at; host.append(node);
    }
    countdown.start(); equal(timers.size, 0, "no interval for invalid schedules");
    equal(host.querySelectorAll("svg").length, 0, "invalid schedules do not acquire icons");
  });
  document.getElementById("results").textContent = JSON.stringify(results);
}
const setup = `window.AnimeTracker = {}; window.PopupLogger = {debug(){}, error(){}};
  window.testNow = Date.parse("2026-10-04T10:00:00Z"); Date.now = () => window.testNow;
  window.testTimers = new Map(); let nextTimer = 0;
  window.setInterval = callback => { const id = ++nextTimer; window.testTimers.set(id, callback); return id; };
  window.clearInterval = id => window.testTimers.delete(id);`;
const html = `<html><body><div id="cards"></div><pre id="results">pending</pre><script>${setup}</script>
  ${scripts.map(file => `<script>${fs.readFileSync(path.join(root, file), "utf8").replace(/<\/script/gi, "<\\/script")}</script>`).join("")}
  <script>(${runInBrowser.toString()})();</script></body></html>`;
(async () => {
  const instance = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const page = await instance.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.abort());
    await page.route("https://an1me.to/countdown-dom-test", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("https://an1me.to/countdown-dom-test");
    const output = await page.locator("#results").textContent();
    assert.notEqual(output, "pending", "browser fixture completes: " + errors.join("; "));
    const outcomes = JSON.parse(output);
    for (const outcome of outcomes) console.log(`${outcome.passed ? "PASS" : "FAIL"} ${outcome.name}${outcome.error ? "\n" + outcome.error : ""}`);
    assert.equal(errors.length, 0, errors.join("; "));
    process.exitCode = outcomes.every(outcome => outcome.passed) ? 0 : 1;
  } finally { await instance.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
