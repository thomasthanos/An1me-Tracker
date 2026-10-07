const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { setupUI, listSwiftFiles } = require("../scripts/setup-ios-ui.js");
const { swiftSource } = require("../scripts/ios-permissions.js");

const REPO = path.join(__dirname, "../..");

// A minimal but structurally faithful project.pbxproj: one host app target whose only build phase is
// Sources, one main group, and the section markers the script inserts into.
function projectFixture() {
  return `// !$*UTF8*$!
{
	archiveVersion = 1;
	objects = {

/* Begin PBXBuildFile section */
		AAAAAAAAAAAAAAAAAAAAAAAA /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = BBBBBBBBBBBBBBBBBBBBBBBB /* AppDelegate.swift */; };
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		BBBBBBBBBBBBBBBBBBBBBBBB /* AppDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppDelegate.swift; sourceTree = "<group>"; };
/* End PBXFileReference section */

/* Begin PBXGroup section */
		CCCCCCCCCCCCCCCCCCCCCCCC = {
			isa = PBXGroup;
			children = (
				BBBBBBBBBBBBBBBBBBBBBBBB /* AppDelegate.swift */,
			);
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		DDDDDDDDDDDDDDDDDDDDDDDD /* An1me Tracker */ = {
			isa = PBXNativeTarget;
			buildPhases = (
				EEEEEEEEEEEEEEEEEEEEEEEE /* Sources */,
			);
			productType = "com.apple.product-type.application";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		FFFFFFFFFFFFFFFFFFFFFFFF /* Project object */ = {
			isa = PBXProject;
			mainGroup = CCCCCCCCCCCCCCCCCCCCCCCC;
		};
/* End PBXProject section */

/* Begin PBXSourcesBuildPhase section */
		EEEEEEEEEEEEEEEEEEEEEEEE /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			files = (
				AAAAAAAAAAAAAAAAAAAAAAAA /* AppDelegate.swift in Sources */,
			);
		};
/* End PBXSourcesBuildPhase section */
	};
	rootObject = FFFFFFFFFFFFFFFFFFFFFFFF /* Project object */;
}
`;
}

// The generated storyboard connects a WKWebView to ViewController's outlet. `outlet` lets a test choose how
// Xcode laid that element out, because wrapping is the case that used to be mishandled.
function storyboardFixture(outlet) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<document>
	<scenes>
		<scene>
			<objects>
				<viewController id="x" customClass="ViewController">
					<view key="view" id="v"/>
					<connections>
						${outlet}
					</connections>
				</viewController>
			</objects>
		</scene>
	</scenes>
</document>
`;
}

function buildFixture({ outlet = '<outlet property="webView" destination="y" id="z"/>' } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ios-ui-test-"));
  const projectDir = path.join(tmpDir, "An1me Tracker.xcodeproj");
  const appDir = path.join(tmpDir, "An1me Tracker/iOS (App)");
  const extDir = path.join(tmpDir, "An1me Tracker/iOS (Extension)");
  const assetsDir = path.join(appDir, "Assets.xcassets");

  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(extDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  fs.writeFileSync(path.join(projectDir, "project.pbxproj"), projectFixture());
  fs.writeFileSync(path.join(appDir, "ViewController.swift"), "// dummy template");
  fs.writeFileSync(path.join(extDir, "ViewController.swift"), "// dummy extension");
  fs.writeFileSync(path.join(extDir, "SceneDelegate.swift"), "// extension");
  fs.writeFileSync(path.join(appDir, "SceneDelegate.swift"), "// template");

  const plist = (body) => `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n${body}</dict>\n</plist>\n`;
  fs.writeFileSync(path.join(appDir, "Info.plist"), plist("\t<key>UIApplicationSceneManifest</key>\n\t<dict>\n\t</dict>\n"));
  fs.writeFileSync(path.join(extDir, "Info.plist"), plist("\t<key>NSExtension</key>\n\t<dict>\n\t</dict>\n"));

  fs.writeFileSync(path.join(appDir, "Main.storyboard"), storyboardFixture(outlet));
  return { tmpDir, projectDir, appDir, extDir, assetsDir };
}

test("setupUI installs the native app sources, registers them, and unwires the WebKit fallback", () => {
  const fixture = buildFixture();
  const { tmpDir, projectDir, appDir, extDir } = fixture;
  try {
    const result = setupUI(tmpDir);
    const expectedSwift = listSwiftFiles(path.join(REPO, "ios/An1meTracker")).length;

    assert.equal(result.viewControllers, 1);
    assert.equal(result.sceneDelegates, 1);
    assert.equal(result.urlSchemes, 1);
    assert.equal(result.assetCatalogs, 1);
    assert.equal(result.storyboards, 1);
    // The app's own sources plus the generated permission model.
    assert.equal(result.swiftFiles, expectedSwift + 1);

    // The host app's launch path is the native one.
    const appSwift = fs.readFileSync(path.join(appDir, "ViewController.swift"), "utf8");
    assert.match(appSwift, /RootView\(\)\.environmentObject\(PermissionCoordinator\.shared\)/);
    assert.match(appSwift, /UIHostingController/);
    assert.doesNotMatch(appSwift, /Main\.html/);
    assert.doesNotMatch(appSwift, /An1meTrackerAppView/);

    const scene = fs.readFileSync(path.join(appDir, "SceneDelegate.swift"), "utf8");
    assert.match(scene, /openURLContexts/);
    assert.match(scene, /PermissionBridge\.event\(from: url\)/);
    assert.match(scene, /PermissionCoordinator\.shared\.handle\(event\)/);

    // The extension target is never touched.
    assert.equal(fs.readFileSync(path.join(extDir, "ViewController.swift"), "utf8"), "// dummy extension");
    assert.equal(fs.readFileSync(path.join(extDir, "SceneDelegate.swift"), "utf8"), "// extension");

    // Every app source landed, and the generated permission model matches ios-permissions.js exactly.
    const installed = listSwiftFiles(path.join(appDir, "An1meTracker"));
    assert.equal(installed.length, expectedSwift + 1, "app sources plus the generated model");
    const generated = fs.readFileSync(path.join(appDir, "An1meTracker/ExtensionPermissions/HostPermissions.generated.swift"), "utf8");
    assert.equal(generated, swiftSource());

    // The project now builds them.
    const project = fs.readFileSync(path.join(projectDir, "project.pbxproj"), "utf8");
    assert.match(project, /An1meTracker \*\/ = \{/);
    const sourcesPhase = project.split("/* Begin PBXSourcesBuildPhase section */")[1].split("/* End PBXSourcesBuildPhase section */")[0];
    for (const file of installed) {
      assert.ok(sourcesPhase.includes(`${path.basename(file)} in Sources`), `${path.basename(file)} is in the Sources phase`);
    }

    // The storyboard no longer connects the WKWebView, and the property survives anyway.
    const storyboard = fs.readFileSync(path.join(appDir, "Main.storyboard"), "utf8");
    assert.doesNotMatch(storyboard, /outlet property="webView"/);
    assert.match(appSwift, /@IBOutlet var webView: WKWebView\?/);

    // Running again adds nothing twice.
    const second = setupUI(tmpDir);
    assert.equal(second.swiftFiles, 0);
    const projectAgain = fs.readFileSync(path.join(projectDir, "project.pbxproj"), "utf8");
    assert.equal(projectAgain.split("An1meTracker */,").length - 1, 1, "one group reference");

    const updated = fs.readFileSync(path.join(appDir, "Info.plist"), "utf8");
    assert.match(updated, /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>an1metracker<\/string>/);
    assert.equal(fs.readFileSync(path.join(extDir, "Info.plist"), "utf8").includes("CFBundleURLTypes"), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("the extension and the app agree about the URL scheme and the settings selector", () => {
  const siteAccess = fs.readFileSync(path.join(REPO, "src/popup/lib/site-access.js"), "utf8");
  assert.match(siteAccess, /"an1metracker:\/\/safari-settings"/);

  const constants = fs.readFileSync(path.join(REPO, "ios/An1meTracker/Shared/TrackerConstants.swift"), "utf8");
  assert.match(constants, /static let urlScheme = "an1metracker"/);

  // Opening the extension's own Settings page is a runtime lookup, so the app also builds against SDKs
  // without the symbol, and a missing class reads as "Safari did not answer" rather than a guess.
  const launcher = fs.readFileSync(path.join(REPO, "ios/An1meTracker/Services/SettingsLauncher.swift"), "utf8");
  assert.match(launcher, /openExtensionsSettingsForIdentifiers:completionHandler:/);
  assert.match(launcher, /NSClassFromString\("SFSafariSettings"\)/);

  const status = fs.readFileSync(path.join(REPO, "ios/An1meTracker/Services/SafariExtensionStatusService.swift"), "utf8");
  assert.match(status, /getStateOfSafariExtensionWithIdentifier:completionHandler:/);
  assert.match(status, /NSClassFromString\("SFSafariExtensionManager"\)/);
});

test("setupUI stamps iOS 26.2 on every target of the generated project", () => {
  const { IOS_DEPLOYMENT_TARGET } = require("../scripts/setup-ios-ui");
  assert.equal(IOS_DEPLOYMENT_TARGET, "26.2");
});
