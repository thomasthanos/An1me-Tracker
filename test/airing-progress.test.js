// Pins how a card reports progress on a show that is still airing, and the episode being watched.
//
//   node test/airing-progress.test.js
//
// An airing show's total was recorded when fewer episodes were out (9) and kept capping it after more
// were released (11): the card read "Ep 11 · Total 10/9" at 100% while episode 11 was half watched.
// For a releasing show the total can never be below an episode that exists, and an unfinished episode
// is shown as the one being watched, with where it stopped, instead of looking finished.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { load } = require("./lib/grouping-harness.js");
const root = path.join(__dirname, "..");

function loadCards(info) {
  const { sandbox } = load();
  sandbox.document = new EventTarget();
  sandbox.document.querySelectorAll = () => [];
  sandbox.addEventListener = () => {};
  sandbox.PopupLogger = { debug() {}, error() {} };
  sandbox.URL = URL;
  const context = vm.createContext(sandbox);
  for (const file of ["src/common/utils.js", "src/common/data/entry-state.js", "src/common/data/merge-utils.js",
    "src/popup/lib/ui-helpers.js", "src/popup/services/filler-service.js", "src/popup/lib/anime-status.js", "src/popup/cards/anime-card.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  Object.assign(sandbox.AnimeTracker.AnilistService, {
    getAuthoritativeInfo: () => info,
    isInfoCompatibleWithEntry: () => true,
    getStatus: () => info?.status || null,
    getLatestEpisode: () => info?.latestEpisode || null,
    getTotalEpisodes: () => info?.totalEpisodes || null,
    getNextEpisodeAt: () => null,
  });
  return sandbox.AnimeTracker;
}

function entry(watched, status) {
  return {
    title: "Yani Neko",
    releaseStatus: status,
    episodes: Array.from({ length: watched }, (_, i) => ({ number: i + 1, duration: 1420 })),
  };
}

const text = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, "[icon]").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const progressInfo = (html) => text(html.match(/<div class="progress-info">([\s\S]*?)<\/div>/)?.[1] || "");
const progressBadge = (html) => text(html.match(/<span class="meta-badge meta-badge-progress"[^>]*>([\s\S]*?)<\/span>(?=\s*<span class="meta-badge|\s*<\/)/)?.[1] || "");

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures++;
    console.log(`  FAIL  ${name}: ${error.message}`);
  }
}

const AIRING = { status: "RELEASING", totalEpisodes: 9, latestEpisode: 11, cachedAt: Date.now() };
const HALF_WATCHED_11 = { "yani-neko__episode-11": { currentTime: 754, duration: 1420, percentage: 53 } };

test("a stale total on an airing show rises to the latest released episode", () => {
  const AT = loadCards(AIRING);
  assert.equal(AT.FillerService.getTotalEpisodes("yani-neko", entry(10, "RELEASING")), 11);
});

test("progress counts 10 of 11 instead of capping at 100%", () => {
  const AT = loadCards(AIRING);
  const html = AT.AnimeCardRenderer.createAnimeCard("yani-neko", entry(10, "RELEASING"), HALF_WATCHED_11);
  assert.equal(progressInfo(html), "[icon] Ep 11 · 12:34 · Watched 10/11 90.9%");
  assert.doesNotMatch(html, /Total 10\/9|>100%</);
});

test("the badge marks the unfinished episode as the one being watched", () => {
  const AT = loadCards(AIRING);
  const html = AT.AnimeCardRenderer.createAnimeCard("yani-neko", entry(10, "RELEASING"), HALF_WATCHED_11);
  assert.equal(progressBadge(html), "[icon]Ep 11/11");
});

test("with nothing half watched, the last finished episode is shown plainly", () => {
  const AT = loadCards(AIRING);
  const html = AT.AnimeCardRenderer.createAnimeCard("yani-neko", entry(10, "RELEASING"), {});
  assert.equal(progressInfo(html), "[icon] Ep 10 · Watched 10/11 90.9%");
  assert.equal(progressBadge(html), "Ep 10/11");
});

test("a season row shows the same progress and the episode being watched", () => {
  const AT = loadCards(AIRING);
  const html = AT.AnimeCardRenderer.createSeasonGroup("yani-neko", [{ slug: "yani-neko", anime: entry(10, "RELEASING") }], HALF_WATCHED_11);
  assert.equal(progressInfo(html), "[icon] Ep 11 · 12:34 · Watched 10/11 90.9%");
});

test("an airing show keeps its announced total when more is still to come", () => {
  const AT = loadCards({ status: "RELEASING", totalEpisodes: 12, latestEpisode: 11, cachedAt: Date.now() });
  assert.equal(AT.FillerService.getTotalEpisodes("yani-neko", entry(10, "RELEASING")), 12);
});

test("a finished show's total is unchanged", () => {
  const AT = loadCards({ status: "FINISHED", totalEpisodes: 12, latestEpisode: 12, cachedAt: Date.now() });
  assert.equal(AT.FillerService.getTotalEpisodes("yani-neko", entry(12, "FINISHED")), 12);
});

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
