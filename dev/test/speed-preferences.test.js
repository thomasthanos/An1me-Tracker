const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const file = path.join(__dirname, "../../src/common/data/speed-preferences.js");
const context = vm.createContext({});
if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, "utf8"), context);
const model = context.AnimeTrackerSpeedPreferences || {};
const plain = value => value == null ? value : JSON.parse(JSON.stringify(value));
let failures = 0;
function test(name, fn) { try { fn(); console.log(`PASS ${name}`); } catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); } }

test("desktop starts enabled without overriding an unchosen player speed or audio", () => {
  assert.deepEqual(plain(model.normalize?.()), { enabled: true, normalRate: null, boostRate: 4, defaultVolume: null, defaultMuted: null });
});
test("mobile exposes only its supported normal speeds with fixed 2x boost and no audio override", () => {
  assert.deepEqual(plain(model.MOBILE_RATES), [1, 1.25, 1.5, 2]);
  assert.deepEqual(plain(model.normalize?.({ enabled: false, normalRate: 1.5, boostRate: 8, defaultVolume: .4, defaultMuted: true }, true)),
    { enabled: false, normalRate: 1.5, boostRate: 2, defaultVolume: null, defaultMuted: null });
  assert.deepEqual(plain(model.normalize?.({ normalRate: .75 }, true)),
    { enabled: true, normalRate: null, boostRate: 2, defaultVolume: null, defaultMuted: null });
});
test("persisted invalid types and unsupported rates fall back without leaking unrelated fields", () => {
  for (const raw of [undefined, null, [], 1, "bad", { enabled: "false", normalRate: 8, boostRate: 1, defaultVolume: Infinity, defaultMuted: 1, animeData: {} }]) {
    assert.deepEqual(plain(model.normalize?.(raw)), { enabled: true, normalRate: null, boostRate: 4, defaultVolume: null, defaultMuted: null });
  }
});
test("desktop retains all valid playback rates and boundary audio values", () => {
  assert.equal(model.KEY, "speedControlPreferences");
  assert.deepEqual(plain(model.NORMAL_RATES), [.5, .75, 1, 1.25, 1.5, 1.75, 2]);
  assert.deepEqual(plain(model.BOOST_RATES), [1.5, 2, 3, 4, 8]);
  for (const normalRate of [.5, .75, 1, 1.25, 1.5, 1.75, 2]) {
    assert.deepEqual(plain(model.normalize?.({ normalRate, boostRate: 8, defaultVolume: 0, defaultMuted: false })),
      { enabled: true, normalRate, boostRate: 8, defaultVolume: 0, defaultMuted: false });
  }
  assert.equal(model.normalize?.({ defaultVolume: 1 })?.defaultVolume, 1);
  for (const defaultVolume of [-.1, 1.1, NaN, "0.5", false]) assert.equal(model.normalize?.({ defaultVolume })?.defaultVolume, null);
});
test("patch changes only selected preferences and never mutates either input", () => {
  const raw = { enabled: false, normalRate: 1.25, boostRate: 8, defaultVolume: .6, defaultMuted: true, unknown: "ignored" };
  const delta = { normalRate: 1.5 };
  const before = JSON.stringify([raw, delta]);
  assert.deepEqual(plain(model.patch?.(raw, delta)), { enabled: false, normalRate: 1.5, boostRate: 8, defaultVolume: .6, defaultMuted: true });
  assert.equal(JSON.stringify([raw, delta]), before);
});
test("null patches clear chosen defaults while preserving the other preferences", () => {
  assert.deepEqual(plain(model.patch?.({ enabled: false, normalRate: 2, boostRate: 8, defaultVolume: .5, defaultMuted: true },
    { normalRate: null, defaultVolume: null, defaultMuted: null })),
    { enabled: false, normalRate: null, boostRate: 8, defaultVolume: null, defaultMuted: null });
  assert.deepEqual(plain(model.patch?.({ enabled: false, boostRate: 8 }, { enabled: null, boostRate: null })),
    { enabled: true, normalRate: null, boostRate: 4, defaultVolume: null, defaultMuted: null });
});
test("selected invalid fields and unknown keys are rejected instead of silently changing playback", () => {
  for (const delta of [null, [], "bad", { unknown: true }, { enabled: 1 }, { normalRate: 3 }, { normalRate: "1.5" },
    { boostRate: 0 }, { defaultVolume: -.01 }, { defaultVolume: 1.01 }, { defaultVolume: NaN }, { defaultMuted: "false" },
    JSON.parse('{"__proto__": {"polluted": true}}')]) {
    assert.throws(() => model.patch?.({}, delta), undefined, JSON.stringify(delta));
  }
  assert.throws(() => model.patch?.({}, { normalRate: .5 }, true));
  assert.throws(() => model.patch?.({}, { boostRate: 4 }, true));
  assert.throws(() => model.patch?.({}, { defaultVolume: .5 }, true));
  assert.throws(() => model.patch?.({}, { defaultMuted: true }, true));
});
test("mobile patches retain the chosen normal rate and consistently discard desktop-only overrides", () => {
  assert.deepEqual(plain(model.patch?.({ normalRate: 1.25, boostRate: 8, defaultVolume: .8, defaultMuted: true }, { enabled: false }, true)),
    { enabled: false, normalRate: 1.25, boostRate: 2, defaultVolume: null, defaultMuted: null });
  assert.deepEqual(plain(model.patch?.({}, { normalRate: 2, boostRate: 2, defaultVolume: null, defaultMuted: null }, true)),
    { enabled: true, normalRate: 2, boostRate: 2, defaultVolume: null, defaultMuted: null });
});
process.exitCode = failures ? 1 : 0;
