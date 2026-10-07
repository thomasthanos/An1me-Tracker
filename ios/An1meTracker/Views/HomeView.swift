//
//  HomeView.swift
//  An1me Tracker
//
//  The home screen: one small status section (Ready, or Setup required with the single action that fixes
//  it), the inset list of screens, and Open an1me.to. Details live one tap away, never repeated here.
//

import SwiftUI
import UIKit

struct HomeView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator
    @EnvironmentObject private var services: ServiceStatusMonitor

    /// Derived on demand from the coordinator the environment publishes. Nothing here is stored, so the
    /// screen cannot show a value that has drifted from the object that owns the state.
    private var model: HomeViewModel { HomeViewModel(coordinator: coordinator) }

    var body: some View {
        List {
            statusSection

            Section {
                NavigationLink(value: AppRoute.permissions) {
                    SettingsRow(symbol: "lock.shield.fill", title: "Permissions", value: model.permissionsValue,
                                valueColor: model.permissionsValue.hasSuffix("to fix") ? .orange : .secondary)
                }
                NavigationLink(value: AppRoute.services) {
                    SettingsRow(symbol: "server.rack", title: "Services", value: services.summary, tint: .indigo)
                }
                NavigationLink(value: AppRoute.diagnostics) {
                    SettingsRow(symbol: "stethoscope", title: "Diagnostics", tint: .teal)
                }
                NavigationLink(value: AppRoute.settings) {
                    SettingsRow(symbol: "gearshape.fill", title: "Settings", tint: .gray)
                }
            }

            Section {
                Button {
                    coordinator.openSite()
                } label: {
                    Label("Open an1me.to", systemImage: "safari")
                }
            }
        }
        .trackerList()
        .navigationTitle("An1me Tracker")
        .navigationBarTitleDisplayMode(.large)
        .refreshable {
            await coordinator.refresh()
            await services.check()
        }
        .task {
            if services.lastChecked == nil { await services.check() }
        }
    }

    // MARK: - Status

    @ViewBuilder
    private var statusSection: some View {
        if model.isReady {
            Section {
                ForEach(model.readyRows) { row in
                    SettingsRow(symbol: row.symbol, title: row.title, value: row.value,
                                tint: AppTheme.color(for: row.tone))
                }
            } header: {
                versionHeader
            }
        } else {
            Section {
                HStack(spacing: 12) {
                    SettingsIcon(symbol: "exclamationmark.triangle.fill", tint: .orange)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.headline)
                            .font(.headline)
                        Text(model.attentionDetail)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)

                Button {
                    Task { await model.perform(model.setupAction) }
                } label: {
                    HStack {
                        Spacer(minLength: 0)
                        if model.isChecking {
                            ProgressView()
                        } else {
                            Text(DashboardAction.allowRequiredAccess.title)
                                .fontWeight(.semibold)
                        }
                        Spacer(minLength: 0)
                    }
                }
                .disabled(model.isChecking)
            } header: {
                versionHeader
            }
        }
    }

    /// "Version X · Safari Extension Y", read from the app's and the extension's own bundles.
    private var versionHeader: some View {
        Text("Version \(SystemInfo.appVersion) · Safari Extension \(SafariExtensionIdentity.version ?? "—")")
            .textCase(nil)
    }
}
