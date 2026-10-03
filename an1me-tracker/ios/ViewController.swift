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
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "7.5.5"
    }

    @State private var selectedGuideTab: Int = 0 // 0: In Safari (iOS 17+), 1: Settings App
    @State private var step1Done: Bool = false
    @State private var step2Done: Bool = false
    @State private var step3Done: Bool = false

    private var completedCount: Int {
        (step1Done ? 1 : 0) + (step2Done ? 1 : 0) + (step3Done ? 1 : 0)
    }

    var body: some View {
        ZStack {
            // Dark liquid canvas background
            Color(red: 6/255, green: 9/255, blue: 18/255)
                .ignoresSafeArea()

            // Dynamic ambient light blooms
            GeometryReader { proxy in
                Circle()
                    .fill(Color(red: 84/255, green: 210/255, blue: 255/255).opacity(0.15))
                    .frame(width: 320, height: 320)
                    .blur(radius: 80)
                    .offset(x: -80, y: -60)

                Circle()
                    .fill(Color(red: 164/255, green: 119/255, blue: 255/255).opacity(0.12))
                    .frame(width: 340, height: 340)
                    .blur(radius: 90)
                    .offset(x: proxy.size.width - 200, y: proxy.size.height / 3)
            }
            .ignoresSafeArea()

            // Main Content ScrollView
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 20) {
                    // Header / Hero Section
                    headerSection

                    // Quick Glass Action Buttons
                    quickActionsGrid

                    // Interactive Step Guide (In-Safari vs iOS 18 Settings)
                    interactiveGuideCard

                    // Features Grid
                    featuresCard

                    // Quick Links
                    quickLinksCard

                    // Footer
                    footerSection
                }
                .padding(.horizontal, 18)
                .padding(.top, 14)
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
                                        Color.white.opacity(0.4),
                                        Color(red: 84/255, green: 210/255, blue: 255/255).opacity(0.6),
                                        Color.white.opacity(0.1)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1.2
                            )
                    )
                    .shadow(color: Color(red: 84/255, green: 210/255, blue: 255/255).opacity(0.28), radius: 24, x: 0, y: 8)

                Text("v\(appVersion)")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundColor(Color.black)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2.5)
                    .background(
                        Capsule()
                            .fill(Color(red: 84/255, green: 210/255, blue: 255/255))
                            .shadow(color: Color(red: 84/255, green: 210/255, blue: 255/255).opacity(0.4), radius: 6, x: 0, y: 2)
                    )
                    .offset(x: 4, y: 4)
            }

            Text("An1me Tracker")
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundColor(.white)

            HStack(spacing: 7) {
                Circle()
                    .fill(Color(red: 52/255, green: 211/255, blue: 153/255))
                    .frame(width: 7, height: 7)
                    .shadow(color: Color(red: 52/255, green: 211/255, blue: 153/255).opacity(0.7), radius: 4)
                Text("SAFARI EXTENSION ACTIVE")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(red: 84/255, green: 210/255, blue: 255/255))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(Color.white.opacity(0.06))
                    .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
            )

            Text("Αυτόματη καταγραφή προόδου, συγχρονισμός cloud & παράκαμψη filler στο an1me.to")
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
                        .foregroundColor(Color(red: 84/255, green: 210/255, blue: 255/255))
                }
            }
        }
    }

    // MARK: - Quick Glass Actions (Launch an1me.to & Settings)
    private var quickActionsGrid: some View {
        HStack(spacing: 12) {
            Button(action: {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                if let url = URL(string: "https://an1me.to") {
                    UIApplication.shared.open(url, options: [:], completionHandler: nil)
                }
            }) {
                HStack(spacing: 10) {
                    Image(systemName: "safari.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color(red: 84/255, green: 210/255, blue: 255/255))
                    Text("Άνοιγμα an1me.to")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(red: 84/255, green: 210/255, blue: 255/255).opacity(0.18),
                                    Color(red: 164/255, green: 119/255, blue: 255/255).opacity(0.12)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(
                                    LinearGradient(
                                        colors: [Color.white.opacity(0.28), Color(red: 84/255, green: 210/255, blue: 255/255).opacity(0.3)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    ),
                                    lineWidth: 1
                                )
                        )
                        .shadow(color: Color(red: 84/255, green: 210/255, blue: 255/255).opacity(0.2), radius: 10, x: 0, y: 4)
                )
            }

            Button(action: {
                openSafariSettings()
            }) {
                HStack(spacing: 10) {
                    Image(systemName: "gearshape.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(Color(red: 190/255, green: 155/255, blue: 255/255))
                    Text("Ρυθμίσεις Safari")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color.white.opacity(0.06))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(Color.white.opacity(0.12), lineWidth: 1)
                        )
                )
            }
        }
    }

    // MARK: - Interactive Activation Guide Card
    private var interactiveGuideCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Header with progress pill
            HStack {
                Text("ΟΔΗΓΟΣ ΕΝΕΡΓΟΠΟΙΗΣΗΣ")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color.white.opacity(0.55))
                    .tracking(1)

                Spacer()

                HStack(spacing: 4) {
                    if completedCount == 3 {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 11))
                            .foregroundColor(Color(red: 52/255, green: 211/255, blue: 153/255))
                    }
                    Text("\(completedCount)/3 Ολοκληρώθηκαν")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundColor(completedCount == 3 ? Color(red: 52/255, green: 211/255, blue: 153/255) : Color(red: 84/255, green: 210/255, blue: 255/255))
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 3.5)
                .background(
                    Capsule()
                        .fill(completedCount == 3 ? Color(red: 52/255, green: 211/255, blue: 153/255).opacity(0.15) : Color.white.opacity(0.06))
                        .overlay(Capsule().stroke(completedCount == 3 ? Color(red: 52/255, green: 211/255, blue: 153/255).opacity(0.3) : Color.white.opacity(0.1), lineWidth: 1))
                )
            }

            // Segmented Mode Switcher (In-Safari vs iOS 27 Settings)
            HStack(spacing: 4) {
                guideTabButton(title: "⚡ Μέσα στο Safari", badge: "iOS 27", index: 0)
                guideTabButton(title: "⚙️ Ρυθμίσεις iOS 27", badge: nil, index: 1)
            }
            .padding(3)
            .background(
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .fill(Color.black.opacity(0.35))
                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
            )

            // Step Rows
            if selectedGuideTab == 0 {
                // Method 1: Inside Safari (Modern & Fast)
                VStack(spacing: 8) {
                    interactiveStepRow(
                        index: 0,
                        number: "1",
                        isDone: step1Done,
                        title: "Άνοιξε το an1me.to στο Safari",
                        detail: "Πάτα στο κουμπί της επέκτασης (εικονίδιο παζλ 🧩 ή aA) στη γραμμή διευθύνσεων του Safari."
                    ) {
                        step1Done.toggle()
                    }

                    interactiveStepRow(
                        index: 1,
                        number: "2",
                        isDone: step2Done,
                        title: "Διαχείριση Επεκτάσεων",
                        detail: "Επίλεξε «Διαχείριση επεκτάσεων» (Manage Extensions) και ενεργοποίησε το An1me Tracker σε ON."
                    ) {
                        step2Done.toggle()
                    }

                    interactiveStepRow(
                        index: 2,
                        number: "3",
                        isDone: step3Done,
                        title: "Δικαιώματα: «Πάντα να επιτρέπεται»",
                        detail: "Πάτα ξανά στο μπλε εικονίδιο 🧩 στο an1me.to και πάτα «Να επιτρέπεται πάντα σε αυτόν τον ιστότοπο»."
                    ) {
                        step3Done.toggle()
                    }
                }
            } else {
                // Method 2: System Settings App (iOS 27)
                VStack(spacing: 8) {
                    interactiveStepRow(
                        index: 0,
                        number: "1",
                        isDone: step1Done,
                        title: "Ρυθμίσεις iOS 27 → Εφαρμογές (Apps)",
                        detail: "Στο iOS 27, οι ρυθμίσεις του Safari βρίσκονται στην ενότητα «Εφαρμογές» (Apps) → Safari."
                    ) {
                        step1Done.toggle()
                    }

                    interactiveStepRow(
                        index: 1,
                        number: "2",
                        isDone: step2Done,
                        title: "Επεκτάσεις → An1me Tracker",
                        detail: "Πάτα «Επεκτάσεις» (Extensions), βρες το An1me Tracker και γύρισε το διακόπτη σε ON."
                    ) {
                        step2Done.toggle()
                    }

                    interactiveStepRow(
                        index: 2,
                        number: "3",
                        isDone: step3Done,
                        title: "Δικαιώματα Ιστοσελίδας",
                        detail: "Στα δικαιώματα για το an1me.to, επίλεξε «Να επιτρέπεται» (Always Allow)."
                    ) {
                        step3Done.toggle()
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color(red: 14/255, green: 19/255, blue: 32/255).opacity(0.68))
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [Color.white.opacity(0.18), Color.white.opacity(0.04)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                )
                .shadow(color: Color.black.opacity(0.35), radius: 18, x: 0, y: 10)
        )
    }

    private func guideTabButton(title: String, badge: String?, index: Int) -> some View {
        Button(action: {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.easeInOut(duration: 0.18)) {
                selectedGuideTab = index
            }
        }) {
            HStack(spacing: 5) {
                Text(title)
                    .font(.system(size: 11.5, weight: selectedGuideTab == index ? .bold : .medium))
                    .foregroundColor(selectedGuideTab == index ? .white : Color.white.opacity(0.5))

                if let badge = badge {
                    Text(badge)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(Color(red: 84/255, green: 210/255, blue: 255/255))
                        .padding(.horizontal, 4.5)
                        .padding(.vertical, 1)
                        .background(Color(red: 84/255, green: 210/255, blue: 255/255).opacity(0.18))
                        .clipShape(Capsule())
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(selectedGuideTab == index ? Color.white.opacity(0.12) : Color.clear)
            )
        }
    }

    private func interactiveStepRow(index: Int, number: String, isDone: Bool, title: String, detail: String, toggle: @escaping () -> Void) -> some View {
        Button(action: {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                toggle()
            }
        }) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    if isDone {
                        Circle()
                            .fill(Color(red: 52/255, green: 211/255, blue: 153/255))
                            .frame(width: 24, height: 24)
                            .shadow(color: Color(red: 52/255, green: 211/255, blue: 153/255).opacity(0.5), radius: 5)
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.black)
                    } else {
                        Circle()
                            .fill(Color(red: 84/255, green: 210/255, blue: 255/255).opacity(0.12))
                            .frame(width: 24, height: 24)
                            .overlay(Circle().stroke(Color(red: 84/255, green: 210/255, blue: 255/255).opacity(0.35), lineWidth: 1))
                        Text(number)
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundColor(Color(red: 84/255, green: 210/255, blue: 255/255))
                    }
                }
                .padding(.top, 1)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundColor(isDone ? Color.white.opacity(0.7) : .white)
                        .strikethrough(isDone, color: Color.white.opacity(0.4))

                    Text(detail)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundColor(Color.white.opacity(0.52))
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer()

                Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 15))
                    .foregroundColor(isDone ? Color(red: 52/255, green: 211/255, blue: 153/255) : Color.white.opacity(0.2))
                    .padding(.top, 2)
            }
            .padding(11)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(isDone ? Color(red: 52/255, green: 211/255, blue: 153/255).opacity(0.04) : Color.white.opacity(0.03))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(isDone ? Color(red: 52/255, green: 211/255, blue: 153/255).opacity(0.2) : Color.white.opacity(0.06), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }

    // MARK: - Features Showcase
    private var featuresCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ EXTENSION")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color.white.opacity(0.55))
                .tracking(1)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                featureItem(
                    icon: "play.circle.fill",
                    color: Color(red: 84/255, green: 210/255, blue: 255/255),
                    title: "Auto Progress",
                    subtitle: "Καταγραφή ακριβούς δευτερολέπτου & προόδου"
                )

                featureItem(
                    icon: "icloud.fill",
                    color: Color(red: 164/255, green: 119/255, blue: 255/255),
                    title: "Cloud Sync",
                    subtitle: "Συγχρονισμός πραγματικού χρόνου με PC"
                )

                featureItem(
                    icon: "checkmark.seal.fill",
                    color: Color(red: 52/255, green: 211/255, blue: 153/255),
                    title: "AniList & MAL",
                    subtitle: "Αυτόματη βαθμολογία & λίστες επεισοδίων"
                )

                featureItem(
                    icon: "bolt.fill",
                    color: Color(red: 245/255, green: 205/255, blue: 87/255),
                    title: "Smart Filler Skip",
                    subtitle: "Εντοπισμός & παράκαμψη filler επεισοδίων"
                )
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color(red: 14/255, green: 19/255, blue: 32/255).opacity(0.68))
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
        )
    }

    private func featureItem(icon: String, color: Color, title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(color.opacity(0.12))
                    .frame(width: 28, height: 28)
                Image(systemName: icon)
                    .font(.system(size: 15))
                    .foregroundColor(color)
            }

            Text(title)
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundColor(.white)

            Text(subtitle)
                .font(.system(size: 10, weight: .regular))
                .foregroundColor(Color.white.opacity(0.5))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    // MARK: - Quick Links
    private var quickLinksCard: some View {
        VStack(spacing: 8) {
            linkButton(
                title: "Μετάβαση στο an1me.to",
                subtitle: "Άνοιγμα ιστοσελίδας στο Safari",
                icon: "globe",
                accentColor: Color(red: 84/255, green: 210/255, blue: 255/255)
            ) {
                if let url = URL(string: "https://an1me.to") {
                    UIApplication.shared.open(url, options: [:], completionHandler: nil)
                }
            }

            linkButton(
                title: "GitHub Repository",
                subtitle: "Πηγαίος κώδικας, εκδόσεις & updates",
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
                        .frame(width: 32, height: 32)
                    Image(systemName: icon)
                        .font(.system(size: 14))
                        .foregroundColor(accentColor)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundColor(.white)
                    Text(subtitle)
                        .font(.system(size: 10.5))
                        .foregroundColor(Color.white.opacity(0.5))
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color.white.opacity(0.3))
            }
            .padding(12)
            .background(Color.white.opacity(0.04))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.07), lineWidth: 1)
            )
        }
    }

    // MARK: - Footer
    private var footerSection: some View {
        VStack(spacing: 4) {
            Text("An1me Tracker v\(appVersion) • Safari Web Extension")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color.white.opacity(0.4))

            Text("Built for SideStore & AltStore • iOS 27 Glass Edition")
                .font(.system(size: 10))
                .foregroundColor(Color.white.opacity(0.25))
        }
        .padding(.top, 6)
    }
}
