// Local playback preferences shared by the player, popup and background writer.
(function () {
  "use strict";
  const KEY = "speedControlPreferences";
  const NORMAL_RATES = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  const MOBILE_RATES = Object.freeze([1, 1.25, 1.5, 2]);
  const BOOST_RATES = Object.freeze([1.5, 2, 3, 4, 8]);
  const FIELDS = new Set(["enabled", "normalRate", "boostRate", "defaultVolume", "defaultMuted"]);
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const isVolume = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

  function normalize(raw, mobile = false) {
    const input = isObject(raw) ? raw : {};
    const rates = mobile ? MOBILE_RATES : NORMAL_RATES;
    return {
      enabled: typeof input.enabled === "boolean" ? input.enabled : true,
      normalRate: rates.includes(input.normalRate) ? input.normalRate : null,
      boostRate: mobile ? 2 : BOOST_RATES.includes(input.boostRate) ? input.boostRate : 4,
      defaultVolume: !mobile && isVolume(input.defaultVolume) ? input.defaultVolume : null,
      defaultMuted: !mobile && typeof input.defaultMuted === "boolean" ? input.defaultMuted : null,
    };
  }

  function patch(raw, delta, mobile = false) {
    if (!isObject(delta)) throw new TypeError("Speed preference patch must be an object");
    const next = normalize(raw, mobile);
    for (const key of Reflect.ownKeys(delta)) {
      if (!FIELDS.has(key)) throw new TypeError(`Unknown speed preference: ${String(key)}`);
      const value = delta[key];
      const valid = value === null ||
        (key === "enabled" && typeof value === "boolean") ||
        (key === "normalRate" && (mobile ? MOBILE_RATES : NORMAL_RATES).includes(value)) ||
        (key === "boostRate" && (mobile ? value === 2 : BOOST_RATES.includes(value))) ||
        (key === "defaultVolume" && !mobile && isVolume(value)) ||
        (key === "defaultMuted" && !mobile && typeof value === "boolean");
      if (!valid) throw new TypeError(`Invalid speed preference: ${key}`);
      next[key] = value;
    }
    return normalize(next, mobile);
  }

  globalThis.AnimeTrackerSpeedPreferences = Object.freeze({ KEY, normalize, patch, NORMAL_RATES, MOBILE_RATES, BOOST_RATES });
})();
