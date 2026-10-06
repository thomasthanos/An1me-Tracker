//
//  HomeViewModel.swift
//  An1me Tracker
//
//  The dashboard's presenter: turns the coordinator's assessment into the headline, the status rows and
//  the single next step. It never invents a state — when nothing is verified it says so and offers the
//  verification instead.
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

    // MARK: - Headline

    var isChecking: Bool { coordinator.isRefreshing }
    var isReady: Bool { coordinator.assessment.isReady }
    var hasSnapshot: Bool { coordinator.snapshot != nil }

    var headline: String {
        if isReady { return "Ready" }
        if coordinator.extensionState.isEnabled == false { return "Action Required" }
        if !coordinator.assessment.state.missingOrigins.isEmpty { return "Action Required" }
        return "Finish setup"
    }

    var headlineDetail: String {
        if isReady { return "Everything the tracker needs is allowed." }
        switch coordinator.assessment.state {
        case .allowed:
            return "Website access looks complete. Verify once so the app can confirm it."
        case .missing(let origins):
            let count = origins.count
            return count == 1 ? "1 required service is blocked." : "\(count) required services are blocked."
        case .unableToVerify(let reason):
            return reason.detail
        }
    }

    var headlineTone: StatusRow.Tone {
        if isReady { return .good }
        if coordinator.extensionState.isEnabled == false { return .bad }
        if !coordinator.assessment.state.missingOrigins.isEmpty { return .bad }
        return .warning
    }

    var headlineSymbol: String {
        if isReady { return "checkmark.seal.fill" }
        if coordinator.extensionState.isEnabled == false { return "exclamationmark.triangle.fill" }
        return "exclamationmark.circle.fill"
    }

    // MARK: - Status rows

    var statusRows: [StatusRow] {
        let assessment = coordinator.assessment
        return [
            StatusRow(
                id: "extension",
                symbol: "puzzlepiece.extension",
                title: "Safari Extension",
                value: coordinator.extensionState.title,
                tone: tone(for: coordinator.extensionState)
            ),
            StatusRow(
                id: "access",
                symbol: "lock.shield",
                title: "Website Access",
                value: assessment.summary,
                tone: tone(for: assessment.state)
            ),
            StatusRow(
                id: "services",
                symbol: "server.rack",
                title: "Required Services",
                value: "\(assessment.grantedHostCount) / \(assessment.totalHostCount)",
                tone: assessment.grantedHostCount == assessment.totalHostCount ? .good : .warning
            ),
        ]
    }

    // MARK: - Actions

    /// The one thing worth doing next. Exactly one action is returned, so the dashboard never presents a
    /// wall of equally-weighted buttons.
    var primaryAction: DashboardAction {
        if coordinator.extensionState.isEnabled == false { return .enableExtension }
        if !coordinator.assessment.state.missingOrigins.isEmpty { return .allowRequiredAccess }
        if coordinator.assessment.state.isAllowed { return .openSite }
        return .verifyAccess
    }

    var showsSettingsFallback: Bool {
        coordinator.extensionState.isEnabled == false || !coordinator.assessment.state.missingOrigins.isEmpty
    }

    func perform(_ action: DashboardAction) async {
        switch action {
        case .enableExtension, .allowRequiredAccess:
            await coordinator.openExtensionSettings()
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
        case .unknown: return .warning
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
