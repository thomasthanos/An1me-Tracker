//
//  SceneDelegate.swift
//  An1me Tracker
//
//  Replaces the generated scene delegate (dev/scripts/setup-ios-ui.js): the same window, plus links into the
//  app. The Safari extension opens an1metracker://safari-settings to send the user to its website access
//  settings; Settings can only be opened while the app is on screen, so the link waits until it is.
//

import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?
    private var pendingURL: URL?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard scene is UIWindowScene else { return }
        pendingURL = connectionOptions.urlContexts.first?.url
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        if scene.activationState == .foregroundActive {
            handleTrackerURL(url)
        } else {
            pendingURL = url
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        guard let url = pendingURL else { return }
        pendingURL = nil
        handleTrackerURL(url)
    }
}
