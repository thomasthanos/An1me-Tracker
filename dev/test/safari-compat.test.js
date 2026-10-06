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
// The iOS host set is decided by dev/scripts/ios-permissions.js, not by the desktop manifest: the two
// builds answer to different questions.
const { REQUIRED_ORIGINS, OPTIONAL_ORIGINS, ALL_WEBSITES, UNSUPPORTED_IOS_PERMISSIONS } = require("../scripts/ios-permissions");

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
    [packaged.permissions.filter((p) => UNSUPPORTED_IOS_PERMISSIONS.includes(p)), "side_panel" in packaged],
    [[], false],
  );
  check("Safari manifest keeps every other permission", packaged.permissions, source.permissions.filter((p) => !UNSUPPORTED_IOS_PERMISSIONS.includes(p)));
  check("Safari manifest keeps the content scripts and version", [packaged.content_scripts, packaged.version], [source.content_scripts, source.version]);
  const core = ["https://an1me.to/*", "https://*.an1me.to/*"];
  // Safari prompts only for optional hosts requested from a tap, so every non-required group ships as one
  // requestable block, with the all-websites switch beside it.
  const iosHosts = [...REQUIRED_ORIGINS, ...OPTIONAL_ORIGINS];
  check("only the tracking site stays required in Safari", packaged.host_permissions, core);
  check("required origins are exactly the tracking-site group", packaged.host_permissions, [...REQUIRED_ORIGINS]);
  check("one tap can request every service, and Settings has an All Websites switch", packaged.optional_host_permissions, [...OPTIONAL_ORIGINS, ALL_WEBSITES]);
  check("the disabled mobile AniList API is not requested", packaged.optional_host_permissions.includes("https://graphql.anilist.co/*"), false);
  check("desktop-only hosts stay out of the iOS build",
    ["https://graphql.anilist.co/*", "https://anilist.co/*", "https://accounts.google.com/*"].filter((host) => iosHosts.includes(host)), []);
  // These three were inherited from the desktop manifest and no code path in this repository produces a
  // URL for them, so the iOS build no longer asks for them.
  check("dead image CDNs are not requested on iOS",
    ["https://image.tmdb.org/*", "https://media.kitsu.app/*", "https://img1.ak.crunchyroll.com/*"].filter((host) => iosHosts.includes(host)), []);
  check("every iOS origin is an https pattern", iosHosts.every((origin) => /^https:\/\/[^/\s]+\/\*$/.test(origin)), true);
  check("content scripts still run on an1me.to only", [...new Set(packaged.content_scripts.flatMap((script) => script.matches))].every((match) => /an1me\.to\//.test(match)), true);
  const filler = ["https://www.animefillerlist.com/*", "https://api.jikan.moe/*"];
  check("Chrome's manifest still requires the filler sites", filler.every((host) => source.host_permissions.includes(host)) && !source.optional_host_permissions, true);
  check("native host icon artwork stays out of the extension bundle", fs.existsSync(path.join(REPO, "dist/an1me-tracker-safari/src/icons/ios")), false);
  check("runtime extension icons remain packaged", fs.existsSync(path.join(REPO, "dist/an1me-tracker-safari/src/icons/icon128.png")), true);

  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})();
