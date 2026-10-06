//
//  DashboardModels.swift
//  An1me Tracker
//
//  Small presentation types shared by the dashboard and the website-access screen. They are derived from
//  `AccessAssessment` at render time and never persisted.
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
        case .allowRequiredAccess: return "Allow Required Access"
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
