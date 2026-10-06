//
//  HomeView.swift
//  An1me Tracker
//
//  The dashboard. It is the whole first-run experience as well: setup steps appear only while setup is
//  incomplete, and disappear once the state is verified.
//

import SwiftUI
import UIKit

struct HomeView: View {
    @EnvironmentObject private var coordinator: PermissionCoordinator
    @StateObject private var model: HomeViewModel

    init(coordinator: PermissionCoordinator) {
        _model = StateObject(wrappedValue: HomeViewModel(coordinator: coordinator))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                statusSection
                if !model.isReady {
                    setupSection
                }
                quickActions
                footer
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("An1me Tracker")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await coordinator.refresh() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 14) {
            appIcon

            VStack(alignment: .leading, spacing: 2) {
                Text("An1me Tracker")
                    .font(.title2.weight(.bold))
                Text("Version \(SystemInfo.appVersion) · Safari extension \(SafariExtensionIdentity.version ?? "—")")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(.top, 4)
        .accessibilityElement(children: .combine)
    }

    private var appIcon: some View {
        Group {
            if let image = UIImage(named: "AppLogo") {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                Image(systemName: "play.tv.fill")
                    .font(.title)
                    .foregroundStyle(AppTheme.accent)
            }
        }
        .frame(width: 58, height: 58)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.5)
        )
        .accessibilityHidden(true)
    }

    // MARK: - Status

    private var statusSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            StatusCard(
                headline: model.headline,
                detail: model.headlineDetail,
                symbol: model.headlineSymbol,
                tone: model.headlineTone,
                rows: model.statusRows
            )

            PrimaryActionButton(action: model.primaryAction, isBusy: model.isChecking) {
                await model.perform(model.primaryAction)
            }
        }
    }

    // MARK: - Setup (only while something is incomplete)

    private var setupSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Set up Safari")
                .font(.headline)

            setupStep(
                number: 1,
                title: "Turn the extension on",
                detail: "Settings → Apps → Safari → Extensions → An1me Tracker.",
                isDone: coordinator.extensionState.isEnabled == true
            )
            setupStep(
                number: 2,
                title: "Allow the websites it uses",
                detail: "On the same page, under Permissions, allow the websites the tracker needs — or turn on All Websites.",
                isDone: coordinator.assessment.state.isAllowed
            )
            setupStep(
                number: 3,
                title: "Verify",
                detail: "Open the site once with verification and the app will show the result.",
                isDone: coordinator.snapshot != nil && !(coordinator.snapshot?.isStale ?? true)
            )

            if model.showsSettingsFallback {
                Button {
                    Task { await model.perform(.allowRequiredAccess) }
                } label: {
                    Label("Open Safari Settings", systemImage: "gear")
                        .font(.subheadline.weight(.medium))
                }
                .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .trackerCard()
    }

    private func setupStep(number: Int, title: String, detail: String, isDone: Bool) -> some View {
        HStack(alignment: .top, spacing: 11) {
            ZStack {
                Circle()
                    .fill(isDone ? Color.green : AppTheme.accent.opacity(0.15))
                    .frame(width: 24, height: 24)
                if isDone {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.black)
                } else {
                    Text("\(number)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.accent)
                }
            }
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Quick actions

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Quick Actions")
                .font(.headline)

            VStack(spacing: 0) {
                quickLink(.websiteAccess, symbol: "lock.shield", title: "Website Access",
                          subtitle: coordinator.assessment.summary)
                Divider()
                quickLink(.safariExtension, symbol: "puzzlepiece.extension", title: "Safari Extension",
                          subtitle: coordinator.extensionState.title)
                Divider()
                quickLink(.diagnostics, symbol: "stethoscope", title: "Diagnostics",
                          subtitle: "Required origins and versions")
                Divider()
                quickLink(.settings, symbol: "gearshape", title: "Settings",
                          subtitle: "Verification and about")
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: AppTheme.cardCorner, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.cardCorner, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5)
            )
        }
    }

    private func quickLink(_ route: AppRoute, symbol: String, title: String, subtitle: String) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.body)
                    .foregroundStyle(AppTheme.accent)
                    .frame(width: 26)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Footer

    private var footer: some View {
        Button {
            coordinator.openSite()
        } label: {
            Label("Open an1me.to", systemImage: "safari")
                .font(.body.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
        }
        .buttonStyle(.bordered)
        .tint(AppTheme.accent)
    }
}
