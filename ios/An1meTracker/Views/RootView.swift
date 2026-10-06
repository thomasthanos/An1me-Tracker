//
//  RootView.swift
//  An1me Tracker
//
//  The navigation shell. Home is the root and everything else is pushed onto it, so the user always has a
//  way back to the dashboard that states whether anything needs attention.
//

import SwiftUI

enum AppRoute: Hashable {
    case websiteAccess
    case safariExtension
    case diagnostics
    case settings
    case about
}

struct RootView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            HomeView(coordinator: coordinator)
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .websiteAccess:
                        WebsiteAccessView(coordinator: coordinator)
                    case .safariExtension:
                        SafariExtensionView(coordinator: coordinator)
                    case .diagnostics:
                        DiagnosticsView(coordinator: coordinator)
                    case .settings:
                        SettingsView()
                    case .about:
                        AboutView()
                    }
                }
        }
        .tint(AppTheme.accent)
        // Refresh on launch and every time the app comes back — including a return from Settings, which is
        // where a permission is actually changed.
        .task { await coordinator.refresh() }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await coordinator.refresh() }
        }
    }
}
