// Account playback preferences shared by the player, popup and background writer.
(function () {
  "use strict";
  const KEY = "speedControlPreferences";
  const NORMAL_RATES = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  const MOBILE_RATES = NORMAL_RATES;
  const BOOST_RATES = Object.freeze([1.5, 2, 3, 4, 8]);
  const FIELDS = new Set(["enabled", "normalRate", "boostRate", "defaultVolume", "defaultMuted"]);
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const isVolume = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

  function normalize(raw) {
    const input = isObject(raw) ? raw : {};
    return {
      enabled: typeof input.enabled === "boolean" ? input.enabled : true,
      normalRate: NORMAL_RATES.includes(input.normalRate) ? input.normalRate : null,
      boostRate: BOOST_RATES.includes(input.boostRate) ? input.boostRate : 4,
      defaultVolume: isVolume(input.defaultVolume) ? input.defaultVolume : null,
      defaultMuted: typeof input.defaultMuted === "boolean" ? input.defaultMuted : null,
    };
  }

  function patch(raw, delta) {
    if (!isObject(delta)) throw new TypeError("Speed preference patch must be an object");
    const next = normalize(raw);
    for (const key of Reflect.ownKeys(delta)) {
      if (!FIELDS.has(key)) throw new TypeError(`Unknown speed preference: ${String(key)}`);
      const value = delta[key];
      const valid = value === null ||
        (key === "enabled" && typeof value === "boolean") ||
        (key === "normalRate" && NORMAL_RATES.includes(value)) ||
        (key === "boostRate" && BOOST_RATES.includes(value)) ||
        (key === "defaultVolume" && isVolume(value)) ||
        (key === "defaultMuted" && typeof value === "boolean");
      if (!valid) throw new TypeError(`Invalid speed preference: ${key}`);
      next[key] = value;
    }
    return normalize(next);
  }

  globalThis.AnimeTrackerSpeedPreferences = Object.freeze({ KEY, normalize, patch, NORMAL_RATES, MOBILE_RATES, BOOST_RATES });
})();
