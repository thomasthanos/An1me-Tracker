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

    // Verify Main.html was replaced, and that its controls kept the contract the native
    // bridge relies on: Script.js forwards data-action values to the `controller` handler,
    // so these attribute values are the interface, not styling details.
    const html = fs.readFileSync(path.join(resDir, "Main.html"), "utf8");
    assert.match(html, /An1me Tracker/);
    assert.doesNotMatch(html, /dummy/);
    assert.match(html, /data-action="open-settings"/);
    assert.match(html, /data-action="open-url:https:\/\/an1me\.to"/);
    assert.match(html, /data-action="open-url:https:\/\/github\.com\/thomasthanos\/An1me-Tracker"/);

    // The version badge is stamped from manifest.json, replacing the template placeholder.
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../../manifest.json"), "utf8"));
    assert.match(html, new RegExp(`\\sdata-version(?=[\\s>])[^>]*>${manifest.version.replace(/\./g, "\\.")}<`));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("setupUI gives the host app the extension's link: its scene delegate and URL scheme, not the extension's", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ios-ui-url-"));
  try {
    const appDir = path.join(tmpDir, "An1me Tracker/iOS (App)");
    const extDir = path.join(tmpDir, "An1me Tracker/iOS (Extension)");
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(extDir, { recursive: true });
    const plist = (body) => `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n${body}</dict>\n</plist>\n`;
    const appPlist = plist("\t<key>UIApplicationSceneManifest</key>\n\t<dict>\n\t\t<key>UIApplicationSupportsMultipleScenes</key>\n\t\t<false/>\n\t</dict>\n");
    const extPlist = plist("\t<key>NSExtension</key>\n\t<dict>\n\t</dict>\n");
    fs.writeFileSync(path.join(appDir, "Info.plist"), appPlist);
    fs.writeFileSync(path.join(extDir, "Info.plist"), extPlist);
    fs.writeFileSync(path.join(appDir, "SceneDelegate.swift"), "// template");
    fs.writeFileSync(path.join(extDir, "SceneDelegate.swift"), "// extension");

    const result = setupUI(tmpDir);
    assert.equal(result.sceneDelegates, 1);
    assert.equal(result.urlSchemes, 1);

    const scene = fs.readFileSync(path.join(appDir, "SceneDelegate.swift"), "utf8");
    assert.match(scene, /openURLContexts/);
    assert.match(scene, /handleTrackerURL/);
    assert.equal(fs.readFileSync(path.join(extDir, "SceneDelegate.swift"), "utf8"), "// extension");
    assert.equal(fs.readFileSync(path.join(extDir, "Info.plist"), "utf8"), extPlist);

    const updated = fs.readFileSync(path.join(appDir, "Info.plist"), "utf8");
    assert.match(updated, /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>an1metracker<\/string>/);
    assert.ok(updated.indexOf("CFBundleURLTypes") > updated.indexOf("</dict>"), "added at the top level, after the nested dict");
    assert.ok(updated.trimEnd().endsWith("</dict>\n</plist>"));

    // Running again (the workflow re-runs on a regenerated project, but be safe) adds nothing twice.
    setupUI(tmpDir);
    assert.equal(fs.readFileSync(path.join(appDir, "Info.plist"), "utf8").split("CFBundleURLTypes").length, 2);

    // The scheme the app registers is the one the extension links to.
    const siteAccess = fs.readFileSync(path.join(__dirname, "../../src/popup/lib/site-access.js"), "utf8");
    assert.match(siteAccess, /"an1metracker:\/\/safari-settings"/);
    const swift = fs.readFileSync(path.join(__dirname, "../../ios/ViewController.swift"), "utf8");
    assert.match(swift, /trackerURLScheme = "an1metracker"/);
    assert.match(swift, /"safari-settings"/);
    assert.match(swift, /openExtensionsSettingsForIdentifiers:completionHandler:/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
