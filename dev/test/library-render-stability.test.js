// Real DOM integration tests. Uses Playwright from normal module resolution (or NODE_PATH).
// AT_TEST_BROWSER can select a Chromium executable; missing Playwright is an explicit skip.
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  console.log("SKIP library DOM integration: install Playwright or expose it through NODE_PATH");
  process.exit(0);
}

const root = path.resolve(__dirname, "../..");
const candidates = [process.env.AT_TEST_BROWSER,
  ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap(dir => [path.join(dir, "Microsoft/Edge/Application/msedge.exe"), path.join(dir, "Google/Chrome/Application/chrome.exe")]),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/microsoft-edge",
].filter(Boolean);
const browser = candidates.find(file => fs.existsSync(file));

function runInBrowser() {
  const AT = window.AnimeTracker;
  const results = [];
  function test(name, fn) {
    try { fn(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.stack }); }
  }
  function equal(actual, expected, message) { if (actual !== expected) throw new Error(message + ": " + actual + " !== " + expected); }
  function entry(title, overrides = {}) {
    return { title, totalEpisodes: 48, releaseStatus: "FINISHED", lastWatched: "2026-10-01T12:00:00Z",
      coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/audit.jpg",
      episodes: Array.from({ length: 24 }, (_, i) => ({ number: i + 1, watchedAt: "2026-10-01T12:00:00Z", duration: 1440 })), ...overrides };
  }
  AT.AnimeActions = {};
  AT.AddAnimeDialog = {};
  AT.AnilistService = { getAuthoritativeInfo: () => null, isInfoCompatibleWithEntry: () => true,
    getTotalEpisodes: () => null, getStatus: () => null, getLatestEpisode: () => null,
    getMediaType: () => null, getNextEpisodeAt: () => null, getAiringSchedule: () => null };
  const list = document.getElementById("animeList");
  const host = document.querySelector(".main-content");
  const elements = { animeList: list, emptyState: document.getElementById("emptyState"),
    searchEmptyState: document.getElementById("searchEmptyState"), searchEmptyQuery: document.getElementById("searchEmptyQuery"),
    listLoading: document.getElementById("listLoading") };
  function reset(animeData, progress = {}) {
    list.replaceChildren();
    AT.PopupState = { animeData, videoProgress: progress, currentCategory: "all", currentSort: "name",
      currentCompactStatus: "completed", currentCompactStatusOpen: false, lastRenderedListMarkup: null, libraryLoaded: true };
    AT.RenderList._init({ elements, _ipPatch() {}, getActiveFilter: () => "", markInternalSave() {},
      normalizeCompactStatus: status => status || "airing", suppressHoverUntilMouseMove() {}, updateStats() {} });
    AT.RenderList.renderAnimeList();
  }
  const card = slug => list.querySelector(`.anime-card[data-slug="${slug}"]`);
  test("saved positions without percentage render Resume and a finite progress bar", () => {
    const progress = { "audit-series__episode-25": { currentTime: 600, duration: 1200, savedAt: "2026-10-04T09:00:00Z" } };
    const before = JSON.stringify(progress);
    reset({ "audit-series": entry("Audit Series") }, progress);
    const resume = list.querySelector('.ip-card[data-slug="audit-series"]');
    equal(!!resume, true, "Resume card exists");
    equal(resume.querySelector(".ip-pct-badge").textContent, "50%", "derived percentage");
    equal(resume.querySelector(".ip-fill").style.width, "50%", "finite progress bar");
    equal(resume.querySelector(".ip-continue-btn").href, "https://an1me.to/watch/audit-series-episode-25", "Resume URL");
    equal(JSON.stringify(progress), before, "stored position is unchanged");
  });
  test("a completed movie with a retained partial position also appears in Resume", () => {
    reset({ "standalone-movie": entry("Standalone Movie", { mediaType: "MOVIE", listState: "completed", totalEpisodes: 1,
      episodes: [{ number: 1, duration: 6000, durationSource: "video" }] }) },
      { "standalone-movie__episode-1": { currentTime: 1800, duration: 6000, percentage: 30, savedAt: "2026-10-04T09:00:00Z" } });
    const resume = list.querySelector('.ip-card[data-slug="standalone-movie"]');
    equal(!!resume, true, "completed movie Resume survives status filter");
    equal(resume.querySelector(".ip-continue-btn").href, "https://an1me.to/watch/standalone-movie-episode-1", "movie Resume URL");
    equal(AT.PopupState.animeData["standalone-movie"].listState, "completed", "completed list state retained");
  });
  // The real formatter supplies plain text; stripping an old emoji prefix would lose days,
  // hours or due/delayed status from the compact section even while card countdowns look right.
  for (const { offset, expected } of [
    { offset: 31 * 3600000, expected: "1 anime · next in 1d 7h" },
    { offset: (3 * 60 + 12) * 60000, expected: "1 anime · next in 3h 12m" },
    { offset: 5 * 60000, expected: "1 anime · next in 5m" },
    { offset: -3600000, expected: "1 anime · due now" },
    { offset: -7 * 3600000, expected: "1 anime · due today" },
    { offset: -2 * 86400000, expected: "1 anime · delayed 2d" },
  ]) {
    test(`compact Airing section preserves "${expected}"`, () => {
      const previousService = AT.AnilistService, previousNow = Date.now;
      const now = Date.parse("2026-10-04T10:00:00Z");
      Date.now = () => now;
      AT.AnilistService = { ...previousService,
        getStatus: () => "RELEASING", getTotalEpisodes: () => 13, getLatestEpisode: () => 5,
        getNextEpisodeAt: () => new Date(now + offset).toISOString(), getAiringSchedule: () => ({ episode: 6 }) };
      try {
        reset({ "airing-series": entry("Airing Series", { releaseStatus: "RELEASING", totalEpisodes: 13,
          episodes: Array.from({ length: 5 }, (_, i) => ({ number: i + 1, duration: 1440 })) }) });
        equal(list.querySelector(".airing-list-label-sub").textContent, expected, "complete section countdown");
      } finally {
        AT.AnilistService = previousService;
        Date.now = previousNow;
      }
    });
  }
  // Catches replacing the whole list after a single metadata update. Real cards/images and
  // delegated expansion handlers are used so retaining a renderer mock cannot satisfy it.
  test("one entry update keeps the other 118 cards and their images attached", () => {
    reset(Object.fromEntries(Array.from({ length: 119 }, (_, i) => ["audit-series-" + i, entry("Series " + String(i).padStart(3, "0"))])));
    const originals = [...list.querySelectorAll(".anime-card")];
    const stable = card("audit-series-10"), image = stable.querySelector("img");
    equal(!!image, true, "fixture has a real cover image");
    stable.querySelector(".anime-card-header").click();
    const more = stable.querySelector(".show-more-episodes");
    more.click();
    const hidden = stable.querySelector(".hidden-episodes");
    host.scrollTop = 250;
    const scroll = host.scrollTop;
    const progressBefore = JSON.stringify(AT.PopupState.videoProgress);
    const observer = new MutationObserver(() => {});
    observer.observe(list, { childList: true });
    AT.PopupState.animeData["audit-series-0"].totalEpisodes = 96;
    AT.RenderList.renderAnimeList();
    const detachedUnchanged = observer.takeRecords().flatMap(record => [...record.removedNodes])
      .filter(node => originals.slice(1).includes(node));
    observer.disconnect();
    equal(detachedUnchanged.length, 0, "unchanged cards are never detached during the update");
    equal(originals.slice(1).filter(node => node.isConnected).length, 118, "unchanged attached cards");
    equal(card("audit-series-10"), stable, "card identity");
    equal(stable.querySelector("img"), image, "image identity");
    equal(stable.classList.contains("expanded"), true, "card expansion");
    equal(stable.querySelector(".hidden-episodes"), hidden, "hydrated episode wrapper identity");
    equal(hidden.classList.contains("expanded"), true, "show-more expansion");
    equal(host.scrollTop, scroll, "scroll position");
    equal(JSON.stringify(AT.PopupState.videoProgress), progressBefore, "progress storage");
    equal(card("audit-series-0").textContent.includes("48/96"), false, "unwatched total does not become watched");
    equal(card("audit-series-0").textContent.includes("24/96"), true, "updated total is rendered");
  });
  // Catches keeping stale order while preserving cards.
  test("sorting moves the existing cards into the requested order", () => {
    reset({ alpha: entry("Alpha", { lastWatched: "2026-09-01T12:00:00Z" }), bravo: entry("Bravo"), charlie: entry("Charlie", { lastWatched: "2026-10-02T12:00:00Z" }) });
    const originals = [card("alpha"), card("bravo"), card("charlie")];
    AT.PopupState.currentSort = "date";
    AT.RenderList.renderAnimeList();
    equal([...list.querySelectorAll(".anime-card")].map(node => node.dataset.slug).join(","), "charlie,bravo,alpha", "date order");
    originals.forEach(node => equal(card(node.dataset.slug), node, "sorted card identity"));
  });
  // A fetched blob changes the generated src but not the card's data or artwork identity.
  test("warming cover URLs does not remount unchanged cards", () => {
    let warmed = false;
    AT.LibraryCoverLoader = { observe() {} };
    AT.CoverCache = { resolve: url => warmed ? "blob:fixture-cover" : url };
    reset({ alpha: entry("Alpha", { coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/alpha.jpg" }), bravo: entry("Bravo", { coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/bravo.jpg" }) });
    const original = card("bravo"), image = original.querySelector("img");
    image.setAttribute("src", "blob:fixture-cover");
    warmed = true;
    AT.RenderList.renderAnimeList();
    equal(card("bravo"), original, "card identity after warm render");
    equal(original.querySelector("img"), image, "image identity after warm render");
    equal(image.getAttribute("src"), "blob:fixture-cover", "loaded image retained");
    delete AT.CoverCache;
    delete AT.LibraryCoverLoader;
  });
  // Catches remounting every season row when its sibling changes.
  test("a changed franchise member keeps its unchanged season row expanded", () => {
    reset({ "audit-family": entry("Audit Family"), "audit-family-season-2": entry("Audit Family Season 2"), independent: entry("Independent") });
    const group = list.querySelector('.anime-season-group[data-base-slug="audit-family"]');
    const row = group.querySelector('.season-item[data-slug="audit-family"]');
    group.querySelector(".season-group-header").click();
    row.querySelector(".season-item-header").click();
    AT.PopupState.animeData["audit-family-season-2"].totalEpisodes = 96;
    AT.RenderList.renderAnimeList();
    equal(list.querySelector('.season-item[data-slug="audit-family"]'), row, "unchanged season identity");
    equal(row.classList.contains("expanded"), true, "season expansion");
    equal(list.querySelector('.season-item[data-slug="audit-family-season-2"]').textContent.includes("24/96"), true, "changed season total");
    equal(list.querySelector('.anime-season-group[data-base-slug="audit-family"]').classList.contains("expanded"), true, "group expansion");
  });
  // Catches confusing the normal/compact copies of the same base slug and stale status moves.
  test("split franchise status sections update without borrowing the wrong member", () => {
    reset({ "audit-family": entry("Audit Family"), "audit-family-season-2": entry("Audit Family Season 2", { listState: "completed" }), "audit-family-season-3": entry("Audit Family Season 3"), independent: entry("Independent") });
    AT.PopupState.currentCompactStatus = "completed";
    AT.PopupState.currentCompactStatusOpen = true;
    AT.RenderList.renderAnimeList();
    const normal = list.querySelector('.anime-season-group[data-base-slug="audit-family"]');
    const completed = list.querySelector('[data-compact-section="completed"] .anime-season-group');
    equal(normal.querySelector(".season-item").dataset.slug, "audit-family", "normal member");
    equal(completed.querySelector(".season-item").dataset.slug, "audit-family-season-2", "completed member");
    AT.PopupState.animeData.independent.totalEpisodes = 72;
    AT.RenderList.renderAnimeList();
    equal(list.querySelector('[data-compact-section="completed"] .anime-season-group'), completed, "compact group identity");
    equal(list.querySelector('.anime-season-group[data-base-slug="audit-family"]'), normal, "normal group identity");
    AT.PopupState.animeData["audit-family"].listState = "completed";
    AT.PopupState.animeData["audit-family-season-3"].listState = "completed";
    AT.RenderList.renderAnimeList();
    equal(list.querySelectorAll('.anime-season-group[data-base-slug="audit-family"]').length, 1, "obsolete normal group removed");
    equal(list.querySelectorAll('[data-compact-section="completed"] .season-item').length, 3, "all completed members rendered");
  });
  // Catches stale removed nodes/empty-state visibility after filtering and category changes.
  test("search and movie categories remove stale cards and show their empty states", () => {
    reset({ alpha: entry("Alpha"), "standalone-movie": entry("Standalone Movie", { mediaType: "MOVIE", totalEpisodes: 1, episodes: [] }) });
    const alpha = card("alpha");
    AT.RenderList.renderAnimeList("no match");
    equal(list.children.length, 0, "filtered empty list");
    equal(elements.searchEmptyState.classList.contains("visible"), true, "search empty state");
    equal(elements.searchEmptyQuery.textContent, "“no match”", "search query");
    AT.RenderList.renderAnimeList();
    AT.PopupState.currentCategory = "movies";
    AT.RenderList.renderAnimeList();
    equal(list.querySelectorAll(".anime-card").length, 0, "series removed from movie category");
    equal(list.querySelectorAll(".single-movie").length, 1, "movie present");
    delete AT.PopupState.animeData["standalone-movie"];
    AT.RenderList.renderAnimeList();
    equal(list.children.length, 0, "empty movie category");
    equal(elements.emptyState.classList.contains("visible"), true, "library empty state");
    equal(alpha.isConnected, false, "old filtered card stays removed");
  });
  document.getElementById("results").textContent = JSON.stringify(results);
}

const scripts = ["src/common/utils.js", "src/common/data/multipart-mappings.js", "src/common/data/anime-identity.js",
  "src/common/data/franchise-seasons.js", "src/common/data/media-type.js", "src/common/data/entry-state.js",
  "src/popup/lib/config.js", "src/common/data/merge-utils.js", "src/common/data/cache-policy.js",
  "src/popup/lib/ui-helpers.js", "src/popup/services/filler-service.js", "src/popup/lib/anime-status.js",
  "src/popup/lib/progress-manager.js", "src/popup/lib/airing-countdown.js", "src/popup/cards/anime-card.js"];
const setup = `window.AnimeTracker = {}; window.PopupLogger = {debug(){}, error(){}};`;
const html = `<html><head><meta charset="utf-8"><style>.main-content {height:120px;overflow:auto}.anime-card {min-height:70px}</style></head><body>
  <div class="main-content"><div id="animeList"></div></div><div id="emptyState"></div><div id="searchEmptyState"></div>
  <span id="searchEmptyQuery"></span><div id="listLoading"></div><pre id="results">pending</pre>
  <script>${setup}</script>${scripts.map(file => `<script>${fs.readFileSync(path.join(root, file), "utf8").replace(/<\/script/gi, "<\\/script")}</script>`).join("")}
  <script>window.AnimeTracker.AnimeActions = {}; window.AnimeTracker.AddAnimeDialog = {};</script>
  <script>${fs.readFileSync(path.join(root, "src/popup/app/render-list.js"), "utf8")}</script>
  <script>(${runInBrowser.toString()})();</script></body></html>`;
(async () => {
  const instance = await chromium.launch({ headless: true, ...(browser ? { executablePath: browser } : {}) });
  try {
    const page = await instance.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.abort());
    await page.route("https://an1me.to/library-render-test", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("https://an1me.to/library-render-test");
    const output = await page.locator("#results").textContent();
    if (output === "pending") throw new Error("browser fixture did not complete: " + errors.join("; "));
    const outcomes = JSON.parse(output);
    for (const outcome of outcomes) console.log(`${outcome.passed ? "PASS" : "FAIL"} ${outcome.name}${outcome.error ? "\n" + outcome.error : ""}`);
    if (errors.length) throw new Error(errors.join("; "));
    process.exitCode = outcomes.every(outcome => outcome.passed) ? 0 : 1;
  } finally { await instance.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
