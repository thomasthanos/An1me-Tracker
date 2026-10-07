// The app's Allow buttons and the extension's grant page must agree on the link and stay gesture-safe.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("app and content script share the at_grant marker", () => {
  assert.match(read("ios/An1meTracker/Shared/TrackerConstants.swift"), /static let grantMarker = "at_grant"/);
  const content = read("src/content/page/permission-report.js");
  assert.match(content, /GRANT_MARKER = "at_grant"/);
  assert.match(content, /type: "OPEN_GRANT_PAGE"/);
  assert.match(read("background.js"), /OPEN_GRANT_PAGE\(message, sender, sendResponse\)[\s\S]*?src\/grant\/grant\.html/);
});

test("grant page requests only declared origins, synchronously in the tap handler", () => {
  const js = read("src/grant/grant.js");
  assert.match(js, /declared\.filter\(\(origin\) => wanted\.includes\(hostOf\(origin\)\)\)/);
  const handler = js.slice(js.indexOf('$("grantAllow").addEventListener("click"'));
  const before = handler.slice(0, handler.indexOf("permissions.request("));
  assert.doesNotMatch(before, /\bawait\b/);
  assert.match(js, /an1metracker|SCHEME = "an1metracker"/);
  assert.ok(fs.existsSync(path.join(ROOT, "src/grant/grant.html")));
});

test("grants come from probes, not from the permissions API", async () => {
  const bg = read("background.js").replace(/\r\n/g, "\n");
  assert.match(bg, /const grantedOrigins = declared\.filter\(\(origin\) => probes\[origin\] === "allowed"\)/);
  assert.match(bg, /apiOrigins: listed/);
  const vm = require("node:vm");
  const pick = (name) => bg.slice(bg.indexOf(name), bg.indexOf("\n}\n", bg.indexOf(name)) + 2);
  const answers = { "an1me.to": { type: "basic" }, "api.aniskip.com": { type: "cors" } };
  const context = { AbortController, setTimeout, clearTimeout, URL,
    fetch: async (url) => { const r = answers[new URL(url).host]; if (!r) throw new TypeError("blocked"); return r; } };
  vm.runInNewContext(`const PERMISSION_PROBE_PATHS = {};\n${pick("async function probeHost")}\n${pick("async function probeDeclaredHosts")}\nthis.run = probeDeclaredHosts;`, context);
  const hostOf = (o) => o.replace(/^[a-z*]+:\/\//i, "").replace(/\/.*$/, "");
  const probes = await context.run(["https://an1me.to/*", "https://*.an1me.to/*", "https://api.aniskip.com/*", "https://myanimelist.net/*"], hostOf);
  assert.deepEqual({ ...probes }, { "https://an1me.to/*": "allowed", "https://*.an1me.to/*": "allowed",
    "https://api.aniskip.com/*": "unverified", "https://myanimelist.net/*": "ask" });
  answers["an1me.to"] = undefined; delete answers["api.aniskip.com"];
  const offline = await context.run(["https://an1me.to/*"], hostOf);
  assert.equal(offline["https://an1me.to/*"], "unreachable");
});

test("a report from another extension version is dropped on refresh", () => {
  assert.match(read("ios/An1meTracker/Services/PermissionCoordinator.swift"), /reported != current \{\s*store\.clear\(\)/);
});

test("Allow buttons no longer route to Settings", () => {
  const vm = read("ios/An1meTracker/ViewModels/WebsiteAccessViewModel.swift");
  assert.match(vm, /case \.allowRequiredAccess:\s*requestAll\(\)/);
  // The app's Approve buttons open the grant page (Safari's own sheet); the only Settings hop is for
  // switching the extension on, which Safari cannot do from anywhere else.
  const root = read("ios/An1meTracker/Views/RootView.swift");
  assert.match(root, /model\.request\(row\)/);
  assert.match(root, /Turn the extension on/);
  assert.doesNotMatch(root, /openExtensionsSettings\(\)[\s\S]*?model\.request/);
});
