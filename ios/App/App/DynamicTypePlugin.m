#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers the Swift DynamicTypePlugin with the Capacitor bridge so the
// "DynamicType" plugin name resolves from JS (src/native/dynamicType.ts).
CAP_PLUGIN(DynamicTypePlugin, "DynamicType",
           CAP_PLUGIN_METHOD(getCategory, CAPPluginReturnPromise);
)
