// session-context.js — which signed-in account a piece of background work belongs to.
//
// Cloud work used to read the "current user" again after each await, so a response that arrived after
// sign-out or an account switch was applied to whoever was signed in by then (review R01), and a sync
// that had already captured a token kept writing and reported "synced" after sign-out (R02).
//
// A Scope is captured once when work starts: { uid, epoch, signal }. Every sign-in to a different
// account and every sign-out bumps the epoch and aborts the previous epoch's signal, so
// `matches(scope)` — a synchronous check — fails for everything the old session started. Callers
// re-check it after every await and right before each network write, local commit, cache write and
// status update. A token refresh for the same account keeps the epoch.
(function (root) {
  "use strict";

  const EPOCH_KEY = "authSessionEpoch";
  let epoch = null;
  let hydrating = null;
  let controller = new AbortController();

  function storage() {
    return root.AnimeTrackerUtils.storage;
  }

  function sessionChangedError(reason = "session_changed") {
    const error = new Error(`Account session changed (${reason})`);
    error.name = "SessionChangedError";
    error.code = "SESSION_CHANGED";
    return error;
  }

  function isSessionChanged(error) {
    return error?.code === "SESSION_CHANGED";
  }

  async function hydrate() {
    if (epoch !== null) return epoch;
    if (!hydrating) {
      hydrating = (async () => {
        const stored = await storage().get([EPOCH_KEY]);
        const value = Number(stored[EPOCH_KEY]);
        if (epoch === null) epoch = Number.isSafeInteger(value) && value >= 0 ? value : 0;
        return epoch;
      })().finally(() => {
        hydrating = null;
      });
    }
    return hydrating;
  }

  // The account and epoch read together: if a transition lands while the user record is being read,
  // read again, so a scope never pairs the old account with the new epoch.
  async function capture() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const before = await hydrate();
      const stored = await storage().get(["firebase_user"]);
      if (epoch !== before) continue;
      const user = stored.firebase_user && typeof stored.firebase_user === "object" ? stored.firebase_user : null;
      return Object.freeze({ uid: user?.uid || null, user, epoch: before, signal: controller.signal });
    }
    throw sessionChangedError("unstable");
  }

  function matches(scope) {
    return !!scope && epoch !== null && scope.epoch === epoch && !scope.signal?.aborted;
  }

  function assertMatches(scope, where = "") {
    if (!matches(scope)) throw sessionChangedError(where || "stale_scope");
  }

  // Called inside the serialized auth mutation, before the stored session changes. Bumping first means a
  // capture() racing with the change either sees the new epoch or read the old user before it changed.
  async function transition(reason = "transition") {
    await hydrate();
    epoch += 1;
    const previous = controller;
    controller = new AbortController();
    try {
      previous.abort(sessionChangedError(reason));
    } catch {}
    await storage().set({ [EPOCH_KEY]: epoch });
    return epoch;
  }

  function current() {
    return epoch;
  }

  root.AnimeTrackerSessionContext = Object.freeze({
    EPOCH_KEY,
    capture,
    matches,
    assertMatches,
    transition,
    current,
    hydrate,
    sessionChangedError,
    isSessionChanged,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
