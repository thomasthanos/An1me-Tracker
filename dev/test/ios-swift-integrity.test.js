// Structural checks on the native app's Swift sources.
//
//   node dev/test/ios-swift-integrity.test.js
//
// There is no Swift toolchain in the environments this suite runs in, and the app is only compiled by the
// macOS release job. These checks catch the mistakes that would otherwise surface there as a failed build,
// and the unsafe patterns the app is not supposed to contain:
//
//   * unbalanced braces, brackets or parentheses in a file;
//   * the same type declared twice across the tree;
//   * `try!`, `as!` and `fatalError(` — the crashers a review is meant to remove;
//   * an enum gaining a case that a switch has not been taught about (a compile error in Swift, caught here).
//
// It is a linter, not a compiler. It says nothing about types, and a green run is not a green build.
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.join(__dirname, "../..");
const IOS = path.join(REPO, "ios");

function swiftFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) swiftFiles(full, out);
    else if (entry.name.endsWith(".swift")) out.push(full);
  }
  return out;
}

/// Walks Swift source, calling `onCode` for every character that is real code rather than a comment or a
/// string literal. Returns nothing; the callbacks decide what to count.
function walk(source, onCode, onBrace) {
  let index = 0;
  let inLine = false;
  let inBlock = false;
  let inString = false;
  let inMultiline = false;
  while (index < source.length) {
    const char = source[index];
    if (inLine) {
      if (char === "\n") inLine = false;
      index += 1;
      continue;
    }
    if (inBlock) {
      if (char === "*" && source[index + 1] === "/") {
        inBlock = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }
    if (inMultiline) {
      if (source.startsWith('"""', index)) {
        inMultiline = false;
        index += 3;
        continue;
      }
      index += 1;
      continue;
    }
    if (inString) {
      // Escapes and \(interpolation) are treated as string content: interpolation is balanced on its own,
      // and none of these files puts a brace inside one.
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (source.startsWith("//", index)) {
      inLine = true;
      index += 2;
      continue;
    }
    if (source.startsWith("/*", index)) {
      inBlock = true;
      index += 2;
      continue;
    }
    if (source.startsWith('"""', index)) {
      inMultiline = true;
      index += 3;
      continue;
    }
    if (char === '"') {
      inString = true;
      index += 1;
      continue;
    }
    onCode(char, index);
    if (onBrace && (char === "{" || char === "}")) onBrace(char, index);
    index += 1;
  }
}

/// The body of the first `{ … }` that follows `anchor`, or `null` when the anchor is missing.
function bodyAfter(source, anchor) {
  const at = source.indexOf(anchor);
  if (at < 0) return null;
  let start = -1;
  walk(source.slice(at), (char, index) => {
    if (start < 0 && char === "{") start = at + index;
  });
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  walk(source.slice(start), (char, index) => {
    if (end >= 0) return;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) end = start + index;
    }
  });
  return end < 0 ? null : source.slice(start, end + 1);
}

/// The cases an enum declares itself, ignoring any nested enum declared inside it.
function casesOf(source, enumName) {
  const body = bodyAfter(source, `enum ${enumName}`);
  if (!body) return [];
  const found = [];
  for (const line of body.split("\n")) {
    // `case .foo` lines belong to a switch, not to the enum's own declaration.
    const match = line.match(/^(\s*)case\s+([a-zA-Z][A-Za-z0-9_]*)/);
    if (match) found.push({ indent: match[1].length, name: match[2] });
  }
  if (found.length === 0) return [];
  const shallowest = Math.min(...found.map((entry) => entry.indent));
  return found.filter((entry) => entry.indent === shallowest).map((entry) => entry.name);
}

/// The cases a switch body actually handles. A single line may list several (`case .a, .b:`).
function handledCases(body) {
  const handled = new Set();
  for (const line of body.split("\n")) {
    const match = line.match(/^\s*case\s+(.+?):/);
    if (!match) continue;
    for (const part of match[1].split(",")) {
      const name = part.trim().match(/^\.?([a-zA-Z][A-Za-z0-9_]*)/)?.[1];
      if (name && name !== "let" && name !== "var" && name !== "is") handled.add(name);
    }
  }
  return handled;
}

const files = swiftFiles(IOS).sort();
const sources = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
const rel = (file) => path.relative(REPO, file).split(path.sep).join("/");

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

// ─── Every file exists and is balanced ───────────────────────────────────────────────────────────────

check("the app has Swift sources to check", files.length >= 25, `found ${files.length}`);

const unbalanced = [];
for (const [file, source] of sources) {
  let braces = 0;
  let parens = 0;
  let brackets = 0;
  walk(source, (char) => {
    if (char === "{") braces += 1;
    if (char === "}") braces -= 1;
    if (char === "(") parens += 1;
    if (char === ")") parens -= 1;
    if (char === "[") brackets += 1;
    if (char === "]") brackets -= 1;
  });
  if (braces !== 0 || parens !== 0 || brackets !== 0) {
    unbalanced.push(`${rel(file)} {${braces}} (${parens}) [${brackets}]`);
  }
}
check("every Swift file has balanced braces, parentheses and brackets", unbalanced.length === 0, unbalanced.join("; "));

const empty = [...sources].filter(([, source]) => source.trim().length === 0).map(([file]) => rel(file));
check("no Swift file is empty", empty.length === 0, empty.join(", "));

// ─── One declaration per type ────────────────────────────────────────────────────────────────────────

const declarations = new Map();
for (const [file, source] of sources) {
  // Top-level only: a nested type lives in its owner's namespace and cannot collide. Both are indented.
  for (const match of source.matchAll(/^(?:public |internal |private |fileprivate |final |open )*(?:struct|class|enum|protocol|actor)\s+([A-Z][A-Za-z0-9_]*)/gm)) {
    const name = match[1];
    if (!declarations.has(name)) declarations.set(name, []);
    declarations.get(name).push(rel(file));
  }
}
const duplicates = [...declarations].filter(([, where]) => where.length > 1);
check("no type is declared twice across the app", duplicates.length === 0, duplicates.map(([name, where]) => `${name}: ${where.join(", ")}`).join("; "));

// ─── ObservableObject conformances actually work ─────────────────────────────────────────────────────
//
// This is the check that earned its place: the first version of this app declared four view models as
// `ObservableObject` with no `@Published` property. The compiler only synthesises `objectWillChange` when
// there is at least one, so the conformance failed — and the diagnostic was a bare `note:` quoting
// `var objectWillChange: Self.ObjectWillChangePublisher { get }`, which says nothing about the cause.

const observableTypes = new Set();
const withoutPublished = [];
for (const [file, source] of sources) {
  const headers = source.matchAll(/^([ \t]*)(?:public |internal |private |fileprivate |final |open )*(?:class|struct)\s+([A-Z][A-Za-z0-9_]*)[^\n{]*ObservableObject[^\n{]*\{/gm);
  for (const header of headers) {
    const name = header[2];
    observableTypes.add(name);
    const body = bodyAfter(source, header[0].trim());
    if (body === null || !body.includes("@Published")) withoutPublished.push(`${rel(file)} ${name}`);
  }
}
check(
  "every ObservableObject declares at least one @Published property",
  withoutPublished.length === 0,
  `no objectWillChange would be synthesised, so the conformance fails: ${withoutPublished.join(", ")}`,
);

// A property wrapper whose type is not an ObservableObject fails the same way, one level up.
const wrappers = [];
for (const [file, source] of sources) {
  for (const match of source.matchAll(/@(StateObject|ObservedObject|EnvironmentObject)[^\n]*?:\s*([A-Z][A-Za-z0-9_]*)/g)) {
    wrappers.push({ wrapper: match[1], type: match[2], where: rel(file) });
  }
}
const badWrappers = wrappers.filter((entry) => !observableTypes.has(entry.type));
check(
  "every @StateObject/@ObservedObject/@EnvironmentObject type is an ObservableObject",
  badWrappers.length === 0,
  badWrappers.map((entry) => `${entry.where} @${entry.wrapper} ${entry.type}`).join("; "),
);
check("the app does observe something", wrappers.length > 0, "no property wrapper was found at all; the scan is probably broken");

// ─── Strict concurrency ──────────────────────────────────────────────────────────────────────────────
//
// The app is compiled with strict concurrency, so both of these are errors rather than warnings. Each one
// cost a CI run to find, which is exactly why they are checked here.

const NON_SENDABLE = [
  "DateFormatter", "NumberFormatter", "ISO8601DateFormatter", "RelativeDateTimeFormatter",
  "DateComponentsFormatter", "MeasurementFormatter", "ByteCountFormatter", "PersonNameComponentsFormatter",
  "JSONEncoder", "JSONDecoder",
];
const alternatives = NON_SENDABLE.join("|");

const sharedFormatters = [];
for (const [file, source] of sources) {
  for (const pattern of [
    new RegExp(`static (?:let|var) \\w+[^=\\n]*=\\s*(?:${alternatives})\\s*\\(`, "g"),
    new RegExp(`static (?:let|var) \\w+\\s*:\\s*(?:${alternatives})\\s*=`, "g"),
  ]) {
    for (const match of source.matchAll(pattern)) sharedFormatters.push(rel(file));
  }
}
check(
  "no non-Sendable formatter is kept in a static",
  sharedFormatters.length === 0,
  `a shared, mutable formatter is a data race under strict concurrency: ${sharedFormatters.join(", ")}`,
);

const mainActorTypes = new Set();
for (const [, source] of sources) {
  const declared = source.matchAll(/@MainActor\s*\n\s*(?:public |internal |private |fileprivate |final |open )*(?:class|struct|enum|actor|protocol)\s+([A-Z][A-Za-z0-9_]*)/g);
  for (const match of declared) mainActorTypes.add(match[1]);
}

const isolatedDefaults = [];
for (const [file, source] of sources) {
  source.split("\n").forEach((line, index) => {
    if (/^\s*(?:let|var|return|case|guard|if|for|while)\b/.test(line)) return;
    const match = line.match(/^\s+[a-zA-Z]\w*\s*:\s*[^=\n]+=\s*([A-Z][A-Za-z0-9_]*)\s*\(/);
    if (match && mainActorTypes.has(match[1])) isolatedDefaults.push(`${rel(file)}:${index + 1} ${match[1]}`);
  });
}
check(
  "no default argument calls a main-actor-isolated initializer",
  isolatedDefaults.length === 0,
  `Swift evaluates default arguments in a nonisolated context: ${isolatedDefaults.join("; ")}`,
);

// ─── No crashers ─────────────────────────────────────────────────────────────────────────────────────

const unsafe = [];
for (const [file, source] of sources) {
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    const code = line.split("//")[0];
    for (const marker of ["try!", "as!", "fatalError(", "preconditionFailure("]) {
      if (code.includes(marker)) unsafe.push(`${rel(file)}:${index + 1} ${marker}`);
    }
  });
}
check("no try!, as! or fatalError in the app", unsafe.length === 0, unsafe.join("; "));

// ─── Every enum case is handled wherever it is switched on ───────────────────────────────────────────

const dashboard = sources.get(path.join(IOS, "An1meTracker/Models/DashboardModels.swift"));
const permissionModels = sources.get(path.join(IOS, "An1meTracker/Models/PermissionModels.swift"));
const extensionStatus = sources.get(path.join(IOS, "An1meTracker/Models/ExtensionStatus.swift"));

const SWITCH_SITES = [
  { enumSource: dashboard, enumName: "DashboardAction", file: "An1meTracker/ViewModels/HomeViewModel.swift", anchor: "func perform(_ action: DashboardAction) async" },
  { enumSource: dashboard, enumName: "DashboardAction", file: "An1meTracker/ViewModels/WebsiteAccessViewModel.swift", anchor: "func perform(_ action: DashboardAction) async" },
  { enumSource: dashboard, enumName: "DashboardAction", file: "An1meTracker/Models/DashboardModels.swift", anchor: "var title: String" },
  { enumSource: dashboard, enumName: "DashboardAction", file: "An1meTracker/Models/DashboardModels.swift", anchor: "var symbol: String" },
  { enumSource: permissionModels, enumName: "AccessState", file: "An1meTracker/ViewModels/HomeViewModel.swift", anchor: "private func tone(for state: AccessState)" },
  { enumSource: permissionModels, enumName: "AccessState", file: "An1meTracker/ViewModels/WebsiteAccessViewModel.swift", anchor: "var statusTitle: String" },
  { enumSource: permissionModels, enumName: "AccessState", file: "An1meTracker/Models/PermissionModels.swift", anchor: "var summary: String" },
  { enumSource: extensionStatus, enumName: "ExtensionEnabledState", file: "An1meTracker/Models/ExtensionStatus.swift", anchor: "var title: String" },
  { enumSource: extensionStatus, enumName: "ExtensionEnabledState", file: "An1meTracker/ViewModels/HomeViewModel.swift", anchor: "private func tone(for state: ExtensionEnabledState)" },
  { enumSource: extensionStatus, enumName: "ExtensionEnabledState", file: "An1meTracker/ViewModels/SafariExtensionViewModel.swift", anchor: "var stateLimitation: String?" },
  { enumSource: extensionStatus, enumName: "ExtensionEnabledState", file: "An1meTracker/Services/DiagnosticsService.swift", anchor: "private static func tone(for state: ExtensionEnabledState)" },
  { enumSource: extensionStatus, enumName: "ExtensionEnabledState", file: "An1meTracker/Views/SafariExtensionView.swift", anchor: "private var stateSymbol: String" },
  { enumSource: permissionModels, enumName: "UnverifiedReason", file: "An1meTracker/Models/PermissionModels.swift", anchor: "var title: String" },
];

for (const site of SWITCH_SITES) {
  const cases = casesOf(site.enumSource, site.enumName);
  const target = sources.get(path.join(IOS, site.file));
  const body = target ? bodyAfter(target, site.anchor) : null;
  const handled = body ? handledCases(body) : new Set();
  const missing = cases.filter((name) => !handled.has(name));
  check(
    `${site.enumName} is fully handled in ${site.file} → ${site.anchor}`,
    cases.length > 0 && body !== null && missing.length === 0,
    !target ? "file not found" : body === null ? "anchor not found" : `unhandled: ${missing.join(", ")}`,
  );
}

// ─── Every route has a destination ───────────────────────────────────────────────────────────────────

const rootView = sources.get(path.join(IOS, "An1meTracker/Views/RootView.swift"));
const rootCases = casesOf(rootView, "AppRoute");
const destination = rootView ? bodyAfter(rootView, "navigationDestination(for: AppRoute.self)") : null;
const missingRoutes = rootCases.filter((name) => destination && !destination.includes(`case .${name}`));
check(
  "every AppRoute has a destination",
  rootCases.length > 0 && destination !== null && missingRoutes.length === 0,
  destination === null ? "navigationDestination not found" : `unhandled: ${missingRoutes.join(", ")}`,
);

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
