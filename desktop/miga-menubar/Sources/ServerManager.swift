import AppKit
import Foundation

@MainActor
final class ServerManager: ObservableObject {
    @Published private(set) var isServerReachable = false
    @Published private(set) var statusMessage = "Prüfe lokalen Server ..."

    private var healthTimer: Timer?

    func start() {
        ensureServerRunning(forceRestart: false)
    }

    func ensureServerRunning(forceRestart: Bool) {
        if forceRestart {
            statusMessage = "Starte lokalen Paperclip- und Crawl4AI-Stack neu ..."
        } else {
            statusMessage = "Prüfe lokalen Paperclip- und Crawl4AI-Stack ..."
        }

        Task { @MainActor in
            let reachable = await probeHealth()
            let crawl4aiReachable = await probeCrawl4AIHealth()
            if reachable && crawl4aiReachable && !forceRestart {
                self.isServerReachable = true
                self.statusMessage = "Paperclip und Crawl4AI sind bereit."
                self.startHealthTimer()
                return
            }

            self.launchCrawl4AI()
            self.launchServer()
            self.startHealthTimer()
        }
    }

    @MainActor
    private func startHealthTimer() {
        healthTimer?.invalidate()
        healthTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                let reachable = await self.probeHealth()
                let crawl4aiReachable = await self.probeCrawl4AIHealth()
                self.isServerReachable = reachable
                if reachable && crawl4aiReachable {
                    self.statusMessage = "Paperclip und Crawl4AI sind bereit."
                } else if !crawl4aiReachable {
                    self.statusMessage = "Warte auf lokalen Crawl4AI-Dienst ..."
                } else {
                    self.statusMessage = "Warte auf lokalen Paperclip-Server ..."
                }
            }
        }
    }

    private func launchCrawl4AI() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.currentDirectoryURL = URL(fileURLWithPath: AppConfig.paperclipRepoPath)
        process.arguments = ["-lc", "\"\(AppConfig.crawl4aiStartScriptPath)\" >/dev/null 2>&1 &"]
        try? process.run()
    }

    private func launchServer() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.currentDirectoryURL = URL(fileURLWithPath: AppConfig.paperclipRepoPath)
        process.arguments = ["-lc", "\"\(AppConfig.paperclipStartScriptPath)\" >/dev/null 2>&1 &"]
        try? process.run()
    }

    private func probeHealth() async -> Bool {
        var request = URLRequest(url: AppConfig.healthURL)
        request.timeoutInterval = 1.5

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let http = response as? HTTPURLResponse
            return http?.statusCode == 200
        } catch {
            return false
        }
    }

    private func probeCrawl4AIHealth() async -> Bool {
        var request = URLRequest(url: AppConfig.crawl4aiHealthURL)
        request.timeoutInterval = 1.5

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let http = response as? HTTPURLResponse
            return http?.statusCode == 200
        } catch {
            return false
        }
    }

    deinit {
        healthTimer?.invalidate()
    }
}
