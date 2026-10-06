//
//  DiagnosticsViewModel.swift
//  An1me Tracker
//
//  Assembles the diagnostics report on demand. Everything it shows is read from the same coordinator the
//  rest of the app uses, so the screen can never disagree with the dashboard.
//
//  A value type: it derives everything from the coordinator and owns nothing. See `HomeViewModel`.
//

import Foundation

@MainActor
struct DiagnosticsViewModel {

    let coordinator: PermissionCoordinator

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
