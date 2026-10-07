//
//  DiagnosticsService.swift
//  An1me Tracker
//
//  Builds the diagnostics screen's content from things the app already knows. Read-only, and free of
//  anything personal: no account, no library, no tokens.
//

import Foundation

@MainActor
enum DiagnosticsService {

    static func report(coordinator: PermissionCoordinator) -> DiagnosticsReport {
        let assessment = coordinator.assessment
        let snapshot = coordinator.snapshot

        var sections: [DiagnosticsReport.Section] = []

        // MARK: Extension
        var extensionRows: [DiagnosticsReport.Row] = [
            .init("Safari Extension", coordinator.extensionState.title, tone: tone(for: coordinator.extensionState)),
            .init("Extension version", SafariExtensionIdentity.version ?? "not found",
                  tone: SafariExtensionIdentity.version == nil ? .bad : .normal),
            .init("Bundle identifier", SafariExtensionIdentity.bundleIdentifier ?? "not found",
                  tone: SafariExtensionIdentity.bundleIdentifier == nil ? .bad : .normal),
        ]
        if !SystemInfo.supportsExtensionStateQuery {
            extensionRows.append(.init("State query", "Not available before iOS 26.2", tone: .warning))
        }
        sections.append(.init(title: "Extension", rows: extensionRows))

        // MARK: Website access
        var accessRows: [DiagnosticsReport.Row] = [
            .init("Required websites", "\(assessment.totalHostCount)"),
            .init("Allowed now", "\(assessment.grantedHostCount)",
                  tone: assessment.grantedHostCount == assessment.totalHostCount ? .good : .warning),
            .init("Missing", "\(assessment.totalHostCount - assessment.grantedHostCount)",
                  tone: assessment.state.missingOrigins.isEmpty ? .normal : .bad),
        ]
        if let snapshot {
            accessRows.append(.init("All Websites switch", snapshot.allWebsites ? "granted" : "not granted",
                                    tone: snapshot.allWebsites ? .good : .normal))
            accessRows.append(.init("Last verified", RelativeTime.string(since: snapshot.capturedAt),
                                    tone: snapshot.isStale ? .warning : .good))
            accessRows.append(.init("Verified at", DateFormatter.diagnosticsStamp.string(from: snapshot.capturedAt)))
            accessRows.append(.init("Reported origins", "\(snapshot.grantedOrigins.count)"))
        } else {
            accessRows.append(.init("Last verified", "never", tone: .warning))
        }
        if let error = coordinator.lastBridgeError {
            accessRows.append(.init("Bridge", error, tone: .bad))
        }
        sections.append(.init(title: "Website access", rows: accessRows))

        // MARK: Manifest (what Safari enforces)
        let manifest = ExtensionManifest.current
        sections.append(.init(title: "Manifest", rows: [
            .init("Source", manifest.source == .bundled ? "extension manifest.json" : "built-in model",
                  tone: manifest.source == .bundled ? .normal : .warning),
            .init("Required websites", "\(manifest.requiredHosts.count)"),
            .init("Optional websites", "\(manifest.optionalHosts.count)"),
            .init("APIs", manifest.apiPermissions.isEmpty ? "none" : manifest.apiPermissions.joined(separator: ", ")),
            .init("Matches app model", manifest.matchesAppModel ? "yes" : "no",
                  tone: manifest.matchesAppModel ? .good : .warning),
        ]))

        // MARK: Every origin
        let originRows = HostPermissions.groups.flatMap { group -> [DiagnosticsReport.Row] in
            group.hosts.map { host in
                DiagnosticsReport.Row(
                    host.display,
                    originState(host.origin, snapshot: snapshot),
                    tone: originTone(host.origin, snapshot: snapshot)
                )
            }
        }
        sections.append(.init(title: "Every required origin", rows: originRows))

        // MARK: Transport
        sections.append(.init(title: "Bridge", rows: [
            .init("Transport", "Custom URL scheme \(Tracker.urlScheme)://"),
            .init("App Groups", "not used (keeps SideStore signing simple)", tone: .normal),
            .init("Verification URL", Tracker.verifyURL.absoluteString),
        ]))

        // MARK: App
        sections.append(.init(title: "App", rows: [
            .init("App version", SystemInfo.appVersion),
            .init("Build", SystemInfo.buildNumber),
            .init("iOS", SystemInfo.osVersion),
            .init("Device", SystemInfo.deviceModel),
        ]))

        return DiagnosticsReport(sections: sections)
    }

    private static func originState(_ origin: String, snapshot: PermissionSnapshot?) -> String {
        guard let snapshot, snapshot.isUsable else { return "unknown" }
        return snapshot.isGranted(origin) ? "allowed" : "missing"
    }

    private static func originTone(_ origin: String, snapshot: PermissionSnapshot?) -> DiagnosticsReport.Tone {
        guard let snapshot, snapshot.isUsable else { return .warning }
        return snapshot.isGranted(origin) ? .good : .bad
    }

    private static func tone(for state: ExtensionEnabledState) -> DiagnosticsReport.Tone {
        switch state {
        case .enabled: return .good
        case .disabled: return .bad
        case .unknown: return .warning
        }
    }
}
