// filler-discovery.js — maps an1me slugs to AnimeFillerList shows and fetches
// per-episode types (canon/filler/mixed), falling back to Jikan; LRU + storage cache.
//
// Matching used to be blind: a chain of regexes mangled the an1me slug into candidate slugs, the
// first five were HEAD-probed, and if none of them happened to exist the show was recorded as
// having no filler data for three days. It never looked at what AnimeFillerList actually has.
// Now the site's /shows index is fetched once, cached, and matched against every title we know
// for the entry (romaji, English, native, synonyms) with a scored comparison.
//
// KNOWN_FILLER_SLUGS survives only as a manual override for cases the scorer gets wrong; the
// JP->EN table it used to need is gone, because native titles and synonyms cover it.
const KNOWN_FILLER_SLUGS = {
  // Kept deliberately small: add an entry only when the index match is demonstrably wrong, and
  // only after checking the target slug actually exists.
  //
  // AnimeFillerList lists the 2011 series at /shows/hunter-x-hunter (titled "Hunter × Hunter
  // (2011)") and the 1999 one at /shows/hunter-x-hunter-1999 (titled plainly "Hunter × Hunter").
  // A bare "Hunter x Hunter" query therefore scores an exact match on the 1999 show, which is
  // right by title and wrong by intent. Note the old table mapped this to "hunter-x-hunter-2011",
  // a slug that does not exist - so this lookup had been 404ing all along.
  "hunter-x-hunter-2011": "hunter-x-hunter",
};

const FILLER_SLUG_CACHE_MAX = 500;
// 4: entries carry {slug, score, matchedVia, kind, needsOffset, indexVersion} instead of a bare
// string, so a bad match is diagnosable and re-evaluable.
const FILLER_SLUG_SCHEMA_VERSION = 4;
const FILLER_MATCH_THRESHOLD = 0.82;
const AFL_INDEX_KEY = "afl_show_index";
const AFL_INDEX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AFL_INDEX_SCHEMA = 1;
const AFL_INDEX_URL = "https://www.animefillerlist.com/shows";
const FILLER_NOTFOUND_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const _fillerSlugLru = new Map();
const fillerSlugCache = {
  has(key) { return _fillerSlugLru.has(key); },
  get(key) { return _fillerSlugLru.get(key); },
  set(key, value) {
    if (_fillerSlugLru.has(key)) _fillerSlugLru.delete(key);
    else if (_fillerSlugLru.size >= FILLER_SLUG_CACHE_MAX) {
      const oldest = _fillerSlugLru.keys().next().value;
      if (oldest !== undefined) _fillerSlugLru.delete(oldest);
    }
    _fillerSlugLru.set(key, value);
  },
  delete(key) { _fillerSlugLru.delete(key); },
};

let _aflIndexPromise = null;

// A failed index load (offline, blocked, rate limited, unreadable page) is remembered briefly so one
// sweep does not repeat a 20-second request for every show in the library.
const AFL_INDEX_FAILURE_MEMO_MS = 2 * 60 * 1000;
let _aflIndexFailure = null;

// A manual "Fetch & Import" is the user asking to try again right now, so it must not be refused by
// state that an earlier bad moment left behind.
function resetFillerFetchBreakers() {
  _aflIndexFailure = null;
  globalThis.__jikanCircuitBroken = false;
  globalThis.__jikanCircuitBrokenUntil = 0;
  globalThis.__jikanTimeouts = 0;
}

const AFL_ORIGIN_PATTERN = "https://www.animefillerlist.com/*";

// A request of the show Fetch & Import is working on, for its trace (metadata-repair.js); nothing outside a run.
function traceFillerStep(text) {
  try {
    if (typeof traceMetadataRepairStep === "function") traceMetadataRepairStep(text);
  } catch {}
}
const secondsSince = (startedAt) => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

// fetch() settles when the headers arrive, and the body can still stall on a phone's connection. The timers used to
// be cleared at the headers, which left text() and json() waiting with no limit and held Fetch & Import on one show.
// The body is read under the request's own timer now, and its abort ends the read even where the browser does not tie
// the body to the signal.
function readBodyWithin(read, signal) {
  return Promise.race([read, new Promise((_, reject) => {
    const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  })]);
}

// False only when the browser says the extension may not reach AnimeFillerList: Safari lets the user
// limit an extension to some websites, and Chrome to sites they pick. A fetch then fails as a bare
// "Load failed", which says nothing about the fix. Any doubt (no API, an error, no answer) is "allowed".
function aflHostAccessDenied() {
  return new Promise((resolve) => {
    const api = globalThis.chrome?.permissions;
    if (typeof api?.contains !== "function") return resolve(false);
    const timer = setTimeout(() => resolve(false), 1000);
    const done = (granted) => { clearTimeout(timer); resolve(granted === false); };
    try {
      const pending = api.contains({ origins: [AFL_ORIGIN_PATTERN] }, done);
      if (pending && typeof pending.then === "function") pending.then(done, () => done(true));
    } catch {
      done(true);
    }
  });
}

// Why AnimeFillerList could not be read, in words short enough for a Fetch & Import row.
async function describeAflFailure(reason, response = null) {
  const header = (name) => String(response?.headers?.get?.(name) || "");
  // A challenge says so in cf-mitigated; a plain 403 from Cloudflare is its firewall. A 5xx through Cloudflare
  // is usually the site itself being down, so it keeps its status.
  if (response && (header("cf-mitigated").toLowerCase() === "challenge" ||
      (response.status === 403 && /cloudflare/i.test(header("server"))))) {
    return "blocked by Cloudflare";
  }
  if (!response && await aflHostAccessDenied()) return "no site access";
  return reason;
}

function aflIndexIsFresh(snapshot) {
  if (!snapshot || Number(snapshot.schemaVersion || 0) < AFL_INDEX_SCHEMA) return false;
  if (!Array.isArray(snapshot.shows) || snapshot.shows.length === 0) return false;
  return Date.now() - (Number(snapshot.cachedAt) || 0) < AFL_INDEX_TTL_MS;
}

// AnimeFillerList titles routinely carry the alternate title in parentheses -
// "Attack on Titan (Shingeki no Kyojin)", "The Seven Deadly Sins (Nanatsu no Taizai)". Scoring
// against that whole string DILUTES a match on either half, which is how a search for "Shingeki
// no Kyojin" lost to the shorter "Attack on Titan OADs". Each half therefore becomes its own
// candidate pointing at the same slug.
function expandAflTitles(title) {
  const out = [{ title, alias: false }];
  const paren = title.match(/^(.*?)\s*\(([^()]{2,})\)\s*(.*)$/);
  if (paren) {
    const head = `${paren[1]} ${paren[3]}`.replace(/\s+/g, " ").trim();
    if (head) out.push({ title: head, alias: false });
    const inner = paren[2].trim();
    if (inner) out.push({ title: inner, alias: true });
  }
  const seen = new Set();
  return out.filter((entry) => {
    if (!entry.title || entry.title.length < 2 || seen.has(entry.title)) return false;
    seen.add(entry.title);
    return true;
  });
}

// Listings that cover a supplement rather than the main series. Matching a series to one of these
// yields the right show's wrong episodes, which is worse than no match at all.
const AFL_SUPPLEMENT_RE = /\b(?:ova|ova s|oad|oads|movie|movies|film|films|special|specials|junior\s*high|recap)\b/i;
const AFL_SUPPLEMENT_PENALTY = 0.35;
// A parenthetical is an alias, not the show's name. Without this, "One Pace (One Piece)" - a fan
// re-edit - scored an exact 1.000 for the query "One Piece" and, sorting first, beat the real
// "One Piece". Just enough to lose every tie against a primary-title match, small enough that an
// alias-only match (how most JP->EN pairs resolve) still clears the threshold comfortably.
const AFL_ALIAS_PENALTY = 0.02;

// The /shows page is a single unpaginated A-Z list of <a href="/shows/slug">Title</a>, so one
// fetch covers the whole database (357 shows at the time of writing).
function parseAflShowIndex(html) {
  const shows = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*href=["']\/shows\/([a-z0-9][a-z0-9-]*)\/?["'][^>]*>([\s\S]{1,200}?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(String(html || ""))) !== null) {
    const id = match[1].toLowerCase();
    if (seen.has(id)) continue;
    const title = AnimeTrackerUtils.decodeHtmlEntities(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (!title) continue;
    seen.add(id);
    shows.push({ id, title });
  }
  return shows;
}

// Index entries -> scorer candidates: one per title variant, supplements pushed down.
function buildAflCandidates(shows, options = {}) {
  const allowSupplements = options.allowSupplements === true;
  const candidates = [];
  for (const show of shows) {
    const supplementPenalty = !allowSupplements && AFL_SUPPLEMENT_RE.test(show.title) ? AFL_SUPPLEMENT_PENALTY : 0;
    for (const variant of expandAflTitles(show.title)) {
      candidates.push({
        id: show.id,
        title: variant.title,
        penalty: supplementPenalty + (variant.alias ? AFL_ALIAS_PENALTY : 0),
      });
    }
  }
  return candidates;
}

// Resolves to { shows, version } — version is the snapshot's cachedAt, recorded on each match so
// a stale verdict can be told apart from one made against the current index.
async function getAflShowIndex(options = {}) {
  if (_aflIndexPromise) return _aflIndexPromise;

  _aflIndexPromise = (async () => {
    let stored;
    try {
      stored = await bgStorageGet([AFL_INDEX_KEY]);
    } catch {
      stored = {};
    }
    const snapshot = stored[AFL_INDEX_KEY];
    if (options.forceRefresh !== true && aflIndexIsFresh(snapshot)) {
      return { shows: snapshot.shows, version: Number(snapshot.cachedAt) || 0 };
    }

    const previous = Array.isArray(snapshot?.shows) && snapshot.shows.length > 0
      ? { shows: snapshot.shows, version: Number(snapshot.cachedAt) || 0 }
      : null;
    // Having no index at all is reported as unavailable, never as an empty list: an empty list reads as
    // "this show is not on AnimeFillerList", which sent every show to Jikan and cached a false "no filler".
    const unavailable = (reason) => ({
      shows: [],
      version: 0,
      unavailable: { reason, retryAfterMs: AFL_INDEX_FAILURE_MEMO_MS },
    });

    const failure = _aflIndexFailure;
    if (failure && Date.now() - failure.at < AFL_INDEX_FAILURE_MEMO_MS) {
      return previous || unavailable(failure.reason);
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    let html = null;
    let reason = "no response";
    let res = null;
    const requestedAt = Date.now();
    traceFillerStep("AnimeFillerList index…");
    try {
      res = await fetch(AFL_INDEX_URL, { signal: ctrl.signal });
      if (res.ok) html = await readBodyWithin(res.text(), ctrl.signal);
      else reason = await describeAflFailure(`HTTP ${res.status}`, res);
    } catch (e) {
      reason = e?.name === "AbortError" ? "timed out" : await describeAflFailure(String(e?.message || e || "network error"));
      console.warn("[BG] AnimeFillerList index fetch failed:", e?.message || e);
    } finally {
      clearTimeout(timer);
    }

    const shows = html ? parseAflShowIndex(html) : [];
    // A parse that yields almost nothing means the page structure changed. Keep whatever we had
    // rather than replacing a good index with an empty one.
    if (shows.length < 100) {
      if (html) {
        console.warn(`[BG] AnimeFillerList index parsed only ${shows.length} shows - keeping previous index`);
        reason = `unreadable index (${shows.length} shows)`;
      }
      traceFillerStep(`AnimeFillerList index failed: ${reason}, ${secondsSince(requestedAt)}`);
      _aflIndexFailure = { at: Date.now(), reason };
      return previous || unavailable(reason);
    }

    traceFillerStep(`AnimeFillerList index: ${shows.length} shows, ${Math.round(html.length / 1024)} KB, ${secondsSince(requestedAt)}`);
    _aflIndexFailure = null;
    const cachedAt = Date.now();
    try {
      await bgStorageSet({ [AFL_INDEX_KEY]: { schemaVersion: AFL_INDEX_SCHEMA, cachedAt, shows } });
    } catch (e) {
      console.warn("[BG] Could not cache AnimeFillerList index:", e?.message || e);
    }
    (typeof dlog === "function" ? dlog : () => {})(`[AnimeTracker] AnimeFillerList index cached: ${shows.length} shows`);
    return { shows, version: cachedAt };
  })();

  try {
    return await _aflIndexPromise;
  } finally {
    _aflIndexPromise = null;
  }
}

// Every title we know for an entry, best first. These are what the scorer compares against the
// index; nativeTitle and synonyms come from the info cache and used to be scraped-but-unread.
function collectFillerMatchKeys(an1meSlug, animeTitle, info) {
  const keys = [];
  const add = (value) => {
    const text = String(value || "").trim();
    if (text.length > 1) keys.push(text);
  };

  add(animeTitle);
  add(info?.englishTitle);
  add(info?.title);
  add(info?.nativeTitle);
  for (const synonym of Array.isArray(info?.synonyms) ? info.synonyms : []) add(synonym);

  // The slug itself, de-slugified, as a last resort for entries with no usable title at all.
  const fromSlug = String(an1meSlug || "")
    .replace(/-episode.*$/i, "")
    .replace(/-ep-?\d+$/i, "")
    .replace(/-/g, " ")
    .trim();
  add(fromSlug);

  return [...new Set(keys)];
}

// Resolves { slug, score, matchedVia, kind, needsOffset, indexVersion } or null.
async function discoverFillerSlug(an1meSlug, animeTitle, options = {}) {
  const { forceRefresh = false, info = null } = options;
  const cacheKey = String(an1meSlug || "").toLowerCase();
  if (!cacheKey) return null;

  if (!forceRefresh && fillerSlugCache.has(cacheKey)) return fillerSlugCache.get(cacheKey);

  if (cacheKey in KNOWN_FILLER_SLUGS) {
    const known = { slug: KNOWN_FILLER_SLUGS[cacheKey], score: 1, matchedVia: "override", kind: "exact", needsOffset: false };
    fillerSlugCache.set(cacheKey, known);
    return known;
  }

  const storageKey = `fillerslug_${cacheKey}`;
  if (forceRefresh) {
    fillerSlugCache.delete(cacheKey);
    try {
      await bgStorageRemove([storageKey]);
    } catch (e) {
      console.warn("[BG] Failed to clear filler slug cache before refresh:", e.message);
    }
  }

  const index = await getAflShowIndex();
  // Without an index a show cannot be matched or ruled out. Fail retryably instead of continuing, so
  // nothing is negative-cached and the lookup is not handed to Jikan for every show in the library.
  const requireIndex = () => {
    if (!index.unavailable) return;
    throw Object.assign(new Error(`afl_index_unavailable: ${index.unavailable.reason}`), {
      aflIndexUnavailable: true,
      deferRetry: true,
      retryAfterMs: Math.max(1000, Number(index.unavailable.retryAfterMs) || AFL_INDEX_FAILURE_MEMO_MS),
    });
  };

  let cached = null;
  try {
    const stored = await bgStorageGet([storageKey]);
    cached = stored[storageKey] ?? null;
  } catch (e) {
    console.warn("[BG] discoverFillerSlug storage read failed:", e.message);
  }

  if (cached && Number(cached.schemaVersion || 0) === FILLER_SLUG_SCHEMA_VERSION) {
    if (typeof cached.slug === "string") {
      const hit = {
        slug: cached.slug,
        score: Number(cached.score) || 1,
        matchedVia: cached.matchedVia || "cache",
        kind: cached.kind || "exact",
        needsOffset: cached.needsOffset === true,
        indexVersion: Number(cached.indexVersion) || 0,
      };
      fillerSlugCache.set(cacheKey, hit);
      return hit;
    }
    requireIndex();
    if (cached.notFound) {
      // A miss recorded against a guess is much weaker evidence than a miss against the full
      // index, so it is re-evaluated as soon as the index moves on or the scorer changes.
      const age = cached.cachedAt ? Date.now() - cached.cachedAt : Infinity;
      const sameIndex = Number(cached.indexVersion || 0) === index.version;
      const sameThreshold = Number(cached.threshold || 0) === FILLER_MATCH_THRESHOLD;
      if (age < FILLER_NOTFOUND_TTL_MS && sameIndex && sameThreshold) {
        fillerSlugCache.set(cacheKey, null);
        return null;
      }
    }
  }
  if (cached !== null && Number(cached?.schemaVersion || 0) !== FILLER_SLUG_SCHEMA_VERSION) {
    try {
      await bgStorageRemove([storageKey]);
    } catch {}
  }

  requireIndex();
  const keys = collectFillerMatchKeys(an1meSlug, animeTitle, info);
  // If the entry itself IS an OVA/movie, the supplement listings are the correct targets, so the
  // penalty must not apply.
  const wantsSupplement = keys.some((key) => AFL_SUPPLEMENT_RE.test(key)) || AFL_SUPPLEMENT_RE.test(cacheKey.replace(/-/g, " "));
  const candidates = buildAflCandidates(index.shows, { allowSupplements: wantsSupplement });
  const match = candidates.length > 0 ? self.AnimeTrackerTitleMatch.bestMatch(keys, candidates, FILLER_MATCH_THRESHOLD) : null;

  if (!match) {
    const notFoundEntry = {
      notFound: true,
      schemaVersion: FILLER_SLUG_SCHEMA_VERSION,
      cachedAt: Date.now(),
      indexVersion: index.version,
      threshold: FILLER_MATCH_THRESHOLD,
    };
    fillerSlugCache.set(cacheKey, null);
    try {
      await bgStorageSet({ [storageKey]: notFoundEntry });
    } catch (e) {
      console.warn("[BG] Failed to cache notFound filler slug:", e.message);
    }
    (typeof dlog === "function" ? dlog : () => {})(
      `[AnimeTracker] No filler match for ${an1meSlug} (${keys.length} title(s) vs ${index.shows.length} shows)`,
    );
    return null;
  }

  const resolved = {
    slug: match.id,
    score: match.score,
    matchedVia: match.matchedKey,
    kind: match.kind,
    // "base" means an1me's per-season entry matched an absolute-numbered listing: the caller has
    // to offset episode numbers, or it gets the right show with the wrong episodes.
    needsOffset: match.seasonStripped === true,
    indexVersion: index.version,
  };
  fillerSlugCache.set(cacheKey, resolved);
  try {
    await bgStorageSet({ [storageKey]: { ...resolved, schemaVersion: FILLER_SLUG_SCHEMA_VERSION, cachedAt: Date.now() } });
  } catch (e) {
    console.warn("[BG] Failed to cache filler slug:", e.message);
  }
  (typeof dlog === "function" ? dlog : () => {})(
    `[AnimeTracker] Filler slug matched: ${an1meSlug} -> ${match.id} (${match.score.toFixed(3)}, ${match.kind}` +
      `${resolved.needsOffset ? ", needs offset" : ""})`,
  );
  return resolved;
}

async function fetchEpisodeTypesFromAnimeFillerList(animeSlug) {
  const requestedAt = Date.now();
  traceFillerStep(`AnimeFillerList page ${animeSlug}…`);
  try {
    const url = `https://www.animefillerlist.com/shows/${animeSlug}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    // The show page fails for the same reasons the index does (blocked, challenged, down), and the
    // caller can still try Jikan for it, so those failures are marked and described the same way.
    const unreachable = (reason) => Object.assign(new Error(`afl_page_unavailable: ${reason}`), { aflUnreachable: true });
    let response;
    let html = "";
    try {
      response = await fetch(url, { signal: ctrl.signal });
      if (response.ok) html = await readBodyWithin(response.text(), ctrl.signal);
    } catch (fetchError) {
      throw unreachable(fetchError?.name === "AbortError" ? "timed out" : await describeAflFailure(String(fetchError?.message || fetchError || "network error")));
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      if (response.status === 404) return null;
      throw unreachable(await describeAflFailure(`HTTP ${response.status}`, response));
    }
    const episodeTypes = { canon: [], filler: [], mixed: [], anime_canon: [], totalEpisodes: null };

    const trPattern = /<tr[^>]*\bclass=["']([^"']+)["'][^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trPattern.exec(html)) !== null) {
      const classes = trMatch[1].toLowerCase();
      const rowContent = trMatch[2];

      let type = null;
      if (/\bmanga_canon\b/.test(classes)) type = "canon";
      else if (/\bmixed_canon/.test(classes)) type = "mixed";
      else if (/\banime_canon\b/.test(classes)) type = "anime_canon";
      else if (/\bfiller\b/.test(classes)) type = "filler";

      if (!type) continue;

      const numMatch = rowContent.match(/>(\d+)</);
      if (!numMatch) continue;

      const epNum = parseInt(numMatch[1], 10);
      if (!Number.isFinite(epNum) || epNum <= 0) continue;

      episodeTypes[type].push(epNum);
    }

    for (const key of ["canon", "filler", "mixed", "anime_canon"]) {
      episodeTypes[key] = [...new Set(episodeTypes[key])].sort((a, b) => a - b);
    }

    const all = [...episodeTypes.canon, ...episodeTypes.mixed, ...episodeTypes.filler, ...episodeTypes.anime_canon];
    if (all.length > 0) episodeTypes.totalEpisodes = Math.max(...all);

    if (all.length === 0) {
      console.warn(`[Anime Tracker] ⚠ No episodes parsed for ${animeSlug} — site structure may have changed`);
      const parseError = new Error("animefillerlist_parse_empty");
      parseError.aflParseEmpty = true;
      throw parseError;
    }

    (typeof dlog === "function" ? dlog : () => {})(`[Anime Tracker] ✓ Fetched episode types for ${animeSlug}:`, episodeTypes);
    traceFillerStep(`AnimeFillerList page: ${all.length} episodes, ${secondsSince(requestedAt)}`);
    return episodeTypes;
  } catch (error) {
    console.error(`[Anime Tracker] ✗ Failed for ${animeSlug}: ${error?.message}`, error);
    traceFillerStep(`AnimeFillerList page failed: ${error?.message || error}, ${secondsSince(requestedAt)}`);
    throw error;
  }
}

// Shifts an absolute-numbered episode-type set down onto an1me's per-season numbering.
// Without this a correct show match still yields wrong marks, which is indistinguishable from a
// wrong match: episode 1 of a second season is episode 26 in the absolute listing.
function rebaseEpisodeTypes(episodeTypes, offset, seasonLength) {
  if (!episodeTypes || !Number.isFinite(offset) || offset <= 0) return episodeTypes;
  const shift = (list) =>
    (Array.isArray(list) ? list : [])
      .map((n) => Number(n) - offset)
      .filter((n) => n >= 1 && (!seasonLength || n <= seasonLength));
  const out = {
    canon: shift(episodeTypes.canon),
    filler: shift(episodeTypes.filler),
    mixed: shift(episodeTypes.mixed),
    anime_canon: shift(episodeTypes.anime_canon),
    totalEpisodes: null,
    _rebasedBy: offset,
  };
  const all = [...out.canon, ...out.filler, ...out.mixed, ...out.anime_canon];
  out.totalEpisodes = all.length > 0 ? Math.max(...all) : null;
  return out;
}

// A phone on mobile data, or one streaming the episode being watched, answers slowly; a short limit turned slow
// answers into failures (2.5s and 3.5s used to be, then 5s and 7s still missed while a video played).
const JIKAN_MOBILE_SEARCH_TIMEOUT_MS = 8000;
const JIKAN_MOBILE_EPISODES_TIMEOUT_MS = 10000;
const JIKAN_SEARCH_TIMEOUT_MS = 5000;
const JIKAN_EPISODES_TIMEOUT_MS = 7000;
// One slow answer is not an outage. A single timeout used to close Jikan for an hour, and every show after it
// failed at once as "filler paused" (63 of 119 in one run). Now two timeouts in a row close it briefly, each
// further one lengthens the pause up to half an hour, and any answer from Jikan resets the count.
const JIKAN_TIMEOUTS_BEFORE_PAUSE = 2;
const JIKAN_PAUSE_STEPS_MS = Object.freeze([2, 5, 10, 20, 30].map((minutes) => minutes * 60 * 1000));

function noteJikanTimeout() {
  const strikes = (Number(globalThis.__jikanTimeouts) || 0) + 1;
  globalThis.__jikanTimeouts = strikes;
  if (strikes < JIKAN_TIMEOUTS_BEFORE_PAUSE) return;
  const step = Math.min(strikes - JIKAN_TIMEOUTS_BEFORE_PAUSE, JIKAN_PAUSE_STEPS_MS.length - 1);
  globalThis.__jikanCircuitBroken = true;
  globalThis.__jikanCircuitBrokenUntil = Date.now() + JIKAN_PAUSE_STEPS_MS[step];
  (typeof dlog === "function" ? dlog : () => {})(`[AnimeTracker] Jikan timed out ${strikes} times in a row — pausing it`);
}

function noteJikanAnswer() {
  globalThis.__jikanTimeouts = 0;
}
// Jikan allows about one request a second sustained (3/s, 60/min). Every request, search or episode page,
// takes the next free slot, so a library sweep that leans on Jikan is not answered with 429s.
const JIKAN_MIN_GAP_MS = 1000;
// 100 episodes a page: enough for the longest-running shows (One Piece, Detective Conan), which used to
// stop at 10 pages and always end as "incomplete".
const JIKAN_MAX_EPISODE_PAGES = 15;
let _jikanNextSlotAt = 0;

async function waitForJikanSlot() {
  const now = Date.now();
  const at = Math.max(now, _jikanNextSlotAt);
  _jikanNextSlotAt = at + JIKAN_MIN_GAP_MS;
  if (at > now) await AnimeTrackerUtils.sleep(at - now);
}

async function fetchJikanEpisodes(title, options = {}) {
  const unavailable = (message) => Object.assign(new Error(message), {
    deferRetry: true,
    retryAfterMs: Math.max(1000, (globalThis.__jikanCircuitBrokenUntil || 0) - Date.now()),
  });
  // A timeout that ends with the browser offline was the connection's fault, not Jikan's, so it must not close
  // Jikan for an hour: the connection usually comes back long before that.
  const jikanTimeoutWasOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
  // A body that stalls after the headers is a slow answer like any other, under the request's own timer.
  const readJson = async (response, ctrl, timeoutMessage) => {
    try {
      return await readBodyWithin(response.json(), ctrl.signal);
    } catch (error) {
      if (error?.name !== "AbortError") throw error;
      if (jikanTimeoutWasOffline()) throw new Error("jikan_offline");
      noteJikanTimeout();
      throw unavailable(timeoutMessage);
    }
  };
  const requestedAt = Date.now();
  try {
    if (globalThis.__jikanCircuitBroken && Date.now() < (globalThis.__jikanCircuitBrokenUntil || 0)) {
      throw unavailable("jikan_circuit_open");
    }

    let malId = Number(options.malId) || 0;

    if (!malId) {
      await waitForJikanSlot();
      traceFillerStep("Jikan search…");
      const searchCtrl = new AbortController();
      const isMobile = typeof AnimeTrackerUtils !== "undefined" && typeof AnimeTrackerUtils.isMobileDevice === "function" && AnimeTrackerUtils.isMobileDevice();
      const searchTimer = setTimeout(() => searchCtrl.abort(), isMobile ? JIKAN_MOBILE_SEARCH_TIMEOUT_MS : JIKAN_SEARCH_TIMEOUT_MS);
      let searchData;
      try {
        let searchRes;
        try {
          searchRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=5`, { signal: searchCtrl.signal });
        } catch (fetchErr) {
          const isAbort = fetchErr?.name === "AbortError";
          if (isAbort) {
            if (jikanTimeoutWasOffline()) throw new Error("jikan_offline");
            noteJikanTimeout();
            throw unavailable("jikan_search_timeout");
          }
          const err = new Error(fetchErr?.message || "jikan_fetch_failed");
          err.rateLimited = true;
          throw err;
        }
        noteJikanAnswer();
        if (searchRes.status === 404) return null;
        if (!searchRes.ok) {
          const error = new Error(`jikan_search_http_${searchRes.status}`);
          error.rateLimited = searchRes.status === 429 || searchRes.status >= 500;
          throw error;
        }
        searchData = await readJson(searchRes, searchCtrl, "jikan_search_timeout");
      } finally {
        clearTimeout(searchTimer);
      }
      if (!Array.isArray(searchData?.data)) throw new Error("jikan_search_invalid_data");
      traceFillerStep(`Jikan search: ${searchData.data.length} results, ${secondsSince(requestedAt)}`);

      // This used to demand exact normalized title equality, so a single differing word meant no
      // filler data at all. Scored against the same matcher the index uses instead.
      const candidates = [];
      for (const candidate of searchData?.data || []) {
        if (!candidate?.mal_id) continue;
        const titles = [candidate.title, candidate.title_english, candidate.title_japanese];
        for (const item of candidate.titles || []) titles.push(item?.title);
        for (const candidateTitle of titles) {
          if (candidateTitle) candidates.push({ id: candidate.mal_id, title: candidateTitle });
        }
      }
      const keys = [title, ...(Array.isArray(options.extraKeys) ? options.extraKeys : [])];
      const match = self.AnimeTrackerTitleMatch.bestMatch(keys, candidates, FILLER_MATCH_THRESHOLD);
      if (!match) return null;
      malId = Number(match.id) || 0;
    }
    if (!malId) return null;

    const allEpisodes = [];
    let page = 1;
    let hasNext = true;
    const episodesAt = Date.now();
    traceFillerStep("Jikan episodes…");

    while (hasNext && page <= JIKAN_MAX_EPISODE_PAGES) {
      await waitForJikanSlot();
      const epCtrl = new AbortController();
      const isMobile = typeof AnimeTrackerUtils !== "undefined" && typeof AnimeTrackerUtils.isMobileDevice === "function" && AnimeTrackerUtils.isMobileDevice();
      const epTimer = setTimeout(() => epCtrl.abort(), isMobile ? JIKAN_MOBILE_EPISODES_TIMEOUT_MS : JIKAN_EPISODES_TIMEOUT_MS);
      let epData;
      try {
        let epRes;
        try {
          epRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`, { signal: epCtrl.signal });
        } catch (epErr) {
          if (epErr?.name === "AbortError") {
            if (jikanTimeoutWasOffline()) throw new Error("jikan_offline");
            noteJikanTimeout();
            throw unavailable("jikan_episodes_timeout");
          }
          throw epErr;
        }
        noteJikanAnswer();
        // 429 used to be folded into "no data" and cached as a miss. It means "ask again later".
        if (epRes.status === 429) {
          const err = new Error("jikan_rate_limited");
          err.rateLimited = true;
          throw err;
        }
        if (epRes.status === 404 && page === 1) return null;
        if (!epRes.ok) throw new Error(`jikan_episodes_http_${epRes.status}`);
        epData = await readJson(epRes, epCtrl, "jikan_episodes_timeout");
      } finally {
        clearTimeout(epTimer);
      }
      if (!Array.isArray(epData?.data)) throw new Error("jikan_episodes_invalid_data");
      allEpisodes.push(...epData.data);
      hasNext = epData?.pagination?.has_next_page === true;
      page++;
    }

    if (hasNext) throw new Error("jikan_episodes_incomplete");
    traceFillerStep(`Jikan episodes: ${allEpisodes.length} in ${page - 1} pages, ${secondsSince(episodesAt)}`);
    if (allEpisodes.length === 0) return null;

    const episodeTypes = { canon: [], filler: [], mixed: [], anime_canon: [], totalEpisodes: allEpisodes.length };
    for (const ep of allEpisodes) {
      const num = ep.mal_id;
      if (!num || num <= 0) continue;
      if (ep.filler) {
        episodeTypes.filler.push(num);
      } else if (ep.recap) {
        episodeTypes.mixed.push(num);
      } else {
        episodeTypes.canon.push(num);
      }
    }

    return episodeTypes;
  } catch (error) {
    traceFillerStep(`Jikan failed: ${error?.message || error}, ${secondsSince(requestedAt)}`);
    // Let metadata-repair preserve prior data and apply its short retryable backoff.
    throw error;
  }
}

try {
  globalThis.fillerStats = async () => {
    const stored = await bgStorageGet([AFL_INDEX_KEY]);
    const snap = stored[AFL_INDEX_KEY];
    const all = await chrome.storage.local.get(null);
    const rows = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith("fillerslug_")) continue;
      rows.push({
        slug: key.slice("fillerslug_".length),
        matched: value?.slug || (value?.notFound ? "(none)" : "?"),
        score: value?.score ? Number(value.score).toFixed(3) : "",
        kind: value?.kind || "",
        needsOffset: value?.needsOffset === true,
        via: value?.matchedVia || "",
      });
    }
    rows.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
    console.log(`AFL index: ${snap?.shows?.length || 0} shows, fresh=${aflIndexIsFresh(snap)}`);
    console.log(`mappings: ${rows.length} (${rows.filter((r) => r.matched === "(none)").length} unmatched)`);
    console.table(rows);
    return rows;
  };
} catch {}
