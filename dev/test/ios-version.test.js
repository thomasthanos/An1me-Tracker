// Pins the shipped version to the extension manifest.
//
//   node dev/test/ios-version.test.js
//
// manifest.json is the single source of truth for the version. The release workflow reads it, hands it to
// xcodebuild as MARKETING_VERSION, and generates the Safari package from the same file, so the app, the
// extension and the SideStore feed cannot drift apart. The WebKit fallback page this test used to guard is
// gone, and with it the hand-written version badge it existed for.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "../..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

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

const manifest = JSON.parse(read("manifest.json"));
const workflow = read(".github/workflows/tracker-ipa.yml");

check("manifest.json exposes a version", typeof manifest.version === "string" && /^\d+\.\d+\.\d+$/.test(manifest.version), true);

// The workflow must derive MARKETING_VERSION from the manifest rather than hard-coding a number.
check(
  "the workflow publishes the manifest version as a step output",
  /\ echo "version=\$\(node -p 'require\("\.\/manifest\.json"\)\.version'\)"/.test(workflow),
  true,
);
check(
  "xcodebuild receives that output as MARKETING_VERSION",
  /MARKETING_VERSION="\$\{\{ steps\.meta\.outputs\.version \}\}"/.test(workflow),
  true,
);
const hardCoded = workflow.match(/MARKETING_VERSION="(\d+\.\d+\.\d+)"/);
check("no version is hard-coded in the workflow", hardCoded, null);
check(
  "the build number comes from the run, not the manifest",
  /CURRENT_PROJECT_VERSION="\$GITHUB_RUN_NUMBER"/.test(workflow),
  true,
);

// The SideStore feed is built from the built app's Info.plist, which is stamped by the workflow above.
const sidestore = read("dev/scripts/sidestore-source.js");
check("the SideStore feed reads the app's own version", sidestore.includes("CFBundleShortVersionString"), true);

// The packaged Safari manifest is generated from the same file, so the extension inside the IPA carries it.
const packaged = path.join(REPO, "dist/an1me-tracker-safari/manifest.json");
if (fs.existsSync(packaged)) {
  check("the packaged Safari manifest carries the manifest version", JSON.parse(fs.readFileSync(packaged, "utf8")).version, manifest.version);
} else {
  console.log("  SKIP  packaged Safari manifest not built yet (safari-compat.test.js builds it)");
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
