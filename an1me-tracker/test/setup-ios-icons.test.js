// Verify setup-ios-icons locates and populates AppIcon.appiconset
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setupIcons, findAppIconSets } = require("../scripts/setup-ios-icons.js");

test("setupIcons copies iOS adaptive icons and Contents.json into AppIcon.appiconset", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ios-icon-test-"));
  try {
    const mockAppIconSet = path.join(temp, "An1me Tracker/iOS (App)/Resources/Assets.xcassets/AppIcon.appiconset");
    fs.mkdirSync(mockAppIconSet, { recursive: true });

    assert.equal(findAppIconSets(temp).length, 1);
    setupIcons(temp);

    assert.ok(fs.existsSync(path.join(mockAppIconSet, "Contents.json")), "Contents.json should exist");
    assert.ok(fs.existsSync(path.join(mockAppIconSet, "AppIcon-light.png")), "AppIcon-light.png should exist");
    assert.ok(fs.existsSync(path.join(mockAppIconSet, "AppIcon-dark.png")), "AppIcon-dark.png should exist");
    assert.ok(fs.existsSync(path.join(mockAppIconSet, "AppIcon-tinted.png")), "AppIcon-tinted.png should exist");

    const contents = JSON.parse(fs.readFileSync(path.join(mockAppIconSet, "Contents.json"), "utf8"));
    assert.equal(contents.images.length, 3);
    assert.equal(contents.images[0].filename, "AppIcon-dark.png");
    assert.equal(contents.images[1].filename, "AppIcon-dark.png");
    assert.equal(contents.images[2].filename, "AppIcon-tinted.png");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
