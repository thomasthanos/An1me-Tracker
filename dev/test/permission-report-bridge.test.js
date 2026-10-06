// The contract between the Safari extension and the native app's permission bridge.
//
//   node dev/test/permission-report-bridge.test.js
//
// The app cannot ask Safari for a WebExtension's host permissions, so the extension hands over its own
// reading through `an1metracker://state?p=…`. Two things have to keep agreeing for that to work: the shape
// of the payload, and the rule that a failure must not look like "nothing is allowed". The Swift side reads
// both in ios/An1meTracker/Services/PermissionBridge.swift (`grantedOrigins` and `allWebsites` are
// required; their absence means "could not read").
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../../src/content/page/permission-report.js"), "utf8");

function run({ search, reply = null, lastError = null }) {
  const location = { search, pathname: "/", hash: "", href: "" };
  const sent = [];
  const context = vm.createContext({
    console,
    location,
    window: { location },
    history: { replaceState() {} },
    chrome: {
      runtime: {
        get lastError() {
          return lastError;
        },
        sendMessage(message, callback) {
          sent.push(message);
          callback(reply);
        },
      },
    },
    TextEncoder,
    btoa,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(SOURCE, context, { filename: "permission-report.js" });
  return { location, sent };
}

function decodePayload(href) {
  const prefix = "an1metracker://state?p=";
  assert.ok(href.startsWith(prefix), `expected a bridge URL, got ${href}`);
  let base64 = href.slice(prefix.length).replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) base64 += "=";
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
}

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

test("an ordinary page view is left completely alone", () => {
  const { location, sent } = run({ search: "" });
  assert.equal(sent.length, 0, "no message is sent");
  assert.equal(location.href, "", "nothing is opened");
});

test("the verify marker asks the worker and hands the report over verbatim", () => {
  const report = {
    grantedOrigins: ["https://an1me.to/*", "https://api.jikan.moe/*"],
    blockedOrigins: ["https://firestore.googleapis.com/*"],
    allWebsites: false,
    extensionVersion: "8.3.0",
    capturedAt: 1_760_000_000_000,
  };
  const { location, sent } = run({ search: "?at_verify=1", reply: { success: true, report } });

  // The message is built inside the vm realm, so compare it as data rather than by prototype.
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{ type: "GET_PERMISSION_REPORT" }]);
  const payload = decodePayload(location.href);
  assert.deepEqual(payload, report, "the app stores exactly what the extension measured");
  assert.equal(payload.allWebsites, false);
  assert.ok(Array.isArray(payload.grantedOrigins));
  assert.equal(typeof payload.capturedAt, "number", "capturedAt is epoch milliseconds");
});

test("a broad grant is reported as the All Websites switch, matching Safari's own spelling", () => {
  const report = {
    grantedOrigins: ["*://*/*"],
    blockedOrigins: [],
    allWebsites: true,
    extensionVersion: "8.3.0",
    capturedAt: 1_760_000_000_000,
  };
  const { location } = run({ search: "?at_verify=1", reply: { success: true, report } });
  const payload = decodePayload(location.href);
  assert.equal(payload.allWebsites, true);
  // The app maps both spellings onto one switch; see HostPermissions.allWebsitesPattern.
  assert.ok(payload.grantedOrigins.some((origin) => origin === "*://*/*" || origin === "<all_urls>"));
});

test("an empty grant is a real reading, not a failure", () => {
  const report = {
    grantedOrigins: [],
    blockedOrigins: ["https://firestore.googleapis.com/*", "https://api.jikan.moe/*"],
    allWebsites: false,
    extensionVersion: "8.3.0",
    capturedAt: 1_760_000_000_000,
  };
  const { location } = run({ search: "?at_verify=1", reply: { success: true, report } });
  const payload = decodePayload(location.href);
  assert.deepEqual(payload.grantedOrigins, []);
  assert.equal(payload.allWebsites, false);
  assert.ok(payload.blockedOrigins.length > 0);
});

test("a failure payload omits the two keys the app requires, so it cannot read as 'nothing allowed'", () => {
  const { location } = run({ search: "?at_verify=1", reply: { success: false, error: "token_unavailable" } });
  const payload = decodePayload(location.href);
  assert.equal("grantedOrigins" in payload, false);
  assert.equal("allWebsites" in payload, false);
  assert.equal(payload.error, "token_unavailable");
});

test("a runtime error is reported the same way, without pretending to be a reading", () => {
  const { location } = run({ search: "?at_verify=1", reply: undefined, lastError: { message: "no worker" } });
  const payload = decodePayload(location.href);
  assert.equal("grantedOrigins" in payload, false);
  assert.equal(payload.error, "no worker");
});

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
