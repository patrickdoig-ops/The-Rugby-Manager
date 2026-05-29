// Haptics engine — the low-level trigger + the user preference. Mirrors the
// SoundManager engine half: a dumb device-vibration mixer that the rest of the
// UI never touches directly (the HapticsDirector is the single caller). Much
// simpler than SoundManager — no asset loading, no channels, just a small set
// of named patterns mapped to a native Taptic call or a web vibration fallback.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const HAPTICS_KEY = 'rugby-manager-haptics';

// The key-moment vocabulary. One entry per buzz the match can fire.
export type HapticPattern =
  | 'try'
  | 'card'
  | 'goal_made'
  | 'goal_miss'
  | 'tmo'
  | 'whistle_half'
  | 'whistle_full';

// Web fallback patterns (ms, or [vibrate, pause, vibrate…]) for navigator.vibrate.
// iOS Safari ignores these; the native plugin handles iOS instead.
const WEB_PATTERN: Record<HapticPattern, number | number[]> = {
  try:          [40, 60, 40],
  card:         [60, 40, 60],
  goal_made:    40,
  goal_miss:    20,
  tmo:          20,
  whistle_half: [30, 40, 30],
  whistle_full: [50, 60, 50, 60, 50],
};

// Native (iOS Taptic Engine) — fire-and-forget; we never await the promise so a
// haptic can't stall the match feed, and any rejection is swallowed.
function playNative(pattern: HapticPattern): void {
  switch (pattern) {
    case 'try':
    case 'whistle_full':
      void Haptics.notification({ type: NotificationType.Success });
      break;
    case 'card':
      void Haptics.notification({ type: NotificationType.Warning });
      break;
    case 'goal_made':
    case 'whistle_half':
      void Haptics.impact({ style: ImpactStyle.Medium });
      break;
    case 'goal_miss':
    case 'tmo':
      void Haptics.impact({ style: ImpactStyle.Light });
      break;
  }
}

export function isHapticsEnabled(): boolean {
  return localStorage.getItem(HAPTICS_KEY) !== 'off';
}

export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(HAPTICS_KEY, on ? 'on' : 'off');
  } catch {
    // localStorage disabled / quota exceeded — silent.
  }
}

export function playHaptic(pattern: HapticPattern): void {
  if (!isHapticsEnabled()) return;
  try {
    if (Capacitor.isNativePlatform()) playNative(pattern);
    else navigator.vibrate?.(WEB_PATTERN[pattern]);
  } catch {
    // A platform quirk must never break the live feed — swallow.
  }
}
