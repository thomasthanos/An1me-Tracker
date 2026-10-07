//
//  DashboardModels.swift
//  An1me Tracker
//
//  Small presentation types shared by the home screen and the Permissions screen. They are derived from
//  `AccessAssessment` and the bundled manifest at render time and never persisted.
//

import Foundation

/// One line of the status card: a symbol, a label, and the value the app can actually stand behind.
struct StatusRow: Identifiable, Equatable {
    enum Tone: Equatable {
        case good
        case warning
        case bad
        case neutral
    }

    let id: String
    let symbol: String
    let title: String
    let value: String
    let tone: Tone
}

/// Everything the dashboard can offer as a next step. Each case maps to exactly one real action: the app
/// never shows a button whose effect it cannot perform.
enum DashboardAction: String, Identifiable, Equatable {
    case enableExtension
    case allowRequiredAccess
    case verifyAccess
    case openSite
    case recheck

    var id: String { rawValue }

    var title: String {
        switch self {
        case .enableExtension: return "Enable Extension"
        case .allowRequiredAccess: return "Enable Required Access"
        case .verifyAccess: return "Verify Access"
        case .openSite: return "Open an1me.to"
        case .recheck: return "Recheck"
        }
    }

    var symbol: String {
        switch self {
        case .enableExtension: return "puzzlepiece.extension"
        case .allowRequiredAccess: return "checkmark.shield"
        case .verifyAccess: return "arrow.triangle.2.circlepath"
        case .openSite: return "safari"
        case .recheck: return "arrow.clockwise"
        }
    }
}

/// One Settings-style row on the Permissions screen: a group of manifest entries with one combined state.
/// Built from the extension's manifest.json; the state comes only from the extension's own report.
struct PermissionRow: Identifiable, Equatable {
    enum Status: Equatable {
        case granted
        case missing
        /// Nothing fresh has been measured. Never shown as granted.
        case unknown
    }

    struct Item: Identifiable, Equatable {
        let id: String
        let title: String
        let detail: String
        let status: Status
    }

    static let extensionID = "extension"

    let id: String
    let title: String
    let summary: String
    let symbol: String
    let isRequired: Bool
    let status: Status
    let statusText: String
    let items: [Item]

    static func combined(_ statuses: [Status]) -> Status {
        if statuses.isEmpty || statuses.contains(.unknown) { return .unknown }
        return statuses.contains(.missing) ? .missing : .granted
    }

    static func label(for status: Status) -> String {
        switch status {
        case .granted: return "Allowed"
        case .missing: return "Needs access"
        case .unknown: return "Not verified"
        }
    }

    static func symbol(forGroup id: String?) -> String {
        switch id {
        case "site": return "play.rectangle.fill"
        case "account": return "person.crop.circle.fill"
        case "info": return "list.bullet.rectangle.fill"
        case "artwork": return "photo.fill"
        case "skip": return "forward.end.fill"
        default: return "globe"
        }
    }
}
