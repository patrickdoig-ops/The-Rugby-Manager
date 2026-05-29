// Manifest-driven Web Audio engine.
//
// Builds a small mixing graph — per-channel GainNodes feeding a master gain —
// and plays cues by their manifest id (src/ui/audio/audioManifest.ts). Buffers
// are fetched + decoded lazily on first use; a missing / undecodable file
// caches as null and silently no-ops, so the engine works before the assets
// are sourced. Looping beds (crowd ambience, screen music) cross-fade within
// their channel. Playback is gated behind the SFX preference + master volume,
// both persisted in localStorage.
//
// The routing layer (which game/match/screen moment fires which cue) lives in
// src/ui/audio/AudioDirector.ts. This module is just the engine + the legacy
// playCue/settings API the existing call sites depend on.

import { AUDIO_MANIFEST, type AudioAsset, type AudioChannel } from './audio/audioManifest';

const SFX_KEY    = 'rugby-manager-sfx';
const VOLUME_KEY = 'rugby-manager-volume';

const BED_FADE_S = 0.8; // cross-fade duration for looping beds

// Per-channel base level relative to master — keeps continuous beds sitting
// under the one-shot reactions/whistles that punch through them.
const CHANNEL_MIX: Record<AudioChannel, number> = {
  'whistle':        1.0,
  'crowd-bed':      0.5,
  'crowd-reaction': 0.9,
  'impact':         0.8,
  'ui':             0.7,
  'stinger':        0.9,
  'music':          0.45,
};

// Legacy cue names mapped onto manifest ids so the pre-existing call sites
// (main.ts UI click, MatchResultScreen, EndOfSeasonScreen, TakeoverRevealScreen)
// keep working through the new engine without edits.
const LEGACY_CUE: Record<string, string> = {
  uiClick:   'ui.click.primary',
  whistle:   'whistle.full_time',
  crowdRoar: 'crowd.try.routine',
};

const byId = new Map<string, AudioAsset>();
for (const a of AUDIO_MANIFEST) byId.set(a.id, a);

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
const channelGains = new Map<AudioChannel, GainNode>();

// Decoded buffers: AudioBuffer once loaded, null once a load has failed/missed.
const buffers = new Map<string, AudioBuffer | null>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

// One active looping bed per channel, plus the id we're transitioning toward
// (guards against a race when two playBed calls land before the buffer loads).
interface ActiveBed { src: AudioBufferSourceNode; gain: GainNode; id: string }
const beds = new Map<AudioChannel, ActiveBed>();
const pendingBed = new Map<AudioChannel, string>();

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

function loadBuffer(id: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(id);
  if (cached !== undefined) return Promise.resolve(cached);
  const inflight = loading.get(id);
  if (inflight) return inflight;

  const asset = byId.get(id);
  const c = getCtx();
  if (!asset || !c) {
    buffers.set(id, null);
    return Promise.resolve(null);
  }
  const p = (async (): Promise<AudioBuffer | null> => {
    try {
      const res = await fetch(asset.file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.arrayBuffer();
      const buf = await c.decodeAudioData(arr);
      buffers.set(id, buf);
      return buf;
    } catch {
      // Missing or undecodable — cache the miss and stay silent. This is the
      // expected path until the asset files are added under public/audio/.
      buffers.set(id, null);
      return null;
    } finally {
      loading.delete(id);
    }
  })();
  loading.set(id, p);
  return p;
}

function fadeOutBed(ch: AudioChannel): void {
  const c = ctx;
  const cur = beds.get(ch);
  if (!c || !cur) return;
  beds.delete(ch);
  try {
    const now = c.currentTime;
    cur.gain.gain.cancelScheduledValues(now);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, now);
    cur.gain.gain.linearRampToValueAtTime(0, now + BED_FADE_S);
    cur.src.stop(now + BED_FADE_S + 0.05);
  } catch {
    /* source already stopped — ignore */
  }
}

// ── Public engine API ────────────────────────────────────────────────────────

/** Play a one-shot (or, if the asset is a loop, hand off to playBed) by id. */
export function playId(id: string): void {
  if (!isSfxEnabled()) return;
  const asset = byId.get(id);
  if (!asset) return;
  if (asset.loop) { playBed(id); return; }
  const c = getCtx();
  if (!c) return;
  void c.resume();
  void loadBuffer(id).then(buf => {
    if (!buf || !isSfxEnabled()) return;
    const g = channelGain(asset.channel);
    if (!g) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    src.start();
  });
}

/** Cross-fade the given looping bed in on its channel (no-op if already live). */
export function playBed(id: string): void {
  if (!isSfxEnabled()) return;
  const asset = byId.get(id);
  if (!asset) return;
  const ch = asset.channel;
  if (beds.get(ch)?.id === id || pendingBed.get(ch) === id) return;
  pendingBed.set(ch, id);
  const c = getCtx();
  if (!c) return;
  void c.resume();
  void loadBuffer(id).then(buf => {
    if (pendingBed.get(ch) !== id) return; // superseded by a later playBed/stopBed
    pendingBed.delete(ch);
    if (!buf || !isSfxEnabled()) return;
    const parent = channelGain(ch);
    if (!parent) return;
    fadeOutBed(ch); // ramp the outgoing bed down as the new one comes up
    const now = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.connect(parent);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(g);
    src.start();
    g.gain.linearRampToValueAtTime(1, now + BED_FADE_S);
    beds.set(ch, { src, gain: g, id });
  });
}

/** Fade out and stop the bed on a channel. */
export function stopBed(ch: AudioChannel): void {
  pendingBed.delete(ch);
  fadeOutBed(ch);
}

/** Fade out every active bed (e.g. on mute). */
export function stopAllBeds(): void {
  for (const ch of [...beds.keys()]) fadeOutBed(ch);
  pendingBed.clear();
}

// ── Settings / lifecycle (back-compatible with the previous SoundManager) ────

export function isSfxEnabled(): boolean {
  return localStorage.getItem(SFX_KEY) !== 'off';
}

export function setSfxEnabled(on: boolean): void {
  localStorage.setItem(SFX_KEY, on ? 'on' : 'off');
  if (!on) stopAllBeds();
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
  if (masterGain && ctx) {
    masterGain.gain.setValueAtTime(clamped / 100, ctx.currentTime);
  }
}

// Arms the AudioContext unlock on the first user gesture (browser autoplay
// policy keeps it suspended until then). Named preloadAllCues for back-compat
// with main.ts; it no longer eagerly fetches (buffers load lazily on first
// play, avoiding a request storm for not-yet-sourced assets).
let unlockArmed = false;
export function preloadAllCues(): void {
  if (unlockArmed || typeof window === 'undefined') return;
  unlockArmed = true;
  const unlock = (): void => { void getCtx()?.resume(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

/** Legacy 3-cue API — maps onto manifest ids. */
export function playCue(cue: 'whistle' | 'crowdRoar' | 'uiClick'): void {
  const id = LEGACY_CUE[cue];
  if (id) playId(id);
}
