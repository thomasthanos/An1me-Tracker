// The contract between the Safari extension and the native app's bridge.
//
//   node dev/test/permission-report-bridge.test.js
//
// The extension proves it runs on an1me.to by answering the app's verify link through
// `an1metracker://state?p=…`. ios/An1meTracker/Services/PermissionBridge.swift requires `site` (an1me.to or a
// subdomain) and a fresh `capturedAt`; `extensionVersion` comes from the worker, `error` when it did not answer.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../../src/content/page/permission-report.js"), "utf8");

function run({ search, reply = null, lastError = null }) {
  const location = { search, pathname: "/", hash: "", href: "", hostname: "an1me.to" };
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

test("the verify marker reports the site it ran on and the worker's version", () => {
  const { location, sent } = run({ search: "?at_verify=1", reply: { success: true, report: { extensionVersion: "8.3.8", capturedAt: 1 } } });
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{ type: "GET_PERMISSION_REPORT" }]);
  const payload = decodePayload(location.href);
  assert.equal(payload.site, "an1me.to");
  assert.equal(payload.extensionVersion, "8.3.8");
  assert.equal(typeof payload.capturedAt, "number");
  assert.ok(Math.abs(payload.capturedAt - Date.now()) < 5000, "capturedAt is the content script's own clock");
  assert.equal("error" in payload, false);
  assert.equal("grantedOrigins" in payload, false, "host permissions are not reported: Safari misreports them");
});

test("a worker that does not answer still proves the content script ran", () => {
  const { location } = run({ search: "?at_verify=1", reply: { success: false, error: "token_unavailable" } });
  const payload = decodePayload(location.href);
  assert.equal(payload.site, "an1me.to");
  assert.equal(payload.error, "token_unavailable");
  assert.equal("extensionVersion" in payload, false);
});

test("a runtime error is reported the same way", () => {
  const { location } = run({ search: "?at_verify=1", reply: undefined, lastError: { message: "no worker" } });
  const payload = decodePayload(location.href);
  assert.equal(payload.error, "no worker");
  assert.equal(payload.site, "an1me.to");
});

test("the retired grant marker does nothing", () => {
  const { location, sent } = run({ search: "?at_grant=all" });
  assert.equal(sent.length, 0);
  assert.equal(location.href, "");
});

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
