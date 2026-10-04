// Builds the extension package: only the files the browser loads, nothing from the repo around them.
//
//   node dev/scripts/package.js                  → dist/an1me-tracker/         (Chrome: load it unpacked)
//   node dev/scripts/package.js --target safari  → dist/an1me-tracker-safari/  (input for Safari's packager)
//   add --zip                                → also dist/<folder>-<version>.zip
//
// Screenshots, tests, docs and agent notes live next to the extension in the repo but are never read
// at runtime. The package is an allowlist of runtime entries, and every file the manifest, popup.html
// and background.js point at is checked to exist in it, so a missing file fails here, not in the browser.
//
// The Safari package is the same extension with the manifest entries Safari does not implement removed;
// the code feature-detects those APIs, so there is no second manifest to keep in step.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "../..");
const DIST = path.join(ROOT, "dist");
const targetIndex = process.argv.indexOf("--target");
const TARGET = targetIndex > -1 ? process.argv[targetIndex + 1] : "chrome";
if (!["chrome", "safari"].includes(TARGET)) throw new Error(`Unknown --target ${TARGET} (chrome or safari)`);
const NAME = TARGET === "safari" ? "an1me-tracker-safari" : "an1me-tracker";
const OUT = path.join(DIST, NAME);
const RUNTIME_ENTRIES = ["manifest.json", "background.js", "popup.html", "src"];

// Safari has no identity (Google / AniList OAuth), notifications or side panel APIs.
const SAFARI_UNSUPPORTED_PERMISSIONS = ["identity", "notifications", "sidePanel"];

function toSafariManifest(manifest) {
  const safari = { ...manifest, permissions: (manifest.permissions || []).filter((p) => !SAFARI_UNSUPPORTED_PERMISSIONS.includes(p)) };
  delete safari.side_panel;
  return safari;
}

function copyEntry(relPath) {
  const from = path.join(ROOT, relPath);
  if (!fs.existsSync(from)) throw new Error(`Runtime entry missing: ${relPath}`);
  // Native host artwork is consumed by setup-ios-icons/UI from the repository,
  // not by the extension. Keep several MB of previews and Composer sources out of its bundle.
  const nativeIcons = path.join(ROOT, "src/icons/ios");
  fs.cpSync(from, path.join(OUT, relPath), {
    recursive: true,
    filter: source => source !== nativeIcons && !source.startsWith(nativeIcons + path.sep),
  });
}

function manifestReferences(manifest) {
  const refs = new Set();
  const add = (value) => value && refs.add(value);
  Object.values(manifest.icons || {}).forEach(add);
  Object.values(manifest.action?.default_icon || {}).forEach(add);
  add(manifest.action?.default_popup);
  add(manifest.side_panel?.default_path);
  add(manifest.background?.service_worker);
  for (const script of manifest.content_scripts || []) {
    (script.js || []).forEach(add);
    (script.css || []).forEach(add);
  }
  for (const entry of manifest.web_accessible_resources || []) (entry.resources || []).forEach(add);
  for (const rules of manifest.declarative_net_request?.rule_resources || []) add(rules.path);
  return refs;
}

function htmlReferences(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const refs = new Set();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
    if (!/^(?:https?:)?\/\//.test(match[1])) refs.add(match[1]);
  }
  return refs;
}

function importScriptsReferences(jsPath) {
  const js = fs.readFileSync(jsPath, "utf8");
  const refs = new Set();
  for (const call of js.matchAll(/importScripts\(([^)]*)\)/g)) {
    for (const arg of call[1].matchAll(/"([^"]+)"/g)) refs.add(arg[1]);
  }
  return refs;
}

function zipPackage(version) {
  const zipPath = path.join(DIST, `${NAME}-${version}.zip`);
  fs.rmSync(zipPath, { force: true });
  const entries = fs.readdirSync(OUT);
  if (process.platform === "win32") {
    try {
      execFileSync("tar", ["-a", "-c", "-f", zipPath, ...entries], { cwd: OUT });
    } catch {
      const escapedOut = OUT.replace(/'/g, "''");
      const escapedZip = zipPath.replace(/'/g, "''");
      execFileSync("powershell", [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${escapedOut}', '${escapedZip}')`
      ]);
    }
  } else {
    execFileSync("zip", ["-qr", zipPath, ...entries], { cwd: OUT });
  }
  return zipPath;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
RUNTIME_ENTRIES.forEach(copyEntry);

const manifestPath = path.join(OUT, "manifest.json");
let manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (TARGET === "safari") {
  manifest = toSafariManifest(manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
const references = new Set([
  ...manifestReferences(manifest),
  ...htmlReferences(path.join(OUT, "popup.html")),
  ...importScriptsReferences(path.join(OUT, "background.js")),
]);
const missing = [...references].filter((ref) => !fs.existsSync(path.join(OUT, ref)));
if (missing.length > 0) {
  console.error(`Package references files that are not in it:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

console.log(`Packaged ${manifest.version} → ${path.relative(ROOT, OUT)} (${references.size} referenced files verified)`);
if (process.argv.includes("--zip")) console.log(`Zipped → ${path.relative(ROOT, zipPackage(manifest.version))}`);
