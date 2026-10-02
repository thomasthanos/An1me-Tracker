// Builds the extension package: only the files the browser loads, nothing from the repo around them.
//
//   node scripts/package.js          → dist/an1me-tracker/  (load it unpacked, or hand it to a converter)
//   node scripts/package.js --zip    → also dist/an1me-tracker-<version>.zip
//
// Screenshots, tests, docs and agent notes live next to the extension in the repo but are never read
// at runtime. The package is an allowlist of runtime entries, and every file the manifest, popup.html
// and background.js point at is checked to exist in it, so a missing file fails here, not in the browser.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, "an1me-tracker");
const RUNTIME_ENTRIES = ["manifest.json", "background.js", "popup.html", "src"];

function copyEntry(relPath) {
  const from = path.join(ROOT, relPath);
  if (!fs.existsSync(from)) throw new Error(`Runtime entry missing: ${relPath}`);
  fs.cpSync(from, path.join(OUT, relPath), { recursive: true });
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
  const zipPath = path.join(DIST, `an1me-tracker-${version}.zip`);
  fs.rmSync(zipPath, { force: true });
  if (process.platform === "win32") {
    execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}'`]);
  } else {
    execFileSync("zip", ["-qr", zipPath, "."], { cwd: OUT });
  }
  return zipPath;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
RUNTIME_ENTRIES.forEach(copyEntry);

const manifest = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
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
