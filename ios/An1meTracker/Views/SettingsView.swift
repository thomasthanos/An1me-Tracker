//
//  SettingsView.swift
//  An1me Tracker
//
//  Only rows that do something. The tracker's own preferences (fillers, resume, speed, alerts) live in the
//  Safari extension's settings: they change how a watched page behaves, they are stored in the extension,
//  and this app has no way to write them. Offering toggles here would be theatre, so the screen says where
//  they are instead and links to the page that owns them.
//

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator
    @State private var isChecking = false

    var body: some View {
        List {
            Section {
                NavigationLink(value: AppRoute.websiteAccess) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Website Access")
                            Text(coordinator.assessment.summary)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "lock.shield").foregroundStyle(AppTheme.accent)
                    }
                }

                NavigationLink(value: AppRoute.safariExtension) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Safari Extension")
                            Text(coordinator.extensionState.title)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "puzzlepiece.extension").foregroundStyle(AppTheme.accent)
                    }
                }
            } header: {
                Text("Safari")
            }

            Section {
                Button {
                    coordinator.startVerificationInSafari()
                } label: {
                    Label("Verify Access in Safari", systemImage: "arrow.triangle.2.circlepath")
                }

                Button {
                    Task {
                        isChecking = true
                        await coordinator.refresh()
                        isChecking = false
                    }
                } label: {
                    Label {
                        Text("Recheck")
                    } icon: {
                        if isChecking {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                }
                .disabled(isChecking)
            } header: {
                Text("Verification")
            } footer: {
                Text("Verification opens an1me.to once. The extension measures what Safari allows and hands the result back to this app.")
            }

            Section {
                Button {
                    Task { await coordinator.openExtensionSettings() }
                } label: {
                    Label("Open Extension Settings", systemImage: "gear")
                }

                NavigationLink(value: AppRoute.diagnostics) {
                    Label("Diagnostics", systemImage: "stethoscope")
                }

                NavigationLink(value: AppRoute.about) {
                    Label("About", systemImage: "info.circle")
                }
            } header: {
                Text("Support")
            } footer: {
                Text("Speed, fillers, resume, alerts and Copy Guard are extension preferences. Open the tracker's popup on an1me.to to change them — they are stored by the extension, not by this app.")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task { await coordinator.refresh() }
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
        .listStyle(.insetGrouped)
        .navigationTitle("About")
        .navigationBarTitleDisplayMode(.inline)
    }
}
