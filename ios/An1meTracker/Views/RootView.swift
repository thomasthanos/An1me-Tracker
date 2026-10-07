//
//  RootView.swift
//  An1me Tracker
//
//  The whole app is one compact, Settings-style screen:
//    header → status → action → services → diagnostics.
//
//  The status says only what the app can prove: whether Safari has the extension switched on, and when the
//  extension last answered from an1me.to. There is no per-website permission list: Safari's per-site
//  switches do not gate what the tracker does in the background, and its permissions API cannot report them
//  truthfully, so a list would show guesses. Settings is offered only when the extension is off.
//

import SwiftUI
import UIKit

struct RootView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator
    @ObservedObject private var services = ServiceStatusMonitor.shared
    @Environment(\.scenePhase) private var scenePhase

    private var status: TrackerStatus { coordinator.status }
    private var isReady: Bool { status.isReady }

    var body: some View {
        List {
            header
            statusSection
            action
            servicesSection
            diagnostics
        }
        .trackerList()
        .tint(AppTheme.accent)
        .preferredColorScheme(.dark)
        .refreshable {
            await coordinator.refresh()
            await services.check()
        }
        .task {
            await coordinator.refresh()
            await services.check()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await coordinator.refresh() }
        }
    }

    // MARK: - Header

    private var header: some View {
        Section {
            VStack(spacing: 10) {
                appIcon
                Text("An1me Tracker")
                    .font(.title2.weight(.bold))
                Text("Version \(SystemInfo.appVersion) · Safari Extension \(SafariExtensionIdentity.version ?? "—")")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
        }
        .listRowBackground(Color.clear)
    }

    private var appIcon: some View {
        Group {
            if let image = UIImage(named: "AppLogo") {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                Image(systemName: "play.tv.fill")
                    .font(.title)
                    .foregroundStyle(AppTheme.accent)
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityHidden(true)
    }

    // MARK: - Status

    private var statusSection: some View {
        Section {
            HStack(spacing: 12) {
                SettingsIcon(symbol: isReady ? "checkmark.seal.fill" : "exclamationmark.triangle.fill",
                             tint: isReady ? .green : .orange)
                VStack(alignment: .leading, spacing: 2) {
                    Text(isReady ? "Ready" : "Setup required")
                        .font(.headline)
                    Text(statusDetail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)

            SettingsRow(symbol: "puzzlepiece.extension.fill", title: "Safari Extension",
                        value: extensionValue,
                        valueColor: status.extensionOn == false ? .orange : .secondary,
                        tint: status.extensionOn == false ? .orange : AppTheme.accent)
            SettingsRow(symbol: "play.rectangle.fill", title: "an1me.to",
                        value: status.siteAccess.title,
                        valueColor: status.siteAccess.isAllowed ? .secondary : .orange,
                        tint: status.siteAccess.isAllowed ? AppTheme.accent : .orange)
        } footer: {
            Text(lastSeenText)
        }
    }

    private var extensionValue: String {
        switch status.extensionOn {
        case .some(true): return "On"
        case .some(false): return "Off"
        case .none: return "Unknown"
        }
    }

    private var statusDetail: String {
        if isReady { return "The extension is on and running on an1me.to." }
        if status.extensionOn == false { return "Turn the Safari extension on." }
        switch status.siteAccess {
        case .notChecked: return "Verify once on an1me.to so the extension can report in."
        case .notSeenRecently: return "The extension hasn't reported in a while. Verify on an1me.to."
        case .allowed, .extensionOff: return coordinator.extensionState.detail
        }
    }

    private var lastSeenText: String {
        guard let report = coordinator.report else { return "Not seen on an1me.to yet." }
        return "Last seen on an1me.to \(RelativeTime.string(since: report.capturedAt))."
    }

    // MARK: - Action (one)

    private var action: some View {
        Section {
            if status.extensionOn == false {
                Button {
                    Task { await coordinator.openExtensionSettings() }
                } label: {
                    Label("Turn On in Settings", systemImage: "gear")
                }
            } else if !status.siteAccess.isAllowed {
                Button {
                    coordinator.verifyInSafari()
                } label: {
                    Label("Verify on an1me.to", systemImage: "checkmark.shield")
                }
            } else {
                Button {
                    coordinator.openSite()
                } label: {
                    Label("Open an1me.to", systemImage: "safari")
                }
            }
        }
    }

    // MARK: - Services

    private var servicesSection: some View {
        Section {
            ForEach(services.services) { service in
                let state = services.state(for: service)
                SettingsRow(symbol: service.symbol, title: service.name, value: state?.title ?? "—",
                            valueColor: state == .offline ? .orange : .secondary,
                            tint: state == .offline ? .orange : .indigo)
            }
        } header: {
            Text("Services")
        } footer: {
            Text(services.summary ?? "Pull down to check.")
        }
    }

    // MARK: - Diagnostics

    private var safariQueryError: String? {
        if case .unknown(.queryFailed(let message)) = coordinator.extensionState { return message }
        return nil
    }

    private var diagnostics: some View {
        Section("Diagnostics") {
            LabeledContent("App", value: "\(SystemInfo.appVersion) (\(SystemInfo.buildNumber))")
            LabeledContent("Extension", value: SafariExtensionIdentity.version ?? "Not found")
            LabeledContent("Safari", value: coordinator.extensionState.title)
            if let message = safariQueryError {
                LabeledContent("Safari query", value: message)
            }
            if let report = coordinator.report {
                LabeledContent("Reported from", value: report.site)
                LabeledContent("Background", value: report.workerError.map { "No answer (\($0))" } ?? "Answered")
            }
            if let error = coordinator.lastBridgeError {
                LabeledContent("Bridge", value: error)
            }
            LabeledContent("iOS", value: "\(SystemInfo.osVersion) · \(SystemInfo.deviceModel)")
        }
    }
}
