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
    @StateObject private var model: SafariExtensionViewModel

    init(coordinator: PermissionCoordinator) {
        _model = StateObject(wrappedValue: SafariExtensionViewModel(coordinator: coordinator))
    }

    var body: some View {
        List {
            stateSection
            accessSection
            buildSection
            actionsSection
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Safari Extension")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.recheck() }
        .task { await coordinator.refresh() }
    }

    private var stateSection: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: stateSymbol)
                    .font(.title3)
                    .foregroundStyle(AppTheme.color(for: stateTone))
                    .frame(width: 32, height: 32)
                    .background(
                        AppTheme.color(for: stateTone).opacity(0.14),
                        in: RoundedRectangle(cornerRadius: 9, style: .continuous)
                    )
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.state.title)
                        .font(.headline)
                    Text(model.state.detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 4)
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

            NavigationLink(value: AppRoute.websiteAccess) {
                Text("Manage website access")
            }
        } header: {
            Text("Access")
        }
    }

    private var buildSection: some View {
        Section {
            LabeledContent("Version", value: model.extensionVersion)
            LabeledContent("Bundle", value: model.bundleIdentifier)
            LabeledContent("State API", value: model.canQueryState ? "Available" : "Not on this iOS version")
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
            Text("Safari decides website access; no app can grant it for you. “Verify Access in Safari” opens the site so the extension can measure what Safari has actually allowed and report it back.")
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
