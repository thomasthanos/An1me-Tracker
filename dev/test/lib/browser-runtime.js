// browser-runtime.js — loads Playwright for the browser integration suites.
// Without Playwright a suite prints SKIP and exits 0, so the dependency-free run stays usable.
// With AT_REQUIRE_BROWSER_TESTS=1 (the CI browser job) a missing Playwright is a failure instead:
// a green SKIP must never stand in for browser coverage.
"use strict";

function browserTestsRequired(env = process.env) {
  return env.AT_REQUIRE_BROWSER_TESTS === "1";
}

function loadPlaywright(label, { env = process.env, requireFn = require, exit = process.exit } = {}) {
  try {
    return requireFn("playwright");
  } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND") throw error;
    if (browserTestsRequired(env)) {
      console.error(`FAIL ${label}: Playwright is required (AT_REQUIRE_BROWSER_TESTS=1) but could not be loaded`);
      exit(1);
    } else {
      console.log(`SKIP ${label}: install Playwright (npm ci) or expose it through NODE_PATH`);
      exit(0);
    }
    return null;
  }
}

module.exports = { browserTestsRequired, loadPlaywright };
