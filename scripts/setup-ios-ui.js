// Injects custom native SwiftUI UI and modern assets into the generated Xcode project.
// Usage: node scripts/setup-ios-ui.js [build-dir]
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const IOS_SRC = path.join(ROOT, "ios");
const ICONS_SRC = path.join(ROOT, "src/icons/ios");

function findFilesByName(dir, targetName) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesByName(full, targetName));
    } else if (entry.name === targetName) {
      results.push(full);
    }
  }
  return results;
}

function findAssetCatalogs(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".xcassets")) {
        results.push(full);
      } else {
        results.push(...findAssetCatalogs(full));
      }
    }
  }
  return results;
}

function setupUI(buildDir = path.join(ROOT, "build")) {
  if (!fs.existsSync(buildDir)) {
    console.warn(`[setup-ios-ui] Build directory ${buildDir} does not exist. Skipping.`);
    return { viewControllers: 0, htmlFiles: 0, cssFiles: 0, assetCatalogs: 0 };
  }

  let viewControllersCount = 0;
  let htmlFilesCount = 0;
  let cssFilesCount = 0;
  let assetCatalogsCount = 0;

  // 1. Replace ViewController.swift in the host app
  const swiftFiles = findFilesByName(buildDir, "ViewController.swift");
  const srcSwift = path.join(IOS_SRC, "ViewController.swift");
  if (fs.existsSync(srcSwift)) {
    for (const dest of swiftFiles) {
      // Don't patch extension directories if any
      if (!dest.includes("Extension")) {
        fs.copyFileSync(srcSwift, dest);
        console.log(`[setup-ios-ui] Injected custom SwiftUI ViewController at: ${dest}`);
        viewControllersCount++;
      }
    }
  }

  // 2. Inject AppLogo into Assets.xcassets
  const assetCatalogs = findAssetCatalogs(buildDir);
  for (const catalog of assetCatalogs) {
    if (!catalog.includes("Extension")) {
      const imagesetDir = path.join(catalog, "AppLogo.imageset");
      fs.mkdirSync(imagesetDir, { recursive: true });

      const srcContents = path.join(IOS_SRC, "AppLogo.imageset/Contents.json");
      const destContents = path.join(imagesetDir, "Contents.json");
      if (fs.existsSync(srcContents)) {
        fs.copyFileSync(srcContents, destContents);
      }

      const srcLogo = path.join(ICONS_SRC, "AppIcon-dark.png");
      const destLogo = path.join(imagesetDir, "AppLogo.png");
      if (fs.existsSync(srcLogo)) {
        fs.copyFileSync(srcLogo, destLogo);
      }

      console.log(`[setup-ios-ui] Configured AppLogo.imageset in: ${catalog}`);
      assetCatalogsCount++;
    }
  }

  // 3. Update WebKit fallback resources (Main.html, Style.css, Script.js, Icon.png)
  const htmlFiles = findFilesByName(buildDir, "Main.html");
  const srcHtml = path.join(IOS_SRC, "Resources/Base.lproj/Main.html");
  if (fs.existsSync(srcHtml)) {
    for (const dest of htmlFiles) {
      fs.copyFileSync(srcHtml, dest);
      console.log(`[setup-ios-ui] Updated Main.html at: ${dest}`);
      htmlFilesCount++;
    }
  }

  const cssFiles = findFilesByName(buildDir, "Style.css");
  const srcCss = path.join(IOS_SRC, "Resources/Style.css");
  if (fs.existsSync(srcCss)) {
    for (const dest of cssFiles) {
      fs.copyFileSync(srcCss, dest);
      console.log(`[setup-ios-ui] Updated Style.css at: ${dest}`);
      cssFilesCount++;
    }
  }

  const jsFiles = findFilesByName(buildDir, "Script.js");
  const srcJs = path.join(IOS_SRC, "Resources/Script.js");
  if (fs.existsSync(srcJs)) {
    for (const dest of jsFiles) {
      fs.copyFileSync(srcJs, dest);
      console.log(`[setup-ios-ui] Updated Script.js at: ${dest}`);
    }
  }

  const iconFiles = findFilesByName(buildDir, "Icon.png");
  const srcIcon = path.join(ICONS_SRC, "AppIcon-dark.png");
  if (fs.existsSync(srcIcon)) {
    for (const dest of iconFiles) {
      fs.copyFileSync(srcIcon, dest);
      console.log(`[setup-ios-ui] Replaced template Icon.png at: ${dest}`);
    }
  }

  console.log(`[setup-ios-ui] Done. Updated ${viewControllersCount} ViewController(s), ${htmlFilesCount} HTML, ${cssFilesCount} CSS, and ${assetCatalogsCount} asset catalog(s).`);
  return {
    viewControllers: viewControllersCount,
    htmlFiles: htmlFilesCount,
    cssFiles: cssFilesCount,
    assetCatalogs: assetCatalogsCount,
  };
}

if (require.main === module) {
  const buildDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "build");
  setupUI(buildDir);
}

module.exports = { setupUI, findFilesByName, findAssetCatalogs };
