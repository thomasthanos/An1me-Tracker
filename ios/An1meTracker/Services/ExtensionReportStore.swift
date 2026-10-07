//
//  ExtensionReportStore.swift
//  An1me Tracker
//
//  Keeps the last report the extension handed over. A dated reading, never a decision.
//

import Foundation

protocol ExtensionReportStoring: AnyObject {
    func load() -> ExtensionReport?
    func save(_ report: ExtensionReport)
    func clear()
}

final class UserDefaultsExtensionReportStore: ExtensionReportStoring {

    private let defaults: UserDefaults
    private let key: String

    init(defaults: UserDefaults = .standard, key: String = AppStorageKey.lastExtensionReport) {
        self.defaults = defaults
        self.key = key
        // Permission snapshots from 8.3.x measured something Safari misreports; never read them again.
        for legacy in AppStorageKey.legacy { defaults.removeObject(forKey: legacy) }
    }

    func load() -> ExtensionReport? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(ExtensionReport.self, from: data)
    }

    func save(_ report: ExtensionReport) {
        guard let data = try? JSONEncoder().encode(report) else { return }
        defaults.set(data, forKey: key)
    }

    func clear() {
        defaults.removeObject(forKey: key)
    }
}
