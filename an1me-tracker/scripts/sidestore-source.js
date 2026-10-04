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
  const appName = "An1me Tracker";
  // The source badge and listing use flat PNGs; native iOS icon appearances stay in the IPA.
  // A release-specific URL prevents SideStore's image cache from reusing older artwork.
  const iconURL = `https://raw.githubusercontent.com/${repository}/tracker-v${version}/an1me-tracker/src/icons/ios/AppIcon-sidestore.png`;
  const tintColor = "168aad";
  const privacy = Object.fromEntries(Object.entries(appInfo).filter(([key]) => key.endsWith("UsageDescription")));
  const appDescription =
    "Keep your an1me.to library and watch progress together in Safari.\n\n" +
    "• Track episodes and playback timestamps automatically.\n" +
    "• Resume watching where you left off.\n" +
    "• Choose playback speed or hold the player button for temporary 2×.\n" +
    "• Organise your library, view covers and mark filler episodes.\n\n" +
    "Works locally without an account. Sign in to sync your library and watch progress between iPhone and desktop.\n\n" +
    "AniList updates run in the desktop extension; mobile watch progress syncs through the tracker cloud.";

  const versionReleaseNotes =
    `v${version} (Build ${appInfo.CFBundleVersion}):\n` +
    "• Integrated Speed Control: 1×, 1.25×, 1.5× and 2× on iPhone, with hold for temporary 2×.\n" +
    "• Local speed settings, no added polling or requests; phone audio remains controlled by iOS.\n" +
    "• Verified media timestamps for Resume, completion and phone-to-PC sync at faster rates.\n" +
    "• Existing watch progress, library data and native icon appearances are retained.";

  return {
    name: appName,
    subtitle: "Safari companion for an1me.to",
    description: "Track episodes, resume watching and manage your an1me.to library in Safari. Optional cloud sync connects your iPhone and desktop library.",
    website: `https://github.com/${repository}/tree/main/an1me-tracker`,
    identifier: "io.github.thomasthanos.an1metracker.source",
    sourceURL: `${baseURL}/tracker-source/source.json`,
    iconURL,
    tintColor,
    apps: [{
      name: appName,
      bundleIdentifier: appInfo.CFBundleIdentifier,
      developerName: manifest.author,
      subtitle: "Track episodes and resume watching in Safari",
      localizedDescription: appDescription,
      iconURL,
      tintColor,
      versions: [{
        version,
        buildVersion: appInfo.CFBundleVersion,
        date,
        downloadURL: `${baseURL}/tracker-v${version}/${ipaName}`,
        localizedDescription: versionReleaseNotes,
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
