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
    /// The bundle identifier of the Safari Web Extension inside this app, or `nil` when there is none.
    static let bundleIdentifier: String? = {
        guard let plugins = Bundle.main.builtInPlugInsURL,
              let items = try? FileManager.default.contentsOfDirectory(
                  at: plugins,
                  includingPropertiesForKeys: nil
              )
        else { return nil }
        return items
            .filter { $0.pathExtension == "appex" }
            .compactMap { Bundle(url: $0)?.bundleIdentifier }
            .first
    }()

    /// The extension's own version, read from its bundle. Also the value the build stamps from
    /// `manifest.json`, so the two never drift.
    static let version: String? = {
        guard let plugins = Bundle.main.builtInPlugInsURL,
              let items = try? FileManager.default.contentsOfDirectory(
                  at: plugins,
                  includingPropertiesForKeys: nil
              ),
              let appex = items.first(where: { $0.pathExtension == "appex" }),
              let bundle = Bundle(url: appex)
        else { return nil }
        return bundle.infoDictionary?["CFBundleShortVersionString"] as? String
    }()

    /// True when the app found an extension to talk about at all.
    static var isPresent: Bool { bundleIdentifier != nil }
}
