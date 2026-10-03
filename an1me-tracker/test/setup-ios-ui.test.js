const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { setupUI } = require("../scripts/setup-ios-ui.js");

test("setupUI injects SwiftUI ViewController, AppLogo imageset, and web resources", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ios-ui-test-"));
  try {
    const appDir = path.join(tmpDir, "An1me Tracker/An1me Tracker");
    const extDir = path.join(tmpDir, "An1me Tracker/An1me Tracker Extension");
    const assetsDir = path.join(appDir, "Assets.xcassets");
    const resDir = path.join(appDir, "Resources/Base.lproj");

    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(extDir, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(resDir, { recursive: true });

    // Create dummy template files
    fs.writeFileSync(path.join(appDir, "ViewController.swift"), "// dummy template");
    fs.writeFileSync(path.join(extDir, "ViewController.swift"), "// dummy extension");
    fs.writeFileSync(path.join(resDir, "Main.html"), "<p>dummy</p>");
    fs.writeFileSync(path.join(appDir, "Resources/Style.css"), "/* dummy */");
    fs.writeFileSync(path.join(appDir, "Resources/Icon.png"), "dummy icon");

    const result = setupUI(tmpDir);

    assert.equal(result.viewControllers, 1);
    assert.equal(result.htmlFiles, 1);
    assert.equal(result.cssFiles, 1);
    assert.equal(result.assetCatalogs, 1);

    // Verify app ViewController was replaced
    const appSwift = fs.readFileSync(path.join(appDir, "ViewController.swift"), "utf8");
    assert.match(appSwift, /An1meTrackerAppView/);
    assert.match(appSwift, /UIHostingController/);

    // Verify extension ViewController was NOT touched
    const extSwift = fs.readFileSync(path.join(extDir, "ViewController.swift"), "utf8");
    assert.equal(extSwift, "// dummy extension");

    // Verify AppLogo.imageset was created
    const logoDir = path.join(assetsDir, "AppLogo.imageset");
    assert.ok(fs.existsSync(path.join(logoDir, "Contents.json")));
    assert.ok(fs.existsSync(path.join(logoDir, "AppLogo.png")));

    // Verify Main.html was replaced
    const html = fs.readFileSync(path.join(resDir, "Main.html"), "utf8");
    assert.match(html, /An1me Tracker/);
    assert.match(html, /openSettingsBtn/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
