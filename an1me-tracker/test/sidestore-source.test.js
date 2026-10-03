// Verify the metadata SideStore consumes, including version and download integrity.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function fixture() {
  return {
    repository: "example/tracker",
    manifest: { name: "Example Tracker", author: "Example", version: "9.3.1", icons: { 128: "src/icons/icon128.png" } },
    appInfo: {
      CFBundleIdentifier: "com.example.Tracker",
      CFBundleShortVersionString: "9.3.1",
      CFBundleVersion: "77",
      MinimumOSVersion: "18.0",
    },
    ipaName: "An1meTracker-9.3.1.ipa",
    ipaSize: 123456,
    ipaSha256: "a".repeat(64),
    date: "2026-10-03",
  };
}

test("source describes the built app and its release download", () => {
  const { createSource } = require("../scripts/sidestore-source.js");
  const source = JSON.parse(JSON.stringify(createSource(fixture())));
  assert.equal(source.sourceURL, "https://github.com/example/tracker/releases/download/tracker-source/source.json");
  assert.equal(source.apps.length, 1);
  const appDescription =
    "The official companion Safari extension & tracker for an1me.to on iOS.\n\n" +
    "✨ Key Features:\n" +
    "• Automatic Episode Tracking: Accurately saves your watch progress and playback timestamp.\n" +
    "• Real-time Cloud Sync: Seamlessly syncs your library between iPhone and PC.\n" +
    "• AniList & MyAnimeList Integration: Automatically updates your anime lists upon completion.\n" +
    "• Smart Filler Detection: Highlights and skips filler episodes smoothly.\n" +
    "• Modern iOS Experience: Native dark design, fluid Safari popup sheets, and iOS 18 adaptive icons.\n\n" +
    "Requires iOS 18.0 or later.";

  const versionReleaseNotes =
    "v9.3.1 (Build 77):\n" +
    "• Resolved iOS Safari popup sheet detent layout and overflow issues.\n" +
    "• Fixed image flickering and DOM reloading in Continue Watching during library fetches.\n" +
    "• Graceful handling of Jikan 504 gateway timeouts and rate limits (no false errors).\n" +
    "• Enhanced mobile video progress persistence with iOS Page Lifecycle freeze and fullscreen exit handlers.\n" +
    "• Dark premium icon and improved SideStore description.";

  assert.deepEqual(source.apps[0], {
    name: "Example Tracker",
    bundleIdentifier: "com.example.Tracker",
    developerName: "Example",
    subtitle: "Safari Extension & Tracker for an1me.to",
    localizedDescription: appDescription,
    iconURL: "https://raw.githubusercontent.com/example/tracker/main/an1me-tracker/src/icons/ios/AppIcon-dark.png",
    tintColor: "54d2ff",
    versions: [{
      version: "9.3.1",
      buildVersion: "77",
      date: "2026-10-03",
      downloadURL: "https://github.com/example/tracker/releases/download/tracker-v9.3.1/An1meTracker-9.3.1.ipa",
      localizedDescription: versionReleaseNotes,
      size: 123456,
      sha256: "a".repeat(64),
      minOSVersion: "18.0",
    }],
    appPermissions: { entitlements: [], privacy: {} },
  });
  assert.equal("marketplaceID" in source.apps[0], false);
});

test("missing or malformed content hashes cannot create source metadata", () => {
  const { createSource } = require("../scripts/sidestore-source.js");
  assert.throws(() => createSource({ ...fixture(), ipaSha256: "wrong" }), /SHA256/i);
  assert.throws(() => createSource({ ...fixture(), ipaSha256: undefined }), /SHA256/i);
});

test("mismatched manifest and built app versions cannot publish a wrong release URL", () => {
  const { createSource } = require("../scripts/sidestore-source.js");
  const input = fixture();
  input.appInfo.CFBundleShortVersionString = "9.3.2";
  assert.throws(() => createSource(input), /version.*match/i);
});

test("missing built app fields fail before publishing undecodable metadata", () => {
  const { createSource } = require("../scripts/sidestore-source.js");
  for (const field of ["CFBundleIdentifier", "CFBundleVersion", "MinimumOSVersion"]) {
    const input = fixture();
    delete input.appInfo[field];
    assert.throws(() => createSource(input), new RegExp(field));
  }
});

test("an empty IPA or unexpected filename cannot be advertised as a release", () => {
  const { createSource } = require("../scripts/sidestore-source.js");
  assert.throws(() => createSource({ ...fixture(), ipaSize: 0 }), /size/i);
  assert.throws(() => createSource({ ...fixture(), ipaName: "old.ipa" }), /filename/i);
});

test("native privacy declarations are carried into the source", () => {
  const { createSource } = require("../scripts/sidestore-source.js");
  const input = fixture();
  input.appInfo.NSCameraUsageDescription = "Scan a pairing code.";
  assert.deepEqual(createSource(input).apps[0].appPermissions.privacy, { NSCameraUsageDescription: "Scan a pairing code." });
});

test("CLI reads built metadata and emits dates accepted by SideStore's ISO8601 decoder", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-source-test-"));
  try {
    const manifest = require("../manifest.json");
    const infoPath = path.join(temp, "app-info.json");
    const ipaPath = path.join(temp, `An1meTracker-${manifest.version}.ipa`);
    fs.writeFileSync(infoPath, JSON.stringify({ ...fixture().appInfo, CFBundleShortVersionString: manifest.version }));
    // Packaging validates the archive; this generator's boundary is its bytes and app metadata.
    fs.writeFileSync(ipaPath, "hello");
    const output = execFileSync(process.execPath, [path.join(__dirname, "../scripts/sidestore-source.js"), infoPath, ipaPath, "example/tracker"], { encoding: "utf8" });
    const source = JSON.parse(output);
    const version = source.apps[0].versions[0];
    assert.match(version.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(version.size, 5);
    assert.equal(version.sha256, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    assert.equal(source.apps[0].bundleIdentifier, "com.example.Tracker");
  } finally {
    // Only remove the exact directory returned by mkdtemp inside the system temp directory.
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
