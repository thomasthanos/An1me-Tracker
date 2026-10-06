//
//  SafariExtensionStatusService.swift
//  An1me Tracker
//
//  Asks Safari whether the extension is enabled.
//
//  `SFSafariExtensionManager` and `SFSafariExtensionState` are public API, but only for iOS 26.2 and later.
//  They are reached through `NSClassFromString`/`class_getClassMethod` rather than by importing the symbol:
//  the app still has to build against an SDK that may predate them, and it has to run on iOS 18, where the
//  honest answer is "this system cannot tell you" instead of a made-up "Enabled".
//

import Foundation
import ObjectiveC

protocol SafariExtensionStatusProviding: AnyObject {
    func currentState() async -> ExtensionEnabledState
}

final class SafariExtensionStatusService: SafariExtensionStatusProviding {

    private typealias GetStateImplementation =
        @convention(c) (AnyObject, Selector, NSString, @escaping @convention(block) (AnyObject?, NSError?) -> Void) -> Void

    private static let selectorName = "getStateOfSafariExtensionWithIdentifier:completionHandler:"

    func currentState() async -> ExtensionEnabledState {
        guard let identifier = SafariExtensionIdentity.bundleIdentifier else {
            return .unknown(.extensionNotFound)
        }
        guard let manager: AnyClass = NSClassFromString("SFSafariExtensionManager") else {
            return .unknown(.unsupportedSystem(currentVersion: Self.systemVersion))
        }
        let selector = NSSelectorFromString(Self.selectorName)
        guard let method = class_getClassMethod(manager, selector) else {
            return .unknown(.unsupportedSystem(currentVersion: Self.systemVersion))
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

    private static var systemVersion: String {
        let version = ProcessInfo.processInfo.operatingSystemVersion
        return "\(version.majorVersion).\(version.minorVersion)"
    }
}
