import Foundation

enum AppConfig {
    static let paperclipRepoPath =
        "/Users/huvema/Library/Mobile Documents/com~apple~CloudDocs/MIGA/Github MIGA/paperclip"
    static let localURL = URL(string: "http://127.0.0.1:3100")!
    static let healthURL = URL(string: "http://127.0.0.1:3100/api/health")!
    static let crawl4aiHealthURL = URL(string: "http://127.0.0.1:11235/health")!
    static let paperclipStartScriptPath =
        "/Users/huvema/Library/Mobile Documents/com~apple~CloudDocs/MIGA/Github MIGA/paperclip/scripts/run-miga-local.sh"
    static let crawl4aiStartScriptPath =
        "/Users/huvema/Library/Mobile Documents/com~apple~CloudDocs/MIGA/Github MIGA/paperclip/scripts/run-crawl4ai-local.sh"
}
