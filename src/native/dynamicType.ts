import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

// Native bridge to the iOS system Dynamic Type setting. Implemented by
// ios/App/App/DynamicTypePlugin.swift; there is no web implementation, so
// callers must gate on Capacitor.isNativePlatform() (see src/ui/textScale.ts),
// which also makes a stale Xcode project (plugin files not yet added) degrade
// gracefully rather than crash.
export interface DynamicTypePlugin {
  // Resolves the current UIContentSizeCategory.rawValue (e.g. "UICTContentSizeCategoryL").
  getCategory(): Promise<{ category: string }>;
  addListener(
    eventName: 'contentSizeCategoryChanged',
    listener: (data: { category: string }) => void,
  ): Promise<PluginListenerHandle>;
}

export const DynamicType = registerPlugin<DynamicTypePlugin>('DynamicType');
