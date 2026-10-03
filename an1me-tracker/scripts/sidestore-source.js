// Generate a SideStore/AltStore source from the built app's Info.plist and IPA.
// node scripts/sidestore-source.js <app-info.json> <app.ipa> <owner/repo> > source.json
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function createSource({ repository, manifest, appInfo, ipaName, ipaSize, ipaSha256, date }) {
  for (const field of ["CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion", "MinimumOSVersion"]) {
    if (typeof appInfo[field] !== "string" || !appInfo[field]) throw new Error(`Missing app Info.plist field: ${field}`);
  }
  const version = appInfo.CFBundleShortVersionString;
  if (version !== manifest.version) throw new Error("Built app version must match the extension manifest version");
  if (ipaName !== `An1meTracker-${version}.ipa`) throw new Error("IPA filename does not match the built app version");
  if (!Number.isSafeInteger(ipaSize) || ipaSize <= 0) throw new Error("IPA size must be a positive integer");
  if (!/^[a-f0-9]{64}$/.test(ipaSha256)) throw new Error("IPA SHA256 must be a 64-character lowercase hash");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Repository must be owner/repo");

  const baseURL = `https://github.com/${repository}/releases/download`;
  const iconURL = `https://raw.githubusercontent.com/${repository}/main/an1me-tracker/${manifest.icons[128]}`;
  const privacy = Object.fromEntries(Object.entries(appInfo).filter(([key]) => key.endsWith("UsageDescription")));
  return {
    name: manifest.name,
    identifier: "io.github.thomasthanos.an1metracker.source",
    sourceURL: `${baseURL}/tracker-source/source.json`,
    iconURL,
    apps: [{
      name: manifest.name,
      bundleIdentifier: appInfo.CFBundleIdentifier,
      developerName: manifest.author,
      localizedDescription: "Track your an1me.to episodes in Safari and sync your library with the desktop extension. Install with SideStore; requires iOS 18 or later.",
      iconURL,
      versions: [{
        version,
        buildVersion: appInfo.CFBundleVersion,
        date,
        downloadURL: `${baseURL}/tracker-v${version}/${ipaName}`,
        size: ipaSize,
        sha256: ipaSha256,
        minOSVersion: appInfo.MinimumOSVersion,
      }],
      // The unsigned Safari wrapper has no signed entitlements or native privacy permissions.
      appPermissions: { entitlements: [], privacy },
    }],
    news: [],
  };
}

if (require.main === module) {
  const [infoPath, ipaPath, repository] = process.argv.slice(2);
  if (!infoPath || !ipaPath || !repository) throw new Error("Usage: sidestore-source.js <app-info.json> <app.ipa> <owner/repo>");
  const ipa = fs.readFileSync(ipaPath);
  const source = createSource({
    repository,
    manifest: JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8")),
    appInfo: JSON.parse(fs.readFileSync(infoPath, "utf8")),
    ipaName: path.basename(ipaPath),
    ipaSize: ipa.length,
    ipaSha256: crypto.createHash("sha256").update(ipa).digest("hex"),
    // SideStore accepts YYYY-MM-DD; its ISO8601 formatter does not accept fractional seconds.
    date: new Date().toISOString().slice(0, 10),
  });
  process.stdout.write(`${JSON.stringify(source, null, 2)}\n`);
}

module.exports = { createSource };
