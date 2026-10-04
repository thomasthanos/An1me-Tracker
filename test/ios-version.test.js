// Pins the iOS WebKit fallback to the extension manifest version.
//
//   node test/ios-version.test.js
//
// The sidebar/WebKit fallback page (ios/Resources/Base.lproj/Main.html) shows a version badge.
// That number used to be hand-written and had already drifted a minor version behind
// manifest.json. scripts/setup-ios-ui.js now stamps every data-version element from the manifest
// during the iOS build, so this test guards the two things that would silently undo that:
// the manifest staying the single source of truth, and the elements the stamp targets existing.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { manifestVersion, stampVersion } = require("../scripts/setup-ios-ui.js");

const REPO = path.join(__dirname, "..");
const MAIN_HTML = path.join(REPO, "ios/Resources/Base.lproj/Main.html");

let failures = 0;
function check(label, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    console.log(`  PASS  ${label}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, "manifest.json"), "utf8"));
const html = fs.readFileSync(MAIN_HTML, "utf8");

check("manifest.json exposes a version", typeof manifest.version === "string" && manifest.version.length > 0, true);
check("manifestVersion reads it from the manifest", manifestVersion(), manifest.version);

// The stamp must reach the rendered element, not just the text of the file.
const { html: stamped, stamped: count } = stampVersion(html, manifest.version);
check("Main.html has a data-version element to stamp", count >= 1, true);
// data-version is followed by whitespace or ">" — a class such as "version-badge" makes a plain
// word boundary fail, and an unrelated data-version-anchor must not be matched as a prefix.
const ATTRIBUTE = new RegExp(`\\sdata-version(?=[\\s>])[^>]*>${manifest.version.replace(/\./g, "\\.")}<`);
check("the stamped badge shows the manifest version", ATTRIBUTE.test(stamped), true);

// The repo copy is the build input, so it must never carry a version manifest.json disagrees with.
const inRepo = html.match(/\sdata-version(?=[\s>])[^>]*>([^<]*)</);
check("the version written in the repo matches the manifest", inRepo && inRepo[1].trim(), manifest.version);

// A missing target must be an error, otherwise a rename would ship the old number silently.
let threw = false;
try {
  stampVersion("<html><body><span>1.0.0</span></body></html>", manifest.version);
} catch {
  threw = true;
}
check("stamping fails loudly when no data-version element exists", threw, true);

// A longer attribute name that merely starts with data-version must not be treated as the target.
const decoy = stampVersion('<body data-version-anchor><i>1.0.0</i></body><p data-version>0.0.0</p>', manifest.version);
check("a data-version-anchor decoy is left alone", decoy.stamped, 1);
check("the real data-version element is the one stamped", decoy.html.includes(`>${manifest.version}<`), true);
check("the decoy keeps its own content", decoy.html.includes("<i>1.0.0</i>"), true);

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
