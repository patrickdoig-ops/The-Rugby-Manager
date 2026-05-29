import Foundation
import UIKit
import Capacitor

// Bridges the iOS system Dynamic Type setting (preferredContentSizeCategory)
// into the web layer, where src/ui/textScale.ts maps it onto the --rm-text-scale
// CSS multiplier. JS side: src/native/dynamicType.ts.
@objc(DynamicTypePlugin)
public class DynamicTypePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DynamicTypePlugin"
    public let jsName = "DynamicType"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCategory", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(contentSizeCategoryDidChange),
            name: UIContentSizeCategory.didChangeNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // Returns the current UIContentSizeCategory.rawValue (e.g.
    // "UICTContentSizeCategoryL"). Read on the main thread — UIApplication
    // state must not be touched from the bridge's background queue.
    @objc func getCategory(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["category": UIApplication.shared.preferredContentSizeCategory.rawValue])
        }
    }

    @objc private func contentSizeCategoryDidChange() {
        notifyListeners(
            "contentSizeCategoryChanged",
            data: ["category": UIApplication.shared.preferredContentSizeCategory.rawValue]
        )
    }
}
