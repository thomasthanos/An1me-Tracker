//
//  SettingsLauncher.swift
//  An1me Tracker
//
//  Taking the user to the exact place where a Safari Web Extension's website access is decided.
//
//  A containing app cannot grant WebExtension host permissions: there is no public API for it, and the
//  permission prompt only runs inside the extension's own Safari context. What iOS does offer, from 26.2,
//  is `SFSafariSettings.openExtensionsSettings(forIdentifiers:)`, which opens the extension's own page —
//  the one screen that lists its websites. Below that, the app falls back to Safari's extension settings
//  in the Settings app.
//

import Foundation
import ObjectiveC
import UIKit

@MainActor
protocol ExtensionSettingsLaunching: AnyObject {
    /// Opens the extension's own Settings page. `true` when the system took the deep link.
    func openExtensionSettings() async -> Bool
    /// Opens the Settings app as far down the tree as the OS allows.
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
        // Most specific first. iOS 18 moved Safari under Settings → Apps and addresses it by bundle id;
        // older releases use the SAFARI key. The last candidate, the app's own page, always opens.
        // `canOpenURL` answers false for these unless the scheme is declared in LSApplicationQueriesSchemes,
        // so each candidate is opened in turn and its completion decides whether to keep going.
        let candidates = [
            "App-prefs:com.apple.mobilesafari&path=WEB_EXTENSIONS",
            "App-prefs:SAFARI&path=WEB_EXTENSIONS",
            "App-prefs:com.apple.mobilesafari",
            "App-prefs:SAFARI",
            UIApplication.openSettingsURLString,
        ]
        await openFirst(candidates.compactMap(URL.init(string:)))
    }

    private func openFirst(_ urls: [URL]) async {
        guard let url = urls.first else { return }
        let opened = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            UIApplication.shared.open(url, options: [:]) { success in
                continuation.resume(returning: success)
            }
        }
        if !opened { await openFirst(Array(urls.dropFirst())) }
    }
}

@MainActor
enum SystemLinks {
    /// Opens a normal `https` URL. Shared so every screen takes the same path out of the app.
    static func open(_ url: URL) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
}
