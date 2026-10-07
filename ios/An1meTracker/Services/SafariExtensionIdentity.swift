//
//  SafariExtensionIdentity.swift
//  An1me Tracker
//
//  The extension ships inside this app's PlugIns folder. Safari's own APIs address an extension by its
//  bundle identifier, so the app reads it from the bundle rather than hard-coding a name that the packager
//  could change.
//

import Foundation

enum SafariExtensionIdentity {
    /// The `.appex` inside this app's PlugIns folder, or `nil` when there is none.
    static let bundleURL: URL? = {
        guard let plugins = Bundle.main.builtInPlugInsURL,
              let items = try? FileManager.default.contentsOfDirectory(
                  at: plugins,
                  includingPropertiesForKeys: nil
              )
        else { return nil }
        return items.first { $0.pathExtension == "appex" && Bundle(url: $0)?.bundleIdentifier != nil }
    }()

    /// The bundle identifier of the Safari Web Extension inside this app, or `nil` when there is none.
    static let bundleIdentifier: String? = bundleURL.flatMap { Bundle(url: $0)?.bundleIdentifier }

    /// The extension's own version, read from its bundle. Also the value the build stamps from
    /// `manifest.json`, so the two never drift.
    static let version: String? = bundleURL
        .flatMap { Bundle(url: $0)?.infoDictionary?["CFBundleShortVersionString"] as? String }

    /// True when the app found an extension to talk about at all.
    static var isPresent: Bool { bundleIdentifier != nil }
}
