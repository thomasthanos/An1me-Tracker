//
//  PermissionCoordinator.swift
//  An1me Tracker
//
//  The one place that answers "is the extension on, and has it run on an1me.to?". The screen reads this
//  object; nothing recomputes the status on its own and nothing stores a verdict.
//

import Combine
import Foundation
import SwiftUI

@MainActor
final class PermissionCoordinator: ObservableObject {

    @Published private(set) var extensionState: ExtensionEnabledState
    @Published private(set) var report: ExtensionReport?
    @Published private(set) var isRefreshing = false
    @Published private(set) var lastBridgeError: String?

    private let statusService: SafariExtensionStatusProviding
    private let store: ExtensionReportStoring
    let settingsLauncher: ExtensionSettingsLaunching

    init(
        statusService: SafariExtensionStatusProviding = SafariExtensionStatusService(),
        store: ExtensionReportStoring = UserDefaultsExtensionReportStore(),
        settingsLauncher: ExtensionSettingsLaunching? = nil
    ) {
        self.statusService = statusService
        self.store = store
        // Built here rather than as a default argument: Swift evaluates default arguments in a nonisolated
        // context, and this initializer is main-actor isolated.
        self.settingsLauncher = settingsLauncher ?? SettingsLauncher()
        self.extensionState = .unknown(.notChecked)
        self.report = store.load()
    }

    var status: TrackerStatus { TrackerStatus(extensionState: extensionState, report: report) }

    // MARK: - Refreshing

    /// Asks Safari about the extension again and re-reads the stored report. Runs on launch, on return to the
    /// foreground and on pull to refresh — never on a timer.
    func refresh() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        extensionState = await statusService.currentState()
        // A report from another extension version (an app update) says nothing about this one.
        if let stored = store.load(), let reported = stored.extensionVersion,
           let current = SafariExtensionIdentity.version, reported != current {
            store.clear()
        }
        report = store.load()
    }

    func ingest(_ report: ExtensionReport) {
        store.save(report)
        lastBridgeError = nil
        self.report = report
    }

    // MARK: - Actions

    /// Opens an1me.to with the verify marker; the extension answers by reopening this app with a report.
    func verifyInSafari() {
        SystemLinks.open(Tracker.verifyURL)
    }

    func openSite() {
        SystemLinks.open(Tracker.siteURL)
    }

    /// Only for an extension that is off: Settings is the one place it can be switched on.
    @discardableResult
    func openExtensionSettings() async -> Bool {
        await settingsLauncher.openExtensionSettings()
    }

    // MARK: - Routing

    func handle(_ event: TrackerURLEvent) {
        switch event {
        case .report(let report):
            ingest(report)
        case .openExtensionSettings:
            Task { await openExtensionSettings() }
        case .unrecognised:
            lastBridgeError = "The tracker sent a report this app could not read."
        }
    }
}

extension PermissionCoordinator {
    /// The shared instance the app's scene uses. The screen receives it from the environment.
    static let shared = PermissionCoordinator()
}
