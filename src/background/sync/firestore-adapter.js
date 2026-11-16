// firestore-adapter.js — conditional writes to the legacy users/{uid} document (review R03).
//
// A sync reads the cloud document, merges it with the local library and PATCHes the result. Field masks
// alone do not protect that: if another device writes between our read and our PATCH, the PATCH replaces
// the whole videoProgress / animeData.<slug> value it read earlier and the other device's change is lost.
// Every library PATCH therefore carries a precondition on the document version it was merged from:
//   - existing document: currentDocument.updateTime=<the updateTime of the read>
//   - no document yet:   currentDocument.exists=false
// Firestore refuses the write when the document changed in between; the caller re-reads, re-merges and
// tries again a bounded number of times, then leaves the change pending for the normal retry alarm.
// This protects against other updated clients; a client without this code can still overwrite blindly.
(function (root) {
  "use strict";

  const UPDATE_TIME_FIELD = "__updateTime";
  const MAX_ATTEMPTS = 5;
  const CONFLICT_DELAYS_MS = Object.freeze([250, 500, 1000, 2000]);

  // The version the decoded document was read at, or null for a document that did not exist.
  function updateTimeOf(doc) {
    return doc && typeof doc[UPDATE_TIME_FIELD] === "string" && doc[UPDATE_TIME_FIELD] ? doc[UPDATE_TIME_FIELD] : null;
  }

  function withUpdateTime(doc, updateTime) {
    if (!doc) return doc;
    doc[UPDATE_TIME_FIELD] = typeof updateTime === "string" && updateTime ? updateTime : null;
    return doc;
  }

  // Query parameter for the PATCH: `doc` is the document the write was merged from (null = none existed).
  function preconditionQuery(doc) {
    const updateTime = updateTimeOf(doc);
    if (updateTime) return `currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
    if (!doc) return "currentDocument.exists=false";
    return null;
  }

  // A refused precondition: the document changed (FAILED_PRECONDITION), appeared (ALREADY_EXISTS) or
  // disappeared (NOT_FOUND on a conditional update) since it was read.
  function isConflict(status, body = "") {
    const text = typeof body === "string" ? body : "";
    if (status === 409) return true;
    if (status === 412) return true;
    if (status === 400 && /FAILED_PRECONDITION/.test(text)) return true;
    if (status === 404) return true;
    return false;
  }

  function conflictDelay(attempt) {
    return CONFLICT_DELAYS_MS[Math.min(Math.max(0, attempt - 1), CONFLICT_DELAYS_MS.length - 1)];
  }

  root.AnimeTrackerFirestoreAdapter = Object.freeze({
    UPDATE_TIME_FIELD,
    MAX_ATTEMPTS,
    CONFLICT_DELAYS_MS,
    updateTimeOf,
    withUpdateTime,
    preconditionQuery,
    isConflict,
    conflictDelay,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
