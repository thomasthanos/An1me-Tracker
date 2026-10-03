// Configures iOS 18+ adaptive AppIcon (Light, Dark, Tinted) into the generated Xcode project.
// Usage: node scripts/setup-ios-icons.js [build-dir]
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ICONS_SRC = path.join(ROOT, "src/icons/ios");

function findAppIconSets(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "AppIcon.appiconset") {
        results.push(full);
      } else {
        results.push(...findAppIconSets(full));
      }
    }
  }
  return results;
}

function setupIcons(buildDir = path.join(ROOT, "build")) {
  const iconSets = findAppIconSets(buildDir);
  if (iconSets.length === 0) {
    console.warn(`[setup-ios-icons] No AppIcon.appiconset found in ${buildDir}. Skipping.`);
    return;
  }

  const requiredFiles = ["AppIcon-light.png", "AppIcon-dark.png", "AppIcon-tinted.png", "Contents.json"];
  for (const iconSet of iconSets) {
    console.log(`[setup-ios-icons] Configuring iOS 18 adaptive icons in: ${iconSet}`);
    for (const file of requiredFiles) {
      const src = path.join(ICONS_SRC, file);
      const dest = path.join(iconSet, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      } else {
        console.warn(`[setup-ios-icons] Warning: ${src} not found.`);
      }
    }
  }
  console.log(`[setup-ios-icons] Successfully updated ${iconSets.length} icon set(s).`);
}

if (require.main === module) {
  const buildDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "build");
  setupIcons(buildDir);
}

module.exports = { setupIcons, findAppIconSets };
