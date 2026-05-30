// Manifest-driven audio engine.
//
// One-shot cues (whistles, impacts, crowd reactions, stingers) route through a
// Web Audio graph — per-channel GainNodes → master gain — with buffers fetched
// and decoded lazily on first use. A missing / undecodable file caches as null
// and silently no-ops (falls back to procedural synthesis where a generator
// exists).
//
// Looping ambient beds use HTMLAudioElement with loop=true instead of the Web
// Audio decode pipeline. On iOS WKWebView (Capacitor) large buffers decoded via
// decodeAudioData (>~500 KB compressed → ~20 MB PCM) fail silently; bed-engaged
// at 909 KB is the primary victim. HTMLAudioElement hands off decoding + looping
// to the native audio layer, bypassing this limit entirely. Volume cross-fades
// are driven by a setInterval ramp on el.volume rather than gainNode automation,
// keeping beds independent of the AudioContext run/suspend lifecycle.

import { AUDIO_MANIFEST, type AudioAsset, type AudioChannel } from './audio/audioManifest';
import { synthesize } from './audio/synth';

const SFX_UI_KEY    = 'rugby-manager-sfx-ui';
const SFX_MATCH_KEY = 'rugby-manager-sfx-match';
const VOLUME_KEY    = 'rugby-manager-volume';

const BED_FADE_S           = 0.8;  // cross-fade duration when switching beds
const BED_FADE_STEPS       = 20;   // setInterval updates per second during a fade
const BED_FADE_INTERVAL_MS = 1000 / BED_FADE_STEPS;

// Per-channel base level relative to master.
const CHANNEL_MIX: Record<AudioChannel, number> = {
  'whistle':        1.0,
  'crowd-bed':      0.4,
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

// ── Web Audio graph (one-shots only) ─────────────────────────────────────────

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
const channelGains = new Map<AudioChannel, GainNode>();

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
  ctx = new AudioContext();
  masterGain = ctx.createGain();
  masterGain.gain.value = getVolume();
  masterGain.connect(ctx.destination);
  return ctx;
}

function channelGain(ch: AudioChannel): GainNode | null {
  const c = getCtx();
  if (!c || !masterGain) return null;
  let g = channelGains.get(ch);
  if (!g) {
    g = c.createGain();
    g.gain.value = CHANNEL_MIX[ch];
    g.connect(masterGain);
    channelGains.set(ch, g);
  }
  return g;
}

// Decoded buffers: AudioBuffer once loaded, null once a load has failed/missed.
const buffers = new Map<string, AudioBuffer | null>();
const loading  = new Map<string, Promise<AudioBuffer | null>>();

function loadBufferAt(key: string, file: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const inflight = loading.get(key);
  if (inflight) return inflight;
  const c = getCtx();
  if (!c) { buffers.set(key, null); return Promise.resolve(null); }
  const p = (async (): Promise<AudioBuffer | null> => {
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.arrayBuffer();
      const buf = await c.decodeAudioData(arr);
      buffers.set(key, buf);
      return buf;
    } catch {
      // Missing or undecodable — cache the miss and stay silent.
      buffers.set(key, null);
      return null;
    } finally {
      loading.delete(key);
    }
  })();
  loading.set(key, p);
  return p;
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
  bed.fadeTimer = setInterval(() => {
    bed.el.volume = Math.max(0, bed.el.volume - step);
    if (bed.el.volume <= 0) { clearFade(bed); bed.el.pause(); }
  }, BED_FADE_INTERVAL_MS);
}

// ── Public engine API ─────────────────────────────────────────────────────────

/** Play a one-shot (or redirect to playBed for loop assets) by id. */
export function playId(id: string): void {
  const asset = byId.get(id);
  if (!asset) return;
  if (!isChannelEnabled(asset.channel)) return;
  if (asset.loop) { playBed(id); return; }
  const c = getCtx();
  if (!c) return;
  void c.resume();
  const take = pickVariant(id, asset.variants ?? 1);
  const key  = take <= 1 ? id : `${id}:${take}`;
  const file = variantFile(asset.file, take);
  void loadBufferAt(key, file).then(buf => {
    if (!isChannelEnabled(asset.channel)) return;
    const g = channelGain(asset.channel);
    if (!g) return;
    if (buf) {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start();
      return;
    }
    // No file present — fall back to procedural synthesis if a generator exists.
    synthesize(c, g, id);
  });
}

/** Cross-fade the given looping bed in on its channel (no-op if already live). */
export function playBed(id: string): void {
  const asset = byId.get(id);
  if (!asset) return;
  if (!isChannelEnabled(asset.channel)) return;
  const ch = asset.channel;
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
  htmlPending.delete(ch);
  const bed = htmlBeds.get(ch);
  if (!bed) return;
  htmlBeds.delete(ch);
  bed.stopped = true;
  fadeBedOut(bed);
}

/** Fade out every active bed (e.g. on mute). */
export function stopAllBeds(): void {
  for (const ch of [...htmlBeds.keys()]) stopBed(ch);
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
  if (masterGain && ctx) {
    masterGain.gain.setValueAtTime(masterVol, ctx.currentTime);
  }
  // Sync any non-fading HTML beds to the new master level.
  for (const bed of htmlBeds.values()) {
    if (!bed.stopped && bed.fadeTimer === null) {
      bed.el.volume = masterVol * CHANNEL_MIX[bed.ch];
    }
  }
}

// Arms the AudioContext unlock on the first user gesture (browser autoplay
// policy). Also fires a silent HTMLAudioElement probe from within the same
// gesture handler, which grants the iOS WKWebView audio-session permission for
// all subsequent el.play() calls — including the crowd bed after navigation.
let unlockArmed = false;
export function preloadAllCues(): void {
  if (unlockArmed || typeof window === 'undefined') return;
  unlockArmed = true;
  const unlock = (): void => {
    void getCtx()?.resume();
    // iOS HTMLAudioElement unlock: play a short silent file from the user-gesture
    // context. Any file works; whistle.stoppage (9.8 KB) is the smallest asset.
    const probeAsset = byId.get('whistle.stoppage');
    if (probeAsset) {
      const probe = new Audio(probeAsset.file);
      probe.volume = 0;
      void probe.play().catch(() => {});
    }
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown',     unlock, { once: true });
}
