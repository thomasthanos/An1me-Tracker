// ios-permissions.js — the single source of truth for every website the iOS build asks Safari for.
//
//   node dev/scripts/ios-permissions.js            → print the resolved manifest block
//   node dev/scripts/ios-permissions.js --swift    → print the generated Swift model for the app
//
// Why this file exists: the Safari build used to derive its optional hosts from the Chrome manifest
// (`host_permissions` minus the tracking site minus AniList). That coupled iOS to whatever desktop
// happened to need, and it kept asking for image CDNs no code path in this repository ever produces.
// The list below is evidence-based: each origin names the feature that reaches it, and the audit script
// (.agents/ios-permission-audit.cjs) fails the build's expectations when one stops being used.
//
// `required: true` groups land in `host_permissions`; everything else lands in
// `optional_host_permissions`, which is what lets one tap (or the Safari "All Websites" switch) grant the
// rest. `graphql.anilist.co` is deliberately absent: the AniList API is disabled on mobile.
"use strict";

const ALL_WEBSITES = "<all_urls>";

const GROUPS = Object.freeze([
  Object.freeze({
    id: "site",
    title: "An1me.to",
    summary: "Tracking, resume and the player bridge",
    required: true,
    hosts: Object.freeze([
      { origin: "https://an1me.to/*", feature: "Watch pages, watchlists and progress tracking" },
      { origin: "https://*.an1me.to/*", feature: "Player and mirror subdomains" },
    ]),
  }),
  Object.freeze({
    id: "account",
    title: "Account & Sync",
    summary: "Sign-in and cloud library sync",
    required: true,
    hosts: Object.freeze([
      { origin: "https://identitytoolkit.googleapis.com/*", feature: "Email and password sign-in" },
      { origin: "https://securetoken.googleapis.com/*", feature: "Refreshing the sign-in session" },
      { origin: "https://firestore.googleapis.com/*", feature: "Library, progress and settings sync" },
    ]),
  }),
  Object.freeze({
    id: "info",
    title: "Anime Information",
    summary: "Episode counts, filler flags and airing data",
    required: true,
    hosts: Object.freeze([
      { origin: "https://www.animefillerlist.com/*", feature: "Filler and canon episode lists" },
      { origin: "https://api.jikan.moe/*", feature: "Episode metadata and filler stand-in" },
      { origin: "https://myanimelist.net/*", feature: "Filler fallback when AnimeFillerList is unreachable" },
    ]),
  }),
  Object.freeze({
    id: "artwork",
    title: "Artwork",
    summary: "Cover images for library entries",
    required: true,
    hosts: Object.freeze([
      { origin: "https://s4.anilist.co/*", feature: "AniList cover images already stored in your library" },
      { origin: "https://cdn.myanimelist.net/*", feature: "MyAnimeList cover images" },
    ]),
  }),
  Object.freeze({
    id: "skip",
    title: "Skip Data",
    summary: "Intro and outro times for Skip Outro",
    required: true,
    hosts: Object.freeze([
      { origin: "https://api.aniskip.com/*", feature: "Intro and outro timestamps" },
    ]),
  }),
]);

const REQUIRED_ORIGINS = Object.freeze(GROUPS.filter((g) => g.required).flatMap((g) => g.hosts.map((h) => h.origin)));
const OPTIONAL_ORIGINS = Object.freeze(GROUPS.filter((g) => !g.required).flatMap((g) => g.hosts.map((h) => h.origin)));
const ALL_ORIGINS = Object.freeze([...REQUIRED_ORIGINS, ...OPTIONAL_ORIGINS]);

// Safari has no identity, notifications or side panel API. Kept here so both the packager and the tests
// agree about what the iOS manifest must not ask for.
const UNSUPPORTED_IOS_PERMISSIONS = Object.freeze(["identity", "notifications", "sidePanel"]);

function validate(groups = GROUPS) {
  const seen = new Set();
  for (const group of groups) {
    if (!group.id || !group.title) throw new Error(`ios-permissions: group without an id/title: ${JSON.stringify(group)}`);
    if (!group.hosts?.length) throw new Error(`ios-permissions: group "${group.id}" has no hosts`);
    for (const host of group.hosts) {
      if (!/^https:\/\/[^/\s]+\/\*$/.test(host.origin)) {
        throw new Error(`ios-permissions: "${host.origin}" is not an https origin pattern`);
      }
      if (!host.feature) throw new Error(`ios-permissions: "${host.origin}" has no feature description`);
      if (seen.has(host.origin)) throw new Error(`ios-permissions: "${host.origin}" is listed twice`);
      seen.add(host.origin);
    }
  }
  for (const duplicate of [ALL_WEBSITES, "https://graphql.anilist.co/*"]) {
    if (seen.has(duplicate)) throw new Error(`ios-permissions: "${duplicate}" must not be a group host`);
  }
  return true;
}

// Applies the iOS configuration to a copy of the Chrome manifest. The desktop manifest is never touched.
function toSafariManifest(manifest, groups = GROUPS) {
  validate(groups);
  const safari = {
    ...manifest,
    permissions: (manifest.permissions || []).filter((p) => !UNSUPPORTED_IOS_PERMISSIONS.includes(p)),
  };
  delete safari.side_panel;
  safari.host_permissions = groups.filter((g) => g.required).flatMap((g) => g.hosts.map((h) => h.origin));
  // Every host is required (8.3.6). Safari iOS answers permissions.contains()/getAll() as granted for any
  // declared host even at "Ask", so optional hosts bought no truthful request flow — only a second list.
  // Whatever stays optional is still emitted; with none, the key is omitted.
  const optional = groups.filter((g) => !g.required).flatMap((g) => g.hosts.map((h) => h.origin));
  if (optional.length) safari.optional_host_permissions = optional;
  else delete safari.optional_host_permissions;
  return safari;
}

function swiftString(value) {
  return JSON.stringify(String(value));
}

// The native app needs the same groups, with the same wording, so the user reads one vocabulary in both
// places. Generating Swift from this file keeps that from drifting.
function swiftSource(groups = GROUPS) {
  validate(groups);
  const groupBlocks = groups
    .map((group) => {
      const hosts = group.hosts
        .map((host) => `            HostPermission(origin: ${swiftString(host.origin)}, feature: ${swiftString(host.feature)}),`)
        .join("\n");
      return [
        "        HostPermissionGroup(",
        `            id: ${swiftString(group.id)},`,
        `            title: ${swiftString(group.title)},`,
        `            summary: ${swiftString(group.summary)},`,
        `            isRequired: ${group.required ? "true" : "false"},`,
        "            hosts: [",
        hosts,
        "            ]",
        "        ),",
      ].join("\n");
    })
    .join("\n");

  return `// Generated by dev/scripts/setup-ios-ui.js from dev/scripts/ios-permissions.js — do not edit by hand.
//
// One source of truth for what the iOS build asks Safari for, mirrored into the native app so both show
// the same groups with the same wording.

import Foundation

struct HostPermission: Hashable, Identifiable {
    let origin: String
    let feature: String

    var id: String { origin }

    /// "api.jikan.moe" — the host without the scheme and the trailing wildcard.
    var display: String {
        origin
            .replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "/*", with: "")
    }
}

struct HostPermissionGroup: Hashable, Identifiable {
    let id: String
    let title: String
    let summary: String
    let isRequired: Bool
    let hosts: [HostPermission]
}

enum HostPermissions {
    /// Safari's single "All Websites" switch. Never requested directly; Settings owns it.
    static let allWebsitesPattern = ${swiftString(ALL_WEBSITES)}

    static let groups: [HostPermissionGroup] = [
${groupBlocks}
    ]

    static var requiredOrigins: [String] { groups.filter(\\.isRequired).flatMap { $0.hosts.map(\\.origin) } }

    static var optionalOrigins: [String] { groups.filter { !$0.isRequired }.flatMap { $0.hosts.map(\\.origin) } }

    static var allOrigins: [String] { requiredOrigins + optionalOrigins }

    static var hostCount: Int { allOrigins.count }

    static func group(forOrigin origin: String) -> HostPermissionGroup? {
        groups.first { group in group.hosts.contains { $0.origin == origin } }
    }

    /// The groups an "All Websites" grant covers — every group except the always-required tracking site,
    /// which Safari keeps as its own row and always allows.
    static var coverableGroups: [HostPermissionGroup] { groups.filter { !$0.isRequired } }
}
`;
}

module.exports = {
  ALL_WEBSITES,
  GROUPS,
  REQUIRED_ORIGINS,
  OPTIONAL_ORIGINS,
  ALL_ORIGINS,
  UNSUPPORTED_IOS_PERMISSIONS,
  validate,
  toSafariManifest,
  swiftSource,
};

if (require.main === module) {
  validate();
  if (process.argv.includes("--swift")) {
    process.stdout.write(swiftSource());
  } else {
    const fs = require("node:fs");
    const path = require("node:path");
    const chrome = JSON.parse(fs.readFileSync(path.join(__dirname, "../../manifest.json"), "utf8"));
    const safari = toSafariManifest(chrome);
    console.log(JSON.stringify({
      host_permissions: safari.host_permissions,
      optional_host_permissions: safari.optional_host_permissions,
      permissions: safari.permissions,
    }, null, 2));
    console.log(`\n${ALL_ORIGINS.length} website${ALL_ORIGINS.length === 1 ? "" : "s"} across ${GROUPS.length} groups`);
  }
}
