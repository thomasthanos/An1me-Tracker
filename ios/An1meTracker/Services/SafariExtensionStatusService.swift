//
//  SafariExtensionStatusService.swift
//  An1me Tracker
//
//  Asks Safari whether the extension is enabled, with `SFSafariExtensionManager.stateOfExtension(withIdentifier:)`
//  (SafariServices, iOS 26.2 — the app's minimum).
//
//  It used to be looked up by name at runtime. That failed on iPhone for two reasons: the selector was the
//  macOS spelling (`getStateOfSafariExtensionWithIdentifier:`; iOS declares `getStateOfExtensionWithIdentifier:`),
//  and nothing imported SafariServices, so `NSClassFromString` could not find a class from a framework that was
//  never loaded. Calling the API directly links the framework and lets the compiler check the name.
//
//  If Safari still cannot answer, the result is `.unknown(.queryFailed)`, never a made-up "Enabled"; the
//  extension's own fresh report then confirms it (see `WebsiteAccessViewModel.extensionConfirmed`).
//

import Foundation
import SafariServices

/// `Sendable` because the coordinator `await`s it from the main actor. A non-`Sendable` service would have
/// to be sent across an isolation boundary to run its nonisolated async work, which strict concurrency
/// rejects at compile time.
protocol SafariExtensionStatusProviding: Sendable {
    func currentState() async -> ExtensionEnabledState
}

/// A value type with no stored state, and therefore `Sendable` for free.
struct SafariExtensionStatusService: SafariExtensionStatusProviding {

    func currentState() async -> ExtensionEnabledState {
        guard let identifier = SafariExtensionIdentity.bundleIdentifier else {
            return .unknown(.extensionNotFound)
        }
        do {
            let state = try await SFSafariExtensionManager.stateOfExtension(withIdentifier: identifier)
            return state.isEnabled ? .enabled : .disabled
        } catch {
            return .unknown(.queryFailed(error.localizedDescription))
        }
    }
}
