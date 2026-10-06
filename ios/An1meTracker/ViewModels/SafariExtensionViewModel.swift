//
//  SafariExtensionViewModel.swift
//  An1me Tracker
//
//  The Safari-extension screen's presenter: what the app knows about the extension bundle and about the
//  access it has been granted.
//

import Foundation
import SwiftUI

@MainActor
final class SafariExtensionViewModel: ObservableObject {

    private let coordinator: PermissionCoordinator

    init(coordinator: PermissionCoordinator) {
        self.coordinator = coordinator
    }

    var state: ExtensionEnabledState { coordinator.extensionState }
    var isChecking: Bool { coordinator.isRefreshing }
    var extensionVersion: String { SafariExtensionIdentity.version ?? "Not found" }
    var bundleIdentifier: String { SafariExtensionIdentity.bundleIdentifier ?? "Not found" }
    var canQueryState: Bool { SystemInfo.supportsExtensionStateQuery }

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

    /// Why the app cannot read the enabled state, phrased for the system the user is on.
    var stateLimitation: String? {
        switch state {
        case .unknown(.unsupportedSystem):
            return "iOS \(SystemInfo.osVersion) has no public API for this. Turn the extension on in Settings, then verify access — the app will show the state the extension reports."
        case .unknown(.extensionNotFound):
            return "No Safari extension was found inside this app. Reinstall An1me Tracker, keeping the existing app so your data stays."
        case .unknown(.queryFailed(let message)):
            return "Safari did not answer: \(message)"
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
