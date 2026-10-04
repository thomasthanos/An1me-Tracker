// Pins every place that displays the extension version to manifest.json.
//
//   node dev/test/release-version.test.js
//
// manifest.json is the single source of truth. The README and IOS.md badges, the badge and hero SVGs
// and the changelog heading are written by hand or generated once, so a release that only bumps the
// manifest would ship them showing the old number. The iOS fallback page is covered separately by
// ios-version.test.js, which also checks the build-time stamp.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "../..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const { version } = JSON.parse(read("manifest.json"));
const escaped = version.replace(/\./g, "\\.");

let failures = 0;
function check(label, ok) {
  try {
    assert.strictEqual(ok, true);
    console.log(`  PASS  ${label}`);
  } catch {
    failures++;
    console.log(`  FAIL  ${label} (expected ${version})`);
  }
}

check("the manifest version is a plain x.y.z", /^\d+\.\d+\.\d+$/.test(version));

const readme = read("README.md");
check("README badge reads the manifest version", new RegExp(`alt="Version ${escaped}"`).test(readme));
check(
  "README iPhone download link points at this version's release and IPA",
  readme.includes(`/releases/download/tracker-v${version}/An1meTracker-${version}.ipa`),
);

check("IOS.md badge reads the manifest version", new RegExp(`\\[!\\[Version ${escaped}\\]`).test(read("IOS.md")));

const badge = read(".github/assets/badge-v-tracker.svg");
check("version badge SVG is labelled with the manifest version", badge.includes(`aria-label="Version ${version}"`));
check("version badge SVG shows the manifest version", new RegExp(`>${escaped}</text>`).test(badge));

check("hero SVG shows the manifest version", new RegExp(`>v${escaped}</text>`).test(read(".github/assets/hero-animated.svg")));

const changelog = read("CHANGELOG.md");
const latest = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
check("the newest changelog entry is the manifest version", !!latest && latest[1] === version);

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
