//
//  ServiceStatusMonitor.swift
//  An1me Tracker
//
//  Whether the services the tracker talks to answer from this iPhone right now. These are not permissions;
//  this only tells a dead network or an outage apart from everything else. The list is generated from
//  dev/scripts/ios-permissions.js (`TrackedServices.all`), the same file the Safari manifest is built from.
//

import Combine
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

@MainActor
final class ServiceStatusMonitor: ObservableObject {

    @Published private(set) var states: [String: ServiceReachability] = [:]
    @Published private(set) var lastChecked: Date?
    @Published private(set) var isChecking = false

    let services: [TrackedService] = TrackedServices.all

    func state(for service: TrackedService) -> ServiceReachability? { states[service.id] }

    /// "6 of 7 online", or `nil` before the first check.
    var summary: String? {
        if isChecking && lastChecked == nil { return "Checking…" }
        guard lastChecked != nil else { return nil }
        let online = services.filter { states[$0.id] == .online }.count
        return online == services.count ? "All online" : "\(online) of \(services.count) online"
    }

    /// Probes every service at once. Runs when the screen appears and on pull to refresh — never on a timer.
    func check() async {
        guard !isChecking else { return }
        isChecking = true
        defer { isChecking = false }
        for service in services where states[service.id] == nil { states[service.id] = .checking }

        let probes = services.map { service in
            (service.id, service.hosts.compactMap { URL(string: "https://\($0)/") })
        }
        let results = await withTaskGroup(
            of: (String, ServiceReachability).self,
            returning: [(String, ServiceReachability)].self
        ) { group in
            for (id, urls) in probes {
                group.addTask { (id, await ServiceStatusMonitor.probe(urls)) }
            }
            var collected: [(String, ServiceReachability)] = []
            for await result in group { collected.append(result) }
            return collected
        }
        for (id, state) in results { states[id] = state }
        lastChecked = Date()
    }

    /// Any HTTP answer from any of the service's hosts counts as reachable; the status code is the service's
    /// business. HEAD first; some API edges reset a HEAD to the root, so a failed HEAD is retried as GET.
    nonisolated private static func probe(_ urls: [URL]) async -> ServiceReachability {
        for url in urls {
            for method in ["HEAD", "GET"] {
                if await answers(url, method: method) { return .online }
            }
        }
        return .offline
    }

    nonisolated private static func answers(_ url: URL, method: String) async -> Bool {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        request.httpMethod = method
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            return response is HTTPURLResponse
        } catch {
            return false
        }
    }

    static let shared = ServiceStatusMonitor()
}
