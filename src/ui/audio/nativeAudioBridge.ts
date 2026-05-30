// Cross-platform seam for low-latency UI one-shots on native iOS.
//
// Why this exists: HTMLAudioElement on iOS WKWebView routes through WebKit's
// media-playback stack, and the shared audio output route powers down when
// nothing has played for a moment. UI taps are sporadic (tap… wait… tap), so on
// menu screens — where no crowd bed is holding the route warm — almost every
// tap hits a cold route and pays a ~100-300ms hardware re-engagement cost before
// any sound comes out. (Inside a live match the looping crowd bed keeps the
// route warm, which is why match SFX feel snappy but menu clicks lag.)
//
// @capacitor-community/native-audio preloads each cue into native AVAudioPlayers
// (prepareToPlay() per channel at preload time) so play() fires with near-zero
// latency, fully bypassing the WKWebView media stack. We route only the `ui`
// channel through here — match SFX stay on HTMLAudioElement, kept warm by the
// bed.
//
// On the web (and if a per-asset native preload fails) this reports unavailable
// and SoundManager falls back to its HTMLAudioElement path. Every native call is
// wrapped so a missing/odd plugin state degrades to a console.warn, never an
// unhandled rejection — same defensive posture as GameCenterBridge.

import { Capacitor } from '@capacitor/core';
import { NativeAudio } from '@capacitor-community/native-audio';

// Manifest file URLs that successfully preloaded into a native player. Only
// these are eligible for the native play path; anything else falls back.
const preloaded = new Set<string>();
// Last volume pushed per asset, so the rapid-tap path skips a redundant
// setVolume bridge call (volume only changes on the settings slider).
const lastVol = new Map<string, number>();

// Runtime cue URLs are base-relative (`./audio/ui/click-primary.mp3` under the
// Capacitor build). The plugin's isUrl:false path resolves via
// Bundle.main.path(forResource:ofType:), and `cap sync` copies the web assets
// into the app bundle's `public/` folder preserving structure — so the
// bundle-relative path is `public/audio/...`.
function bundlePath(fileUrl: string): string {
  const i = fileUrl.indexOf('/audio/');
  return i >= 0 ? `public${fileUrl.slice(i)}` : fileUrl;
}

/**
 * Preload the given one-shot cue files into native players. No-op off native.
 * Safe to call once at startup — AVAudioPlayer needs no user-gesture unlock.
 */
export async function preloadNativeOneShots(files: readonly string[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  // Ambient category: mixes with the user's background audio and respects the
  // ringer switch — the polite choice for non-essential UI feedback. (The
  // plugin's default is .playback, which would pause the user's music.)
  try { await NativeAudio.configure({ focus: false, fade: false }); }
  catch (err) { console.warn('NativeAudio.configure failed', err); }

  for (const file of files) {
    if (preloaded.has(file)) continue;
    try {
      await NativeAudio.preload({
        assetId: file,
        assetPath: bundlePath(file),
        audioChannelNum: 2, // allow a quick double-tap to overlap
        isUrl: false,
      });
      preloaded.add(file);
    } catch (err) {
      console.warn('NativeAudio.preload failed', file, err);
    }
  }
}

/**
 * Play a preloaded one-shot through the native player.
 * Returns false if the file isn't preloaded (web, or preload failed) so the
 * caller can fall back to the HTMLAudioElement path.
 */
export function playNativeOneShot(file: string, volume: number): boolean {
  if (!preloaded.has(file)) return false;
  const prev = lastVol.get(file);
  if (prev === undefined || Math.abs(prev - volume) > 0.001) {
    lastVol.set(file, volume);
    // Set the new level, then play once it's applied. play() always runs.
    void NativeAudio.setVolume({ assetId: file, volume })
      .catch(() => {})
      .finally(() => { void NativeAudio.play({ assetId: file }).catch(() => {}); });
  } else {
    void NativeAudio.play({ assetId: file }).catch(() => {});
  }
  return true;
}

// ── Looping beds (crowd ambience, TMO drone, off-season music) ──────────────────
// Routed natively for the same reason as UI one-shots PLUS a second one:
// HTMLAudioElement.volume is ignored on iOS WKWebView, so the per-channel
// CHANNEL_MIX (crowd bed at 0.32) and the master-volume slider never reach a
// bed on the HTML path — the continuous crowd loop plays at full volume and
// drowns the action. AVAudioPlayer.setVolume is respected, so going native
// restores the mix and master-volume control on the one sound that runs the
// whole match. Falls through to the HTML bed engine on web.

const preloadedBeds = new Set<string>();

/** Preload looping bed files into native players. No-op off native. */
export async function preloadNativeBeds(files: readonly string[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  for (const file of files) {
    if (preloadedBeds.has(file)) continue;
    try {
      await NativeAudio.preload({
        assetId: file,
        assetPath: bundlePath(file),
        audioChannelNum: 1, // one looping instance per bed
        isUrl: false,
      });
      preloadedBeds.add(file);
    } catch (err) {
      console.warn('NativeAudio bed preload failed', file, err);
    }
  }
}

/** True if this bed file preloaded natively — the caller should use the native path. */
export function nativeBedAvailable(file: string): boolean {
  return preloadedBeds.has(file);
}

/** Start (or restart) a looping bed at the given volume. */
export function playNativeBed(file: string, volume: number): void {
  if (!preloadedBeds.has(file)) return;
  void NativeAudio.setVolume({ assetId: file, volume })
    .catch(() => {})
    .finally(() => { void NativeAudio.loop({ assetId: file }).catch(() => {}); });
}

/** Update a live bed's volume (master-slider / mix change). */
export function setNativeBedVolume(file: string, volume: number): void {
  if (!preloadedBeds.has(file)) return;
  void NativeAudio.setVolume({ assetId: file, volume }).catch(() => {});
}

/** Stop a looping bed. */
export function stopNativeBed(file: string): void {
  if (!preloadedBeds.has(file)) return;
  void NativeAudio.stop({ assetId: file }).catch(() => {});
}
