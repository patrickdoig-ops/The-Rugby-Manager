// Lightweight audio cue manager. Preloads three cues, gates playback
// behind a localStorage preference, exposes a tiny API.
type Cue = 'whistle' | 'crowdRoar' | 'uiClick';

const SFX_KEY    = 'rugby-manager-sfx';
const VOLUME_KEY = 'rugby-manager-volume';

// Base-relative so the cues resolve under both the GitHub Pages sub-path
// (/Rugby-Simulator-/) and the Capacitor native origin (capacitor://localhost).
const BASE = import.meta.env.BASE_URL;
const sources: Record<Cue, string> = {
  whistle:   `${BASE}audio/whistle.mp3`,
  crowdRoar: `${BASE}audio/crowd-roar.mp3`,
  uiClick:   `${BASE}audio/ui-click.mp3`,
};

const cache: Partial<Record<Cue, HTMLAudioElement>> = {};

function preload(cue: Cue): HTMLAudioElement {
  if (cache[cue]) return cache[cue]!;
  const a = new Audio(sources[cue]);
  a.preload = 'auto';
  cache[cue] = a;
  return a;
}

export function preloadAllCues(): void {
  (Object.keys(sources) as Cue[]).forEach(preload);
}

export function isSfxEnabled(): boolean {
  return localStorage.getItem(SFX_KEY) !== 'off';
}

export function setSfxEnabled(on: boolean): void {
  localStorage.setItem(SFX_KEY, on ? 'on' : 'off');
}

export function getVolume(): number {
  const v = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : 0.7;
}

export function setVolume(percent: number): void {
  localStorage.setItem(VOLUME_KEY, String(Math.max(0, Math.min(100, percent))));
}

export function playCue(cue: Cue): void {
  if (!isSfxEnabled()) return;
  const a = preload(cue);
  a.volume = getVolume();
  a.currentTime = 0;
  void a.play().catch(() => { /* autoplay denied — silent */ });
}
