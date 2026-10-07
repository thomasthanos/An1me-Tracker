//
//  HomeViewModel.swift
//  An1me Tracker
//
//  The home screen's presenter: Ready, or "Setup required" with a count and the one action that fixes it.
//  It never invents a state — the rows and the count come from the same presenter the Permissions screen
//  uses, which reads only the coordinator.
//
//  This is a value type on purpose. It owns no state: every value below is derived from the coordinator,
//  which is the object that actually changes and the one the views observe. A class conforming to
//  `ObservableObject` with nothing `@Published` would have no `objectWillChange` for the compiler to
//  synthesise, and would not conform at all.
//

import Foundation

@MainActor
struct HomeViewModel {

    let coordinator: PermissionCoordinator

    private var permissions: WebsiteAccessViewModel { WebsiteAccessViewModel(coordinator: coordinator) }

    var isChecking: Bool { coordinator.isRefreshing }

    /// Verified access plus an extension Safari itself reports as on. Nothing else counts.
    var isReady: Bool {
        coordinator.assessment.isReady || (permissions.extensionConfirmed && coordinator.assessment.state.isAllowed)
    }

    var headline: String {
        if isReady { return "Ready" }
        return "Setup required"
    }

    var attentionDetail: String {
        let count = permissions.attentionCount
        if count > 0 {
            return count == 1 ? "1 permission needs attention" : "\(count) permissions need attention"
        }
        if case .unableToVerify(let reason) = coordinator.assessment.state { return reason.title }
        return "Safari has not confirmed the extension yet"
    }

    /// The three facts behind "Ready". Only shown when `isReady`, so each is already established.
    var readyRows: [StatusRow] {
        [
            StatusRow(id: "extension", symbol: "puzzlepiece.extension.fill", title: "Safari Extension",
                      value: "Enabled", tone: tone(for: coordinator.extensionState)),
            StatusRow(id: "access", symbol: "lock.shield.fill", title: "Website Access",
                      value: "Allowed", tone: tone(for: coordinator.assessment.state)),
            StatusRow(id: "permissions", symbol: "checkmark.shield.fill", title: "Permissions",
                      value: "Ready", tone: permissions.attentionCount == 0 ? .good : .warning),
        ]
    }

    /// Short value for the Permissions row in the list.
    var permissionsValue: String {
        let count = permissions.attentionCount
        if count > 0 { return "\(count) to fix" }
        return isReady ? "Ready" : "Not verified"
    }

    // MARK: - Actions

    /// What "Enable Required Access" really does on this device, in this state. Each case is an action the
    /// app can perform; nothing here pretends to grant a permission itself.
    var setupAction: DashboardAction {
        permissions.primaryAction ?? .verifyAccess
    }

    func perform(_ action: DashboardAction) async {
        switch action {
        case .enableExtension:
            await coordinator.openExtensionSettings()
        case .allowRequiredAccess:
            permissions.requestAll()
        case .verifyAccess:
            coordinator.startVerificationInSafari()
        case .openSite:
            coordinator.openSite()
        case .recheck:
            await coordinator.refresh()
        }
    }

    // MARK: - Helpers

    private func tone(for state: ExtensionEnabledState) -> StatusRow.Tone {
        switch state {
        case .enabled: return .good
        case .disabled: return .bad
        case .unknown: return permissions.extensionConfirmed ? .good : .warning
        }
    }

    private func tone(for state: AccessState) -> StatusRow.Tone {
        switch state {
        case .allowed: return .good
        case .missing: return .bad
        case .unableToVerify: return .warning
        }
    }
}
