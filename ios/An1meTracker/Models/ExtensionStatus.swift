//
//  ExtensionStatus.swift
//  An1me Tracker
//
//  What Safari will tell the app about the extension itself. `SFSafariExtensionManager` only exposes this
//  on iOS 26.2 and later, so "unknown" is a first-class answer rather than a false "Enabled".
//

import Foundation

enum ExtensionEnabledState: Equatable {
    case enabled
    case disabled
    case unknown(UnknownReason)

    enum UnknownReason: Equatable {
        /// The extension is inside this app, but no `.appex` bundle could be found beside it.
        case extensionNotFound
        /// Safari exposes the state to a containing app only from iOS 26.2. Older systems have no public API.
        case unsupportedSystem(currentVersion: String)
        /// The API exists but refused to answer.
        case queryFailed(String)

        var detail: String {
            switch self {
            case .extensionNotFound:
                return "The Safari extension is missing from this app. Reinstall An1me Tracker."
            case .unsupportedSystem(let version):
                return "iOS \(version) cannot report whether a Safari extension is on. Enable it in Settings → Apps → Safari → Extensions, then verify access."
            case .queryFailed(let message):
                return "Safari did not answer (\(message)). Open Safari Settings and check the extension there."
            }
        }
    }

    /// `nil` means "the app does not know", which every caller must treat as unknown, never as enabled.
    var isEnabled: Bool? {
        switch self {
        case .enabled: return true
        case .disabled: return false
        case .unknown: return nil
        }
    }

    var title: String {
        switch self {
        case .enabled: return "Enabled"
        case .disabled: return "Off"
        case .unknown: return "Unable to check"
        }
    }

    var detail: String {
        switch self {
        case .enabled: return "Safari is running the An1me Tracker extension."
        case .disabled: return "Turn it on in Settings → Apps → Safari → Extensions."
        case .unknown(let reason): return reason.detail
        }
    }
}
