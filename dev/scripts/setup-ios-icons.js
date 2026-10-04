// Installs native Icon Composer artwork and retains the adaptive PNG catalog.
// Usage: node dev/scripts/setup-ios-icons.js [build-dir]
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "../..");
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

function findProjects(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory() || entry.name === "DerivedData") return [];
    const full = path.join(dir, entry.name);
    return entry.name.endsWith(".xcodeproj") ? [path.join(full, "project.pbxproj")] : findProjects(full);
  });
}

function projectObjects(project, kind) {
  const section = project.split(`/* Begin ${kind} section */`)[1]?.split(`/* End ${kind} section */`)[0] || "";
  return [...section.matchAll(/^([ \t]+)([A-F0-9]{24})[^\n]*= \{([\s\S]*?)^\1\};/gm)]
    .map(match => ({ id: match[2], body: match[3], text: match[0] }));
}

function registerComposerIcon(projectFile, iconDir) {
  let project = fs.readFileSync(projectFile, "utf8");
  const hosts = projectObjects(project, "PBXNativeTarget").filter(target => /productType = "com\.apple\.product-type\.application";/.test(target.body));
  if (hosts.length !== 1) throw new Error(`[setup-ios-icons] Expected one host app target in ${projectFile}`);
  const phaseIDs = hosts[0].body.match(/buildPhases = \(([\s\S]*?)\);/)?.[1] || "";
  const phases = projectObjects(project, "PBXResourcesBuildPhase").filter(phase => phaseIDs.includes(phase.id));
  if (phases.length !== 1) throw new Error(`[setup-ios-icons] Cannot identify the host app target Resources phase in ${projectFile}`);
  if (!/ASSETCATALOG_COMPILER_APPICON_NAME = "?AppIcon"?;/.test(project)) {
    throw new Error(`[setup-ios-icons] Generated project must use AppIcon as its app icon name: ${projectFile}`);
  }
  const relative = path.relative(path.dirname(path.dirname(projectFile)), iconDir).split(path.sep).join("/");
  const id = suffix => crypto.createHash("sha256").update(relative + suffix).digest("hex").slice(0, 24).toUpperCase();
  const fileID = id("file"), buildID = id("resource");
  function insert(kind, line, objectID) {
    if (project.includes(`${objectID} /* AppIcon.icon`)) return;
    const marker = `/* End ${kind} section */`;
    if (!project.includes(marker)) throw new Error(`[setup-ios-icons] Missing ${kind} section in ${projectFile}`);
    project = project.replace(marker, line + "\n" + marker);
  }
  insert("PBXFileReference", `\t\t${fileID} /* AppIcon.icon */ = {isa = PBXFileReference; lastKnownFileType = folder.iconcomposer.icon; path = ${JSON.stringify(relative)}; sourceTree = SOURCE_ROOT; };`, fileID);
  insert("PBXBuildFile", `\t\t${buildID} /* AppIcon.icon in Resources */ = {isa = PBXBuildFile; fileRef = ${fileID} /* AppIcon.icon */; };`, buildID);
  const phase = phases[0];
  if (!phase.body.includes(buildID)) {
    if (!/files = \(\r?\n/.test(phase.body)) throw new Error(`[setup-ios-icons] Missing host Resources file list in ${projectFile}`);
    project = project.replace(phase.text, phase.text.replace(/(files = \(\r?\n)/, `$1\t\t\t\t${buildID} /* AppIcon.icon in Resources */,\n`));
  }
  // Show the native icon beside the host asset catalog in Xcode's navigator when
  // a traditional group exists. SOURCE_ROOT keeps the file reference independent of that group.
  const catalogBuildID = phase.body.match(/([A-F0-9]{24}) \/\* Assets\.xcassets in Resources \*\//)?.[1];
  if (catalogBuildID) {
    const catalogRef = project.match(new RegExp(`${catalogBuildID}[^\\n]*fileRef = ([A-F0-9]{24})`))?.[1];
    const group = catalogRef && projectObjects(project, "PBXGroup").find(value => value.body.includes(catalogRef));
    if (group && !group.body.includes(fileID)) {
      project = project.replace(group.text, group.text.replace(/(children = \(\r?\n)/, `$1\t\t\t\t${fileID} /* AppIcon.icon */,\n`));
    }
  }
  fs.writeFileSync(projectFile, project);
}

function setupIcons(buildDir = path.join(ROOT, "build")) {
  const iconSets = findAppIconSets(buildDir);
  if (iconSets.length === 0) {
    throw new Error(`[setup-ios-icons] No AppIcon.appiconset found in ${buildDir}`);
  }

  const projects = findProjects(buildDir);
  const requiredFiles = ["AppIcon-light.png", "AppIcon-dark.png", "AppIcon-tinted.png", "Contents.json"];
  for (const iconSet of iconSets) {
    console.log(`[setup-ios-icons] Configuring iOS adaptive icons in: ${iconSet}`);
    for (const file of requiredFiles) {
      const src = path.join(ICONS_SRC, file);
      const dest = path.join(iconSet, file);
      fs.copyFileSync(src, dest);
    }

    const resourcesDir = path.dirname(path.dirname(iconSet));
    const projectFile = projects.filter(file => resourcesDir.startsWith(path.dirname(path.dirname(file)) + path.sep))
      .sort((a, b) => b.length - a.length)[0];
    if (!projectFile) throw new Error(`[setup-ios-icons] No Xcode project found for ${iconSet}`);
    const nativeDir = path.join(resourcesDir, "AppIcon.icon");
    fs.cpSync(path.join(ICONS_SRC, "AppIcon.icon"), nativeDir, { recursive: true });
    registerComposerIcon(projectFile, nativeDir);
    // Xcode generates correctly sized legacy icons; never overwrite its output with a 1024px PNG.
    console.log(`[setup-ios-icons] Registered native AppIcon.icon in host Resources: ${projectFile}`);
  }
  console.log(`[setup-ios-icons] Successfully updated ${iconSets.length} icon set(s).`);
}

if (require.main === module) {
  const buildDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "build");
  setupIcons(buildDir);
}

module.exports = { setupIcons, findAppIconSets, registerComposerIcon };
