import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let popover = NSPopover()
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let serverManager = ServerManager()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        popover.behavior = .transient
        popover.animates = true
        popover.contentSize = NSSize(width: 1100, height: 760)
        popover.contentViewController = NSHostingController(rootView: PopoverView(serverManager: serverManager))

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "paperclip.circle.fill", accessibilityDescription: "Paperclip MIGA")
            button.action = #selector(togglePopover(_:))
            button.target = self
        }

        serverManager.start()
    }

    @objc
    private func togglePopover(_ sender: AnyObject?) {
        guard let button = statusItem.button else { return }
        if popover.isShown {
            popover.performClose(sender)
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            popover.contentViewController?.view.window?.makeKey()
        }
    }
}

@main
struct PaperclipMIGAMenuBarApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}
