//
//  PermissionModels.swift
//  An1me Tracker
//
//  The permission vocabulary. The Safari Web Extension is the only authority on whether a website is
//  allowed; the app stores what it reported, with the moment it said so, and refuses to turn an old report
//  into a fresh "Allowed".
//

import Foundation

/// A snapshot the Safari Web Extension produced by asking Safari itself.
///
/// `grantedOrigins` is what `browser.permissions.getAll()` returned, verbatim. Safari represents the
/// "All Websites" switch internally as `*://*/*` even when the manifest asks for `<all_urls>`, so both
/// spellings are accepted (see `HostPermissions.allWebsitesPattern`).
struct PermissionSnapshot: Codable, Equatable {
    var grantedOrigins: [String]
    var allWebsites: Bool
    var blockedOrigins: [String]
    var extensionVersion: String?
    var capturedAt: Date
    /// API permissions from `permissions.getAll()`. `nil` for readings from extensions that predate it.
    var grantedPermissions: [String]? = nil
    /// What `permissions.getAll()` claimed, kept for Diagnostics only. Safari iOS lists declared hosts here
    /// even while Settings shows them at "Ask", so it is never used as a grant.
    var apiOrigins: [String]? = nil
    /// The extension's empirical reading per origin: "allowed", "ask" or "unreachable". This, not the API,
    /// is what `grantedOrigins` is built from.
    var probes: [String: String]? = nil

    static let empty = PermissionSnapshot(
        grantedOrigins: [],
        allWebsites: false,
        blockedOrigins: [],
        extensionVersion: nil,
        capturedAt: .distantPast
    )

    var isUsable: Bool { capturedAt != .distantPast }

    func isGranted(_ origin: String) -> Bool {
        allWebsites || grantedOrigins.contains(origin)
    }

    /// How long ago the extension measured this. The UI prints it; nothing else depends on wall-clock time,
    /// so a stale snapshot stays readable instead of silently becoming wrong.
    var age: TimeInterval { Date().timeIntervalSince(capturedAt) }

    var isStale: Bool { age > PermissionSnapshot.staleAfter }

    static let staleAfter: TimeInterval = 12 * 60 * 60
}

/// The state of one website, or of the whole set, as far as the app can honestly tell.
enum AccessState: Equatable {
    /// Every required origin is granted. Only produced from a snapshot or from Safari's own answer.
    case allowed
    /// Some origins are not granted, and the extension said which.
    case missing([String])
    /// The app has nothing trustworthy to show, and says why instead of guessing.
    case unableToVerify(UnverifiedReason)

    var isAllowed: Bool {
        if case .allowed = self { return true }
        return false
    }

    var missingOrigins: [String] {
        if case .missing(let origins) = self { return origins }
        return []
    }

    var reason: UnverifiedReason? {
        if case .unableToVerify(let reason) = self { return reason }
        return nil
    }
}

/// Why the app cannot show live state. Every case has a concrete, actionable cause.
enum UnverifiedReason: Equatable {
    /// The extension has never sent a snapshot. Common on a fresh install before the first verification.
    case neverVerified
    /// The last snapshot is older than `PermissionSnapshot.staleAfter`.
    case stale(lastVerified: Date)
    /// The WebExtension is not running, so nothing can measure it right now.
    case extensionNotEnabled
    /// The bridge handed the app something it could not parse.
    case malformedReport

    var title: String {
        switch self {
        case .neverVerified: return "Not verified yet"
        case .stale: return "Not recently verified"
        case .extensionNotEnabled: return "Extension is off"
        case .malformedReport: return "Could not read the report"
        }
    }

    var detail: String {
        switch self {
        case .neverVerified:
            return "Open the verification once and the tracker will report what Safari has actually allowed."
        case .stale(let date):
            return "Last verified \(RelativeTime.string(since: date)). Verify again to see the current state."
        case .extensionNotEnabled:
            return "Turn the Safari extension on, then verify again."
        case .malformedReport:
            return "The tracker's report could not be read. Verify again."
        }
    }
}

/// The state of one permission group, derived from a snapshot. Never stored on its own.
struct GroupAccess: Identifiable, Equatable {
    let group: HostPermissionGroup
    let state: AccessState

    var id: String { group.id }

    var grantedCount: Int {
        switch state {
        case .allowed: return group.hosts.count
        case .missing(let missing): return group.hosts.count - missing.count
        case .unableToVerify: return 0
        }
    }
}

/// The whole picture the permission screens render, built from one snapshot plus Safari's answer about the
/// extension itself. Everything here is derived on demand; none of it is persisted as a decision.
struct AccessAssessment: Equatable {
    let extensionEnabled: ExtensionEnabledState
    let snapshot: PermissionSnapshot?
    let state: AccessState
    let groups: [GroupAccess]

    var verifiedAt: Date? {
        guard let snapshot, snapshot.isUsable else { return nil }
        return snapshot.capturedAt
    }

    var grantedHostCount: Int { groups.reduce(0) { $0 + $1.grantedCount } }
    var totalHostCount: Int { groups.reduce(0) { $0 + $1.group.hosts.count } }

    /// The single line the dashboard shows under "Website Access".
    var summary: String {
        switch state {
        case .allowed:
            return "All \(totalHostCount) required services are allowed"
        case .missing(let missing):
            return missing.count == 1
                ? "1 service is blocked"
                : "\(missing.count) services are blocked"
        case .unableToVerify(let reason):
            return reason.title
        }
    }

    /// True only when nothing needs the user's attention.
    var isReady: Bool { extensionEnabled.isEnabled == true && state.isAllowed }

    static func make(
        extensionEnabled: ExtensionEnabledState,
        snapshot: PermissionSnapshot?
    ) -> AccessAssessment {
        // With the extension off nothing can be measured, so that outranks a previously good snapshot.
        if extensionEnabled.isEnabled == false {
            return AccessAssessment(
                extensionEnabled: extensionEnabled,
                snapshot: snapshot,
                state: .unableToVerify(.extensionNotEnabled),
                groups: HostPermissions.groups.map { GroupAccess(group: $0, state: .unableToVerify(.extensionNotEnabled)) }
            )
        }

        guard let snapshot, snapshot.isUsable else {
            return AccessAssessment(
                extensionEnabled: extensionEnabled,
                snapshot: nil,
                state: .unableToVerify(.neverVerified),
                groups: HostPermissions.groups.map { GroupAccess(group: $0, state: .unableToVerify(.neverVerified)) }
            )
        }

        let missing = HostPermissions.allOrigins.filter { !snapshot.isGranted($0) }
        let state: AccessState = missing.isEmpty ? .allowed : .missing(missing)

        let groups = HostPermissions.groups.map { group -> GroupAccess in
            let groupMissing = group.hosts.map(\.origin).filter { !snapshot.isGranted($0) }
            // A stale snapshot is still shown, but never as "Allowed": the user has to see that it is
            // an old reading rather than a live one.
            let groupState: AccessState = snapshot.isStale
                ? .unableToVerify(.stale(lastVerified: snapshot.capturedAt))
                : (groupMissing.isEmpty ? .allowed : .missing(groupMissing))
            return GroupAccess(group: group, state: groupState)
        }

        let resolved: AccessState = snapshot.isStale
            ? .unableToVerify(.stale(lastVerified: snapshot.capturedAt))
            : state

        return AccessAssessment(extensionEnabled: extensionEnabled, snapshot: snapshot, state: resolved, groups: groups)
    }
}
