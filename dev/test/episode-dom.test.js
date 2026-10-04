const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { load } = require("./lib/grouping-harness.js");
const root = path.join(__dirname, "../..");

function loadCards() {
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
    getStatus: () => null, getLatestEpisode: () => null, getTotalEpisodes: () => null, getNextEpisodeAt: () => null,
  });
  return sandbox.AnimeTracker;
}

function anime(count, first = 1) {
  return { title: "Example", releaseStatus: "FINISHED", totalEpisodes: first + count - 1,
    episodes: Array.from({ length: count }, (_, i) => ({ number: i + first, duration: 1200 })) };
}

function wrapper(html, className, index = 0) {
  const matches = [...html.matchAll(new RegExp(`<div class="${className}"([^>]*)>([\\s\\S]*?)<\\/div>`, "g"))];
  assert.ok(matches[index], `${className} wrapper must remain in the markup`);
  const token = matches[index][1].match(/data-episode-overflow="([^"]+)"/)?.[1];
  let markup = matches[index][2];
  return {
    dataset: { episodeOverflow: token },
    get childElementCount() { return (markup.match(/<span\b/g) || []).length; },
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = value; },
  };
}

const tags = html => [...html.matchAll(/<span class="episode-tag(?: [^"]*)?"[^>]*>Ep (\d+)<\/span>/g)].map(m => Number(m[1]));
const plain = value => JSON.parse(JSON.stringify(value));

function run() {
  let failures = 0;
  function test(name, fn) {
    try { fn(); console.log(`PASS ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
  }
  // These regress if the renderer rebuilds large hidden tag strings or alters source progress.
  test("a 1000-episode card initially renders only its first ten episode tags", () => {
    const AT = loadCards(), entry = anime(1000), before = plain(entry);
    const html = AT.AnimeCardRenderer.createAnimeCard("example", entry);
    assert.deepEqual(tags(html), [1000, 999, 998, 997, 996, 995, 994, 993, 992, 991]);
    assert.equal(wrapper(html, "hidden-episodes").innerHTML, "");
    assert.match(html, /data-more-text="\+990 more" data-less-text="Show less">\+990 more/);
    assert.deepEqual(plain(entry), before);
  });
  test("unwatched filler overflow stays deferred with its six visible tags and exact count", () => {
    const AT = loadCards(); AT.FillerService.KNOWN_FILLERS.example = [[1, 30]];
    const html = AT.AnimeCardRenderer.createAnimeCard("example", { ...anime(1, 31), totalEpisodes: 40 });
    assert.deepEqual(tags(html), [31, 30, 29, 28, 27, 26, 25]);
    assert.equal(wrapper(html, "hidden-fillers").innerHTML, "");
    assert.match(html, /data-more-text="\+24 more" data-less-text="Show less">\+24 more/);
  });
  test("opening a watched overflow hydrates every omitted tag once with filler styling", () => {
    const AT = loadCards(); AT.FillerService.KNOWN_FILLERS.example = [[1, 1]];
    const entry = anime(12), html = AT.AnimeCardRenderer.createAnimeCard("example", entry);
    const hidden = wrapper(html, "hidden-episodes");
    assert.equal(hidden.childElementCount, 0, "hidden tags should be absent until requested");
    assert.equal(typeof AT.AnimeCardRenderer.hydrateEpisodeOverflow, "function");
    AT.AnimeCardRenderer.hydrateEpisodeOverflow(hidden);
    assert.deepEqual(tags(hidden.innerHTML), [2, 1]);
    assert.match(hidden.innerHTML, /class="episode-tag filler watched-filler" title="Filler Episode \(Watched\)">Ep 1/);
    const first = hidden.innerHTML;
    AT.AnimeCardRenderer.hydrateEpisodeOverflow(hidden);
    assert.equal(hidden.innerHTML, first, "show less / more must not duplicate tags");
  });
  test("opening filler overflow retains all omitted episode numbers and unwatched styling", () => {
    const AT = loadCards(); AT.FillerService.KNOWN_FILLERS.example = [[1, 8]];
    const html = AT.AnimeCardRenderer.createAnimeCard("example", { ...anime(1, 9), totalEpisodes: 12 });
    const hidden = wrapper(html, "hidden-fillers");
    assert.equal(hidden.childElementCount, 0);
    assert.equal(typeof AT.AnimeCardRenderer.hydrateEpisodeOverflow, "function");
    AT.AnimeCardRenderer.hydrateEpisodeOverflow(hidden);
    assert.deepEqual(tags(hidden.innerHTML), [2, 1]);
    assert.match(hidden.innerHTML, /class="episode-tag filler unwatched-filler" title="Filler Episode \(Not watched\)">Ep 1/);
  });
  test("season groups defer both watched and filler overflow while merged movie rows remain unchanged", () => {
    const AT = loadCards(); AT.FillerService.KNOWN_FILLERS.example = [[1, 20]];
    const movie = { slug: "example-movie-1", anime: { ...anime(1), title: "Example Movie 1", mediaType: "MOVIE" }, isMovie: true };
    const html = AT.AnimeCardRenderer.createSeasonGroup("example", [{ slug: "example", anime: { ...anime(12, 21), totalEpisodes: 40 } }, movie]);
    assert.deepEqual(tags(html), [32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 20, 19, 18, 17, 16, 15]);
    assert.equal(wrapper(html, "hidden-episodes").innerHTML, "");
    assert.equal(wrapper(html, "hidden-fillers").innerHTML, "");
    assert.match(html, /season-item-movie/);
    AT.AnimeCardRenderer.hydrateEpisodeOverflow(wrapper(html, "hidden-episodes"));
    const fillers = wrapper(html, "hidden-fillers"); AT.AnimeCardRenderer.hydrateEpisodeOverflow(fillers);
    assert.deepEqual(tags(fillers.innerHTML), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });
  test("multipart groups hydrate display episode numbers rather than stored offsets", () => {
    const AT = loadCards(), entry = { ...anime(25), title: "Fate/Zero" };
    const html = AT.AnimeCardRenderer.createSeasonGroup("fate-zero", [{ slug: "fate-zero", anime: entry }]);
    const hidden = wrapper(html, "hidden-episodes", 1);
    assert.equal(hidden.childElementCount, 0);
    AT.AnimeCardRenderer.hydrateEpisodeOverflow(hidden);
    assert.deepEqual(tags(hidden.innerHTML), [2, 1]);
  });
  test("standalone parts preserve absolute episode labels when hydrating", () => {
    const AT = loadCards(), entry = anime(25);
    const html = AT.AnimeCardRenderer.createPartsSection("fate-zero", entry.episodes);
    const hidden = wrapper(html, "hidden-episodes", 1);
    assert.equal(hidden.childElementCount, 0);
    AT.AnimeCardRenderer.hydrateEpisodeOverflow(hidden);
    assert.deepEqual(tags(hidden.innerHTML), [15, 14]);
  });
  test("registry tokens stay stable for unchanged cards and survive pruning when their nodes are reused", () => {
    const AT = loadCards(), renderer = AT.AnimeCardRenderer, entry = anime(12);
    const old = wrapper(renderer.createAnimeCard("example", entry), "hidden-episodes");
    assert.ok(old.dataset.episodeOverflow, "deferred markup needs a short lookup token");
    const repeated = wrapper(renderer.createAnimeCard("example", entry), "hidden-episodes");
    assert.equal(repeated.dataset.episodeOverflow, old.dataset.episodeOverflow);
    const replacement = wrapper(renderer.createAnimeCard("example", anime(13)), "hidden-episodes");
    assert.notEqual(replacement.dataset.episodeOverflow, old.dataset.episodeOverflow);
    renderer.pruneEpisodeOverflow({ querySelectorAll: () => [old] });
    const retained = wrapper(renderer.createAnimeCard("example", entry), "hidden-episodes");
    assert.equal(retained.dataset.episodeOverflow, old.dataset.episodeOverflow, "discarding a newer render must preserve the live card's stable token");
    renderer.hydrateEpisodeOverflow(old);
    assert.deepEqual(tags(old.innerHTML), [2, 1]);
    renderer.hydrateEpisodeOverflow(replacement);
    assert.equal(replacement.innerHTML, "", "detached render records must be released");
    renderer.pruneEpisodeOverflow({ querySelectorAll: () => [] });
    const detached = { ...old, innerHTML: "" }; renderer.hydrateEpisodeOverflow(detached);
    assert.equal(detached.innerHTML, "");
  });
  test("a filler reclassification invalidates already hydrated hidden episode styling", () => {
    const AT = loadCards(), renderer = AT.AnimeCardRenderer, entry = anime(12);
    AT.FillerService.KNOWN_FILLERS.example = [[1, 1]];
    const old = wrapper(renderer.createAnimeCard("example", entry), "hidden-episodes");
    assert.equal(typeof renderer.hydrateEpisodeOverflow, "function");
    renderer.hydrateEpisodeOverflow(old);
    AT.FillerService.KNOWN_FILLERS.example[0] = [2, 2];
    const replacement = wrapper(renderer.createAnimeCard("example", entry), "hidden-episodes");
    assert.notEqual(replacement.dataset.episodeOverflow, old.dataset.episodeOverflow, "unchanged visible tags must not preserve stale hidden filler classes");
    renderer.hydrateEpisodeOverflow(replacement);
    assert.match(replacement.innerHTML, /class="episode-tag filler watched-filler" title="Filler Episode \(Watched\)">Ep 2/);
    assert.match(replacement.innerHTML, /class="episode-tag" title="">Ep 1/);
  });
  process.exitCode = failures ? 1 : 0;
}
if (require.main === module) run();
module.exports = { loadCards, anime };
