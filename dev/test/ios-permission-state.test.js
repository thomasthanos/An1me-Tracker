// The native app's honesty rules, locked down.
//
//   node dev/test/ios-permission-state.test.js
//
// There is no Swift toolchain here, so the status model is guarded at the source level:
//
//   * "Ready" requires the extension on AND a recent report from an1me.to;
//   * Safari saying "off" outranks any report;
//   * "unknown" never degrades to "on" without a recent report;
//   * a report is only accepted from the tracking site, with a fresh timestamp;
//   * no per-host permission state is shown (Safari's API misreports it);
//   * a report from another extension version is dropped.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.join(__dirname, "../..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const model = read("ios/An1meTracker/Models/ExtensionReport.swift");
const status = read("ios/An1meTracker/Models/ExtensionStatus.swift");
const bridge = read("ios/An1meTracker/Services/PermissionBridge.swift");
const coordinator = read("ios/An1meTracker/Services/PermissionCoordinator.swift");
const rootView = read("ios/An1meTracker/Views/RootView.swift");

let failures = 0;
function check(label, condition, explanation) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${label}`);
  console.log(`        ${explanation}`);
}

check("Ready requires the extension on and the site allowed",
  /var isReady: Bool \{ extensionOn == true && siteAccess\.isAllowed \}/.test(model),
  "Ready must not be reachable from an unknown extension state or without a report");
check("Safari's answer wins; unknown is on only with a recent report",
  /case \.enabled: return true\s*case \.disabled: return false\s*case \.unknown: return report\?\.isRecent == true \? true : nil/.test(model),
  "an unknown state must not read as on without evidence");
check("an extension that is off outranks a report",
  /if extensionOn == false \{ return \.extensionOff \}/.test(model),
  "with the extension off it cannot run anywhere");
check("no report reads as not checked",
  /guard let report else \{ return \.notChecked \}/.test(model),
  "a fresh install has nothing to show and must say so");
check("an old report is not 'allowed'",
  /report\.isRecent \? \.allowed\(lastSeen: report\.capturedAt\) : \.notSeenRecently/.test(model) &&
    /static let recentWithin: TimeInterval =/.test(model),
  "an old report must not read as current");
check("ExtensionEnabledState.isEnabled answers nil for .unknown",
  /case \.unknown: return nil/.test(status),
  "unknown must stay distinguishable from enabled");

check("the bridge accepts reports from an1me.to only",
  /site == "an1me\.to" \|\| site\.hasSuffix\("\.an1me\.to"\)/.test(bridge),
  "a report from any other page proves nothing");
check("the bridge requires a fresh timestamp",
  bridge.includes('guard let milliseconds = (payload["capturedAt"] as? NSNumber)?.doubleValue else { return nil }') &&
    bridge.includes("abs(capturedAt.timeIntervalSinceNow) <= 5 * 60"),
  "a replayed link must not become a fresh report");
check("an unreadable link is surfaced",
  /case \.unrecognised:\s*lastBridgeError =/.test(coordinator),
  "a malformed link must not pass silently");
check("a report from another extension version is dropped on refresh",
  /reported != current \{\s*store\.clear\(\)/.test(coordinator),
  "after an update the old report describes another build");

check("the app refreshes on launch and on returning to the foreground",
  /\.task \{/.test(rootView) && /onChange\(of: scenePhase\)/.test(rootView),
  "returning from Safari is when a report arrives");
check("there is no timer-based polling",
  ![rootView, coordinator].some((source) => /Timer\.|scheduledTimer/.test(source)),
  "state is refreshed on events only");
check("Ready comes from the status model",
  /private var isReady: Bool \{ status\.isReady \}/.test(rootView),
  "a hard-coded Ready would defeat the model");
check("Settings is offered only when the extension is off",
  (rootView.match(/openExtensionSettings/g) || []).length === 1 &&
    /if status\.extensionOn == false \{\s*Button \{\s*Task \{ await coordinator\.openExtensionSettings\(\) \}/.test(rootView),
  "Settings is the last resort, not the primary action");
check("no per-host permission state is shown anywhere",
  !/grantedOrigins|blockedOrigins|allWebsites|Needs access|Allow All Websites|at_grant/.test(
    fs.readdirSync(path.join(REPO, "ios/An1meTracker"), { recursive: true })
      .filter((file) => String(file).endsWith(".swift"))
      .map((file) => read(path.join("ios/An1meTracker", String(file)))).join("\n")),
  "Safari's permissions API reports every declared host as granted; showing it would be a guess");

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
