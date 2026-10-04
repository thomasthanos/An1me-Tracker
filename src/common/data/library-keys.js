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

  // Keys that once lived in chrome.storage.sync; the first read moves them to local storage.
  const LEGACY_SYNC_KEYS = Object.freeze(["animeData", "trackedEpisodes", "videoProgress"]);

  root.AnimeTrackerLibraryKeys = Object.freeze({
    MUTATION_KEYS,
    LEGACY_SYNC_KEYS,
    LEGACY_SYNC_MIGRATION_KEY: "legacySyncMigrationV1Complete",
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
