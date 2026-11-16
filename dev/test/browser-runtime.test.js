// The browser gate: a missing Playwright is a SKIP locally but a failure when browser tests are required.
const assert = require("node:assert/strict");
const { loadPlaywright, browserTestsRequired } = require("./lib/browser-runtime");

function missing() {
  const error = new Error("Cannot find module 'playwright'");
  error.code = "MODULE_NOT_FOUND";
  throw error;
}

function run(env, requireFn) {
  const exits = [];
  const log = console.log, err = console.error;
  console.log = console.error = () => {};
  try {
    const result = loadPlaywright("probe", { env, requireFn, exit: code => exits.push(code) });
    return { result, exits };
  } finally {
    console.log = log; console.error = err;
  }
}

assert.equal(browserTestsRequired({}), false);
assert.equal(browserTestsRequired({ AT_REQUIRE_BROWSER_TESTS: "1" }), true);

const required = run({ AT_REQUIRE_BROWSER_TESTS: "1" }, missing);
assert.deepEqual(required.exits, [1], "a required browser job without Playwright must exit 1");

const optional = run({}, missing);
assert.deepEqual(optional.exits, [0], "without the requirement the suite skips");

const fake = { chromium: {} };
const present = run({ AT_REQUIRE_BROWSER_TESTS: "1" }, () => fake);
assert.equal(present.result, fake);
assert.deepEqual(present.exits, []);

assert.throws(() => run({}, () => { throw new SyntaxError("broken install"); }), SyntaxError,
  "a broken Playwright install is an error, never a skip");

console.log("browser-runtime: required runtime fails, optional runtime skips");
