//
//  TrackerConstants.swift
//  An1me Tracker
//
//  Every string the app shares with the extension lives here. The extension builds the same URLs, so a
//  change made on one side that is not made on the other fails the node tests instead of shipping.
//

import Foundation

enum Tracker {
    /// The custom scheme registered in the app's Info.plist. The extension opens it to hand the app a
    /// verified permission snapshot (`an1metracker://state?…`) or to ask for the settings page.
    static let urlScheme = "an1metracker"

    /// The tracking site. Everything the extension does on a page starts from here.
    static let siteURL = URL(string: "https://an1me.to")!

    /// Where the app sends the user to have the extension measure access for real. The extension's content
    /// script sees the marker, asks the background worker for `browser.permissions`, and answers by opening
    /// `an1metracker://state?…`. This is the only entitlement-free way for the app to learn a host state.
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
/// ever treated as a source of truth for a permission.
enum AppStorageKey {
    static let lastPermissionSnapshot = "tracker.lastPermissionSnapshot"
    static let lastVerifiedAt = "tracker.lastVerifiedAt"
    static let lastReportSource = "tracker.lastReportSource"
}
