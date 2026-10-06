//
//  AppTheme.swift
//  An1me Tracker
//
//  Only the few values SwiftUI has no semantic equivalent for. Everything else uses system colours,
//  materials and text styles so light mode, Dark Mode, Dynamic Type and Increase Contrast all work
//  without a second set of rules.
//

import SwiftUI

enum AppTheme {
    /// The tracker's accent, shared with the extension's popup.
    static let accent = Color(red: 84 / 255, green: 210 / 255, blue: 255 / 255)

    static let cardCorner: CGFloat = 18
    static let rowCorner: CGFloat = 12

    /// Semantic tint for a status tone. Uses system colours where one exists so it adapts to appearance.
    static func color(for tone: StatusRow.Tone) -> Color {
        switch tone {
        case .good: return .green
        case .warning: return .orange
        case .bad: return .red
        case .neutral: return .secondary
        }
    }

    static func color(for tone: DiagnosticsReport.Tone) -> Color {
        switch tone {
        case .good: return .green
        case .warning: return .orange
        case .bad: return .red
        case .normal: return .secondary
        }
    }
}

/// The card surface used by the dashboard: a native material, a hairline border and a soft shadow, so it
/// reads as part of the system rather than a web panel.
struct CardBackground: ViewModifier {
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: AppTheme.cardCorner, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.cardCorner, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5)
            )
    }
}

extension View {
    func trackerCard(padding: CGFloat = 16) -> some View {
        modifier(CardBackground(padding: padding))
    }
}
