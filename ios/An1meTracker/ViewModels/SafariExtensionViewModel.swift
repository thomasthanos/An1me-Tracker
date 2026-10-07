//
//  SafariExtensionViewModel.swift
//  An1me Tracker
//
//  The Safari-extension screen's presenter: what the app knows about the extension bundle and about the
//  access it has been granted.
//
//  A value type: it derives everything from the coordinator and owns nothing. See `HomeViewModel`.
//

import Foundation

@MainActor
struct SafariExtensionViewModel {

    let coordinator: PermissionCoordinator

    var state: ExtensionEnabledState { coordinator.extensionState }
    var isChecking: Bool { coordinator.isRefreshing }
    var extensionVersion: String { SafariExtensionIdentity.version ?? "Not found" }
    var bundleIdentifier: String { SafariExtensionIdentity.bundleIdentifier ?? "Not found" }

    var accessSummary: String { coordinator.assessment.summary }
    var accessTone: StatusRow.Tone {
        switch coordinator.assessment.state {
        case .allowed: return .good
        case .missing: return .bad
        case .unableToVerify: return .warning
        }
    }

    var lastVerifiedText: String {
        guard let date = coordinator.assessment.verifiedAt else { return "Never verified" }
        return RelativeTime.string(since: date)
    }

    private var permissions: WebsiteAccessViewModel { WebsiteAccessViewModel(coordinator: coordinator) }

    /// Title and detail for the status row. When Safari could not answer but the extension reported in, the
    /// report is the evidence shown — never an API name or error string.
    var title: String { permissions.confirmedByReport ? "Enabled" : state.title }
    var detail: String {
        guard permissions.confirmedByReport, let date = coordinator.assessment.verifiedAt else { return state.detail }
        return "The extension reported in \(RelativeTime.string(since: date))."
    }
    var isConfirmed: Bool { permissions.extensionConfirmed }

    /// Why the app cannot read the enabled state right now.
    var stateLimitation: String? {
        switch state {
        case .unknown(.notChecked):
            return nil
        case .unknown(.extensionNotFound):
            return "No Safari extension was found inside this app. Reinstall An1me Tracker, keeping the existing app so your data stays."
        case .unknown(.queryFailed):
            return nil
        case .enabled, .disabled:
            return nil
        }
    }

    func openSettings() async {
        await coordinator.openExtensionSettings()
    }

    func recheck() async {
        await coordinator.refresh()
    }

    func verifyAccess() {
        coordinator.startVerificationInSafari()
    }
}
