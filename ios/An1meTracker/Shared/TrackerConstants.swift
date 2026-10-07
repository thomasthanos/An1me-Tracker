//
//  TrackerConstants.swift
//  An1me Tracker
//
//  Every string the app shares with the extension lives here. The extension builds the same URLs, so a
//  change made on one side that is not made on the other fails the node tests instead of shipping.
//

import Foundation

enum Tracker {
    /// The custom scheme registered in the app's Info.plist. The extension opens it to hand the app a report
    /// (`an1metracker://state?…`) or to ask for the settings page.
    static let urlScheme = "an1metracker"

    /// The tracking site. Everything the extension does on a page starts from here.
    static let siteURL = URL(string: "https://an1me.to")!

    /// Where the app sends the user to have the extension prove it runs on an1me.to. The content script sees
    /// the marker and answers by opening `an1metracker://state?…` — the only entitlement-free way back.
    static let verifyMarker = "at_verify"
    static var verifyURL: URL {
        URL(string: "https://an1me.to/?\(verifyMarker)=1")!
    }

    /// Safari cannot open `https://` from the containing app's own settings deep links, so the app asks
    /// Safari through Safari's own scheme first and falls back to the plain URL.
    static var openInSafariURL: URL { siteURL }

    static let repositoryURL = URL(string: "https://github.com/thomasthanos/An1me-Tracker")!
    static let privacyURL = URL(string: "https://github.com/thomasthanos/An1me-Tracker/blob/main/PRIVACY.md")!
}

/// Keys for the app's own store. Deliberately namespaced: nothing here is library data, and nothing here is
/// ever treated as a source of truth.
enum AppStorageKey {
    static let lastExtensionReport = "tracker.lastExtensionReport"
    /// Keys of the permission snapshots 8.3.x stored; removed on launch.
    static let legacy = ["tracker.lastPermissionSnapshot", "tracker.lastVerifiedAt", "tracker.lastReportSource"]
}
