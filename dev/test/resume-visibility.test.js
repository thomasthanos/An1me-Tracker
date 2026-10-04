const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const context = vm.createContext({ console }); context.window = context; context.self = context;
for (const file of ["src/common/utils.js", "src/common/data/multipart-mappings.js", "src/common/data/media-type.js",
  "src/common/data/anime-identity.js", "src/common/data/franchise-seasons.js", "src/common/data/entry-state.js",
  "src/common/data/merge-utils.js", "src/popup/lib/config.js", "src/popup/lib/ui-helpers.js",
  "src/popup/lib/progress-manager.js", "src/popup/cards/anime-card.js"])
  vm.runInContext(read(file), context, { filename: file });
const AT = context.AnimeTracker;
const series = { title: "Example", episodes: [], totalEpisodes: 12 };
const movie = { title: "Example Movie", mediaType: "MOVIE", listState: "completed", totalEpisodes: 1,
  episodes: [{ number: 1, durationSource: "video", duration: 6000 }] };
const saved = { currentTime: 600, duration: 1200, savedAt: "2026-10-04T09:00:00Z", pagePath: "example-episode-3" };
let failures = 0;
function test(name, run) { try { run(); console.log("PASS " + name); } catch (error) { failures++; console.error("FAIL " + name + ": " + error.message); } }
test("saved time and duration render a usable Resume card even without percentage", () => {
  const data = { example: series }, progress = { "example__episode-3": saved };
  const original = JSON.stringify({ data, progress });
  const items = AT.ProgressManager.getInProgressAnime(data, progress);
  assert.equal(items.length, 1); assert.equal(items[0].episodes[0].percentage, 50);
  const html = AT.AnimeCardRenderer.createInProgressItem(items[0]);
  assert.match(html, /class="ip-continue-btn"/); assert.match(html, /50%/); assert.match(html, /10:00/);
  assert.match(html, /watch\/example-episode-3/); assert.equal(JSON.stringify({ data, progress }), original);
});
test("invalid percentages fall back to time while completed positions stay out of Resume", () => {
  const items = AT.ProgressManager.getInProgressAnime({ example: series }, { "example__episode-3": { ...saved, percentage: "bad" } });
  assert.equal(items[0].episodes[0].percentage, 50);
  assert.equal(AT.ProgressManager.getInProgressAnime({ example: series }, { "example__episode-3": { ...saved, currentTime: 1100 } }).length, 0);
});
test("legacy imported positions without valid times never display NaN or Infinity", () => {
  for (const currentTime of [undefined, "bad", Infinity, -10]) {
    const record = { ...saved, percentage: 20, currentTime };
    const original = JSON.stringify(record);
    const items = AT.ProgressManager.getInProgressAnime({ example: series }, { "example__episode-3": record });
    const html = AT.AnimeCardRenderer.createInProgressItem(items[0]);
    assert.doesNotMatch(html, /NaN|Infinity|>-1:/);
    assert.match(html, /0:00 \/ 20m/);
    assert.equal(JSON.stringify(record), original);
  }
});
test("tracked movies keep their partial Resume position without changing completed list state", () => {
  const data = { "example-movie": movie }, progress = { "example-movie__episode-1": { ...saved, duration: 6000, percentage: 10 } };
  const original = JSON.stringify({ data, progress });
  const cleaned = AT.ProgressManager.cleanTrackedProgress(data, progress).cleaned;
  const items = AT.ProgressManager.getInProgressAnime(data, cleaned);
  assert.equal(items.length, 1); assert.match(AT.AnimeCardRenderer.createInProgressItem(items[0]), /Resume/);
  assert.equal(JSON.stringify({ data, progress }), original);
});
test("watched series, explicit completed series, dropped and on-hold entries remain excluded", () => {
  for (const entry of [{ ...series, episodes: [{ number: 3, durationSource: "video" }] },
    ...["completed", "dropped", "on_hold"].map(listState => ({ ...series, listState }))]) {
    assert.equal(AT.ProgressManager.getInProgressAnime({ example: entry }, { "example__episode-3": { ...saved, percentage: 50 } }).length, 0);
  }
  assert.equal(AT.ProgressManager.getInProgressAnime({ example: series }, { "example__episode-3": { ...saved, deleted: true } }).length, 0);
});
// Execute the real popup patch path. A live patch must update the destination/actions along
// with its episode label when two saved episodes change their recency order.
test("live Resume refresh derives percentage and keeps link/delete action on the displayed episode", () => {
  const parts = { fill: { style: { width: "10%" } }, badge: {}, items: [{}, {}], remaining: {}, started: {}, link: {}, remove: { dataset: { episode: "7" } } };
  const card = { dataset: { slug: "example" }, querySelector: selector => ({ ".ip-fill": parts.fill, ".ip-pct-badge": parts.badge,
    ".ip-remaining": parts.remaining, ".ip-meta-time": parts.started, ".ip-continue-btn": parts.link, ".ip-delete-btn": parts.remove })[selector], querySelectorAll: () => parts.items };
  context.document = { querySelectorAll: () => [card] }; context.AT = AT;
  context.animeData = { example: series }; context.PopupLogger = { debug() {} };
  const main = read("src/popup/main.js"), start = main.indexOf("  function _ipPatch(vp)"), end = main.indexOf('\n  document.addEventListener("keydown"', start);
  vm.runInContext(main.slice(start, end), context);
  context._ipPatch({ "example__episode-3": saved, "example__episode-7": { ...saved, savedAt: "2026-10-03T09:00:00Z" } });
  assert.equal(parts.badge.textContent, "50%"); assert.equal(parts.fill.style.width, "50%");
  assert.equal(parts.items[0].textContent, "Ep 3"); assert.equal(parts.link.href, "https://an1me.to/watch/example-episode-3");
  assert.equal(parts.remove.dataset.episode, "3");
  assert.equal(parts.link.title, "Continue watching Ep 3");
  assert.equal(parts.started.textContent, "Started Oct 4");
});
process.exitCode = failures ? 1 : 0;
