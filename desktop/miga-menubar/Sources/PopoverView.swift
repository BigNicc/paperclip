import SwiftUI

struct PopoverView: View {
    @ObservedObject var serverManager: ServerManager

    var body: some View {
        Group {
            if serverManager.isServerReachable {
                PaperclipWebView(url: AppConfig.localURL)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Paperclip wird gestartet")
                        .font(.headline)
                    Text(serverManager.statusMessage)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    ProgressView()
                    HStack {
                        Button("Im Browser öffnen") {
                            NSWorkspace.shared.open(AppConfig.localURL)
                        }
                        Button("Neu starten") {
                            serverManager.ensureServerRunning(forceRestart: true)
                        }
                    }
                }
                .padding(16)
                .frame(width: 420, height: 220, alignment: .topLeading)
            }
        }
        .frame(width: 1100, height: 760)
    }
}
