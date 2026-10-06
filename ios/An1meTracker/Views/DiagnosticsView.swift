//
//  DiagnosticsView.swift
//  An1me Tracker
//
//  A read-only view of what the app knows. No account data, no library contents, no tokens.
//

import SwiftUI
import UIKit

struct DiagnosticsView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator
    @State private var didCopy = false

    /// Derived on demand from the coordinator the environment publishes.
    private var model: DiagnosticsViewModel { DiagnosticsViewModel(coordinator: coordinator) }

    var body: some View {
        List {
            ForEach(model.report.sections) { section in
                Section(section.title) {
                    ForEach(section.rows) { row in
                        HStack(alignment: .top) {
                            Text(row.label)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            Spacer(minLength: 10)
                            Text(row.value)
                                .font(.footnote.monospaced())
                                .foregroundStyle(AppTheme.color(for: row.tone))
                                .multilineTextAlignment(.trailing)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }

            Section {
                Button {
                    Task { await model.refresh() }
                } label: {
                    Label("Recheck everything", systemImage: "arrow.clockwise")
                }
                .disabled(model.isChecking)

                Button {
                    model.verifyAccess()
                } label: {
                    Label("Verify Access in Safari", systemImage: "arrow.triangle.2.circlepath")
                }

                Button {
                    copyReport()
                } label: {
                    Label(didCopy ? "Copied" : "Copy report", systemImage: didCopy ? "checkmark" : "doc.on.doc")
                }

                Button(role: .destructive) {
                    model.clearCache()
                } label: {
                    Label("Clear cached reading", systemImage: "trash")
                }
            } footer: {
                Text("Clearing the cached reading only removes what this app stored. It never changes what Safari allows, and it does not touch your library.")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Diagnostics")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.refresh() }
        .task { await coordinator.refresh() }
    }

    private func copyReport() {
        let text = model.report.sections
            .map { section in
                ([section.title] + section.rows.map { "  \($0.label): \($0.value)" }).joined(separator: "\n")
            }
            .joined(separator: "\n\n")
        UIPasteboard.general.string = text
        didCopy = true
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            didCopy = false
        }
    }
}
