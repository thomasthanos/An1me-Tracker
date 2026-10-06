//
//  SystemInfo.swift
//  An1me Tracker
//
//  Version strings, in one place. `manifest.json` is the version source of truth for the extension; the
//  app's own Info.plist is stamped from it by the release workflow, and the extension bundle carries the
//  same number, so the three cannot disagree on a shipped build.
//

import Foundation

enum SystemInfo {
    static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
    }

    static var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—"
    }

    static var osVersion: String {
        let version = ProcessInfo.processInfo.operatingSystemVersion
        return "\(version.majorVersion).\(version.minorVersion)"
    }

    static var deviceModel: String {
        var info = utsname()
        uname(&info)
        let machine = withUnsafeBytes(of: &info.machine) { raw -> String in
            let bytes = raw.prefix { $0 != 0 }
            return String(decoding: bytes, as: UTF8.self)
        }
        return machine.isEmpty ? "iPhone" : machine
    }

    /// Whether Safari can answer questions about an extension at all. Everything that needs
    /// `SFSafariExtensionManager` is guarded by this, and the UI explains itself when it is false.
    static var supportsExtensionStateQuery: Bool {
        NSClassFromString("SFSafariExtensionManager") != nil
    }
}
