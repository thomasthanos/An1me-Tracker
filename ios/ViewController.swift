//
//  ViewController.swift
//  An1me Tracker
//
//  Host app for the An1me Tracker iOS Safari Web Extension.
//
//  The WKWebView below loads Resources/Base.lproj/Main.html and stays
//  hidden: it is kept as a web fallback and shares the same design
//  language (Style.css) as the native SwiftUI view presented on top.
//

import UIKit
import WebKit
import SwiftUI

// MARK: - Design tokens
//
// Single source of truth for the native view. Mirrors the custom
// properties in Resources/Style.css so both surfaces stay in sync.
private enum Theme {

    static let background = Color(red: 7 / 255, green: 8 / 255, blue: 13 / 255)

    // Surfaces
    static let surface = Color.white.opacity(0.055)
    static let surfaceRaised = Color.white.opacity(0.085)
    static let hairline = Color.white.opacity(0.09)
    static let hairlineStrong = Color.white.opacity(0.14)
    static let specular = Color.white.opacity(0.28)

    // Text
    static let text = Color(red: 245 / 255, green: 246 / 255, blue: 250 / 255)
    static let text2 = Color.white.opacity(0.68)
    static let text3 = Color.white.opacity(0.42)
    static let text4 = Color.white.opacity(0.26)

    // Tints
    static let cyan = Color(red: 50 / 255, green: 216 / 255, blue: 255 / 255)
    static let violet = Color(red: 191 / 255, green: 140 / 255, blue: 255 / 255)
    static let green = Color(red: 74 / 255, green: 222 / 255, blue: 128 / 255)
    static let amber = Color(red: 255 / 255, green: 179 / 255, blue: 64 / 255)

    // Radii
    static let cardRadius: CGFloat = 22
    static let rowRadius: CGFloat = 16
    static let tileRadius: CGFloat = 11

    static let hPad: CGFloat = 18
}

// MARK: - Reusable surface

/// Translucent card with a hairline border and a top specular edge —
/// the same layered treatment `.card` gets in Style.css.
private struct GlassCard: ViewModifier {
    var radius: CGFloat = Theme.cardRadius
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(Theme.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .strokeBorder(Theme.hairline, lineWidth: 0.5)
                    )
            )
            .overlay(
                // Specular highlight along the top edge.
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [Theme.specular, .clear],
                            startPoint: .top,
                            endPoint: .init(x: 0.5, y: 0.35)
                        ),
                        lineWidth: 0.5
                    )
                    .allowsHitTesting(false)
            )
    }
}

private extension View {
    func glassCard(radius: CGFloat = Theme.cardRadius, padding: CGFloat = 16) -> some View {
        modifier(GlassCard(radius: radius, padding: padding))
    }

    /// Expands a row's tappable area without changing its visual bounds.
    func rowHitArea() -> some View {
        contentShape(Rectangle())
    }
}

/// Rounded tinted glyph tile, used by actions, features and links.
private struct IconTile: View {
    let symbol: String
    let tint: Color
    var size: CGFloat = 38
    var glyphSize: CGFloat = 17
    var radius: CGFloat = Theme.tileRadius

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(tint.opacity(0.13))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(tint.opacity(0.30), lineWidth: 0.5)
            )
            .frame(width: size, height: size)
            .overlay(
                Image(systemName: symbol)
                    .font(.system(size: glyphSize, weight: .medium))
                    .foregroundColor(tint)
            )
    }
}

/// Section heading with an optional trailing pill.
private struct SectionHeader: View {
    let title: String
    var trailing: String?
    var trailingTint: Color = Theme.text3

    var body: some View {
        HStack(spacing: 10) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Theme.text2)

            Spacer(minLength: 0)

            if let trailing = trailing {
                Text(trailing)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(trailingTint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2.5)
                    .background(
                        Capsule().fill(Color.white.opacity(0.06))
                    )
                    .overlay(
                        Capsule().strokeBorder(Theme.hairline, lineWidth: 0.5)
                    )
            }
        }
    }
}

/// Thin separator matching the grouped-list hairlines.
private struct Hairline: View {
    var body: some View {
        Rectangle()
            .fill(Theme.hairline)
            .frame(height: 0.5)
    }
}

// MARK: - Root Host View Controller
class ViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        // Configure the underlying webView as a fallback surface.
        self.webView?.navigationDelegate = self
        self.webView?.configuration.userContentController.add(self, name: "controller")
        self.webView?.isOpaque = false
        self.webView?.backgroundColor = .clear
        self.webView?.scrollView.backgroundColor = .clear

        if let htmlURL = Bundle.main.url(forResource: "Main", withExtension: "html") {
            self.webView?.loadFileURL(htmlURL, allowingReadAccessTo: Bundle.main.resourceURL ?? htmlURL)
        }

        // Keep it mounted (and message-reachable) but out of sight —
        // the native SwiftUI view below is the primary interface.
        self.webView?.isHidden = true

        let hostView = UIHostingController(rootView: An1meTrackerAppView())
        hostView.view.backgroundColor = .clear
        addChild(hostView)
        hostView.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hostView.view)
        view.backgroundColor = UIColor(Theme.background)

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
    // The Settings pages to try, most specific first. iOS 18 moved Safari under Settings → Apps and
    // addresses it by bundle ID; older versions use the SAFARI key. The last one, this app's own page,
    // always opens.
    let candidates = [
        "App-prefs:com.apple.mobilesafari&path=WEB_EXTENSIONS",
        "App-prefs:SAFARI&path=WEB_EXTENSIONS",
        "App-prefs:com.apple.mobilesafari",
        "App-prefs:SAFARI",
        UIApplication.openSettingsURLString,
    ]
    // canOpenURL answers false for these Settings URLs unless the scheme is listed under
    // LSApplicationQueriesSchemes, which this generated app does not do, so every tap used to
    // fall straight through to the app's own, empty settings page. open() needs no listing,
    // and its completion says whether Settings took the URL, so each candidate is tried in turn.
    openFirst(candidates.compactMap { URL(string: $0) })
}

private func openFirst(_ urls: [URL]) {
    guard let url = urls.first else { return }
    UIApplication.shared.open(url, options: [:]) { opened in
        if !opened { openFirst(Array(urls.dropFirst())) }
    }
}

// MARK: - Native SwiftUI Interface
struct An1meTrackerAppView: View {

    private var appVersion: String {
        // MARKETING_VERSION is set from manifest.json by the workflow, so this matches the
        // extension's version. The fallback is deliberately not a real version number: echoing
        // a stale value here is worse than showing that the bundle has no version at all.
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
    }

    /// 0 = inside Safari, 1 = Settings app.
    @State private var guideTab: Int = 0

    // One set of checkmarks per guide, so switching tabs no longer
    // inherits progress from the other method.
    @State private var inSafariDone: [Bool] = [false, false, false, false]
    @State private var inSettingsDone: [Bool] = [false, false, false, false]

    private var doneSteps: [Bool] {
        guideTab == 0 ? inSafariDone : inSettingsDone
    }

    private var completedCount: Int {
        doneSteps.filter { $0 }.count
    }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            // Two low-opacity ambient light sources, matching the
            // .ambient gradient in Style.css.
            GeometryReader { proxy in
                Circle()
                    .fill(Theme.cyan.opacity(0.16))
                    .frame(width: 320, height: 320)
                    .blur(radius: 80)
                    .offset(x: -80, y: -70)

                Circle()
                    .fill(Theme.violet.opacity(0.14))
                    .frame(width: 340, height: 340)
                    .blur(radius: 90)
                    .offset(x: proxy.size.width - 190, y: proxy.size.height * 0.06)
            }
            .ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 20) {
                    header
                    quickActions
                    guideCard
                    featuresCard
                    linksCard
                    footer
                }
                .padding(.horizontal, Theme.hPad)
                .padding(.top, 14)
                .padding(.bottom, 36)
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Header
    private var header: some View {
        VStack(spacing: 0) {
            appIconMark
                .padding(.bottom, 16)

            Text("An1me Tracker")
                .font(.system(size: 28, weight: .bold))
                .tracking(-0.9)
                .foregroundColor(Theme.text)

            Text("Αυτόματη καταγραφή επεισοδίων για το an1me.to")
                .font(.system(size: 14))
                .foregroundColor(Theme.text2)
                .multilineTextAlignment(.center)
                .padding(.top, 6)
                .padding(.horizontal, 12)

            statusPill
                .padding(.top, 14)
        }
    }

    private var appIconMark: some View {
        ZStack(alignment: .bottomTrailing) {
            appIconImage
                .frame(width: 88, height: 88)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.16), lineWidth: 0.5)
                )
                .shadow(color: .black.opacity(0.55), radius: 16, x: 0, y: 10)

            Text(appVersion)
                .font(.system(size: 11, weight: .semibold))
                .monospacedDigit()
                .foregroundColor(Theme.text2)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(
                    Capsule()
                        .fill(Color(red: 18 / 255, green: 20 / 255, blue: 28 / 255).opacity(0.92))
                        .overlay(Capsule().strokeBorder(Theme.hairlineStrong, lineWidth: 0.5))
                )
                .offset(x: 7, y: 7)
        }
    }

    private var appIconImage: some View {
        Group {
            if let image = UIImage(named: "AppLogo")
                ?? UIImage(contentsOfFile: Bundle.main.path(forResource: "Icon", ofType: "png") ?? "") {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                ZStack {
                    Color.black
                    // `tv.fill` rather than `play.tv.fill`: present since
                    // iOS 13, so the placeholder can never render blank.
                    Image(systemName: "tv.fill")
                        .font(.system(size: 34))
                        .foregroundColor(Theme.cyan)
                }
            }
        }
    }

    private var statusPill: some View {
        HStack(spacing: 7) {
            Circle()
                .fill(Theme.green)
                .frame(width: 6, height: 6)
                .shadow(color: Theme.green.opacity(0.6), radius: 3)

            Text("Ενεργή επέκταση Safari")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.green.opacity(0.95))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule().fill(Theme.green.opacity(0.10))
        )
        .overlay(
            Capsule().strokeBorder(Theme.green.opacity(0.28), lineWidth: 0.5)
        )
    }

    // MARK: - Primary actions
    private var quickActions: some View {
        VStack(spacing: 10) {
            ActionRow(
                symbol: "globe",
                tint: Theme.cyan,
                title: "Άνοιγμα an1me.to",
                subtitle: "Συνέχισε από εκεί που έμεινες"
            ) {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                if let url = URL(string: "https://an1me.to") {
                    UIApplication.shared.open(url, options: [:], completionHandler: nil)
                }
            }

            ActionRow(
                symbol: "slider.horizontal.3",
                tint: Theme.violet,
                title: "Ρυθμίσεις Safari",
                subtitle: "Δικαιώματα & επεκτάσεις"
            ) {
                openSafariSettings()
            }
        }
    }

    // MARK: - Activation guide
    private var guideCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            // The pill doubles as the progress readout.
            SectionHeader(
                title: "Οδηγός ενεργοποίησης",
                trailing: completedCount == guideSteps.count ? "Έτοιμο" : "\(completedCount)/\(guideSteps.count)",
                trailingTint: completedCount == guideSteps.count ? Theme.green : Theme.text3
            )

            guideTabs

            VStack(spacing: 0) {
                // Indexed explicitly rather than via `enumerated()` + `id: \.offset`:
                // key paths into tuple elements are the fragile part of that idiom.
                ForEach(guideSteps.indices, id: \.self) { index in
                    if index > 0 { Hairline() }

                    stepRow(index: index, step: guideSteps[index])
                }
            }
        }
        .glassCard()
    }

    private struct GuideStep {
        let title: String
        let detail: String
    }

    private var guideSteps: [GuideStep] {
        if guideTab == 0 {
            return [
                GuideStep(
                    title: "Άνοιξε το an1me.to στο Safari",
                    detail: "Πάτα στο κουμπί της επέκτασης (εικονίδιο παζλ ή «aA») στη γραμμή διευθύνσεων."
                ),
                GuideStep(
                    title: "Ενεργοποίησε το An1me Tracker",
                    detail: "Επίλεξε «Διαχείριση επεκτάσεων» και γύρισε τον διακόπτη σε ON."
                ),
                GuideStep(
                    title: "Δώσε μόνιμη άδεια",
                    detail: "Πάτα ξανά το εικονίδιο στο an1me.to και διάλεξε «Να επιτρέπεται πάντα σε αυτόν τον ιστότοπο»."
                ),
                otherSitesStep
            ]
        }

        return [
            GuideStep(
                title: "Ρυθμίσεις → Εφαρμογές → Safari",
                detail: "Στις Ρυθμίσεις του iOS, το Safari βρίσκεται πλέον στην ενότητα «Εφαρμογές»."
            ),
            GuideStep(
                title: "Επεκτάσεις → An1me Tracker",
                detail: "Άνοιξε τις «Επεκτάσεις», βρες το An1me Tracker και γύρισε τον διακόπτη σε ON."
            ),
            GuideStep(
                title: "Δικαιώματα: «Allow» στα sites του filler",
                detail: "Το Safari ρωτά μόνο του για animefillerlist.com και api.jikan.moe μετά την εγκατάσταση και στο Fetch & Import · πάτα «Allow». Αν το έκλεισες, κάτω από «Permissions» βάλε «Allow» σε: \(neededSites). Τα υπόλοιπα δουλεύουν και στο «Ask»."
            ),
            otherSitesStep
        ]
    }

    /// The hosts that need Allow. iOS lists each one separately. Sign-in, cloud sync and Jikan answer the
    /// extension on "Ask" too, but AnimeFillerList can only be read with Allow.
    private let neededSites = "an1me.to, animefillerlist.com, api.jikan.moe"

    private var otherSitesStep: GuideStep {
        GuideStep(
            title: "Έλεγχος από την επέκταση",
            detail: "Άνοιξε το Tracker στο Safari → Settings. Αν κάποιο site του filler δεν έχει επιτραπεί, θα το δεις εκεί με κουμπί «Allow access» που ρωτά το Safari · το ίδιο υπάρχει και στο Fetch & Import."
        )
    }

    private var guideTabs: some View {
        HStack(spacing: 4) {
            guideTabButton(title: "Μέσα στο Safari", index: 0)
            guideTabButton(title: "Ρυθμίσεις iOS", index: 1)
        }
        .padding(3)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.black.opacity(0.30))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Theme.hairline, lineWidth: 0.5)
        )
    }

    private func guideTabButton(title: String, index: Int) -> some View {
        let selected = guideTab == index

        return Button {
            guard !selected else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.easeInOut(duration: 0.18)) {
                guideTab = index
            }
        } label: {
            Text(title)
                .font(.system(size: 12, weight: selected ? .semibold : .medium))
                .foregroundColor(selected ? Theme.text : Theme.text3)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(selected ? Theme.surfaceRaised : Color.clear)
                )
                .rowHitArea()
        }
        .buttonStyle(.plain)
    }

    private func stepRow(index: Int, step: GuideStep) -> some View {
        let isDone = doneSteps[index]

        return Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.spring(response: 0.28, dampingFraction: 0.72)) {
                if guideTab == 0 {
                    inSafariDone[index].toggle()
                } else {
                    inSettingsDone[index].toggle()
                }
            }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                stepBadge(number: index + 1, isDone: isDone)

                VStack(alignment: .leading, spacing: 3) {
                    Text(step.title)
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundColor(isDone ? Theme.text2 : Theme.text)
                        .multilineTextAlignment(.leading)

                    Text(step.detail)
                        .font(.system(size: 12.5))
                        .foregroundColor(Theme.text3)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)

                Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 15))
                    .foregroundColor(isDone ? Theme.green : Color.white.opacity(0.20))
                    .padding(.top, 2)
            }
            .padding(.vertical, 11)
            .rowHitArea()
        }
        .buttonStyle(.plain)
    }

    /// Numbered circle that becomes a green check once the step is done.
    private func stepBadge(number: Int, isDone: Bool) -> some View {
        ZStack {
            if isDone {
                Circle().fill(Theme.green)
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.black)
            } else {
                Circle()
                    .fill(Theme.cyan.opacity(0.12))
                    .overlay(Circle().strokeBorder(Theme.cyan.opacity(0.32), lineWidth: 0.5))
                Text("\(number)")
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
                    .foregroundColor(Theme.cyan)
            }
        }
        .frame(width: 24, height: 24)
        .padding(.top, 1)
    }

    // MARK: - Features (grouped inset list)
    private struct Feature {
        let symbol: String
        let tint: Color
        let title: String
        let detail: String
    }

    private let features: [Feature] = [
        Feature(
            symbol: "play.circle",
            tint: Theme.cyan,
            title: "Auto Tracking",
            detail: "Καταγραφή προόδου & χρόνου"
        ),
        Feature(
            symbol: "cloud",
            tint: Theme.violet,
            title: "Cloud Sync",
            detail: "Συγχρονισμός PC & iPhone"
        ),
        Feature(
            symbol: "checkmark",
            tint: Theme.green,
            title: "AniList & MAL",
            detail: "Ενημέρωση λίστας μόνο του"
        ),
        Feature(
            symbol: "bolt.fill",
            tint: Theme.amber,
            title: "Speed Controls",
            detail: "Ρύθμιση ταχύτητας βίντεο"
        )
    ]

    private var featuresCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Τι κάνει")

            VStack(spacing: 0) {
                ForEach(features.indices, id: \.self) { index in
                    if index > 0 { Hairline() }

                    let feature = features[index]

                    HStack(spacing: 12) {
                        IconTile(
                            symbol: feature.symbol,
                            tint: feature.tint,
                            size: 30,
                            glyphSize: 15,
                            radius: 9
                        )

                        VStack(alignment: .leading, spacing: 1) {
                            Text(feature.title)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Theme.text)

                            Text(feature.detail)
                                .font(.system(size: 12))
                                .foregroundColor(Theme.text3)
                        }

                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 11)
                }
            }
        }
        .glassCard()
    }

    // MARK: - Links
    private var linksCard: some View {
        VStack(spacing: 0) {
            LinkRow(
                symbol: "globe",
                tint: Theme.cyan,
                title: "Μετάβαση στο an1me.to"
            ) {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                if let url = URL(string: "https://an1me.to") {
                    UIApplication.shared.open(url, options: [:], completionHandler: nil)
                }
            }

            Hairline().padding(.horizontal, 10)

            LinkRow(
                symbol: "chevron.left.forwardslash.chevron.right",
                tint: Theme.text2,
                title: "GitHub Repository"
            ) {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                if let url = URL(string: "https://github.com/thomasthanos/An1me-Tracker") {
                    UIApplication.shared.open(url, options: [:], completionHandler: nil)
                }
            }
        }
        .glassCard(padding: 4)
    }

    // MARK: - Footer
    private var footer: some View {
        VStack(spacing: 3) {
            Text("An1me Tracker · Safari Web Extension")
                .font(.system(size: 11.5))
                .foregroundColor(Theme.text3)

            Text("SideStore / AltStore iOS Edition")
                .font(.system(size: 11))
                .foregroundColor(Theme.text4)
        }
        .padding(.top, 4)
    }
}

// MARK: - Row components

/// Primary action: tinted glyph tile, two-line label, trailing chevron.
private struct ActionRow: View {
    let symbol: String
    let tint: Color
    let title: String
    let subtitle: String
    let action: () -> Void

    @State private var pressed = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 13) {
                IconTile(symbol: symbol, tint: tint)

                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 15.5, weight: .semibold))
                        .foregroundColor(Theme.text)

                    Text(subtitle)
                        .font(.system(size: 12.5))
                        .foregroundColor(Theme.text3)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.text3)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .rowHitArea()
        }
        .buttonStyle(.plain)
        .glassCard(padding: 0)
        .scaleEffect(pressed ? 0.975 : 1)
        .animation(.easeOut(duration: 0.18), value: pressed)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in pressed = true }
                .onEnded { _ in pressed = false }
        )
    }
}

/// Secondary link row: small neutral tile and a single-line label.
private struct LinkRow: View {
    let symbol: String
    let tint: Color
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                IconTile(symbol: symbol, tint: tint, size: 28, glyphSize: 14, radius: 8)

                Text(title)
                    .font(.system(size: 14.5, weight: .medium))
                    .foregroundColor(Theme.text)

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundColor(Theme.text3)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 12)
            .rowHitArea()
        }
        .buttonStyle(.plain)
    }
}
