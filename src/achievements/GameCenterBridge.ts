// Cross-platform seam for Apple Game Centre. The achievements engine talks to
// this interface only — it never imports GameKit or touches Capacitor plugins
// directly. On the web (and on native until the Swift plugin lands) the no-op
// implementation is used, so unlocking an achievement still pops the in-app
// toast and persists locally; only the Game Centre report is skipped.
//
// Native follow-up (needs a Mac + Xcode, see the plan): add a `GameCenter`
// Capacitor plugin under ios/ that implements authenticate / reportAchievement
// / showAchievements via GKLocalPlayer + GKAchievement +
// GKGameCenterViewController, and create matching achievement identifiers in
// App Store Connect (one per `gcId` in achievementDefs.ts). No JS change is
// needed when it lands — `registerPlugin('GameCenter')` already targets it.

import { Capacitor, registerPlugin } from '@capacitor/core';

export interface GameCenterBridge {
  authenticate(): Promise<void>;
  reportAchievement(gcId: string, percentComplete: number): Promise<void>;
  showAchievements(): Promise<void>;
}

// Shape of the (future) native plugin. Mirrors the bridge but every method is
// optional at the type level because the registered proxy throws if the
// native side isn't present yet — calls are guarded in the native bridge.
interface GameCenterPlugin {
  authenticate(): Promise<void>;
  reportAchievement(opts: { id: string; percentComplete: number }): Promise<void>;
  showAchievements(): Promise<void>;
}

const noopBridge: GameCenterBridge = {
  async authenticate() {},
  async reportAchievement() {},
  async showAchievements() {},
};

function makeNativeBridge(): GameCenterBridge {
  const plugin = registerPlugin<GameCenterPlugin>('GameCenter');
  // Every call is wrapped: until the Swift plugin is added, invoking a
  // registered-but-unimplemented plugin rejects. We don't want a missing
  // native dependency to surface as an unhandled rejection, so each method
  // degrades to a console.warn — the in-app toast + local persistence still
  // happen regardless.
  return {
    async authenticate() {
      try { await plugin.authenticate(); }
      catch (err) { console.warn('GameCenter.authenticate unavailable', err); }
    },
    async reportAchievement(gcId, percentComplete) {
      try { await plugin.reportAchievement({ id: gcId, percentComplete }); }
      catch (err) { console.warn('GameCenter.reportAchievement unavailable', err); }
    },
    async showAchievements() {
      try { await plugin.showAchievements(); }
      catch (err) { console.warn('GameCenter.showAchievements unavailable', err); }
    },
  };
}

let cached: GameCenterBridge | null = null;

// Returns the native bridge on iOS, the no-op bridge everywhere else.
// Memoised so the plugin is registered at most once.
export function getGameCenter(): GameCenterBridge {
  if (cached) return cached;
  cached = Capacitor.isNativePlatform() ? makeNativeBridge() : noopBridge;
  return cached;
}

// True only when the native overlay (GKGameCenterViewController) is reachable —
// drives whether the Achievements screen shows its "View in Game Centre" button.
export function gameCenterAvailable(): boolean {
  return Capacitor.isNativePlatform();
}
