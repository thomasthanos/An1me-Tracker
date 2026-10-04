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
    revision: "b".repeat(40),
  };
}

test("source describes the built app and its release download", () => {
  const { createSource } = require("../scripts/sidestore-source.js");
  const source = JSON.parse(JSON.stringify(createSource(fixture())));
  assert.equal(source.sourceURL, "https://github.com/example/tracker/releases/download/tracker-source/source.json");
  assert.equal(source.identifier, "io.github.thomasthanos.an1metracker.source");
  assert.equal(source.apps.length, 1);
  const { localizedDescription, versions, ...app } = source.apps[0];
  assert.ok(localizedDescription.length > 0);
  assert.deepEqual(app, {
    name: "An1me Tracker",
    bundleIdentifier: "com.example.Tracker",
    developerName: "Example",
    subtitle: "Track episodes and resume watching in Safari",
    iconURL: `https://raw.githubusercontent.com/example/tracker/${"b".repeat(40)}/src/icons/ios/AppIcon-sidestore.png`,
    tintColor: "168aad",
    appPermissions: { entitlements: [], privacy: {} },
  });
  const { localizedDescription: versionReleaseNotes, ...release } = versions[0];
  assert.ok(versionReleaseNotes.length > 0);
  assert.equal(versions.length, 1);
  assert.deepEqual(release, {
    version: "9.3.1",
    buildVersion: "77",
    date: "2026-10-03",
    downloadURL: "https://github.com/example/tracker/releases/download/tracker-v9.3.1/An1meTracker-9.3.1.ipa",
    size: 123456,
    sha256: "a".repeat(64),
    minOSVersion: "18.0",
  });
  assert.equal("marketplaceID" in source.apps[0], false);
});

test("source and app icon URLs change with the build commit so cached older artwork cannot be reused", () => {
  const { createSource } = require("../scripts/sidestore-source.js");
  const current = createSource(fixture());
  const input = fixture();
  input.manifest.version = "9.3.2";
  input.appInfo.CFBundleShortVersionString = "9.3.2";
  input.ipaName = "An1meTracker-9.3.2.ipa";
  input.revision = "c".repeat(40);
  const next = createSource(input);
  assert.equal(current.iconURL, current.apps[0].iconURL);
  assert.equal(next.iconURL, next.apps[0].iconURL);
  assert.notEqual(current.iconURL, next.iconURL);
  assert.equal(next.iconURL, `https://raw.githubusercontent.com/example/tracker/${input.revision}/src/icons/ios/AppIcon-sidestore.png`);
});

test("rebuilding an existing version uses artwork from the actual immutable build commit", () => {
  const { createSource } = require("../scripts/sidestore-source.js");
  const revision = "b".repeat(40);
  const source = createSource({ ...fixture(), revision });
  assert.equal(source.iconURL, `https://raw.githubusercontent.com/example/tracker/${revision}/src/icons/ios/AppIcon-sidestore.png`);
  assert.equal(source.iconURL, source.apps[0].iconURL);
  assert.equal(source.apps[0].versions[0].downloadURL, "https://github.com/example/tracker/releases/download/tracker-v9.3.1/An1meTracker-9.3.1.ipa");
  assert.notEqual(source.iconURL, createSource({ ...fixture(), revision: "c".repeat(40) }).iconURL);
  assert.throws(() => createSource({ ...fixture(), revision: "../main" }), /revision/i);
  assert.throws(() => createSource({ ...fixture(), revision: undefined }), /revision/i);
});

test("source provides optional SideStore presentation fields without changing its identity", () => {
  const { createSource } = require("../scripts/sidestore-source.js");
  const source = createSource(fixture());
  assert.equal(source.name, source.apps[0].name);
  assert.equal(source.website, "https://github.com/example/tracker");
  assert.ok(source.subtitle.length > 0);
  assert.ok(source.description.length > 0);
  assert.match(source.tintColor, /^[a-f0-9]{6}$/);
  assert.equal(source.tintColor, source.apps[0].tintColor);
});

test("SideStore artwork is a full-bleed opaque 1024px PNG for native image decoding", () => {
  const png = fs.readFileSync(path.join(__dirname, "../src/icons/ios/AppIcon-sidestore.png"));
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[24], 8, "8-bit channels");
  assert.equal(png[25], 2, "RGB without transparency");
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
    const revision = "d".repeat(40);
    const output = execFileSync(process.execPath, [path.join(__dirname, "../scripts/sidestore-source.js"), infoPath, ipaPath, "example/tracker"], { encoding: "utf8", env: { ...process.env, GITHUB_SHA: revision } });
    const source = JSON.parse(output);
    const version = source.apps[0].versions[0];
    assert.match(version.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(version.size, 5);
    assert.equal(version.sha256, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    assert.equal(source.apps[0].bundleIdentifier, "com.example.Tracker");
    assert.equal(source.iconURL, `https://raw.githubusercontent.com/example/tracker/${revision}/src/icons/ios/AppIcon-sidestore.png`);
    const command = [path.join(__dirname, "../scripts/sidestore-source.js"), infoPath, ipaPath, "example/tracker"];
    assert.throws(() => execFileSync(process.execPath, command, { env: { ...process.env, GITHUB_SHA: "" }, stdio: "pipe" }), /revision.*commit/i);
    const explicitRevision = "e".repeat(40);
    const explicit = JSON.parse(execFileSync(process.execPath, [...command, explicitRevision], { encoding: "utf8", env: { ...process.env, GITHUB_SHA: "" } }));
    assert.equal(explicit.iconURL, `https://raw.githubusercontent.com/example/tracker/${explicitRevision}/src/icons/ios/AppIcon-sidestore.png`);
  } finally {
    // Only remove the exact directory returned by mkdtemp inside the system temp directory.
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
