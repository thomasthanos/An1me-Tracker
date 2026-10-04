// Verify setup-ios-icons locates and populates AppIcon.appiconset
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setupIcons, findAppIconSets } = require("../scripts/setup-ios-icons.js");

const hostID = "111111111111111111111111", extensionID = "222222222222222222222222";
function writeProject(temp, withHost = true) {
  const project = path.join(temp, "An1me Tracker/An1me Tracker.xcodeproj/project.pbxproj");
  fs.mkdirSync(path.dirname(project), { recursive: true });
  fs.writeFileSync(project, `// !$*UTF8*$!
{
  objects = {
/* Begin PBXBuildFile section */
/* End PBXBuildFile section */
/* Begin PBXFileReference section */
/* End PBXFileReference section */
/* Begin PBXNativeTarget section */
\t\tAAAAAAAAAAAAAAAAAAAAAAAA /* Tracker */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildPhases = (
\t\t\t\t${hostID} /* Resources */,
\t\t\t);
\t\t\tproductType = "com.apple.product-type.${withHost ? "application" : "app-extension"}";
\t\t};
\t\tBBBBBBBBBBBBBBBBBBBBBBBB /* Safari Extension */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildPhases = (
\t\t\t\t${extensionID} /* Resources */,
\t\t\t);
\t\t\tproductType = "com.apple.product-type.app-extension";
\t\t};
/* End PBXNativeTarget section */
/* Begin PBXResourcesBuildPhase section */
\t\t${hostID} /* Resources */ = {
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tfiles = (
\t\t\t);
\t\t};
\t\t${extensionID} /* Resources */ = {
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tfiles = (
\t\t\t);
\t\t};
/* End PBXResourcesBuildPhase section */
/* Begin XCBuildConfiguration section */
\t\tCCCCCCCCCCCCCCCCCCCCCCCC /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
\t\t\t};
\t\t};
/* End XCBuildConfiguration section */
  };
}
`);
  return project;
}

test("setupIcons copies iOS adaptive icons and Contents.json into AppIcon.appiconset", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ios-icon-test-"));
  try {
    const mockAppIconSet = path.join(temp, "An1me Tracker/iOS (App)/Resources/Assets.xcassets/AppIcon.appiconset");
    fs.mkdirSync(mockAppIconSet, { recursive: true });
    writeProject(temp);

    assert.equal(findAppIconSets(temp).length, 1);
    setupIcons(temp);

    assert.ok(fs.existsSync(path.join(mockAppIconSet, "Contents.json")), "Contents.json should exist");
    assert.ok(fs.existsSync(path.join(mockAppIconSet, "AppIcon-light.png")), "AppIcon-light.png should exist");
    assert.ok(fs.existsSync(path.join(mockAppIconSet, "AppIcon-dark.png")), "AppIcon-dark.png should exist");
    assert.ok(fs.existsSync(path.join(mockAppIconSet, "AppIcon-tinted.png")), "AppIcon-tinted.png should exist");

    const contents = JSON.parse(fs.readFileSync(path.join(mockAppIconSet, "Contents.json"), "utf8"));
    assert.equal(contents.images.length, 3);
    assert.equal(contents.images[0].filename, "AppIcon-light.png");
    assert.equal(contents.images[1].filename, "AppIcon-dark.png");
    assert.equal(contents.images[2].filename, "AppIcon-tinted.png");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("native Icon Composer artwork belongs to the host Resources phase and setup is idempotent", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ios-composer-test-"));
  try {
    const resources = path.join(temp, "An1me Tracker/iOS (App)/Resources");
    fs.mkdirSync(path.join(resources, "Assets.xcassets/AppIcon.appiconset"), { recursive: true });
    const project = writeProject(temp);
    setupIcons(temp);
    const nativeIcon = path.join(resources, "AppIcon.icon");
    const icon = JSON.parse(fs.readFileSync(path.join(nativeIcon, "icon.json"), "utf8"));
    assert.ok(icon.groups.some(group => group.layers.some(layer => layer.glass && fs.existsSync(path.join(nativeIcon, "Assets", layer["image-name"])))));
    assert.ok(icon["fill-specializations"].some(value => value.appearance === "dark"));
    const before = fs.readFileSync(project, "utf8");
    assert.match(before, /lastKnownFileType = folder\.iconcomposer\.icon/);
    assert.match(before, /path = "iOS \(App\)\/Resources\/AppIcon\.icon"; sourceTree = SOURCE_ROOT/);
    const resourcesSection = before.split("/* Begin PBXResourcesBuildPhase section */")[1];
    const hostPhase = resourcesSection.split(hostID)[1].split("\n\t\t};")[0];
    const extensionPhase = resourcesSection.split(extensionID)[1].split("\n\t\t};")[0];
    assert.match(hostPhase, /AppIcon\.icon in Resources/);
    assert.doesNotMatch(extensionPhase, /AppIcon\.icon/);
    assert.equal(fs.existsSync(path.join(resources, "AppIcon60x60@3x.png")), false, "do not replace compiler-generated legacy icons with 1024px files");
    setupIcons(temp);
    assert.equal(fs.readFileSync(project, "utf8"), before);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("setup fails visibly when it cannot identify a host app target", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ios-composer-bad-test-"));
  try {
    fs.mkdirSync(path.join(temp, "An1me Tracker/iOS (App)/Resources/Assets.xcassets/AppIcon.appiconset"), { recursive: true });
    writeProject(temp, false);
    assert.throws(() => setupIcons(temp), /host app target/i);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("catalog assets are opaque 1024px PNGs and the native foreground preserves alpha", () => {
  const icons = path.join(__dirname, "../../src/icons/ios");
  for (const mode of ["light", "dark", "glass", "tinted", "transparent"]) {
    const png = fs.readFileSync(path.join(icons, `AppIcon-${mode}.png`));
    assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024);
    assert.equal(png[25], mode === "transparent" ? 6 : 2);
  }
  assert.deepEqual(fs.readFileSync(path.join(icons, "AppIcon.icon/Assets/TrackerPortrait.png")), fs.readFileSync(path.join(icons, "AppIcon-transparent.png")));
});
