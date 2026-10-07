//
//  ExtensionStatus.swift
//  An1me Tracker
//
//  What Safari will tell the app about the extension itself, through `SFSafariExtensionManager` (the app
//  requires iOS 26.2, where it exists). "Unknown" stays a first-class answer rather than a false "Enabled".
//

import Foundation

enum ExtensionEnabledState: Equatable {
    case enabled
    case disabled
    case unknown(UnknownReason)

    enum UnknownReason: Equatable {
        /// The extension is inside this app, but no `.appex` bundle could be found beside it.
        case extensionNotFound
        /// Safari has not been asked yet (the moment between launch and the first answer).
        case notChecked
        /// The API exists but refused to answer.
        case queryFailed(String)

        var detail: String {
            switch self {
            case .extensionNotFound:
                return "The Safari extension is missing from this app. Reinstall An1me Tracker."
            case .notChecked:
                return "Asking Safari…"
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
