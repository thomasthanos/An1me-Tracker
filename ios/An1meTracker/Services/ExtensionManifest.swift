//
//  ExtensionManifest.swift
//  An1me Tracker
//
//  The permissions the Safari extension actually declares, read at runtime from the `manifest.json` inside
//  its `.appex`. That file is what Safari enforces, so the Permissions screen lists exactly what it lists —
//  never a separate, hand-kept copy. The generated `HostPermissions` model only adds human wording.
//

import Foundation

struct ExtensionManifest: Equatable {
    enum Source: Equatable {
        /// Read from the extension bundle's own manifest.json.
        case bundled
        /// The bundle could not be read; the build-time model generated from the same source is used.
        case builtInModel
    }

    let version: String?
    let apiPermissions: [String]
    let optionalApiPermissions: [String]
    let hostPermissions: [String]
    let optionalHostPermissions: [String]
    let source: Source

    /// Read once: the manifest cannot change while the app is running.
    static let current: ExtensionManifest = loadBundled() ?? builtInModel

    static func loadBundled() -> ExtensionManifest? {
        guard let appex = SafariExtensionIdentity.bundleURL,
              let bundle = Bundle(url: appex),
              let url = bundle.url(forResource: "manifest", withExtension: "json"),
              let data = try? Data(contentsOf: url)
        else { return nil }
        return parse(data)
    }

    static func parse(_ data: Data) -> ExtensionManifest? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        func strings(_ key: String) -> [String] {
            (object[key] as? [Any])?.compactMap { $0 as? String } ?? []
        }
        return ExtensionManifest(
            version: object["version"] as? String,
            apiPermissions: strings("permissions"),
            optionalApiPermissions: strings("optional_permissions"),
            hostPermissions: strings("host_permissions"),
            optionalHostPermissions: strings("optional_host_permissions"),
            source: .bundled
        )
    }

    static var builtInModel: ExtensionManifest {
        ExtensionManifest(
            version: SafariExtensionIdentity.version,
            apiPermissions: [],
            optionalApiPermissions: [],
            hostPermissions: HostPermissions.requiredOrigins,
            optionalHostPermissions: HostPermissions.optionalOrigins + [HostPermissions.allWebsitesPattern],
            source: .builtInModel
        )
    }

    /// Safari's "All Websites" switch, in either spelling. Shown as a note, never as a row of its own.
    static func isBroad(_ origin: String) -> Bool {
        origin == HostPermissions.allWebsitesPattern || origin == "<all_urls>" || origin == "*://*/*"
    }

    /// Specific host patterns, without the "All Websites" pattern.
    var requiredHosts: [String] { hostPermissions.filter { !Self.isBroad($0) } }
    var optionalHosts: [String] { optionalHostPermissions.filter { !Self.isBroad($0) } }

    /// True when the bundled manifest and the generated model describe the same websites.
    var matchesAppModel: Bool {
        Set(requiredHosts) == Set(HostPermissions.requiredOrigins) &&
            Set(optionalHosts) == Set(HostPermissions.optionalOrigins)
    }
}
