//
//  ServiceStatusMonitor.swift
//  An1me Tracker
//
//  Whether the services the tracker talks to answer from this iPhone right now. These are not permissions:
//  Safari decides access under Permissions; this only tells a dead network or an outage apart from a
//  blocked website. The list is the extension's own manifest hosts, grouped under a service name.
//

import Foundation

enum ServiceReachability: Equatable {
    case checking
    case online
    case offline

    var title: String {
        switch self {
        case .checking: return "Checking…"
        case .online: return "Online"
        case .offline: return "Offline"
        }
    }
}

struct TrackedService: Identifiable, Equatable {
    let id: String
    let name: String
    let symbol: String
    let hosts: [String]

    /// Any HTTP answer from the first host counts as reachable; the status code is the service's business.
    var probeURL: URL? { hosts.first.flatMap { URL(string: "https://\($0)/") } }

    /// Every specific manifest host, wildcards dropped (they have no single address to probe).
    static var all: [TrackedService] {
        let manifest = ExtensionManifest.current
        var order: [String] = []
        var hosts: [String: [String]] = [:]
        for origin in manifest.requiredHosts + manifest.optionalHosts {
            let host = origin.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "/*", with: "")
            guard !host.contains("*") else { continue }
            let name = names[host]?.name ?? host
            if hosts[name] == nil { order.append(name) }
            hosts[name, default: []].append(host)
        }
        return order.map { name in
            let members = hosts[name] ?? []
            return TrackedService(id: name, name: name, symbol: members.first.flatMap { names[$0]?.symbol } ?? "globe", hosts: members)
        }
    }

    private static let names: [String: (name: String, symbol: String)] = [
        "an1me.to": ("An1me.to", "play.rectangle.fill"),
        "identitytoolkit.googleapis.com": ("Firebase Auth", "person.badge.key.fill"),
        "securetoken.googleapis.com": ("Firebase Auth", "person.badge.key.fill"),
        "firestore.googleapis.com": ("Firestore", "icloud.fill"),
        "s4.anilist.co": ("AniList", "photo.fill"),
        "graphql.anilist.co": ("AniList", "photo.fill"),
        "api.aniskip.com": ("AniSkip", "forward.end.fill"),
        "api.jikan.moe": ("Jikan", "list.bullet.rectangle.fill"),
        "www.animefillerlist.com": ("AnimeFillerList", "list.star"),
        "myanimelist.net": ("MyAnimeList", "books.vertical.fill"),
        "cdn.myanimelist.net": ("MyAnimeList", "books.vertical.fill"),
    ]
}

@MainActor
final class ServiceStatusMonitor: ObservableObject {

    @Published private(set) var states: [String: ServiceReachability] = [:]
    @Published private(set) var lastChecked: Date?
    @Published private(set) var isChecking = false

    let services: [TrackedService] = TrackedService.all

    func state(for service: TrackedService) -> ServiceReachability? { states[service.id] }

    /// "6 of 7 online", or `nil` before the first check.
    var summary: String? {
        if isChecking && lastChecked == nil { return "Checking…" }
        guard lastChecked != nil else { return nil }
        let online = services.filter { states[$0.id] == .online }.count
        return online == services.count ? "All online" : "\(online) of \(services.count) online"
    }

    /// Probes every service at once. Runs on demand (screen appears, pull to refresh) — never on a timer.
    func check() async {
        guard !isChecking else { return }
        isChecking = true
        defer { isChecking = false }
        for service in services where states[service.id] == nil { states[service.id] = .checking }

        let probes = services.map { ($0.id, $0.probeURL) }
        let results = await withTaskGroup(
            of: (String, ServiceReachability).self,
            returning: [(String, ServiceReachability)].self
        ) { group in
            for (id, url) in probes {
                group.addTask { (id, await ServiceStatusMonitor.probe(url)) }
            }
            var collected: [(String, ServiceReachability)] = []
            for await result in group { collected.append(result) }
            return collected
        }
        for (id, state) in results { states[id] = state }
        lastChecked = Date()
    }

    nonisolated private static func probe(_ url: URL?) async -> ServiceReachability {
        guard let url else { return .offline }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        request.httpMethod = "HEAD"
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            return response is HTTPURLResponse ? .online : .offline
        } catch {
            return .offline
        }
    }

    static let shared = ServiceStatusMonitor()
}
