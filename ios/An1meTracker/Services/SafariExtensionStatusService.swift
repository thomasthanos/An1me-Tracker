//
//  SafariExtensionStatusService.swift
//  An1me Tracker
//
//  Asks Safari whether the extension is enabled.
//
//  `SFSafariExtensionManager` and `SFSafariExtensionState` are public API on iOS 26.2, the app's minimum.
//  They are still reached through `NSClassFromString`/`class_getClassMethod`, so a missing symbol becomes an
//  honest "Safari did not answer" instead of a crash or a made-up "Enabled".
//

import Foundation
import ObjectiveC

/// `Sendable` because the coordinator `await`s it from the main actor. A non-`Sendable` service would have
/// to be sent across an isolation boundary to run its nonisolated async work, which strict concurrency
/// rejects at compile time.
protocol SafariExtensionStatusProviding: Sendable {
    func currentState() async -> ExtensionEnabledState
}

/// A value type with no stored state, and therefore `Sendable` for free.
struct SafariExtensionStatusService: SafariExtensionStatusProviding {

    private typealias GetStateImplementation =
        @convention(c) (AnyObject, Selector, NSString, @escaping @convention(block) (AnyObject?, NSError?) -> Void) -> Void

    private static let selectorName = "getStateOfSafariExtensionWithIdentifier:completionHandler:"

    func currentState() async -> ExtensionEnabledState {
        guard let identifier = SafariExtensionIdentity.bundleIdentifier else {
            return .unknown(.extensionNotFound)
        }
        guard let manager: AnyClass = NSClassFromString("SFSafariExtensionManager") else {
            return .unknown(.queryFailed("SFSafariExtensionManager is unavailable"))
        }
        let selector = NSSelectorFromString(Self.selectorName)
        guard let method = class_getClassMethod(manager, selector) else {
            return .unknown(.queryFailed("SFSafariExtensionManager is unavailable"))
        }

        let answer = await withCheckedContinuation { (continuation: CheckedContinuation<AnyObject?, Never>) in
            let implementation = unsafeBitCast(method_getImplementation(method), to: GetStateImplementation.self)
            implementation(manager as AnyObject, selector, identifier as NSString) { state, error in
                continuation.resume(returning: error == nil ? state : nil)
            }
        }

        guard let state = answer else {
            return .unknown(.queryFailed("no answer from Safari"))
        }
        // Objective-C exposes the property as `enabled` (Swift `isEnabled`); read it through KVC so no
        // compile-time knowledge of SFSafariExtensionState is needed. Casting to NSObject first keeps the
        // KVC call unambiguous rather than relying on dynamic member lookup on AnyObject.
        let enabled = ((state as? NSObject)?.value(forKey: "enabled") as? NSNumber)?.boolValue
        guard let enabled else {
            return .unknown(.queryFailed("unexpected state object"))
        }
        return enabled ? .enabled : .disabled
    }

}
