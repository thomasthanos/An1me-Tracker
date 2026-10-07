//
//  PermissionsView.swift
//  An1me Tracker
//
//  Settings-style list of what the extension's manifest declares, split into Required and Optional. Each
//  row shows only a short state; the websites behind it and what they are for appear on tap. The single
//  action appears only when something actually needs doing.
//

import SwiftUI

struct PermissionsView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator

    private var model: WebsiteAccessViewModel { WebsiteAccessViewModel(coordinator: coordinator) }

    var body: some View {
        List {
            Section("Required") {
                ForEach(model.requiredRows) { row in link(for: row) }
            }

            if !model.optionalRows.isEmpty {
                Section {
                    ForEach(model.optionalRows) { row in link(for: row) }
                } header: {
                    Text("Optional")
                } footer: {
                    if model.offersAllWebsites {
                        Text("Turning on All Websites in Safari covers every optional website.")
                    }
                }
            }

            if let action = model.primaryAction {
                Section {
                    Button {
                        Task { await model.perform(action) }
                    } label: {
                        Label(action.title, systemImage: action.symbol)
                    }
                    .disabled(model.isChecking)
                } footer: {
                    Text(model.lastVerifiedText)
                }
            }
        }
        .trackerList()
        .navigationTitle("Permissions")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if model.isChecking {
                    ProgressView()
                } else {
                    Button {
                        Task { await model.recheck() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("Recheck")
                }
            }
        }
        .refreshable { await model.recheck() }
        .task { await coordinator.refresh() }
    }

    private func link(for row: PermissionRow) -> some View {
        NavigationLink(value: row.id == PermissionRow.extensionID ? AppRoute.safariExtension : AppRoute.permission(row.id)) {
            SettingsRow(symbol: row.symbol, title: row.title, value: row.statusText,
                        valueColor: AppTheme.color(for: row.status),
                        tint: row.status == .missing ? .orange : AppTheme.accent)
        }
    }
}

/// One permission row, opened: what it is for, and each website or API behind it with its own state.
struct PermissionDetailView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator
    let rowID: String

    private var model: WebsiteAccessViewModel { WebsiteAccessViewModel(coordinator: coordinator) }

    var body: some View {
        List {
            if let row = model.row(id: rowID) {
                Section {
                    LabeledContent("Status") {
                        Text(row.statusText).foregroundStyle(AppTheme.color(for: row.status))
                    }
                    LabeledContent("Type", value: row.isRequired ? "Required" : "Optional")
                } footer: {
                    Text(row.summary)
                }

                Section(row.id.hasPrefix("api:") ? "APIs" : "Websites") {
                    ForEach(row.items) { item in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(item.title)
                                    .font(.body.monospaced())
                                Spacer(minLength: 8)
                                Text(PermissionRow.label(for: item.status))
                                    .font(.subheadline)
                                    .foregroundStyle(AppTheme.color(for: item.status))
                            }
                            Text(item.detail)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }

                if row.status == .missing {
                    Section {
                        Button {
                            Task { await coordinator.openExtensionSettings() }
                        } label: {
                            Label("Open Safari Settings", systemImage: "gear")
                        }
                    } footer: {
                        Text("Safari decides website access. Allow it there; the app rechecks when you return.")
                    }
                }
            } else {
                Text("This permission is no longer declared by the extension.")
                    .foregroundStyle(.secondary)
            }
        }
        .trackerList()
        .navigationTitle(model.row(id: rowID)?.title ?? "Permission")
        .navigationBarTitleDisplayMode(.inline)
    }
}
