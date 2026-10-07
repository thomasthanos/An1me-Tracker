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
                        Text("Allow asks Safari for that group's websites. Safari's All Websites switch also covers them.")
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
        let requestable = model.canRequest(row)
        return HStack(spacing: 8) {
            NavigationLink(value: row.id == PermissionRow.extensionID ? AppRoute.safariExtension : AppRoute.permission(row.id)) {
                SettingsRow(symbol: row.symbol, title: row.title, value: requestable ? nil : row.statusText,
                            valueColor: AppTheme.color(for: row.status),
                            tint: row.status == .missing ? .orange : AppTheme.accent)
            }
            if requestable {
                Button("Allow") { model.request(row) }
                    .buttonStyle(.borderless)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(AppTheme.accent)
                    .accessibilityLabel("Allow \(row.title)")
            }
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

                if model.canRequest(row) {
                    Section {
                        Button {
                            model.request(row)
                        } label: {
                            Label("Allow \(row.title)", systemImage: "checkmark.shield")
                        }
                    } footer: {
                        Text("Opens Safari, where the tracker asks for these websites. The app updates when you come back.")
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
