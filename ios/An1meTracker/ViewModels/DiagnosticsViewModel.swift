//
//  DiagnosticsViewModel.swift
//  An1me Tracker
//
//  Assembles the diagnostics report on demand. Everything it shows is read from the same coordinator the
//  rest of the app uses, so the screen can never disagree with the dashboard.
//

import Foundation
import SwiftUI

@MainActor
final class DiagnosticsViewModel: ObservableObject {

    private let coordinator: PermissionCoordinator

    init(coordinator: PermissionCoordinator) {
        self.coordinator = coordinator
    }

    var report: DiagnosticsReport { DiagnosticsService.report(coordinator: coordinator) }
    var isChecking: Bool { coordinator.isRefreshing }

    func refresh() async {
        await coordinator.refresh()
    }

    func openSettings() async {
        await coordinator.openExtensionSettings()
    }

    func verifyAccess() {
        coordinator.startVerificationInSafari()
    }

    func clearCache() {
        coordinator.clearCachedSnapshot()
    }
}
