//
//  DiagnosticsReport.swift
//  An1me Tracker
//
//  A read-only description of what the app knows. Deliberately excludes anything personal: no account,
//  no library contents, no tokens. Only the facts someone needs when a permission will not stick.
//

import Foundation

struct DiagnosticsReport: Equatable {
    enum Tone: Equatable {
        case normal
        case good
        case warning
        case bad
    }

    struct Row: Identifiable, Equatable {
        let label: String
        let value: String
        let tone: Tone
        var id: String { label }

        init(_ label: String, _ value: String, tone: Tone = .normal) {
            self.label = label
            self.value = value
            self.tone = tone
        }
    }

    struct Section: Identifiable, Equatable {
        let title: String
        let rows: [Row]
        var id: String { title }
    }

    var sections: [Section]
}
