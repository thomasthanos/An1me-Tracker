// Pins script load order for the shared modules in every context.
//
//   node dev/test/load-order.test.js
//
// Content scripts (manifest.json), the popup (popup.html) and the service worker (importScripts in
// background.js) each load their files in a fixed order, and a module that reads a shared global
// while it loads crashes if that global's file comes later. This checks every file that mentions a
// shared global is loaded after the file that defines it, in each context that loads it.
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "../..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const SHARED = {
  AnimeTrackerUtils: "src/common/utils.js",
  AnimeTrackerLibraryKeys: "src/common/data/library-keys.js",
  AnimeTrackerSpeedPreferences: "src/common/data/speed-preferences.js",
  "AnimeTracker.AuthEnv": "src/popup/lib/auth-env.js",
  "AT.AuthEnv": "src/popup/lib/auth-env.js",
  "AT.SETTING_KEYS": "src/popup/lib/config.js",
  PageEvents: "src/content/lib/page-events.js",
  PlayerDom: "src/content/lib/player-dom.js",
  PlayerObserver: "src/content/player/player-observer.js",
};

// boot-check.js names modules as strings to verify them at runtime; it never reads them while loading.
const NAMES_ONLY = new Set(["src/common/boot-check.js"]);

function contexts() {
  const manifest = JSON.parse(read("manifest.json"));
  const list = manifest.content_scripts.map((entry, i) => ({ name: `content_scripts[${i}] ${entry.matches[0]}`, files: entry.js }));

  const popupFiles = [...read("popup.html").matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  list.push({ name: "popup.html", files: popupFiles });

  const imported = [];
  for (const call of read("background.js").matchAll(/importScripts\(([^)]*)\)/g)) {
    for (const arg of call[1].matchAll(/"([^"]+)"/g)) imported.push(arg[1]);
  }
  list.push({ name: "background.js", files: [...imported, "background.js"] });
  return list;
}

let failures = 0;
for (const { name, files } of contexts()) {
  files.forEach((file, index) => {
    if (NAMES_ONLY.has(file)) return;
    const source = read(file);
    for (const [symbol, definer] of Object.entries(SHARED)) {
      if (file === definer || !source.includes(symbol)) continue;
      const definedAt = files.indexOf(definer);
      if (definedAt === -1 || definedAt > index) {
        failures++;
        console.log(`  FAIL  ${name}: ${file} uses ${symbol} but ${definer} ${definedAt === -1 ? "is not loaded" : "loads after it"}`);
      }
    }
  });
  console.log(`  PASS  ${name} (${files.length} files)`);
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
