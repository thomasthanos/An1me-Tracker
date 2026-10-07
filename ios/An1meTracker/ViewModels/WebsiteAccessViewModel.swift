//
//  WebsiteAccessViewModel.swift
//  An1me Tracker
//
//  The Permissions screen's presenter. The list of permissions is the extension's real manifest.json
//  (`ExtensionManifest`), split into Required (`permissions`, `host_permissions`) and Optional
//  (`optional_permissions`, `optional_host_permissions`). Wording comes from the generated `HostPermissions`
//  model; state comes only from the extension's dated report and Safari's answer about the extension.
//
//  A value type: it derives everything from the coordinator and owns nothing, so there is no state to
//  republish. See `HomeViewModel` for why that matters.
//

import Foundation

@MainActor
struct WebsiteAccessViewModel {

    let coordinator: PermissionCoordinator
    var manifest: ExtensionManifest { ExtensionManifest.current }

    var assessment: AccessAssessment { coordinator.assessment }
    var isChecking: Bool { coordinator.isRefreshing }

    // MARK: - Summary

    var statusTitle: String {
        switch coordinator.assessment.state {
        case .allowed: return "Allowed"
        case .missing(let origins):
            return origins.count == 1 ? "1 website needs access" : "\(origins.count) websites need access"
        case .unableToVerify(let reason): return reason.title
        }
    }

    var lastVerifiedText: String {
        guard let date = coordinator.assessment.verifiedAt else { return "Never verified" }
        return "Last verified \(RelativeTime.string(since: date))"
    }

    /// Only Safari's own answer confirms the extension. An unknown state stays unconfirmed.
    var extensionConfirmed: Bool { coordinator.extensionState.isEnabled == true }

    // MARK: - Rows

    var requiredRows: [PermissionRow] {
        var rows = [extensionRow]
        if let api = apiRow(manifest.apiPermissions, isRequired: true) { rows.append(api) }
        return rows + hostRows(manifest.requiredHosts, isRequired: true)
    }

    var optionalRows: [PermissionRow] {
        var rows = hostRows(manifest.optionalHosts, isRequired: false)
        if let api = apiRow(manifest.optionalApiPermissions, isRequired: false) { rows.append(api) }
        return rows
    }

    var allRows: [PermissionRow] { requiredRows + optionalRows }

    func row(id: String) -> PermissionRow? { allRows.first { $0.id == id } }

    /// Rows Safari reported as not allowed. Unverified rows are not counted as problems, nor as granted.
    var attentionCount: Int { allRows.filter { $0.status == .missing }.count }

    /// Whether the manifest offers Safari's "All Websites" switch, and whether it is on.
    var offersAllWebsites: Bool { manifest.optionalHostPermissions.contains(where: ExtensionManifest.isBroad) }
    var allWebsitesGranted: Bool? { freshSnapshot?.allWebsites }

    // MARK: - Actions

    /// The one action that moves things forward, or `nil` when nothing needs doing.
    var primaryAction: DashboardAction? {
        if coordinator.extensionState.isEnabled == false { return .enableExtension }
        if !coordinator.assessment.state.missingOrigins.isEmpty { return .allowRequiredAccess }
        if !coordinator.assessment.state.isAllowed { return .verifyAccess }
        return nil
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

    var snapshot: PermissionSnapshot? { coordinator.snapshot }

    // MARK: - Derivation

    /// A reading that may be shown as current: usable, not stale, and not contradicted by Safari.
    private var freshSnapshot: PermissionSnapshot? {
        guard coordinator.extensionState.isEnabled != false,
              let snapshot = coordinator.snapshot,
              snapshot.isUsable,
              !snapshot.isStale
        else { return nil }
        return snapshot
    }

    private var extensionRow: PermissionRow {
        let status: PermissionRow.Status = extensionConfirmed
            ? .granted
            : (coordinator.extensionState.isEnabled == false ? .missing : .unknown)
        let text: String
        switch status {
        case .granted: text = "On"
        case .missing: text = "Off"
        case .unknown: text = "Unknown"
        }
        return PermissionRow(
            id: PermissionRow.extensionID,
            title: "Safari Extension",
            summary: coordinator.extensionState.detail,
            symbol: "puzzlepiece.extension.fill",
            isRequired: true,
            status: status,
            statusText: text,
            items: []
        )
    }

    private func apiRow(_ names: [String], isRequired: Bool) -> PermissionRow? {
        guard !names.isEmpty else { return nil }
        let items = names.map { name in
            PermissionRow.Item(id: name, title: name, detail: Self.apiDescription(name), status: apiStatus(name))
        }
        let status = PermissionRow.combined(items.map(\.status))
        return PermissionRow(
            id: "api:\(isRequired ? "required" : "optional")",
            title: "Extension APIs",
            summary: "Granted by Safari when the extension is installed",
            symbol: "gearshape.2.fill",
            isRequired: isRequired,
            status: status,
            statusText: status == .granted ? "Granted" : PermissionRow.label(for: status),
            items: items
        )
    }

    private func hostRows(_ origins: [String], isRequired: Bool) -> [PermissionRow] {
        var order: [String] = []
        var buckets: [String: [String]] = [:]
        for origin in origins {
            let key = HostPermissions.group(forOrigin: origin)?.id ?? origin
            if buckets[key] == nil { order.append(key) }
            buckets[key, default: []].append(origin)
        }
        return order.map { key -> PermissionRow in
            let members = buckets[key] ?? []
            let group = HostPermissions.groups.first(where: { $0.id == key })
            let items = members.map { origin in
                PermissionRow.Item(
                    id: origin,
                    title: Self.display(origin),
                    detail: group?.hosts.first(where: { $0.origin == origin })?.feature ?? "Declared in manifest.json",
                    status: hostStatus(origin)
                )
            }
            let status = PermissionRow.combined(items.map(\.status))
            return PermissionRow(
                id: "host:\(key)",
                title: group?.title ?? Self.display(key),
                summary: group?.summary ?? "Website access",
                symbol: PermissionRow.symbol(forGroup: group?.id),
                isRequired: isRequired,
                status: status,
                statusText: PermissionRow.label(for: status),
                items: items
            )
        }
    }

    private func hostStatus(_ origin: String) -> PermissionRow.Status {
        guard let snapshot = freshSnapshot else { return .unknown }
        return snapshot.isGranted(origin) ? .granted : .missing
    }

    private func apiStatus(_ name: String) -> PermissionRow.Status {
        guard let granted = freshSnapshot?.grantedPermissions else { return .unknown }
        return granted.contains(name) ? .granted : .missing
    }

    private static func display(_ origin: String) -> String {
        origin.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "/*", with: "")
    }

    private static func apiDescription(_ name: String) -> String {
        switch name {
        case "storage", "unlimitedStorage": return "Library, progress and settings on this device"
        case "alarms": return "Scheduled sync and refresh"
        case "declarativeNetRequestWithHostAccess": return "Request rules for the player and artwork"
        default: return "Declared in manifest.json"
        }
    }
}
