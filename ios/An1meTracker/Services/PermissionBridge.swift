//
//  PermissionBridge.swift
//  An1me Tracker
//
//  The transport between the Safari Web Extension and this app.
//
//  There is no App Group here on purpose. An App Group would need `com.apple.security.application-groups`
//  on both the app and the extension, and this app is distributed unsigned through SideStore, which signs
//  it with the user's own (often free) Apple ID. A capability the profile cannot grant turns into a failed
//  signature, i.e. an app that will not install at all. A custom URL scheme needs no entitlement, works on
//  every supported iOS version, and is a documented, supported way for one app to hand another a payload.
//
//  The scheme therefore carries the extension's own measurement:
//
//      an1metracker://state?p=<base64url(JSON)>
//      an1metracker://safari-settings
//
//  and the app treats what arrives as a dated reading, never as a standing truth.
//

import Foundation

enum TrackerURLEvent: Equatable {
    case openExtensionSettings
    case permissionSnapshot(PermissionSnapshot)
    case unrecognised
}

enum PermissionBridge {

    /// A report is a few hundred bytes at most; anything near this is not one of ours.
    private static let maxPayloadBytes = 32 * 1024

    // MARK: - Reading

    static func event(from url: URL) -> TrackerURLEvent {
        guard url.scheme?.lowercased() == Tracker.urlScheme else { return .unrecognised }
        switch url.host?.lowercased() {
        case "safari-settings":
            return .openExtensionSettings
        case "state":
            guard let snapshot = snapshot(from: url) else { return .unrecognised }
            return .permissionSnapshot(snapshot)
        default:
            return .unrecognised
        }
    }

    /// Decodes the payload the extension attached. Returns `nil` for anything it cannot fully trust, so a
    /// truncated, stale or foreign link can never be shown as a verified reading.
    static func snapshot(from url: URL) -> PermissionSnapshot? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let encoded = components.queryItems?.first(where: { $0.name == "p" })?.value,
              encoded.utf8.count <= maxPayloadBytes,
              let data = decodeBase64URL(encoded)
        else { return nil }

        guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }

        // Both keys are required, and `grantedOrigins` may legitimately be empty: a fresh install with
        // nothing allowed yet is a real reading, not a malformed one. A failure payload omits them, which
        // is how "the extension could not measure this" stays distinguishable from "nothing is allowed".
        guard let granted = payload["grantedOrigins"] as? [String],
              let allWebsites = payload["allWebsites"] as? Bool
        else { return nil }

        let blocked = (payload["blockedOrigins"] as? [String]) ?? []
        let version = payload["extensionVersion"] as? String
        let apiPermissions = payload["grantedPermissions"] as? [String]
        let apiOrigins = payload["apiOrigins"] as? [String]
        let probes = payload["probes"] as? [String: String]

        // Only origins the extension's own manifest can declare may be reported; anything else is forged.
        let allowed = Set(ExtensionManifest.current.requiredHosts
                          + ExtensionManifest.current.optionalHosts
                          + ["<all_urls>", "*://*/*"])
        guard Set(granted).isSubset(of: allowed), Set(blocked).isSubset(of: allowed) else { return nil }

        // A report must carry the moment it was measured. A missing or far-off timestamp is rejected rather
        // than silently replaced with "now", which would turn malformed input into a fresh-looking snapshot.
        guard let milliseconds = (payload["capturedAt"] as? NSNumber)?.doubleValue else { return nil }
        let capturedAt = Date(timeIntervalSince1970: milliseconds / 1000)
        guard abs(capturedAt.timeIntervalSinceNow) <= 5 * 60 else { return nil }

        return PermissionSnapshot(
            grantedOrigins: granted,
            allWebsites: allWebsites,
            blockedOrigins: blocked,
            extensionVersion: version,
            capturedAt: capturedAt,
            grantedPermissions: apiPermissions,
            apiOrigins: apiOrigins,
            probes: probes
        )
    }

    private static func decodeBase64URL(_ value: String) -> Data? {
        var base64 = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        return Data(base64Encoded: base64)
    }

    // MARK: - Writing (the extension does this; the encoder is here so one file owns the format)

    static func url(for snapshot: PermissionSnapshot) -> URL? {
        var payload: [String: Any] = [
            "grantedOrigins": snapshot.grantedOrigins,
            "blockedOrigins": snapshot.blockedOrigins,
            "allWebsites": snapshot.allWebsites,
            "extensionVersion": snapshot.extensionVersion ?? "",
            "capturedAt": snapshot.capturedAt.timeIntervalSince1970 * 1000,
        ]
        if let granted = snapshot.grantedPermissions { payload["grantedPermissions"] = granted }
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return nil }
        let encoded = data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        var components = URLComponents()
        components.scheme = Tracker.urlScheme
        components.host = "state"
        components.queryItems = [URLQueryItem(name: "p", value: encoded)]
        return components.url
    }
}
