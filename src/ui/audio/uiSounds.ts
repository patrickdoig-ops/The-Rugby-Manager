// UI sound routing — turns DOM interactions into interface cues. The sibling of
// AudioDirector (match/season cues): this one listens to the document rather
// than the event bus, since clicks/toggles/slider drags have no engine event.
//
// Routing precedence on pointerdown:
//   1. An explicit `data-sfx="…"` on the nearest ancestor wins (the override
//      hook — tag commit CTAs with data-sfx="confirm", etc.).
//   2. Back / cancel controls (.app-back / .app-back-floating) → click.back.
//   3. Any other button / tile / card → click.primary (the default).
// Toggles (checkbox / radio change) and slider drags (range input) are detected
// generically, so no per-element tagging is needed for those.
//
// playId is gated on the SFX preference inside SoundManager, so callers here
// never check it.

import { playId } from '../SoundManager';

// data-sfx value → manifest cue id. Unknown values fall back to primary.
const SFX_BY_DATA: Record<string, string> = {
  back:    'ui.click.back',
  confirm: 'ui.confirm',
  toggle:  'ui.toggle',
  error:   'ui.error',
};

// Slider drags fire `input` continuously; throttle the tick so a drag produces
// a sparse detent rather than a buzz. Uses performance.now() — wall-clock UI
// timing, unrelated to the engine's seeded RNG determinism boundary.
const SLIDER_MIN_GAP_MS = 70;

let inited = false;
export function initUiSounds(): void {
  if (inited) return;
  inited = true;

  // pointerdown, not click: on touch devices `click` fires only after
  // touchend + a tap-disambiguation wait (~300ms+ on iOS WKWebView), so a
  // click-bound cue lags the finger noticeably. pointerdown fires the instant
  // contact is made and covers mouse + touch alike.
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const tagged = target.closest<HTMLElement>('[data-sfx]');
    if (tagged) {
      playId(SFX_BY_DATA[tagged.dataset.sfx ?? ''] ?? 'ui.click.primary');
      return;
    }
    if (target.closest('.app-back, .app-back-floating')) { playId('ui.click.back'); return; }
    if (target.closest('button, .hub-tile, .ts-card, .mp-card')) { playId('ui.click.primary'); }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && (t.type === 'checkbox' || t.type === 'radio')) {
      playId('ui.toggle');
    }
  });

  let lastSliderTick = 0;
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'range') return;
    const now = performance.now();
    if (now - lastSliderTick < SLIDER_MIN_GAP_MS) return;
    lastSliderTick = now;
    playId('ui.slider');
  });
}
