import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { DynamicType } from '../native/dynamicType';
import {
  applyTextScale,
  loadManualTextScale, saveManualTextScale,
  loadTextScaleMode, saveTextScaleMode,
} from './uiPrefs';

// Accessibility text-scale controller. Owns the effective --rm-text-scale
// multiplier and the choice between "follow the iOS system Dynamic Type size"
// (auto) and a fixed manual size. The CSS plumbing (--rm-fs-* tokens) lives in
// style/main.css; the iOS bridge lives in src/native/dynamicType.ts.

// The largest iOS accessibility sizes (≈3.1×) would shatter layouts the app's
// discrete in-app steps (max 1.45) were never tested against, so the
// system-derived scale is clamped here. The standard (non-accessibility) sizes
// map across roughly the same range as the manual steps.
const SYSTEM_SCALE_MAX = 1.5;

// iOS UIContentSizeCategory.rawValue → text-scale multiplier.
const CATEGORY_SCALE: Record<string, number> = {
  UICTContentSizeCategoryXS:   0.85,
  UICTContentSizeCategoryS:    0.9,
  UICTContentSizeCategoryM:    0.95,
  UICTContentSizeCategoryL:    1.0,   // iOS default
  UICTContentSizeCategoryXL:   1.1,
  UICTContentSizeCategoryXXL:  1.2,
  UICTContentSizeCategoryXXXL: 1.3,
  UICTContentSizeCategoryAccessibilityM:    1.4,
  UICTContentSizeCategoryAccessibilityL:    1.5,
  UICTContentSizeCategoryAccessibilityXL:   1.5,
  UICTContentSizeCategoryAccessibilityXXL:  1.5,
  UICTContentSizeCategoryAccessibilityXXXL: 1.5,
};

function categoryToScale(raw: string): number {
  return Math.min(CATEGORY_SCALE[raw] ?? 1, SYSTEM_SCALE_MAX);
}

let listener: PluginListenerHandle | null = null;
let effectiveScale = 1;
let onChange: ((scale: number) => void) | null = null;

function apply(scale: number): void {
  effectiveScale = scale;
  applyTextScale(scale);
  onChange?.(scale);
}

async function startFollowingSystem(): Promise<void> {
  try {
    const { category } = await DynamicType.getCategory();
    apply(categoryToScale(category));
  } catch {
    apply(1); // plugin missing / failed — neutral, never crash
  }
  if (listener) return;
  try {
    listener = await DynamicType.addListener('contentSizeCategoryChanged', ({ category }) => {
      apply(categoryToScale(category));
    });
  } catch {
    // listener unsupported — static follow only.
  }
}

function stopFollowingSystem(): void {
  void listener?.remove();
  listener = null;
}

/** Following the iOS system size is only meaningful inside the native shell. */
export function systemFollowAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export function isFollowingSystem(): boolean {
  return loadTextScaleMode() === 'auto';
}

export function getEffectiveTextScale(): number {
  return effectiveScale;
}

// Settings registers this to live-refresh its controls when the system size
// changes while the screen is open; pass null on screen exit to detach.
export function setTextScaleChangeHandler(cb: ((scale: number) => void) | null): void {
  onChange = cb;
}

// Boot entry (main.ts). Applies a synchronous best-guess (the last manual
// choice) before first paint, then refines from the system size when following
// it on a native shell — the splash screen covers the async refine.
export function initTextScale(): void {
  apply(loadManualTextScale());
  if (loadTextScaleMode() === 'auto' && systemFollowAvailable()) {
    void startFollowingSystem();
  }
}

/** Settings: user picked a fixed text size. */
export function setManualTextScale(scale: number): void {
  saveManualTextScale(scale);
  saveTextScaleMode('manual');
  stopFollowingSystem();
  apply(scale);
}

/** Settings: user toggled "follow system text size". */
export function setFollowSystem(follow: boolean): void {
  if (follow) {
    saveTextScaleMode('auto');
    if (systemFollowAvailable()) void startFollowingSystem();
    else apply(1); // web has no system source
  } else {
    saveTextScaleMode('manual');
    stopFollowingSystem();
    apply(loadManualTextScale());
  }
}
