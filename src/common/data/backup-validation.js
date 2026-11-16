// backup-validation.js — checks a library backup file before anything from it is merged (review R13).
//
// The importer used to accept almost any JSON object: an array as animeData passed, and a "__proto__" key
// inside progress, goals or badges changed the prototype of the merged map instead of staying an ordinary
// record. The whole file is checked first; a file that fails is refused as a whole, so nothing is written.
(function (root) {
  "use strict";

  const FORMAT_VERSION = 1;
  const LIMITS = Object.freeze({
    maxBytes: 50 * 1024 * 1024,
    maxRecords: 100000,
    maxDepth: 16,
    maxStringLength: 64 * 1024,
  });
  const RESERVED_KEYS = Object.freeze(["__proto__", "constructor", "prototype"]);
  const RESERVED = new Set(RESERVED_KEYS);
  // Maps of independent records; each must be a plain object when present.
  const MAP_FIELDS = Object.freeze(["animeData", "videoProgress", "deletedAnime", "groupCoverImages", "badgeUnlocks"]);

  class BackupValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = "BackupValidationError";
    }
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function byteLength(text) {
    if (typeof Blob === "function") return new Blob([text]).size;
    return new TextEncoder().encode(text).byteLength;
  }

  // Walks every value once: depth, string length, reserved keys and a record count over all objects and
  // array items, so a file cannot pass by hiding its size in nesting.
  function inspect(value, limits) {
    let records = 0;
    const stack = [{ value, depth: 0 }];
    while (stack.length) {
      const { value: current, depth } = stack.pop();
      if (typeof current === "string") {
        if (current.length > limits.maxStringLength) throw new BackupValidationError("Backup contains a value that is too long");
        continue;
      }
      if (typeof current === "number") {
        if (!Number.isFinite(current)) throw new BackupValidationError("Backup contains an invalid number");
        continue;
      }
      if (!current || typeof current !== "object") continue;
      if (depth >= limits.maxDepth) throw new BackupValidationError("Backup is nested too deeply");
      const entries = Array.isArray(current) ? current.map((item) => ["", item]) : Object.entries(current);
      records += entries.length;
      if (records > limits.maxRecords) throw new BackupValidationError("Backup has too many records");
      for (const [key, child] of entries) {
        if (RESERVED.has(key)) throw new BackupValidationError("Backup contains a reserved key");
        if (key.length > limits.maxStringLength) throw new BackupValidationError("Backup contains a value that is too long");
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }

  function validate(text, limits = LIMITS) {
    if (typeof text !== "string") throw new BackupValidationError("Invalid JSON file");
    if (byteLength(text) > limits.maxBytes) throw new BackupValidationError("Backup file is too large");

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BackupValidationError("Invalid JSON file");
    }
    if (!isPlainObject(parsed)) throw new BackupValidationError("Backup file is malformed");

    if (parsed.version !== undefined) {
      if (!Number.isSafeInteger(parsed.version) || parsed.version < 1) throw new BackupValidationError("Backup file is malformed");
      if (parsed.version > FORMAT_VERSION) throw new BackupValidationError("Backup was made by a newer version of the extension");
    }

    if (!isPlainObject(parsed.animeData)) throw new BackupValidationError("Backup is missing animeData");
    for (const field of MAP_FIELDS) {
      if (parsed[field] !== undefined && parsed[field] !== null && !isPlainObject(parsed[field])) {
        throw new BackupValidationError("Backup file is malformed");
      }
    }
    if (parsed.goalSettings !== undefined && parsed.goalSettings !== null && !isPlainObject(parsed.goalSettings)) {
      throw new BackupValidationError("Backup file is malformed");
    }
    for (const entry of Object.values(parsed.animeData)) {
      if (!isPlainObject(entry)) throw new BackupValidationError("Backup file is malformed");
      if (entry.episodes !== undefined && !Array.isArray(entry.episodes)) throw new BackupValidationError("Backup file is malformed");
    }
    for (const entry of Object.values(parsed.videoProgress || {})) {
      if (!isPlainObject(entry)) throw new BackupValidationError("Backup file is malformed");
    }

    inspect(parsed, limits);
    return parsed;
  }

  // A copy of a record map without keys that would act on the prototype when assigned. Used by the merge
  // functions, which also receive maps from the cloud document.
  function safeMap(value) {
    const out = {};
    if (!isPlainObject(value)) return out;
    for (const [key, entry] of Object.entries(value)) {
      if (!RESERVED.has(key)) out[key] = entry;
    }
    return out;
  }

  root.AnimeTrackerBackupValidation = Object.freeze({
    FORMAT_VERSION,
    LIMITS,
    RESERVED_KEYS,
    BackupValidationError,
    validate,
    safeMap,
    isReservedKey: (key) => RESERVED.has(key),
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
