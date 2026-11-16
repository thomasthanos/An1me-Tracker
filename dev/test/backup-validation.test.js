// R13: a backup is checked as a whole before anything from it is merged, and reserved map keys stay data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { cloudWorker } = require("./lib/cloud-worker-harness.js");
const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const ctx = { TextEncoder, Blob };
ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(read("src/common/data/backup-validation.js"), ctx);
const { validate, LIMITS } = ctx.AnimeTrackerBackupValidation;

const valid = () => ({
  version: 1, exportedAt: "2026-11-07T10:00:00.000Z",
  animeData: { naruto: { title: "Naruto", episodes: [{ number: 1, watchedAt: "2026-11-01T10:00:00Z" }] } },
  videoProgress: { "naruto__episode-2": { currentTime: 300, duration: 1440 } },
  deletedAnime: {}, groupCoverImages: {}, goalSettings: null, badgeUnlocks: {},
});

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log("PASS " + name); } catch (error) { failures++; console.error("FAIL " + name + ": " + error.stack); }
};
const refuses = (text, pattern, limits) => assert.throws(() => validate(text, limits), (error) => {
  assert.equal(error.name, "BackupValidationError");
  assert.match(error.message, pattern);
  return true;
});

test("a real export is accepted unchanged", () => {
  const parsed = validate(JSON.stringify(valid()));
  assert.equal(parsed.animeData.naruto.title, "Naruto");
});

test("malformed shapes are refused", () => {
  refuses("not json", /Invalid JSON/);
  refuses("[]", /malformed/);
  refuses("null", /malformed/);
  refuses(JSON.stringify({ animeData: [] }), /missing animeData/);
  refuses(JSON.stringify({ ...valid(), videoProgress: [] }), /malformed/);
  refuses(JSON.stringify({ ...valid(), goalSettings: "weekly" }), /malformed/);
  refuses(JSON.stringify({ ...valid(), animeData: { naruto: "Naruto" } }), /malformed/);
  refuses(JSON.stringify({ ...valid(), animeData: { naruto: { title: "N", episodes: {} } } }), /malformed/);
  refuses(JSON.stringify({ ...valid(), videoProgress: { id: null } }), /malformed/);
});

test("a backup from a newer format is refused instead of half-understood", () => {
  refuses(JSON.stringify({ ...valid(), version: 2 }), /newer version/);
  refuses(JSON.stringify({ ...valid(), version: "1" }), /malformed/);
});

test("reserved keys anywhere in the file are refused", () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    refuses(`{"animeData":{},"videoProgress":{"${key}":{"currentTime":1}}}`, /reserved key/);
    refuses(`{"animeData":{"x":{"title":"X","episodes":[{"${key}":{}}]}}}`, /reserved key/);
  }
  refuses('{"animeData":{},"goalSettings":{"__proto__":{"polluted":true}}}', /reserved key/);
});

test("size, record count, depth and string length are bounded", () => {
  refuses(JSON.stringify(valid()), /too large/, { ...LIMITS, maxBytes: 100 });
  const many = valid();
  for (let i = 0; i < 50; i++) many.animeData[`show-${i}`] = { title: `Show ${i}`, episodes: [] };
  refuses(JSON.stringify(many), /too many records/, { ...LIMITS, maxRecords: 40 });
  let deep = { leaf: true };
  for (let i = 0; i < 20; i++) deep = { deep };
  refuses(JSON.stringify({ animeData: { x: { title: "X", episodes: [], extra: deep } } }), /nested too deeply/);
  refuses(JSON.stringify({ animeData: { x: { title: "x".repeat(LIMITS.maxStringLength + 1), episodes: [] } } }), /too long/);
});

test("the popup importer validates before merging and checks the file size before reading it", () => {
  const main = read("src/popup/main.js");
  assert.match(main, /validator\.validate\(text\)/);
  assert.match(main, /file\.size > maxBytes/);
  const html = read("popup.html");
  assert.ok(html.indexOf("src/common/data/backup-validation.js") > 0 && html.indexOf("src/common/data/backup-validation.js") < html.indexOf("src/popup/main.js"));
});

test("reserved keys from a cloud document or an old backup never change a merged map's prototype", () => {
  const w = cloudWorker({ legacySyncMigrationV1Complete: true });
  const plain = vm.runInContext("Object.prototype", w.context);
  const attack = JSON.parse('{"__proto__":{"reviewMarker":true},"real":{"currentTime":5,"duration":10,"savedAt":"2026-11-01T00:00:00Z"}}');
  for (const name of ["mergeVideoProgress", "mergeGoalSettings", "mergeBadgeUnlocks", "mergeAnimeData", "mergeDeletedAnime", "mergeGroupCoverImages"]) {
    const merged = w.call(name, {}, attack);
    assert.equal(Object.getPrototypeOf(merged), plain, `${name} keeps a plain prototype`);
    assert.equal(merged.reviewMarker, undefined, name);
    assert.ok(!Object.prototype.hasOwnProperty.call(merged, "__proto__"), name);
  }
  const decoded = w.call("fromFSDoc", { fields: { videoProgress: { mapValue: { fields: { __proto__: { mapValue: { fields: { reviewMarker: { booleanValue: true } } } } } } } } });
  assert.equal(decoded.videoProgress.reviewMarker, undefined, "the Firestore decoder drops reserved keys");
});

process.exitCode = failures ? 1 : 0;
