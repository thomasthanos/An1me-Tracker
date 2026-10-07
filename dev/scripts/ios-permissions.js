// ios-permissions.js — the single source of truth for every website the iOS build talks to, and for which
// of them Safari must grant host access to.
//
//   node dev/scripts/ios-permissions.js            → print the resolved manifest block
//   node dev/scripts/ios-permissions.js --swift    → print the generated Swift model for the app
//
// What a Safari host permission is actually for (verified on iOS 27, 8.3.7):
//   * Safari's per-site "Allow / Ask / Deny" in Settings governs page access (content scripts, tabs). It did
//     not block the extension's own background fetches: with every host at "Ask", the info refresh still
//     fetched an1me.to, AnimeFillerList and MyAnimeList. permissions.contains()/getAll() say "granted" for
//     every declared host either way, so they cannot measure that switch.
//   * What a host permission really buys a background fetch is a CORS exemption. So a host is declared only
//     when the extension reads a response the site does not share cross-origin.
//
// Each service lists its hosts with `access`:
//   "host" — declared in host_permissions (content scripts run there, the DNR header rule applies there, or
//            the endpoint sends no CORS header the extension's origin would pass);
//   "cors" — not declared: the endpoint answers cross-origin requests from any origin, so a plain fetch
//            works without asking Safari for anything.
// `graphql.anilist.co` is deliberately absent: the AniList API is disabled on mobile.
"use strict";

const ALL_WEBSITES = "<all_urls>";

const GROUPS = Object.freeze([
  Object.freeze({
    id: "site",
    title: "An1me.to",
    symbol: "play.rectangle.fill",
    hosts: Object.freeze([
      { origin: "https://an1me.to/*", access: "host", feature: "Content scripts, the DNR referer rule, page fetches" },
      { origin: "https://*.an1me.to/*", access: "host", feature: "Player and mirror subdomains" },
    ]),
  }),
  Object.freeze({
    id: "account",
    title: "Firebase",
    symbol: "icloud.fill",
    hosts: Object.freeze([
      { origin: "https://identitytoolkit.googleapis.com/*", access: "cors", feature: "Sign-in (CORS: reflects the caller's origin)" },
      { origin: "https://securetoken.googleapis.com/*", access: "cors", feature: "Session refresh (CORS: reflects the caller's origin)" },
      { origin: "https://firestore.googleapis.com/*", access: "cors", feature: "Library sync (CORS: reflects the caller's origin)" },
    ]),
  }),
  Object.freeze({
    id: "afl",
    title: "AnimeFillerList",
    symbol: "list.star",
    hosts: Object.freeze([
      { origin: "https://www.animefillerlist.com/*", access: "host", feature: "Filler lists, scraped from HTML that sends no CORS header" },
    ]),
  }),
  Object.freeze({
    id: "jikan",
    title: "Jikan",
    symbol: "list.bullet.rectangle.fill",
    hosts: Object.freeze([
      { origin: "https://api.jikan.moe/*", access: "cors", feature: "Episode metadata (public API, Access-Control-Allow-Origin: *)" },
    ]),
  }),
  Object.freeze({
    id: "mal",
    title: "MyAnimeList",
    symbol: "books.vertical.fill",
    hosts: Object.freeze([
      { origin: "https://myanimelist.net/*", access: "host", feature: "Search and episode pages, which send no CORS header" },
      { origin: "https://cdn.myanimelist.net/*", access: "cors", feature: "Cover images (Access-Control-Allow-Origin: *)" },
    ]),
  }),
  Object.freeze({
    id: "anilist",
    title: "AniList Images",
    symbol: "photo.fill",
    hosts: Object.freeze([
      { origin: "https://s4.anilist.co/*", access: "host", feature: "Cover cache fetch; the CDN answers Access-Control-Allow-Origin: null" },
    ]),
  }),
  Object.freeze({
    id: "aniskip",
    title: "AniSkip",
    symbol: "forward.end.fill",
    hosts: Object.freeze([
      { origin: "https://api.aniskip.com/*", access: "cors", feature: "Outro times (Access-Control-Allow-Origin: *)" },
    ]),
  }),
]);

const HOST_ORIGINS = Object.freeze(GROUPS.flatMap((g) => g.hosts.filter((h) => h.access === "host").map((h) => h.origin)));
const CORS_ORIGINS = Object.freeze(GROUPS.flatMap((g) => g.hosts.filter((h) => h.access === "cors").map((h) => h.origin)));
// Kept for callers of the old names: everything declared is required; nothing is optional.
const REQUIRED_ORIGINS = HOST_ORIGINS;
const OPTIONAL_ORIGINS = Object.freeze([]);
const ALL_ORIGINS = Object.freeze([...HOST_ORIGINS, ...CORS_ORIGINS]);

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
      if (!["host", "cors"].includes(host.access)) throw new Error(`ios-permissions: "${host.origin}" needs access "host" or "cors"`);
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
  safari.host_permissions = groups.flatMap((g) => g.hosts.filter((h) => h.access === "host").map((h) => h.origin));
  // Nothing optional: with no optional hosts the website-access gate (src/common/website-access.js) stays
  // off, exactly as on desktop, and there is no request flow whose answer Safari would misreport.
  delete safari.optional_host_permissions;
  return safari;
}

function swiftString(value) {
  return JSON.stringify(String(value));
}

// The app's Services list: every service the extension talks to, with the hosts to probe for reachability.
function swiftSource(groups = GROUPS) {
  validate(groups);
  const blocks = groups
    .map((group) => {
      const hosts = group.hosts
        .filter((host) => !host.origin.includes("*."))
        .map((host) => swiftString(host.origin.replace("https://", "").replace("/*", "")))
        .join(", ");
      return `        TrackedService(id: ${swiftString(group.id)}, name: ${swiftString(group.title)}, symbol: ${swiftString(group.symbol || "globe")}, hosts: [${hosts}]),`;
    })
    .join("\n");

  return `// Generated by dev/scripts/setup-ios-ui.js from dev/scripts/ios-permissions.js — do not edit by hand.
//
// The services the extension talks to, mirrored into the app's Services section so both list the same ones.

import Foundation

struct TrackedService: Hashable, Identifiable {
    let id: String
    let name: String
    let symbol: String
    /// Hosts to probe for reachability, without scheme or path.
    let hosts: [String]
}

enum TrackedServices {
    static let all: [TrackedService] = [
${blocks}
    ]
}
`;
}

module.exports = {
  ALL_WEBSITES,
  GROUPS,
  HOST_ORIGINS,
  CORS_ORIGINS,
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
    console.log(JSON.stringify({ host_permissions: safari.host_permissions, permissions: safari.permissions }, null, 2));
    console.log(`\n${HOST_ORIGINS.length} declared, ${CORS_ORIGINS.length} reached over CORS`);
  }
}
