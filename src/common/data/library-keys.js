// library-keys.js — which storage keys make up the synced library. The background coordinator, the
// popup and content scripts must agree on this list: a write to one of these keys goes through the
// coordinator, which bumps the library revision that cloud sync compares against.
(function (root) {
  "use strict";

  const MUTATION_KEYS = Object.freeze([
    "animeData",
    "videoProgress",
    "deletedAnime",
    "groupCoverImages",
    "anilist_media_map",
    "anilist_pushed",
    "anilist_push_schema",
    "fillerStaySelections",
    "goalSettings",
    "badgeUnlocks",
    "badgeEvaluationBaselineV1",
    "badgeNotificationBaselineV1",
    "anilist_auth",
    "anilist_username",
    "copyGuardEnabled",
    "smartNotificationsEnabled",
    "autoSkipFillers",
    "skiptimeHelperEnabled",
    "auto4kServerEnabled",
    "playbackSettingsUpdatedAt",
  ]);

  // Keys whose value is a map of many independent records. Replacing one of these with a map built from an
  // older read silently drops whatever another writer added in between (review R06), so they may only be
  // written by a transaction that computes the change from the latest snapshot inside the coordinator
  // (runBgLibraryTransaction, LIBRARY_MUTATION_SNAPSHOT + LIBRARY_MUTATION_COMMIT, LibraryMutations.enqueue*,
  // ContentStorage.mutate). The remaining MUTATION_KEYS are single settings values, where a plain write of
  // the new value is the intended last-writer-wins behaviour.
  const MAP_MUTATION_KEYS = Object.freeze([
    "animeData",
    "videoProgress",
    "deletedAnime",
    "groupCoverImages",
    "anilist_media_map",
    "anilist_pushed",
    "fillerStaySelections",
    "goalSettings",
    "badgeUnlocks",
    "badgeEvaluationBaselineV1",
    "badgeNotificationBaselineV1",
  ]);
  const MAP_MUTATION_KEY_SET = new Set(MAP_MUTATION_KEYS);

  function writesLibraryMap(data) {
    return Object.keys(data || {}).some((key) => MAP_MUTATION_KEY_SET.has(key));
  }

  // Keys that once lived in chrome.storage.sync; the first read moves them to local storage.
  const LEGACY_SYNC_KEYS = Object.freeze(["animeData", "trackedEpisodes", "videoProgress"]);

  root.AnimeTrackerLibraryKeys = Object.freeze({
    MUTATION_KEYS,
    MAP_MUTATION_KEYS,
    writesLibraryMap,
    BLIND_MAP_WRITE_ERROR: "library_map_requires_transaction",
    LEGACY_SYNC_KEYS,
    LEGACY_SYNC_MIGRATION_KEY: "legacySyncMigrationV1Complete",
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
