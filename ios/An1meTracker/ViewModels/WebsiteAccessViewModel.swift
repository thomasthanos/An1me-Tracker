//
//  WebsiteAccessViewModel.swift
//  An1me Tracker
//
//  The website-access screen's presenter. Groups come from the generated `HostPermissions` model, so the
//  app and the extension describe the same websites in the same words.
//
//  A value type: it derives everything from the coordinator and owns nothing, so there is no state to
//  republish. See `HomeViewModel` for why that matters.
//

import Foundation

@MainActor
struct WebsiteAccessViewModel {

    let coordinator: PermissionCoordinator

    var groups: [GroupAccess] { coordinator.assessment.groups }
    var assessment: AccessAssessment { coordinator.assessment }
    var isChecking: Bool { coordinator.isRefreshing }

    var statusTitle: String {
        switch coordinator.assessment.state {
        case .allowed: return "Allowed"
        case .missing(let origins):
            return origins.count == 1 ? "1 service missing" : "\(origins.count) services missing"
        case .unableToVerify(let reason): return reason.title
        }
    }

    var statusDetail: String {
        switch coordinator.assessment.state {
        case .allowed:
            return "Safari has allowed every website the tracker uses."
        case .missing:
            return "Tap Allow Required Access and turn on the websites Safari lists."
        case .unableToVerify(let reason):
            return reason.detail
        }
    }

    var statusTone: StatusRow.Tone {
        switch coordinator.assessment.state {
        case .allowed: return .good
        case .missing: return .bad
        case .unableToVerify: return .warning
        }
    }

    var lastVerifiedText: String {
        guard let date = coordinator.assessment.verifiedAt else { return "Never verified" }
        return "Last verified \(RelativeTime.string(since: date))"
    }

    var verificationIsStale: Bool { coordinator.snapshot?.isStale ?? true }

    /// The one action that moves things forward on this screen.
    var primaryAction: DashboardAction {
        coordinator.assessment.state.missingOrigins.isEmpty ? .verifyAccess : .allowRequiredAccess
    }

    func perform(_ action: DashboardAction) async {
        switch action {
        case .enableExtension, .allowRequiredAccess:
            await coordinator.openExtensionSettings()
        case .verifyAccess:
            coordinator.startVerificationInSafari()
        case .recheck:
            await coordinator.refresh()
        case .openSite:
            coordinator.openSite()
        }
    }

    func recheck() async {
        await coordinator.refresh()
    }

    /// The dated reading itself, for the technical section. Returns `nil` until the extension has reported.
    var snapshot: PermissionSnapshot? { coordinator.snapshot }

    /// One row of the technical section: the raw origin, what it is for, and whether it is granted.
    /// `isGranted` is `nil` when nothing has been verified, which the view renders as "unknown".
    struct HostState: Identifiable, Equatable {
        let origin: String
        let display: String
        let feature: String
        let isGranted: Bool?
        var id: String { origin }
    }

    var technicalHosts: [HostState] {
        let snapshot = coordinator.snapshot
        return HostPermissions.groups.flatMap { group in
            group.hosts.map { host in
                HostState(
                    origin: host.origin,
                    display: host.display,
                    feature: host.feature,
                    isGranted: snapshot.map { $0.isGranted(host.origin) }
                )
            }
        }
    }

    var allWebsitesGranted: Bool? { coordinator.snapshot?.allWebsites }
}
