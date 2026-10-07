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

test("contains() is diagnostics only; grants come from getAll()", () => {
  const bg = read("background.js");
  assert.match(bg, /containsOrigins\.push\(origin\)/);
  assert.match(bg, /const grantedOrigins = \[\.\.\.new Set\(\[\.\.\.listed, \.\.\.declared\.filter\(covered\)\]\)\]/);
  assert.match(read("src/grant/grant.js"), /verifyAndReturn/);
});

test("Allow buttons no longer route to Settings", () => {
  const vm = read("ios/An1meTracker/ViewModels/WebsiteAccessViewModel.swift");
  assert.match(vm, /case \.allowRequiredAccess:\s*requestAll\(\)/);
  assert.match(read("ios/An1meTracker/ViewModels/HomeViewModel.swift"), /case \.allowRequiredAccess:\s*permissions\.requestAll\(\)/);
  assert.doesNotMatch(read("ios/An1meTracker/Views/PermissionsView.swift"), /Open Safari Settings/);
});
