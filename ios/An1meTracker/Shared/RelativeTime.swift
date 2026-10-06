//
//  RelativeTime.swift
//  An1me Tracker
//
//  Dates are only ever shown next to a verification, so they are always relative ("4 minutes ago") and
//  never used to decide permissions.
//

import Foundation

enum RelativeTime {
    static func string(since date: Date) -> String {
        guard date != .distantPast else { return "never" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

extension DateFormatter {
    /// Short, locale-aware stamp for the diagnostics screen, where local time is the useful frame.
    ///
    /// Built per call rather than kept in a `static let`: `DateFormatter` is not `Sendable`, so a shared
    /// instance is a data race under strict concurrency and does not compile. The diagnostics screen is not
    /// a hot path, so the cost of a fresh formatter is irrelevant next to that.
    static var diagnosticsStamp: DateFormatter {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .medium
        return formatter
    }
}
