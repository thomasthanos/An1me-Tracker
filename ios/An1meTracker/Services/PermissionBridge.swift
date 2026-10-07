//
//  PermissionBridge.swift
//  An1me Tracker
//
//  The transport between the Safari Web Extension and this app.
//
//  There is no App Group here on purpose. An App Group would need `com.apple.security.application-groups`
//  on both the app and the extension, and this app is distributed unsigned through SideStore, which signs
//  it with the user's own (often free) Apple ID. A capability the profile cannot grant turns into a failed
//  signature, i.e. an app that will not install at all. A custom URL scheme needs no entitlement.
//
//      an1metracker://state?p=<base64url(JSON)>    the extension ran on an1me.to (see ExtensionReport)
//      an1metracker://safari-settings             the popup asks the app to open the extension's settings
//

import Foundation

enum TrackerURLEvent: Equatable {
    case openExtensionSettings
    case report(ExtensionReport)
    case unrecognised
}

enum PermissionBridge {

    /// A report is a few hundred bytes at most; anything near this is not one of ours.
    private static let maxPayloadBytes = 8 * 1024

    static func event(from url: URL) -> TrackerURLEvent {
        guard url.scheme?.lowercased() == Tracker.urlScheme else { return .unrecognised }
        switch url.host?.lowercased() {
        case "safari-settings":
            return .openExtensionSettings
        case "state":
            guard let report = report(from: url) else { return .unrecognised }
            return .report(report)
        default:
            return .unrecognised
        }
    }

    /// Decodes the payload. Returns `nil` for anything it cannot trust, so a truncated, stale or foreign link
    /// never reads as "the extension ran".
    static func report(from url: URL) -> ExtensionReport? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let encoded = components.queryItems?.first(where: { $0.name == "p" })?.value,
              encoded.utf8.count <= maxPayloadBytes,
              let data = decodeBase64URL(encoded),
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }

        // The content script always names the page it ran on; only the tracking site counts.
        guard let site = (payload["site"] as? String)?.lowercased(),
              site == "an1me.to" || site.hasSuffix(".an1me.to")
        else { return nil }

        // A report must carry the moment it was made, and that moment must be now-ish: a replayed or
        // hand-made link must not become a fresh-looking report.
        guard let milliseconds = (payload["capturedAt"] as? NSNumber)?.doubleValue else { return nil }
        let capturedAt = Date(timeIntervalSince1970: milliseconds / 1000)
        guard abs(capturedAt.timeIntervalSinceNow) <= 5 * 60 else { return nil }

        let version = (payload["extensionVersion"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let error = (payload["error"] as? String).map { String($0.prefix(200)) }
        return ExtensionReport(site: site, extensionVersion: version, workerError: error, capturedAt: capturedAt)
    }

    private static func decodeBase64URL(_ value: String) -> Data? {
        var base64 = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        return Data(base64Encoded: base64)
    }
}
