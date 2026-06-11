#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers the Swift GameCenterPlugin with the Capacitor bridge so the
// "GameCenter" plugin name resolves from JS (src/achievements/GameCenterBridge.ts).
CAP_PLUGIN(GameCenterPlugin, "GameCenter",
           CAP_PLUGIN_METHOD(authenticate, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(reportAchievement, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(showAchievements, CAPPluginReturnPromise);
)
