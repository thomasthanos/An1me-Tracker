// R04: watch routes resolve to one series key. Acts are episodes of their series, combined acts follow the
// existing combined-episode rule, and the routes that already parsed correctly keep their keys.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const quiet = { debug() {}, info() {}, warn() {}, error() {}, log() {} };
const routes = JSON.parse(read("dev/test/fixtures/site-routes/watch-routes.json"));

function parse(route) {
  const ctx = { URL, console, document: { querySelector: () => null, querySelectorAll: () => [] }, location: new URL(`https://an1me.to${route}`) };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.AnimeTrackerContent = { Logger: quiet, CONFIG: { SELECTORS: { CURRENT_EPISODE: [] } } };
  vm.createContext(ctx);
  for (const file of ["src/common/data/media-type.js", "src/common/data/anime-identity.js", "src/content/page/anime-parser.js"]) {
    vm.runInContext(read(file), ctx, { filename: file });
  }
  const info = ctx.AnimeTrackerContent.AnimeParser.extractAnimeInfo({ silent: true });
  return { slug: info.animeSlug, episode: info.episodeNumber, double: info.isDoubleEpisode, second: info.secondEpisodeNumber };
}

let failures = 0;
for (const { route, expected, why } of routes) {
  try {
    assert.deepEqual(parse(route), expected);
    console.log(`PASS ${route} (${why})`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${route} (${why}): ${error.message}`);
  }
}

// Every act of one series, single or combined, lands on the same series key.
const areaKeys = new Set(["/watch/area-88-act-1-act-2/", "/watch/area-88-act-3/"].map((route) => parse(route).slug));
try {
  assert.deepEqual([...areaKeys], ["area-88"]);
  console.log("PASS all Area 88 acts share one series key");
} catch (error) {
  failures++;
  console.error(`FAIL all Area 88 acts share one series key: ${error.message}`);
}
process.exitCode = failures ? 1 : 0;
