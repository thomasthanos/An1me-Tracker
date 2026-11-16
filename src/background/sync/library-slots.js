// library-slots.js — one library per account, plus a separate signed-out ("guest") library.
//
// The active library stays in the storage keys every reader already uses (animeData, videoProgress, ...),
// so popup, content scripts and jobs read it unchanged. `libraryOwner` names whose library that is:
// "uid:<firebase uid>" or "guest". Every other owner's library is parked whole in `librarySlot:<owner>`.
//
// Switching owner (sign-in to another account, sign-out) runs inside the library mutation queue:
//   1. one write: park the active keys in librarySlot:<from> and record a journal {from, to};
//   2. remove the settings keys the target library does not have;
//   3. one write: the target library (absent maps as {}), libraryOwner = to, a new library revision and
//      any extra keys that must change in the same write (the new signed-in user);
//   4. drop the journal and the target's parked copy.
// A worker that dies part-way leaves the journal; recover() finishes the switch. Nothing is lost at any
// point: the parked copy is complete before the active keys are touched.
(function (root) {
  "use strict";

  const OWNER_KEY = "libraryOwner";
  const SLOT_PREFIX = "librarySlot:";
  const JOURNAL_KEY = "librarySwapJournal";
  const GUEST = "guest";
  const SLOT_SCHEMA = 1;

  // Account state that is not part of MUTATION_KEYS but must never follow the library to another account:
  // sync flags/status, pending cloud and website writes, cached stats painted on popup open, synced
  // playback settings outside MUTATION_KEYS, and notification state derived from this library.
  const EXTRA_OWNER_KEYS = Object.freeze([
    "syncState.pendingFlush",
    "syncState.pendingProgressFlush",
    "syncState.cloudStatus",
    "syncState.pendingSidecars",
    "syncState.retryAttempts",
    "pendingWebsiteWatchlist",
    "anilist_sync_status",
    "cachedStats",
    "smartNotifState",
    "notificationDeliveryStateV1",
    "adGuardEnabled",
    "autoResumeEnabled",
    "cloud_desktop_playback_settings",
    "userPreferences",
    "speedControlPreferences",
  ]);

  function ownerForUid(uid) {
    return uid ? `uid:${uid}` : GUEST;
  }

  function slotKey(owner) {
    return SLOT_PREFIX + owner;
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function create({ get, set, remove, libraryKeys, revisionKey, mapKeys, beforeActivate = (data) => data }) {
    const ownerKeys = Object.freeze([...new Set([...libraryKeys, ...EXTRA_OWNER_KEYS])]);
    const mapKeySet = new Set(mapKeys);

    async function activate(journal) {
      const stored = await get([slotKey(journal.to), revisionKey]);
      const parked = stored[slotKey(journal.to)];
      const target = parked && typeof parked.data === "object" && parked.data ? parked.data : {};
      const absentSettings = ownerKeys.filter((key) => !hasOwn(target, key) && !mapKeySet.has(key));
      if (absentSettings.length) await remove(absentSettings);

      const payload = {};
      for (const key of ownerKeys) {
        if (hasOwn(target, key)) payload[key] = target[key];
        else if (mapKeySet.has(key)) payload[key] = {};
      }
      payload[OWNER_KEY] = journal.to;
      payload[revisionKey] = Math.max(0, Number(stored[revisionKey]) || 0) + 1;
      await set(beforeActivate({ ...payload, ...(journal.extra || {}) }));
      await remove([JOURNAL_KEY, slotKey(journal.to)]);
    }

    // Finishes a switch a previous worker started. Safe to call any number of times.
    async function recover() {
      const stored = await get([JOURNAL_KEY, OWNER_KEY]);
      const journal = stored[JOURNAL_KEY];
      if (!journal || typeof journal !== "object" || !journal.to) return false;
      if (stored[OWNER_KEY] === journal.to) {
        await remove([JOURNAL_KEY, slotKey(journal.to)]);
      } else {
        // The journal is only written together with the complete parked copy, so the active keys may be
        // half-cleared here without loss. Extra keys (a sign-in) are not replayed: the auth mutation that
        // asked for them did not complete.
        await activate({ from: journal.from, to: journal.to });
      }
      return true;
    }

    // Parks the active library and activates `to`'s. `extra` is written in the same storage write as the
    // new library (used to switch the signed-in user atomically with the library it owns).
    async function switchOwner(to, { extra = null } = {}) {
      await recover();
      const stored = await get([...ownerKeys, OWNER_KEY]);
      const from = stored[OWNER_KEY] || null;
      if (from === to) {
        if (extra) await set(extra);
        return { switched: false, from, to };
      }
      const parked = {};
      for (const key of ownerKeys) if (hasOwn(stored, key)) parked[key] = stored[key];
      const journal = { from, to, startedAt: Date.now() };
      const write = { [JOURNAL_KEY]: journal };
      if (from) write[slotKey(from)] = { schema: SLOT_SCHEMA, owner: from, savedAt: Date.now(), data: parked };
      await set(write);
      await activate({ ...journal, extra });
      return { switched: true, from, to };
    }

    // First run of a build with per-account libraries: decide whose library the existing shared keys are.
    // The signed-in account keeps them unless the last cloud sync recorded a different account, in which
    // case they are parked for that account (signing into it restores them) and the current owner starts
    // from its own cloud copy. Signed out: the last-synced account's library is parked for it as well;
    // with no sync evidence the data stays with the guest library.
    async function ensureOwner() {
      await recover();
      const stored = await get([OWNER_KEY, "firebase_user", "syncState.cloudStatus", "_bgCloudDocCachePersisted"]);
      if (stored[OWNER_KEY]) return { owner: stored[OWNER_KEY], attributed: false };

      const currentOwner = ownerForUid(stored.firebase_user?.uid || null);
      const evidenceUid = stored["syncState.cloudStatus"]?.uid || stored._bgCloudDocCachePersisted?.uid || null;
      const evidenceOwner = evidenceUid ? ownerForUid(evidenceUid) : null;

      if (!evidenceOwner || evidenceOwner === currentOwner) {
        await set({ [OWNER_KEY]: currentOwner });
        return { owner: currentOwner, attributed: true, parkedFor: null };
      }
      // Claim the shared keys for the account that last synced them, then switch to the current owner.
      await set({ [OWNER_KEY]: evidenceOwner });
      await switchOwner(currentOwner);
      return { owner: currentOwner, attributed: true, parkedFor: evidenceOwner };
    }

    async function currentOwner() {
      const stored = await get([OWNER_KEY]);
      return stored[OWNER_KEY] || null;
    }

    return Object.freeze({ ownerKeys, switchOwner, recover, ensureOwner, currentOwner });
  }

  root.AnimeTrackerLibrarySlots = Object.freeze({
    OWNER_KEY,
    SLOT_PREFIX,
    JOURNAL_KEY,
    GUEST,
    EXTRA_OWNER_KEYS,
    ownerForUid,
    slotKey,
    create,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
