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
import ObjectiveC
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

    private typealias OpenSettingsImplementation =
        @convention(c) (AnyObject, Selector, NSArray, @escaping @convention(block) (NSError?) -> Void) -> Void

    private static let selectorName = "openExtensionsSettingsForIdentifiers:completionHandler:"

    func openExtensionSettings() async -> Bool {
        guard let identifier = SafariExtensionIdentity.bundleIdentifier,
              let settings: AnyClass = NSClassFromString("SFSafariSettings"),
              let method = class_getClassMethod(settings, NSSelectorFromString(Self.selectorName))
        else {
            await openSettingsApp()
            return false
        }

        let selector = NSSelectorFromString(Self.selectorName)
        let took = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            let implementation = unsafeBitCast(method_getImplementation(method), to: OpenSettingsImplementation.self)
            implementation(settings as AnyObject, selector, [identifier] as NSArray) { error in
                continuation.resume(returning: error == nil)
            }
        }
        if !took { await openSettingsApp() }
        return took
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
