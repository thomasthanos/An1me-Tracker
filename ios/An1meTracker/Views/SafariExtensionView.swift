//
//  SafariExtensionView.swift
//  An1me Tracker
//
//  Everything the app can honestly say about the extension: whether Safari reports it enabled, what access
//  it has been granted, which build it is, and the two real actions available.
//

import SwiftUI

struct SafariExtensionView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator

    /// Derived on demand from the coordinator the environment publishes.
    private var model: SafariExtensionViewModel { SafariExtensionViewModel(coordinator: coordinator) }

    var body: some View {
        List {
            stateSection
            accessSection
            buildSection
            actionsSection
        }
        .trackerList()
        .navigationTitle("Safari Extension")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.recheck() }
        .task { await coordinator.refresh() }
    }

    private var stateSection: some View {
        Section {
            HStack(spacing: 12) {
                SettingsIcon(symbol: stateSymbol, tint: AppTheme.color(for: stateTone))
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.state.title)
                        .font(.body.weight(.semibold))
                    Text(model.state.detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)

            if let limitation = model.stateLimitation {
                Label(limitation, systemImage: "info.circle")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Status")
        }
    }

    private var accessSection: some View {
        Section {
            HStack {
                Text("Website access")
                Spacer(minLength: 0)
                Text(model.accessSummary)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AppTheme.color(for: model.accessTone))
                    .multilineTextAlignment(.trailing)
            }
            .accessibilityElement(children: .combine)

            HStack {
                Text("Last verified")
                Spacer(minLength: 0)
                Text(model.lastVerifiedText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)

            NavigationLink(value: AppRoute.permissions) {
                Text("Permissions")
            }
        } header: {
            Text("Access")
        }
    }

    private var buildSection: some View {
        Section {
            LabeledContent("Version", value: model.extensionVersion)
            LabeledContent("Bundle", value: model.bundleIdentifier)
        } header: {
            Text("Build")
        }
    }

    private var actionsSection: some View {
        Section {
            Button {
                Task { await model.openSettings() }
            } label: {
                Label("Open Safari Extension Settings", systemImage: "gear")
            }

            Button {
                model.verifyAccess()
            } label: {
                Label("Verify Access in Safari", systemImage: "arrow.triangle.2.circlepath")
            }

            Button {
                Task { await model.recheck() }
            } label: {
                Label("Recheck", systemImage: "arrow.clockwise")
            }
            .disabled(model.isChecking)
        } footer: {
            Text("Safari decides website access. Verify opens an1me.to so the extension can report what Safari allows.")
        }
    }

    private var stateSymbol: String {
        switch model.state {
        case .enabled: return "checkmark.seal.fill"
        case .disabled: return "exclamationmark.triangle.fill"
        case .unknown: return "questionmark.circle.fill"
        }
    }

    private var stateTone: StatusRow.Tone {
        switch model.state {
        case .enabled: return .good
        case .disabled: return .bad
        case .unknown: return .warning
        }
    }
}
