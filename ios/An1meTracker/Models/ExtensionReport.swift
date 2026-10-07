//
//  ExtensionReport.swift
//  An1me Tracker
//
//  What the app can honestly know about the extension, and nothing more.
//
//  Safari tells the app whether the extension is switched on (`SFSafariExtensionManager`). Whether it actually
//  runs on an1me.to only the extension can prove: the app opens an1me.to with a marker, the content script —
//  which Safari only injects where the extension is let in — answers over `an1metracker://state`, and that
//  answer is stored here with the moment it was given. Host permissions are not reported: on Safari iOS the
//  permissions API answers "granted" for every declared host whatever Settings shows, so it proves nothing.
//

import Foundation

/// One "the extension ran on an1me.to" answer.
struct ExtensionReport: Codable, Equatable {
    /// The page's host the content script ran on (an1me.to or one of its subdomains).
    var site: String
    /// The extension's manifest version, from the background worker. `nil` when the worker did not answer.
    var extensionVersion: String?
    /// Why the background worker did not answer, when it did not. The content script still ran.
    var workerError: String?
    var capturedAt: Date

    var age: TimeInterval { Date().timeIntervalSince(capturedAt) }

    /// A report this old still says the extension worked then, but no longer that it works now.
    static let recentWithin: TimeInterval = 7 * 24 * 60 * 60
    var isRecent: Bool { age < Self.recentWithin }
}

/// Whether the extension runs on an1me.to, as far as the evidence goes.
enum SiteAccess: Equatable {
    /// The content script answered from an1me.to within `ExtensionReport.recentWithin`.
    case allowed(lastSeen: Date)
    /// It answered once, but not recently.
    case notSeenRecently(lastSeen: Date)
    /// No answer yet (fresh install, or the report was dropped after an update).
    case notChecked
    /// Safari says the extension is off, so it cannot run anywhere.
    case extensionOff

    var title: String {
        switch self {
        case .allowed: return "Allowed"
        case .notSeenRecently: return "Not seen recently"
        case .notChecked: return "Not checked"
        case .extensionOff: return "—"
        }
    }

    var isAllowed: Bool {
        if case .allowed = self { return true }
        return false
    }
}

/// The whole status the screen renders, derived on demand from Safari's answer and the last report.
struct TrackerStatus: Equatable {
    let extensionState: ExtensionEnabledState
    let report: ExtensionReport?

    /// Safari's answer wins. When Safari cannot answer, a recent report proves the extension ran, which it can
    /// only do while switched on. `nil` means unknown, never "on".
    var extensionOn: Bool? {
        switch extensionState {
        case .enabled: return true
        case .disabled: return false
        case .unknown: return report?.isRecent == true ? true : nil
        }
    }

    var siteAccess: SiteAccess {
        if extensionOn == false { return .extensionOff }
        guard let report else { return .notChecked }
        return report.isRecent ? .allowed(lastSeen: report.capturedAt) : .notSeenRecently(lastSeen: report.capturedAt)
    }

    /// Ready requires both: the extension on, and evidence it ran on an1me.to.
    var isReady: Bool { extensionOn == true && siteAccess.isAllowed }
}
