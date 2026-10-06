//
//  PermissionSnapshotStore.swift
//  An1me Tracker
//
//  The cache the transport writes into and the UI reads from. It holds a dated reading, never a decision:
//  nothing in the app consults it to decide whether an action is allowed.
//

import Foundation

protocol PermissionSnapshotStoring: AnyObject {
    func load() -> PermissionSnapshot?
    func save(_ snapshot: PermissionSnapshot)
    func clear()
}

final class UserDefaultsPermissionSnapshotStore: PermissionSnapshotStoring {

    private let defaults: UserDefaults
    private let key: String

    init(defaults: UserDefaults = .standard, key: String = AppStorageKey.lastPermissionSnapshot) {
        self.defaults = defaults
        self.key = key
    }

    func load() -> PermissionSnapshot? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(PermissionSnapshot.self, from: data)
    }

    func save(_ snapshot: PermissionSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key)
        defaults.set(snapshot.capturedAt, forKey: AppStorageKey.lastVerifiedAt)
    }

    func clear() {
        defaults.removeObject(forKey: key)
        defaults.removeObject(forKey: AppStorageKey.lastVerifiedAt)
    }
}

#if DEBUG
/// In-memory store for previews and tests; never used by the shipping app.
final class InMemoryPermissionSnapshotStore: PermissionSnapshotStoring {
    private var snapshot: PermissionSnapshot?
    init(snapshot: PermissionSnapshot? = nil) { self.snapshot = snapshot }
    func load() -> PermissionSnapshot? { snapshot }
    func save(_ snapshot: PermissionSnapshot) { self.snapshot = snapshot }
    func clear() { snapshot = nil }
}
#endif
