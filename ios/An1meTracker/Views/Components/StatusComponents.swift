//
//  StatusComponents.swift
//  An1me Tracker
//
//  The two pieces every list screen reuses: the small Settings-style icon tile and a row built on it.
//

import SwiftUI

/// A rounded, filled tile with a white SF Symbol — the icon shape iOS Settings uses. Scales with Dynamic Type.
struct SettingsIcon: View {
    let symbol: String
    var tint: Color = AppTheme.accent
    @ScaledMetric(relativeTo: .body) private var size: CGFloat = 29

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.52, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(tint, in: RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// Icon, title and an optional short trailing value. Wrap it in a NavigationLink for the chevron.
struct SettingsRow: View {
    let symbol: String
    let title: String
    var value: String? = nil
    var valueColor: Color = .secondary
    var tint: Color = AppTheme.accent

    var body: some View {
        HStack(spacing: 12) {
            SettingsIcon(symbol: symbol, tint: tint)
            Text(title)
                .foregroundStyle(.primary)
            Spacer(minLength: 8)
            if let value {
                Text(value)
                    .foregroundStyle(valueColor)
                    .multilineTextAlignment(.trailing)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
