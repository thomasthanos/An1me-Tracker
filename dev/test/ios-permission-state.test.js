// The native app's anti-faking rules, locked down.
//
//   node dev/test/ios-permission-state.test.js
//
// There is no Swift toolchain in this repository's test environments, so the state machine is guarded at
// the source level instead of by running it. The rules below are the ones the app must never lose:
//
//   * "Ready" requires both a verified allowance and a known-enabled extension;
//   * an extension that is off outranks a previously good reading;
//   * no snapshot, or a stale one, reads as "unable to verify" — never as "Allowed";
//   * "unknown" is a real answer for the extension state and never degrades to "enabled".
//
// Every assertion names the Swift it is protecting, so a change that weakens one fails here with an
// explanation rather than shipping as a dashboard that says Ready when nothing is verified.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.join(__dirname, "../..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const models = read("ios/An1meTracker/Models/PermissionModels.swift");
const status = read("ios/An1meTracker/Models/ExtensionStatus.swift");
const bridge = read("ios/An1meTracker/Services/PermissionBridge.swift");
const coordinator = read("ios/An1meTracker/Services/PermissionCoordinator.swift");
const viewModels = [
  "ios/An1meTracker/ViewModels/HomeViewModel.swift",
  "ios/An1meTracker/ViewModels/WebsiteAccessViewModel.swift",
  "ios/An1meTracker/ViewModels/SafariExtensionViewModel.swift",
].map(read);

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

// ─── Ready means verified, and nothing else ──────────────────────────────────────────────────────────

check(
  'AccessAssessment.isReady requires a known-enabled extension AND an allowed state',
  /var isReady: Bool \{ extensionEnabled\.isEnabled == true && state\.isAllowed \}/.test(models),
  "isReady must not be satisfiable by an unknown/absent extension state or an unverified snapshot",
);

check(
  "AccessState.isAllowed is true for .allowed only",
  /var isAllowed: Bool \{\s*if case \.allowed = self \{ return true \}\s*return false\s*\}/.test(models),
  "an unverified state must never compare as allowed",
);

check(
  "ExtensionEnabledState.isEnabled answers nil for .unknown",
  /case \.unknown: return nil/.test(status),
  "unknown must stay distinguishable from enabled; a Bool default would fake it",
);

// ─── The precedence in AccessAssessment.make ─────────────────────────────────────────────────────────

// `guard let snapshot, snapshot.isUsable` also appears in a small accessor earlier in the file, so the
// search has to start after the branch it delimits.
const disabledStart = models.indexOf("if extensionEnabled.isEnabled == false {");
const noSnapshotStart = models.indexOf("guard let snapshot, snapshot.isUsable else {", disabledStart);
const missingStart = models.indexOf("let missing = HostPermissions.allOrigins", noSnapshotStart);
check(
  "the branches of AccessAssessment.make are all present",
  disabledStart > -1 && noSnapshotStart > disabledStart && missingStart > noSnapshotStart,
  "the state machine changed shape; re-read the precedence in PermissionModels.swift",
);

const disabledBranch = models.slice(disabledStart, noSnapshotStart);
check(
  "an extension that is off outranks a good snapshot",
  disabledBranch.includes(".unableToVerify(.extensionNotEnabled)"),
  "with the extension off nothing can be measured, so a previous reading must not be shown as current",
);

const noSnapshotBranch = models.slice(noSnapshotStart, missingStart);
check(
  "no snapshot reads as 'never verified', not as allowed",
  noSnapshotBranch.includes(".unableToVerify(.neverVerified)"),
  "a fresh install has nothing to show and must say so",
);

check(
  "a stale snapshot reads as stale, never as allowed",
  /snapshot\.isStale\s*\?\s*\.unableToVerify\(\.stale\(lastVerified: snapshot\.capturedAt\)\)/.test(models),
  "an old reading must not be presented as live state",
);

check(
  "staleness has a defined age",
  /static let staleAfter: TimeInterval =/.test(models),
  "without a threshold, 'stale' is undefined and every reading looks current",
);

// ─── The bridge only accepts something it can trust ──────────────────────────────────────────────────

check(
  "the bridge requires grantedOrigins and allWebsites together",
  bridge.includes('guard let granted = payload["grantedOrigins"] as? [String]') &&
    bridge.includes('let allWebsites = payload["allWebsites"] as? Bool'),
  "requiring both keeps a failure payload ('could not measure') distinct from an empty grant ('nothing allowed')",
);

check(
  "the bridge reports an unreadable link rather than an empty state",
  /case \.unrecognised:\s*noteBridgeFailure\(\)/.test(coordinator),
  "a malformed link must surface, not silently read as 'nothing allowed'",
);

// ─── Refreshing happens on the real triggers, without polling ────────────────────────────────────────

const rootView = read("ios/An1meTracker/Views/RootView.swift");
check(
  "the app refreshes on launch and when it returns to the foreground",
  /\.task \{ await coordinator\.refresh\(\) \}/.test(rootView) && /onChange\(of: scenePhase\)/.test(rootView),
  "returning from Settings is the moment a permission changes, so it has to re-read",
);
check(
  "there is no timer-based polling",
  ![rootView, coordinator, ...viewModels].some((source) => /Timer\.|scheduledTimer|setInterval/.test(source)),
  "state is refreshed on events only; polling wastes battery on a phone",
);

// ─── Screens derive their wording from state, never from constants ───────────────────────────────────

check(
  "the dashboard's headline comes from the assessment",
  /if isReady \{ return "Ready" \}/.test(viewModels[0]) && /coordinator\.assessment/.test(viewModels[0]),
  "a hard-coded Ready would defeat the whole model",
);
check(
  "the website-access status comes from the assessment",
  /switch coordinator\.assessment\.state/.test(viewModels[1]),
  "the screen must render the state it derived, not a stored boolean",
);
check(
  "the extension screen explains an unknown state instead of showing a value",
  /case \.unknown\(\.queryFailed\):/.test(viewModels[2]),
  "when Safari does not answer, the app has to say so rather than show a value",
);

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
