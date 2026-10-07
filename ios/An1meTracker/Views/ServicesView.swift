//
//  ServicesView.swift
//  An1me Tracker
//
//  Reachability of the services the tracker uses, from this iPhone. Not permissions — those are under
//  Permissions — so a blocked website and an outage are never confused.
//

import SwiftUI

struct ServicesView: View {
    @EnvironmentObject private var services: ServiceStatusMonitor

    var body: some View {
        List {
            Section {
                ForEach(services.services) { service in
                    let state = services.state(for: service)
                    SettingsRow(symbol: service.symbol, title: service.name, value: state?.title ?? "—",
                                valueColor: AppTheme.color(for: state), tint: .indigo)
                }
            } footer: {
                Text(footer)
            }
        }
        .trackerList()
        .navigationTitle("Services")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if services.isChecking {
                    ProgressView()
                } else {
                    Button {
                        Task { await services.check() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("Check again")
                }
            }
        }
        .refreshable { await services.check() }
        .task { await services.check() }
    }

    private var footer: String {
        let checked = services.lastChecked.map { " Checked \(RelativeTime.string(since: $0))." } ?? ""
        return "Whether each service answers from this iPhone's network.\(checked)"
    }
}
