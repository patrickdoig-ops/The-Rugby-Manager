import Foundation
import GameKit
import Capacitor

// Native Apple Game Center bridge. The web layer talks to this only through
// src/achievements/GameCenterBridge.ts (registerPlugin('GameCenter')) — it
// never imports GameKit. Three methods mirror the GameCenterBridge interface:
// authenticate (GKLocalPlayer sign-in), reportAchievement (GKAchievement), and
// showAchievements (GKGameCenterViewController overlay). The JS side wraps every
// call in try/catch and degrades to a console.warn, so a rejection here can
// never surface as an unhandled rejection — the in-app toast + local
// persistence happen regardless.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showAchievements", returnType: CAPPluginReturnPromise)
    ]

    // Guards against resolving the same CAPPluginCall twice — the
    // authenticateHandler closure can fire again on later auth-state changes.
    private var authCall: CAPPluginCall?

    // Triggers Game Center sign-in. If iOS hands back a view controller, the
    // player isn't signed in yet and we present it; the handler fires again
    // once they finish. Resolves on success, rejects on a hard error.
    @objc func authenticate(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.authCall = call
            let localPlayer = GKLocalPlayer.local
            localPlayer.authenticateHandler = { [weak self] viewController, error in
                guard let self = self else { return }
                if let vc = viewController {
                    self.bridge?.viewController?.present(vc, animated: true, completion: nil)
                    return
                }
                guard let pending = self.authCall else { return }
                self.authCall = nil
                if let error = error {
                    pending.reject("Game Center authentication failed", nil, error)
                } else {
                    pending.resolve(["authenticated": localPlayer.isAuthenticated])
                }
            }
        }
    }

    // Reports a single achievement by App Store Connect identifier. iOS clamps
    // percentComplete and never downgrades an already-completed achievement, so
    // re-reporting an unlock is a safe no-op.
    @objc func reportAchievement(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing achievement id")
            return
        }
        let percent = call.getDouble("percentComplete") ?? 100.0
        let achievement = GKAchievement(identifier: id)
        achievement.percentComplete = percent
        achievement.showsCompletionBanner = true
        GKAchievement.report([achievement]) { error in
            if let error = error {
                call.reject("Failed to report achievement", nil, error)
            } else {
                call.resolve()
            }
        }
    }

    // Presents the native Game Center achievements overlay. iOS 14 changed the
    // initializer; the deployment target is 13.0 so both paths are kept.
    @objc func showAchievements(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let gcVC: GKGameCenterViewController
            if #available(iOS 14.0, *) {
                gcVC = GKGameCenterViewController(state: .achievements)
            } else {
                gcVC = GKGameCenterViewController()
                gcVC.viewState = .achievements
            }
            gcVC.gameCenterDelegate = self
            self.bridge?.viewController?.present(gcVC, animated: true, completion: nil)
            call.resolve()
        }
    }
}

extension GameCenterPlugin: GKGameCenterControllerDelegate {
    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true, completion: nil)
    }
}
