// Manifest-driven audio engine — every cue plays through HTMLAudioElement.
//
// One-shot cues (whistles, impacts, crowd reactions, stingers, UI) play through
// a small per-file pool of HTMLAudioElements; looping beds (crowd ambience,
// screen music, TMO drone) use a dedicated element with loop=true and a
// setInterval volume ramp for cross-fades.
//
// Why not Web Audio: on iOS WKWebView (Capacitor) the AudioContext path is
// unreliable. decodeAudioData fails silently for large bed buffers (bed-engaged
// at 909 KB → ~20 MB PCM), and one-shots stay silent even after resume() because
// the OS output route never engages without an in-gesture buffer-source start.
// HTMLAudioElement hands decoding + playback to the native audio layer, which a
// single iOS audio-session unlock (a silent element played from the first user
// gesture in preloadAllCues) makes reliable for every subsequent play — beds and
// one-shots alike, including after navigation. Playback is gated behind the split
// UI / match SFX prefs + master volume, all persisted in localStorage.

import { AUDIO_MANIFEST, type AudioAsset, type AudioChannel } from './audio/audioManifest';
import {
  preloadNativeOneShots, playNativeOneShot,
  preloadNativeBeds, nativeBedAvailable, playNativeBed, setNativeBedVolume, stopNativeBed,
} from './audio/nativeAudioBridge';

const SFX_UI_KEY    = 'rugby-manager-sfx-ui';
const SFX_MATCH_KEY = 'rugby-manager-sfx-match';
const VOLUME_KEY    = 'rugby-manager-volume';

const BED_FADE_S           = 0.8;  // cross-fade duration when switching beds
const BED_FADE_STEPS       = 20;   // setInterval updates per second during a fade
const BED_FADE_INTERVAL_MS = 1000 / BED_FADE_STEPS;

// Per-channel base level relative to master.
const CHANNEL_MIX: Record<AudioChannel, number> = {
  'whistle':        1.0,
  'crowd-bed':      0.32,
  'crowd-reaction': 0.9,
  'impact':         0.8,
  'ui':             0.47,
  'stinger':        0.9,
  'stinger-season': 0.9,
  'music':          0.45,
};

// Channels that belong to live-match audio. Everything else is UI / season audio.
const MATCH_CHANNELS: ReadonlySet<AudioChannel> = new Set([
  'whistle', 'crowd-bed', 'crowd-reaction', 'impact', 'stinger', 'music',
]);

function isChannelEnabled(ch: AudioChannel): boolean {
  return MATCH_CHANNELS.has(ch) ? isMatchSfxEnabled() : isUiSfxEnabled();
}

const byId = new Map<string, AudioAsset>();
for (const a of AUDIO_MANIFEST) byId.set(a.id, a);

// ── One-shot pool ─────────────────────────────────────────────────────────────
// Each distinct file keeps a small pool of HTMLAudioElements. A play reuses an
// idle (paused / ended) element if one exists, else grows the pool up to
// ONE_SHOT_POOL_MAX; past that it spawns a transient element (kept alive by the
// play() promise, GC'd once it ends). Reuse avoids re-buffering latency and keeps
// the live element count bounded — important on iOS WKWebView, which caps
// concurrent media elements.

const ONE_SHOT_POOL_MAX = 4;
const oneShotPool = new Map<string, HTMLAudioElement[]>();

function acquireOneShot(file: string): HTMLAudioElement {
  let pool = oneShotPool.get(file);
  if (!pool) { pool = []; oneShotPool.set(file, pool); }
  for (const el of pool) {
    if (el.paused || el.ended) return el;
  }
  const el = new Audio(file);
  el.preload = 'auto';
  if (pool.length < ONE_SHOT_POOL_MAX) pool.push(el);
  return el;
}

// ── Variant selection ─────────────────────────────────────────────────────────
// Tracks the last take played per asset so the same take is never repeated
// back-to-back. Uses plain Math.random() — UI-only code, not the engine.

const lastTake = new Map<string, number>();

function pickVariant(id: string, count: number): number {
  if (count <= 1) return 1;
  const last = lastTake.get(id) ?? 0;
  let take: number;
  do { take = Math.floor(Math.random() * count) + 1; } while (take === last);
  lastTake.set(id, take);
  return take;
}

function variantFile(baseFile: string, take: number): string {
  return take <= 1 ? baseFile : baseFile.replace(/\.mp3$/, `-${take}.mp3`);
}

// ── HTML-element bed engine ───────────────────────────────────────────────────
// HTMLAudioElement with loop=true: the browser / OS decodes and loops natively
// without allocating a PCM buffer in JS memory. el.volume drives the cross-fade
// instead of a gainNode, keeping beds independent of AudioContext state.

interface HtmlBed {
  el: HTMLAudioElement;
  id: string;
  ch: AudioChannel;
  fadeTimer: ReturnType<typeof setInterval> | null;
  stopped: boolean;
}
const htmlBeds    = new Map<AudioChannel, HtmlBed>();
const htmlPending = new Map<AudioChannel, string>();

// Native iOS beds, one per channel. Tracks the asset id + file currently looping
// so playBed can no-op a re-trigger of the same bed (routeMatchEvent re-asks for
// the engaged bed on every event) and stop a superseded one on a channel switch.
const nativeBeds = new Map<AudioChannel, { id: string; file: string }>();

function htmlTargetVol(ch: AudioChannel): number {
  return getVolume() * CHANNEL_MIX[ch];
}

function clearFade(bed: HtmlBed): void {
  if (bed.fadeTimer !== null) { clearInterval(bed.fadeTimer); bed.fadeTimer = null; }
}

function fadeBedIn(bed: HtmlBed): void {
  clearFade(bed);
  const target = htmlTargetVol(bed.ch);
  const step   = target / (BED_FADE_S * BED_FADE_STEPS);
  bed.fadeTimer = setInterval(() => {
    if (bed.stopped) { clearFade(bed); return; }
    bed.el.volume = Math.min(target, bed.el.volume + step);
    if (bed.el.volume >= target - step / 2) clearFade(bed);
  }, BED_FADE_INTERVAL_MS);
}

function fadeBedOut(bed: HtmlBed): void {
  clearFade(bed);
  const startVol = bed.el.volume;
  if (startVol <= 0) { bed.el.pause(); return; }
  const step = startVol / (BED_FADE_S * BED_FADE_STEPS);
  // Count steps rather than waiting for el.volume to reach 0: iOS WKWebView
  // ignores HTMLAudioElement.volume (see preloadAllCues note), so the volume
  // readback never crosses 0 there and the element would loop forever. After
  // the fade's worth of ticks we pause unconditionally — the audible stop is
  // load-bearing (the crowd bed must die at full-time), the fade is cosmetic.
  let ticksLeft = Math.ceil(BED_FADE_S * BED_FADE_STEPS);
  bed.fadeTimer = setInterval(() => {
    bed.el.volume = Math.max(0, bed.el.volume - step);
    if (bed.el.volume <= 0 || --ticksLeft <= 0) { clearFade(bed); bed.el.pause(); }
  }, BED_FADE_INTERVAL_MS);
}

// ── Public engine API ─────────────────────────────────────────────────────────

/** Play a one-shot (or redirect to playBed for loop assets) by id. */
export function playId(id: string): void {
  const asset = byId.get(id);
  if (!asset) return;
  if (!isChannelEnabled(asset.channel)) return;
  if (asset.loop) { playBed(id); return; }
  const take = pickVariant(id, asset.variants ?? 1);
  const file = variantFile(asset.file, take);
  const vol  = getVolume() * CHANNEL_MIX[asset.channel];
  // On native iOS, UI one-shots play through preloaded AVAudioPlayers (near-zero
  // latency). Returns false on web / if the cue wasn't preloaded — fall through
  // to the HTMLAudioElement path below.
  if (playNativeOneShot(file, vol)) return;
  const el = acquireOneShot(file);
  el.volume = vol;
  try { el.currentTime = 0; } catch { /* not yet seekable — ignore */ }
  void el.play().catch(() => {});
}

/** Cross-fade the given looping bed in on its channel (no-op if already live). */
export function playBed(id: string): void {
  const asset = byId.get(id);
  if (!asset) return;
  if (!isChannelEnabled(asset.channel)) return;
  const ch = asset.channel;

  // Native iOS: loop the bed through AVAudioPlayer so CHANNEL_MIX + master
  // volume apply (the HTML path's el.volume is ignored on iOS). Falls through
  // to the HTML engine below on web / if the bed wasn't preloaded natively.
  if (nativeBedAvailable(asset.file)) {
    if (nativeBeds.get(ch)?.id === id) return; // already looping this bed
    const prev = nativeBeds.get(ch);
    if (prev) stopNativeBed(prev.file);
    nativeBeds.set(ch, { id, file: asset.file });
    playNativeBed(asset.file, htmlTargetVol(ch));
    return;
  }

  if (htmlBeds.get(ch)?.id === id || htmlPending.get(ch) === id) return;

  // Fade out the current bed on this channel before the new one begins.
  const prev = htmlBeds.get(ch);
  if (prev) { htmlBeds.delete(ch); prev.stopped = true; fadeBedOut(prev); }
  htmlPending.set(ch, id);

  const take = pickVariant(id, asset.variants ?? 1);
  const file = variantFile(asset.file, take);
  const el   = new Audio(file);
  el.loop    = true;
  el.volume  = 0;
  const bed: HtmlBed = { el, id, ch, fadeTimer: null, stopped: false };

  let activated = false;
  const activate = (): void => {
    if (activated) return;
    activated = true;
    if (htmlPending.get(ch) !== id) { el.pause(); return; } // superseded
    htmlPending.delete(ch);
    if (!isChannelEnabled(ch)) { el.pause(); return; }
    htmlBeds.set(ch, bed);
    fadeBedIn(bed);
  };

  // el.play() on iOS requires a prior user-gesture unlock (handled in
  // preloadAllCues). If it's blocked, wait for canplaythrough and retry once.
  void el.play().then(activate).catch(() => {
    el.addEventListener('canplaythrough', () => {
      void el.play().then(activate).catch(() => {});
    }, { once: true });
  });
}

/** Fade out and stop the bed on a channel. */
export function stopBed(ch: AudioChannel): void {
  const nb = nativeBeds.get(ch);
  if (nb) { nativeBeds.delete(ch); stopNativeBed(nb.file); }
  htmlPending.delete(ch);
  const bed = htmlBeds.get(ch);
  if (!bed) return;
  htmlBeds.delete(ch);
  bed.stopped = true;
  fadeBedOut(bed);
}

/** Fade out every active bed (e.g. on mute). */
export function stopAllBeds(): void {
  for (const ch of [...htmlBeds.keys(), ...nativeBeds.keys()]) stopBed(ch);
  htmlPending.clear();
}

// ── Settings / lifecycle ──────────────────────────────────────────────────────

export function isUiSfxEnabled(): boolean {
  return localStorage.getItem(SFX_UI_KEY) !== 'off';
}

export function setUiSfxEnabled(on: boolean): void {
  localStorage.setItem(SFX_UI_KEY, on ? 'on' : 'off');
  // No UI-channel beds exist today, so nothing to stop on disable.
}

export function isMatchSfxEnabled(): boolean {
  return localStorage.getItem(SFX_MATCH_KEY) !== 'off';
}

export function setMatchSfxEnabled(on: boolean): void {
  localStorage.setItem(SFX_MATCH_KEY, on ? 'on' : 'off');
  if (!on) {
    // Stop any live match beds (crowd ambient, TMO drone).
    for (const ch of MATCH_CHANNELS) stopBed(ch);
  }
}

export function getVolume(): number {
  const raw = localStorage.getItem(VOLUME_KEY);
  if (raw === null) return 0.7;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : 0.7;
}

export function setVolume(percent: number): void {
  const clamped = Math.max(0, Math.min(100, percent));
  localStorage.setItem(VOLUME_KEY, String(clamped));
  const masterVol = clamped / 100;
  // Sync any non-fading HTML beds to the new master level. One-shots pick up the
  // new level on their next play.
  for (const bed of htmlBeds.values()) {
    if (!bed.stopped && bed.fadeTimer === null) {
      bed.el.volume = masterVol * CHANNEL_MIX[bed.ch];
    }
  }
  // Native iOS beds respect setVolume — push the new master level straight in.
  for (const [ch, nb] of nativeBeds) setNativeBedVolume(nb.file, masterVol * CHANNEL_MIX[ch]);
}

// A genuinely silent 0.1s WAV, used as the unlock probe. iOS WKWebView ignores
// HTMLAudioElement.volume, so a volume=0 probe on a real cue (e.g. a whistle)
// plays at full volume — audibly, on the first user gesture. A silent asset
// unlocks the audio session with no output. Built once as a data URI so it ships
// no binary and is immune to base-path resolution.
function silentWavDataUri(): string {
  const sampleRate = 8000, samples = 800, dataSize = samples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (off: number, s: string): void => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, dataSize, true); // samples left zero ⇒ silence
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

// Arms the iOS WKWebView audio-session unlock on the first user gesture. Playing
// a silent HTMLAudioElement from inside the gesture handler grants permission for
// every subsequent el.play() — one-shots and beds alike — including after
// navigation. (On the desktop web build this is a harmless silent probe.)
let unlockArmed = false;
export function preloadAllCues(): void {
  if (unlockArmed || typeof window === 'undefined') return;
  unlockArmed = true;

  // Native iOS: preload UI one-shots into AVAudioPlayers up front so menu taps
  // fire instantly (no cold-route lag). Only the `ui` channel is routed
  // natively — match SFX stay on HTMLAudioElement, kept warm by the crowd bed.
  // Each variant take is its own native asset. No-op on the web.
  const uiFiles: string[] = [];
  const bedFiles: string[] = [];
  for (const a of AUDIO_MANIFEST) {
    if (a.loop) { bedFiles.push(a.file); continue; } // beds loop natively (volume-controllable on iOS)
    if (a.channel !== 'ui') continue;
    const takes = a.variants ?? 1;
    for (let t = 1; t <= takes; t++) uiFiles.push(variantFile(a.file, t));
  }
  void preloadNativeOneShots(uiFiles);
  void preloadNativeBeds(bedFiles);
  const probeSrc = silentWavDataUri();
  const unlock = (): void => {
    const probe = new Audio(probeSrc);
    void probe.play().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown',     unlock, { once: true });
}
