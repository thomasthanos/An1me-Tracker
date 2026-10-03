//
//  ViewController.swift
//  An1me Tracker
//
//  Created for An1me Tracker iOS Safari Extension Host App.
//

import UIKit
import WebKit
import SwiftUI

// MARK: - Root Host View Controller
class ViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        // Configure underlying webView as fallback
        self.webView?.navigationDelegate = self
        self.webView?.configuration.userContentController.add(self, name: "controller")
        if let htmlURL = Bundle.main.url(forResource: "Main", withExtension: "html") {
            self.webView?.loadFileURL(htmlURL, allowingReadAccessTo: Bundle.main.resourceURL ?? htmlURL)
        }

        // Hide storyboard webView since we present the native SwiftUI view
        self.webView?.isHidden = true

        // Host the native SwiftUI UI
        let hostView = UIHostingController(rootView: An1meTrackerAppView())
        addChild(hostView)
        hostView.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hostView.view)

        NSLayoutConstraint.activate([
            hostView.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostView.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostView.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostView.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        hostView.didMove(toParent: self)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Navigation completed
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let command = message.body as? String else { return }
        handleAppAction(command)
    }
}

// MARK: - Global Action Handlers
private func handleAppAction(_ action: String) {
    if action == "open-settings" {
        openSafariSettings()
    } else if action.hasPrefix("open-url:") {
        let rawURL = String(action.dropFirst("open-url:".count))
        if let url = URL(string: rawURL) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
    }
}

private func openSafariSettings() {
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    if let extURL = URL(string: "App-Prefs:Safari&path=WEB_EXTENSIONS"), UIApplication.shared.canOpenURL(extURL) {
        UIApplication.shared.open(extURL, options: [:], completionHandler: nil)
    } else if let safariURL = URL(string: "App-Prefs:Safari"), UIApplication.shared.canOpenURL(safariURL) {
        UIApplication.shared.open(safariURL, options: [:], completionHandler: nil)
    } else if let appSettingsURL = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(appSettingsURL, options: [:], completionHandler: nil)
    }
}

// MARK: - Native SwiftUI Interface
struct An1meTrackerAppView: View {
    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "7.5.2"
    }

    var body: some View {
        ZStack {
            // Background
            Color(red: 9/255, green: 10/255, blue: 16/255)
                .ignoresSafeArea()

            // Ambient background glows
            GeometryReader { proxy in
                Circle()
                    .fill(Color(red: 0/255, green: 229/255, blue: 255/255).opacity(0.12))
                    .frame(width: 280, height: 280)
                    .blur(radius: 60)
                    .offset(x: -60, y: -60)

                Circle()
                    .fill(Color(red: 138/255, green: 43/255, blue: 226/255).opacity(0.12))
                    .frame(width: 280, height: 280)
                    .blur(radius: 70)
                    .offset(x: proxy.size.width - 180, y: proxy.size.height / 3)
            }
            .ignoresSafeArea()

            // Main Content ScrollView
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 20) {
                    // Header / Hero Section
                    headerSection

                    // Quick Action: Primary Setup Button
                    setupActionCard

                    // 3-Step Setup Instructions Card
                    instructionsCard

                    // Features Grid
                    featuresCard

                    // Quick Links
                    quickLinksCard

                    // Footer
                    footerSection
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 36)
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Header
    private var headerSection: some View {
        VStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                appIconImage
                    .frame(width: 96, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color(red: 0/255, green: 229/255, blue: 255/255).opacity(0.7),
                                        Color(red: 138/255, green: 43/255, blue: 226/255).opacity(0.3)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1.5
                            )
                    )
                    .shadow(color: Color(red: 0/255, green: 229/255, blue: 255/255).opacity(0.35), radius: 20, x: 0, y: 8)

                Text("v\(appVersion)")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundColor(.black)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color(red: 0/255, green: 229/255, blue: 255/255))
                    .clipShape(Capsule())
                    .offset(x: 4, y: 4)
            }

            Text("An1me Tracker")
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundColor(.white)

            HStack(spacing: 6) {
                Circle()
                    .fill(Color(red: 52/255, green: 199/255, blue: 89/255))
                    .frame(width: 7, height: 7)
                Text("SAFARI WEB EXTENSION")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(red: 0/255, green: 229/255, blue: 255/255))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(Color(red: 0/255, green: 229/255, blue: 255/255).opacity(0.1))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Color(red: 0/255, green: 229/255, blue: 255/255).opacity(0.25), lineWidth: 1)
            )

            Text("Auto-tracking, cloud sync & episode progress for an1me.to")
                .font(.system(size: 13, weight: .regular))
                .foregroundColor(Color.white.opacity(0.65))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
        }
    }

    private var appIconImage: some View {
        Group {
            if let image = UIImage(named: "AppLogo") ?? UIImage(contentsOfFile: Bundle.main.path(forResource: "Icon", ofType: "png") ?? "") {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                ZStack {
                    Color.black
                    Image(systemName: "tv.fill")
                        .font(.system(size: 40))
                        .foregroundColor(Color(red: 0/255, green: 229/255, blue: 255/255))
                }
            }
        }
    }

    // MARK: - Setup Action Card
    private var setupActionCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("QUICK SETUP")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color.white.opacity(0.6))
                    .tracking(1)

                Spacer()

                Text("STEP 1 OF 3")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(red: 0/255, green: 229/255, blue: 255/255))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color(red: 0/255, green: 229/255, blue: 255/255).opacity(0.12))
                    .clipShape(Capsule())
            }

            Button(action: {
                openSafariSettings()
            }) {
                HStack(spacing: 12) {
                    Image(systemName: "gearshape.fill")
                        .font(.system(size: 17, weight: .bold))
                    Text("Open Safari Settings")
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                    Spacer()
                    Image(systemName: "arrow.up.forward.app.fill")
                        .font(.system(size: 14))
                        .opacity(0.8)
                }
                .foregroundColor(.black)
                .padding(.horizontal, 18)
                .padding(.vertical, 15)
                .background(
                    LinearGradient(
                        colors: [
                            Color(red: 0/255, green: 229/255, blue: 255/255),
                            Color(red: 20/255, green: 170/255, blue: 255/255)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                .shadow(color: Color(red: 0/255, green: 229/255, blue: 255/255).opacity(0.35), radius: 10, x: 0, y: 4)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(red: 15/255, green: 20/255, blue: 32/255).opacity(0.75))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(Color(red: 0/255, green: 229/255, blue: 255/255).opacity(0.25), lineWidth: 1)
                )
        )
    }

    // MARK: - Step Instructions
    private var instructionsCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("HOW TO ENABLE")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color.white.opacity(0.6))
                .tracking(1)

            stepRow(
                number: "1",
                title: "Open Safari Settings",
                detail: "Open iOS Settings → Safari → Extensions"
            )

            stepRow(
                number: "2",
                title: "Enable An1me Tracker",
                detail: "Find An1me Tracker in the list and toggle ON"
            )

            stepRow(
                number: "3",
                title: "Allow Site Permissions",
                detail: "Tap Permissions → set to 'Always Allow' for an1me.to"
            )
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(white: 1.0, opacity: 0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(Color(white: 1.0, opacity: 0.08), lineWidth: 1)
                )
        )
    }

    private func stepRow(number: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(number)
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundColor(Color(red: 0/255, green: 229/255, blue: 255/255))
                .frame(width: 24, height: 24)
                .background(Color(red: 0/255, green: 229/255, blue: 255/255).opacity(0.15))
                .clipShape(Circle())
                .overlay(Circle().stroke(Color(red: 0/255, green: 229/255, blue: 255/255).opacity(0.3), lineWidth: 1))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                Text(detail)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundColor(Color.white.opacity(0.55))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(white: 1.0, opacity: 0.02))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // MARK: - Features Showcase
    private var featuresCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("EXTENSION FEATURES")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color.white.opacity(0.6))
                .tracking(1)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                featureItem(
                    icon: "play.circle.fill",
                    color: Color(red: 0/255, green: 229/255, blue: 255/255),
                    title: "Auto Tracking",
                    subtitle: "Auto-detects episode progress"
                )

                featureItem(
                    icon: "icloud.fill",
                    color: Color(red: 175/255, green: 82/255, blue: 222/255),
                    title: "Cloud Sync",
                    subtitle: "Sync with PC & other devices"
                )

                featureItem(
                    icon: "checkmark.seal.fill",
                    color: Color(red: 52/255, green: 199/255, blue: 89/255),
                    title: "AniList & MAL",
                    subtitle: "Auto-update list scores"
                )

                featureItem(
                    icon: "bolt.fill",
                    color: Color(red: 255/255, green: 149/255, blue: 0/255),
                    title: "Speed Controller",
                    subtitle: "Playback controls & skip"
                )
            }
        }
    }

    private func featureItem(icon: String, color: Color, title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundColor(color)

            Text(title)
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundColor(.white)

            Text(subtitle)
                .font(.system(size: 10, weight: .regular))
                .foregroundColor(Color.white.opacity(0.5))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(white: 1.0, opacity: 0.04))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color(white: 1.0, opacity: 0.06), lineWidth: 1)
        )
    }

    // MARK: - Quick Links
    private var quickLinksCard: some View {
        VStack(spacing: 8) {
            linkButton(
                title: "Launch an1me.to in Safari",
                subtitle: "Open the website directly",
                icon: "safari.fill",
                accentColor: Color(red: 0/255, green: 229/255, blue: 255/255)
            ) {
                if let url = URL(string: "https://an1me.to") {
                    UIApplication.shared.open(url, options: [:], completionHandler: nil)
                }
            }

            linkButton(
                title: "GitHub Repository",
                subtitle: "View source code & releases",
                icon: "chevron.left.forwardslash.chevron.right",
                accentColor: Color.white.opacity(0.8)
            ) {
                if let url = URL(string: "https://github.com/thomasthanos/an1me-extensions") {
                    UIApplication.shared.open(url, options: [:], completionHandler: nil)
                }
            }
        }
    }

    private func linkButton(title: String, subtitle: String, icon: String, accentColor: Color, action: @escaping () -> Void) -> some View {
        Button(action: {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        }) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(accentColor.opacity(0.12))
                        .frame(width: 34, height: 34)
                    Image(systemName: icon)
                        .font(.system(size: 15))
                        .foregroundColor(accentColor)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundColor(Color.white.opacity(0.5))
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color.white.opacity(0.3))
            }
            .padding(12)
            .background(Color(white: 1.0, opacity: 0.04))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color(white: 1.0, opacity: 0.06), lineWidth: 1)
            )
        }
    }

    // MARK: - Footer
    private var footerSection: some View {
        VStack(spacing: 4) {
            Text("An1me Tracker v\(appVersion) • Safari Web Extension")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color.white.opacity(0.4))

            Text("Built for SideStore & AltStore on iOS 15+")
                .font(.system(size: 10))
                .foregroundColor(Color.white.opacity(0.25))
        }
        .padding(.top, 8)
    }
}
