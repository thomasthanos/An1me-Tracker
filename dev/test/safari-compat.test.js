// Pins what keeps the extension loadable in Safari.
//
//   node dev/test/safari-compat.test.js
//
// Safari implements neither chrome.notifications nor chrome.identity nor the side panel. The
// notification coordinator attached listeners to chrome.notifications while loading, which in a
// browser without it throws inside importScripts and takes the whole service worker down; and a
// manifest that requests unsupported permissions is reported by Safari's packager. The Safari
// package is generated from the Chrome manifest by scripts/package.js --target safari.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const REPO = path.join(__dirname, "../..");

let failures = 0;
function check(label, actual, expected) {
  try {
    // Values built inside the vm sandbox carry its prototypes; compare them as plain data.
    assert.deepStrictEqual(actual === undefined ? actual : JSON.parse(JSON.stringify(actual)), expected);
    console.log(`  PASS  ${label}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

function loadCoordinator(withNotifications) {
  const listeners = [];
  const event = () => ({ addListener: (fn) => listeners.push(fn) });
  const chrome = {
    alarms: { onAlarm: event(), get: async () => null, clear: async () => true, create: async () => {} },
    runtime: { onStartup: event(), onInstalled: event(), getURL: (p) => p },
  };
  if (withNotifications) {
    chrome.notifications = { create() {}, clear() {}, getAll() {}, onClicked: event(), onButtonClicked: event() };
  }
  const sandbox = { chrome, console, setTimeout, clearTimeout };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const rel = "src/background/notification-coordinator.js";
  new vm.Script(fs.readFileSync(path.join(REPO, rel), "utf8"), { filename: rel }).runInContext(sandbox);
  return { coordinator: sandbox.AnimeTrackerNotificationCoordinator, listeners };
}

(async () => {
  let safari;
  try {
    safari = loadCoordinator(false);
    check("coordinator loads without chrome.notifications", true, true);
  } catch (error) {
    check("coordinator loads without chrome.notifications", error.message, "no error");
  }
  if (safari) {
    check("reports notifications unsupported", safari.coordinator.supported, false);
    const badges = await safari.coordinator.notifyBadges([{ id: "first-episode", title: "First", tier: "bronze" }]);
    check("badges are accepted (so the popup stops retrying) without being queued", [badges.accepted, badges.queued, badges.acceptedIds], [true, 0, ["first-episode"]]);
  }
  const chrome = loadCoordinator(true);
  check("Chrome: supported and click listeners attached", [chrome.coordinator.supported, chrome.listeners.length], [true, 5]);

  execFileSync(process.execPath, [path.join(REPO, "dev/scripts/package.js"), "--target", "safari"], { stdio: "pipe" });
  const source = JSON.parse(fs.readFileSync(path.join(REPO, "manifest.json"), "utf8"));
  const packaged = JSON.parse(fs.readFileSync(path.join(REPO, "dist/an1me-tracker-safari/manifest.json"), "utf8"));
  check(
    "Safari manifest drops identity, notifications and the side panel",
    [packaged.permissions.filter((p) => ["identity", "notifications", "sidePanel"].includes(p)), "side_panel" in packaged],
    [[], false],
  );
  check("Safari manifest keeps every other permission", packaged.permissions, source.permissions.filter((p) => !["identity", "notifications", "sidePanel"].includes(p)));
  check("Safari manifest keeps the content scripts and version", [packaged.content_scripts, packaged.version], [source.content_scripts, source.version]);
  const core = ["https://an1me.to/*", "https://*.an1me.to/*"];
  // Safari prompts only for optional hosts requested from a tap: the services are optional so one tap asks for all
  // of them, and the optional all-websites pattern is Settings' single "All Websites" switch for the same thing.
  const services = source.host_permissions.filter(host => !core.includes(host) && host !== "https://graphql.anilist.co/*");
  check("only the tracking site stays required in Safari", packaged.host_permissions, core);
  check("one tap can request every service, and Settings has an All Websites switch", packaged.optional_host_permissions, [...services, "<all_urls>"]);
  check("the disabled mobile AniList API is not requested", packaged.optional_host_permissions.includes("https://graphql.anilist.co/*"), false);
  check("content scripts still run on an1me.to only", [...new Set(packaged.content_scripts.flatMap((script) => script.matches))].every((match) => /an1me\.to\//.test(match)), true);
  const filler = ["https://www.animefillerlist.com/*", "https://api.jikan.moe/*"];
  check("Chrome's manifest still requires the filler sites", filler.every((host) => source.host_permissions.includes(host)) && !source.optional_host_permissions, true);
  check("native host icon artwork stays out of the extension bundle", fs.existsSync(path.join(REPO, "dist/an1me-tracker-safari/src/icons/ios")), false);
  check("runtime extension icons remain packaged", fs.existsSync(path.join(REPO, "dist/an1me-tracker-safari/src/icons/icon128.png")), true);

  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})();
