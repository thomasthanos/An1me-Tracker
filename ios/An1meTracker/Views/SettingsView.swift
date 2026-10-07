//
//  SettingsView.swift
//  An1me Tracker
//
//  Only rows that do something. The tracker's own preferences (fillers, resume, speed, alerts) live in the
//  Safari extension's settings: they change how a watched page behaves, they are stored in the extension,
//  and this app has no way to write them. Offering toggles here would be theatre, so the screen says where
//  they are instead. Permissions, Services and Diagnostics are on the home screen, not repeated here.
//

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator

    var body: some View {
        List {
            Section {
                Button {
                    Task { await coordinator.openExtensionSettings() }
                } label: {
                    Label("Open Extension Settings", systemImage: "gear")
                }

                Button {
                    coordinator.startVerificationInSafari()
                } label: {
                    Label("Verify Access in Safari", systemImage: "arrow.triangle.2.circlepath")
                }

                Button {
                    Task { await coordinator.refresh() }
                } label: {
                    Label {
                        Text("Recheck")
                    } icon: {
                        if coordinator.isRefreshing {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                }
                .disabled(coordinator.isRefreshing)
            } header: {
                Text("Safari")
            } footer: {
                Text("Verify opens an1me.to once; the extension reports what Safari allows back to this app.")
            }

            Section {
                NavigationLink(value: AppRoute.about) {
                    Label("About", systemImage: "info.circle")
                }
            } footer: {
                Text("Speed, fillers, resume, alerts and Copy Guard are extension preferences. Change them in the tracker's popup on an1me.to.")
            }
        }
        .trackerList()
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct AboutView: View {
    var body: some View {
        List {
            Section {
                LabeledContent("Version", value: SystemInfo.appVersion)
                LabeledContent("Build", value: SystemInfo.buildNumber)
                LabeledContent("Safari extension", value: SafariExtensionIdentity.version ?? "Not found")
                LabeledContent("iOS", value: SystemInfo.osVersion)
            } header: {
                Text("An1me Tracker")
            } footer: {
                Text("The tracker runs as a Safari extension inside a small app. This app manages access to it and reports its state.")
            }

            Section {
                Button {
                    SystemLinks.open(Tracker.repositoryURL)
                } label: {
                    Label("GitHub Repository", systemImage: "chevron.left.forwardslash.chevron.right")
                }
                Button {
                    SystemLinks.open(Tracker.privacyURL)
                } label: {
                    Label("Privacy Policy", systemImage: "hand.raised")
                }
            }

            Section {
                Text("Installed with SideStore. Re-signing happens on the device with your own Apple ID; reinstalling over the existing app keeps your library and settings.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } header: {
                Text("Installation")
            }
        }
        .trackerList()
        .navigationTitle("About")
        .navigationBarTitleDisplayMode(.inline)
    }
}
