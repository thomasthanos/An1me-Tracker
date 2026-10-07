//
//  RootView.swift
//  An1me Tracker
//
//  The whole app is one screen, in this order:
//    logo → title → description → permissions → permissions that need approval → diagnostics.
//
//  Approving a permission never sends the user to Safari Settings: the button opens the extension's own
//  grant page, whose one tap calls `browser.permissions.request()` and makes Safari show its native
//  "would like to access …" sheet. Settings is only ever offered for the one thing only Safari can do —
//  switching the extension itself on.
//

import SwiftUI
import UIKit

struct RootView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator
    @Environment(\.scenePhase) private var scenePhase

    /// Derived on demand from the coordinator the environment publishes.
    private var model: WebsiteAccessViewModel { WebsiteAccessViewModel(coordinator: coordinator) }

    /// The rows the user actually sees: the extension itself plus the five website groups. API rows are
    /// granted by Safari at install and are noise here, so they are left out.
    private var visibleRows: [PermissionRow] {
        model.allRows.filter { $0.id == PermissionRow.extensionID || $0.id.hasPrefix("host:") }
    }

    private var pendingRows: [PermissionRow] {
        model.allRows.filter { model.canRequest($0) }
    }

    private var isReady: Bool { coordinator.assessment.isReady }

    var body: some View {
        List {
            header
            status
            permissions
            if !pendingRows.isEmpty { approvals }
            diagnostics
        }
        .trackerList()
        .tint(AppTheme.accent)
        .preferredColorScheme(.dark)
        .task { await coordinator.refresh() }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await coordinator.refresh() }
        }
    }

    // MARK: - Header

    private var header: some View {
        Section {
            VStack(spacing: 12) {
                appIcon
                Text("An1me Tracker")
                    .font(.title2.weight(.bold))
                Text("Automatic progress tracking and playback speed for an1me.to.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
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
        .frame(width: 64, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityHidden(true)
    }

    // MARK: - Status

    private var status: some View {
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

            if coordinator.extensionState.isEnabled == false {
                Button {
                    Task { await coordinator.openExtensionSettings() }
                } label: {
                    Label("Turn the extension on", systemImage: "gear")
                }
            }
        }
    }

    private var statusDetail: String {
        if isReady { return "Everything the tracker needs is allowed." }
        return model.statusTitle
    }

    // MARK: - Permissions

    private var permissions: some View {
        Section("Permissions") {
            ForEach(visibleRows) { row in
                SettingsRow(symbol: row.symbol,
                            title: row.title,
                            value: row.statusText,
                            valueColor: AppTheme.color(for: row.status),
                            tint: row.status == .missing ? .orange : AppTheme.accent)
            }
        } footer: {
            Text(model.lastVerifiedText)
        }
    }

    // MARK: - Permissions that need approval

    private var approvals: some View {
        Section("Needs approval") {
            ForEach(pendingRows) { row in
                Button {
                    model.request(row)
                } label: {
                    SettingsRow(symbol: row.symbol,
                                title: row.title,
                                value: "Approve",
                                tint: AppTheme.accent)
                }
            }
        } footer: {
            Text("Safari asks once, on this device. Each button shows Safari's own permission sheet.")
        }
    }

    // MARK: - Diagnostics

    private var diagnostics: some View {
        Section("Diagnostics") {
            LabeledContent("Extension", value: coordinator.extensionState.title)
            LabeledContent("App", value: SystemInfo.appVersion)
            LabeledContent("Extension version", value: SafariExtensionIdentity.version ?? "—")
            LabeledContent("Last verified", value: model.lastVerifiedText)

            if coordinator.isRefreshing {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
            } else {
                Button {
                    Task { await coordinator.refresh() }
                } label: {
                    Label("Recheck", systemImage: "arrow.clockwise")
                }
            }
        }
    }
}
