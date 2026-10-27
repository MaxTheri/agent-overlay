import AppKit
import Foundation
import CoreGraphics

func reply(_ value: Any) {
    if let data = try? JSONSerialization.data(withJSONObject: value),
       let text = String(data: data, encoding: .utf8) { print(text) }
}

let args = CommandLine.arguments
let apps = NSWorkspace.shared.runningApplications.filter { !$0.isTerminated }
if args.count == 3 && args[1] == "--window", let pid = Int32(args[2]) {
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    reply(windows.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid }.map { window in
        var result: [String: Any] = [:]
        result["onScreen"] = window[kCGWindowIsOnscreen as String] ?? false
        result["layer"] = window[kCGWindowLayer as String] ?? 0
        result["bounds"] = window[kCGWindowBounds as String] ?? [:]
        return result
    })
} else if args.count == 2 && args[1] == "--list" {
    reply(apps.compactMap { app -> [String: Any]? in
        guard let bundle = app.bundleIdentifier, let url = app.bundleURL else { return nil }
        return ["pid": app.processIdentifier, "bundle": bundle,
                "path": url.path, "name": app.localizedName ?? bundle]
    })
} else if args.count == 3 && args[1] == "--activate" {
    guard let target = apps.first(where: { $0.bundleIdentifier == args[2] }) else {
        reply(["ok": false, "error": "L’application est fermée."]); exit(1)
    }
    target.unhide()
    let ok = target.activate(options: [.activateAllWindows])
    reply(["ok": ok, "name": target.localizedName ?? args[2],
           "error": ok ? "" : "macOS n’a pas activé l’application."])
    if !ok { exit(1) }
} else {
    reply(["ok": false, "error": "Arguments invalides."]); exit(2)
}
