//
//  SettingsLauncher.swift
//  An1me Tracker
//
//  Taking the user to the exact place where a Safari Web Extension's website access is decided.
//
//  A containing app cannot grant WebExtension host permissions: there is no public API for it, and the
//  permission prompt only runs inside the extension's own Safari context. What iOS 26.2 (the app's
//  minimum) offers is `SFSafariSettings.openExtensionsSettings(forIdentifiers:)`, which opens the extension's
//  own page — the one screen that lists its websites. Only if Safari refuses does the app open its own page
//  in Settings, so the user is never left with nothing.
//

import Foundation
import SafariServices
import UIKit

@MainActor
protocol ExtensionSettingsLaunching: AnyObject {
    /// Opens the extension's own Settings page. `true` when the system took the deep link.
    func openExtensionSettings() async -> Bool
    /// Fallback when Safari refuses the deep link: the app's own page in Settings.
    func openSettingsApp() async
}

@MainActor
final class SettingsLauncher: ExtensionSettingsLaunching {

    func openExtensionSettings() async -> Bool {
        guard let identifier = SafariExtensionIdentity.bundleIdentifier else {
            await openSettingsApp()
            return false
        }
        do {
            try await SFSafariSettings.openExtensionsSettings(forIdentifiers: [identifier])
            return true
        } catch {
            await openSettingsApp()
            return false
        }
    }

    func openSettingsApp() async {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        _ = await UIApplication.shared.open(url)
    }
}

@MainActor
enum SystemLinks {
    /// Opens a normal `https` URL. Shared so every screen takes the same path out of the app.
    static func open(_ url: URL) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
}
