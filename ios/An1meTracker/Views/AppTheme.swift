//
//  AppTheme.swift
//  An1me Tracker
//
//  Only the few values SwiftUI has no semantic equivalent for. Everything else uses system colours and
//  text styles so Dynamic Type and Increase Contrast work without a second set of rules. The app is always
//  dark (black grouped background), matching the extension's popup.
//

import SwiftUI

enum AppTheme {
    /// The tracker's accent, shared with the extension's popup.
    static let accent = Color(red: 84 / 255, green: 210 / 255, blue: 255 / 255)
}

extension View {
    /// The black inset-grouped list every screen uses.
    func trackerList() -> some View {
        self
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color.black)
    }
}
