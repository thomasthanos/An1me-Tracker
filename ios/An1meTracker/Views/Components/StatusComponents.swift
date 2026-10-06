//
//  StatusComponents.swift
//  An1me Tracker
//
//  The two pieces both the dashboard and the permission screens reuse: a tone-carrying status row and the
//  single primary action button.
//

import SwiftUI

/// A symbol, a label and a value, with a tone that is always derived from a verified state.
struct StatusRowView: View {
    let row: StatusRow

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: row.symbol)
                .font(.body)
                .foregroundStyle(AppTheme.color(for: row.tone))
                .frame(width: 26, height: 26)
                .background(AppTheme.color(for: row.tone).opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(row.value)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
        // One element for VoiceOver: the tone is already carried by the value's wording.
        .accessibilityElement(children: .combine)
    }
}

/// The headline of the dashboard: state, one sentence, and the action that changes it.
struct StatusCard: View {
    let headline: String
    let detail: String
    let symbol: String
    let tone: StatusRow.Tone
    let rows: [StatusRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.title2)
                    .foregroundStyle(AppTheme.color(for: tone))
                    .symbolRenderingMode(.hierarchical)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 3) {
                    Text(headline)
                        .font(.title3.weight(.bold))
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)

            if !rows.isEmpty {
                Divider().opacity(0.5)
                VStack(spacing: 2) {
                    ForEach(rows) { row in
                        StatusRowView(row: row)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .trackerCard()
    }
}

/// The one prominent action on a screen. Kept separate so every screen offers the same affordance.
struct PrimaryActionButton: View {
    let action: DashboardAction
    let isBusy: Bool
    let perform: () async -> Void

    var body: some View {
        Button {
            Task { await perform() }
        } label: {
            HStack(spacing: 8) {
                if isBusy {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: action.symbol)
                }
                Text(isBusy ? "Checking…" : action.title)
                    .font(.body.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
        }
        .buttonStyle(.borderedProminent)
        .tint(AppTheme.accent)
        .disabled(isBusy)
    }
}
