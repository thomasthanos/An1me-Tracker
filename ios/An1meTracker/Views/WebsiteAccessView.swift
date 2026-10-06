//
//  WebsiteAccessView.swift
//  An1me Tracker
//
//  Settings → Website Access.
//
//  The screen leads with understandable groups rather than a wall of domains; the raw origins, each with
//  its real state, live behind "Technical Details".
//

import SwiftUI

struct WebsiteAccessView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator
    @StateObject private var model: WebsiteAccessViewModel
    @State private var showsTechnicalDetails = false

    init(coordinator: PermissionCoordinator) {
        _model = StateObject(wrappedValue: WebsiteAccessViewModel(coordinator: coordinator))
    }

    var body: some View {
        List {
            summarySection
            groupsSection
            technicalSection
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Website Access")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.recheck() }
                } label: {
                    if model.isChecking {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .disabled(model.isChecking)
                .accessibilityLabel("Recheck")
            }
        }
        .refreshable { await model.recheck() }
        .task { await coordinator.refresh() }
    }

    // MARK: - Summary

    private var summarySection: some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Circle()
                        .fill(AppTheme.color(for: model.statusTone))
                        .frame(width: 10, height: 10)
                        .accessibilityHidden(true)
                    Text(model.statusTitle)
                        .font(.headline)
                    Spacer(minLength: 0)
                    Text("\(model.assessment.grantedHostCount) / \(model.assessment.totalHostCount)")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)

                Text(model.statusDetail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Text(model.lastVerifiedText)
                    .font(.caption)
                    .foregroundStyle(model.verificationIsStale ? Color.orange : .secondary)

                PrimaryActionButton(action: model.primaryAction, isBusy: model.isChecking) {
                    await model.perform(model.primaryAction)
                }
                .padding(.top, 2)
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - Groups

    private var groupsSection: some View {
        Section {
            ForEach(model.groups) { entry in
                groupRow(entry)
            }
        } header: {
            Text("Categories")
        } footer: {
            Text("An1me Tracker runs on an1me.to only. The services below are read in the background for metadata, artwork and sync.")
        }
    }

    private func groupRow(_ entry: GroupAccess) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol(for: entry.group.id))
                .font(.body)
                .foregroundStyle(AppTheme.color(for: tone(for: entry.state)))
                .frame(width: 28, height: 28)
                .background(
                    AppTheme.color(for: tone(for: entry.state)).opacity(0.14),
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.group.title)
                    .font(.subheadline.weight(.semibold))
                Text(entry.group.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            Text(stateLabel(for: entry))
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.color(for: tone(for: entry.state)))
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Technical details

    private var technicalSection: some View {
        Section {
            DisclosureGroup("Technical Details", isExpanded: $showsTechnicalDetails) {
                ForEach(model.technicalHosts) { host in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 8) {
                            Text(host.display)
                                .font(.footnote.monospaced())
                                .foregroundStyle(.primary)
                            Spacer(minLength: 0)
                            Text(hostLabel(host))
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(color(for: host))
                        }
                        Text(host.feature)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 2)
                    .accessibilityElement(children: .combine)
                }

                if let allWebsites = model.allWebsitesGranted {
                    Divider()
                    HStack {
                        Text("All Websites switch")
                            .font(.footnote)
                        Spacer(minLength: 0)
                        Text(allWebsites ? "on" : "off")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(allWebsites ? .green : .secondary)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        } footer: {
            Text(model.snapshot == nil
                 ? "Nothing has been verified yet, so every website below reads as unknown rather than allowed."
                 : "Measured by the Safari extension with browser.permissions, then handed to this app.")
        }
    }

    // MARK: - Presentation helpers

    private func tone(for state: AccessState) -> StatusRow.Tone {
        switch state {
        case .allowed: return .good
        case .missing: return .bad
        case .unableToVerify: return .warning
        }
    }

    private func stateLabel(for entry: GroupAccess) -> String {
        switch entry.state {
        case .allowed: return "Allowed"
        case .missing(let origins):
            return origins.count == entry.group.hosts.count ? "Missing" : "Partially allowed"
        case .unableToVerify: return "Unable to verify"
        }
    }

    private func hostLabel(_ host: WebsiteAccessViewModel.HostState) -> String {
        switch host.isGranted {
        case .some(true): return "allowed"
        case .some(false): return "missing"
        case .none: return "unknown"
        }
    }

    private func color(for host: WebsiteAccessViewModel.HostState) -> Color {
        switch host.isGranted {
        case .some(true): return .green
        case .some(false): return .red
        case .none: return .secondary
        }
    }

    private func symbol(for groupID: String) -> String {
        switch groupID {
        case "site": return "play.rectangle"
        case "account": return "person.crop.circle.badge.checkmark"
        case "info": return "list.bullet.rectangle"
        case "artwork": return "photo.on.rectangle"
        case "skip": return "forward.end"
        default: return "globe"
        }
    }
}
