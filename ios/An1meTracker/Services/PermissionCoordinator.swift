//
//  PermissionCoordinator.swift
//  An1me Tracker
//
//  The one place that answers "what is the permission state, and when was it measured?". Every screen
//  reads this object; nothing recomputes permissions on its own and nothing stores a verdict.
//

import Combine
import Foundation
import SwiftUI

@MainActor
final class PermissionCoordinator: ObservableObject {

    @Published private(set) var assessment: AccessAssessment
    @Published private(set) var extensionState: ExtensionEnabledState
    @Published private(set) var snapshot: PermissionSnapshot?
    @Published private(set) var isRefreshing = false
    @Published private(set) var lastBridgeError: String?

    private let statusService: SafariExtensionStatusProviding
    private let store: PermissionSnapshotStoring
    let settingsLauncher: ExtensionSettingsLaunching

    init(
        statusService: SafariExtensionStatusProviding = SafariExtensionStatusService(),
        store: PermissionSnapshotStoring = UserDefaultsPermissionSnapshotStore(),
        settingsLauncher: ExtensionSettingsLaunching? = nil
    ) {
        let stored = store.load()
        let unknown = ExtensionEnabledState.unknown(.unsupportedSystem(currentVersion: SystemInfo.osVersion))
        self.statusService = statusService
        self.store = store
        // Built here rather than as a default argument. Swift evaluates default arguments in a nonisolated
        // context, and this initializer is main-actor isolated — which is a compile error under the strict
        // concurrency the app is built with, not a warning.
        self.settingsLauncher = settingsLauncher ?? SettingsLauncher()
        self.snapshot = stored
        self.extensionState = unknown
        self.assessment = AccessAssessment.make(extensionEnabled: unknown, snapshot: stored)
    }

    // MARK: - Refreshing

    /// Re-reads everything the app can read without the user leaving it: Safari's answer about the
    /// extension, and the last snapshot the extension handed over. Runs when the app appears, when the
    /// permission screen appears, when the app returns to the foreground, and on Recheck.
    func refresh() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        let state = await statusService.currentState()
        apply(state: state, snapshot: store.load())
    }

    /// Records a snapshot the extension handed over through the bridge and re-renders immediately.
    func ingest(_ snapshot: PermissionSnapshot) {
        store.save(snapshot)
        lastBridgeError = nil
        apply(state: extensionState, snapshot: snapshot)
    }

    /// Used when the bridge received something it could not read, so the UI can say so instead of leaving
    /// the user wondering why nothing changed.
    func noteBridgeFailure() {
        lastBridgeError = "The tracker sent a report this app could not read."
    }

    func clearCachedSnapshot() {
        store.clear()
        apply(state: extensionState, snapshot: nil)
    }

    // MARK: - Actions

    /// Sends the user to the website in Safari with the verification marker. The extension answers by
    /// reopening this app with a fresh snapshot — the only entitlement-free way to read a host state.
    func startVerificationInSafari() {
        SystemLinks.open(Tracker.verifyURL)
    }

    func openSite() {
        SystemLinks.open(Tracker.siteURL)
    }

    /// Opens the extension's own page in Settings, where its websites are listed. Returns whether the deep
    /// link was taken, so the caller can explain the fallback.
    @discardableResult
    func openExtensionSettings() async -> Bool {
        await settingsLauncher.openExtensionSettings()
    }

    // MARK: - Routing

    func handle(_ event: TrackerURLEvent) {
        switch event {
        case .permissionSnapshot(let snapshot):
            ingest(snapshot)
        case .openExtensionSettings:
            Task { await openExtensionSettings() }
        case .unrecognised:
            noteBridgeFailure()
        }
    }

    // MARK: - Derivation

    private func apply(state: ExtensionEnabledState, snapshot: PermissionSnapshot?) {
        extensionState = state
        self.snapshot = snapshot
        assessment = AccessAssessment.make(extensionEnabled: state, snapshot: snapshot)
    }
}

extension PermissionCoordinator {
    /// The shared instance the app's scene uses. Screens receive it from the environment.
    static let shared = PermissionCoordinator()
}
