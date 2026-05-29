import { isSfxEnabled, setSfxEnabled, getVolume, setVolume } from './SoundManager';
import { clearSave } from './SaveManager';
import { VERSION } from '../version';
import {
  loadAutoPauseEnabled, saveAutoPauseEnabled,
  loadAutoSlowEnabled, saveAutoSlowEnabled,
  loadTextScale, saveTextScale, applyTextScale,
  TEXT_SCALE_VALUES, TEXT_SCALE_LABELS,
} from './uiPrefs';

function backIcon(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>`;
}

export function initSettingsScreen(onBack: () => void, onReset = onBack): void {
  const el = document.getElementById('settings');
  if (!el) return;

  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="settings-back" class="app-back" aria-label="Back to home">
          ${backIcon()}
          <span>Home</span>
        </button>
        <span class="app-title">Settings</span>
        <div class="app-topbar-spacer"></div>
      </div>
    </div>

    <div id="settings-body">
      <section class="settings-section">
        <h2 class="settings-section-title">Audio</h2>

        <div class="settings-row">
          <label class="settings-row-label" for="settings-sfx">Sound effects</label>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-sfx" />
            <span class="settings-toggle-track"></span>
          </label>
        </div>

        <div class="settings-row">
          <label class="settings-row-label" for="settings-volume">Volume</label>
          <div class="settings-slider-wrap">
            <input type="range" id="settings-volume" min="0" max="100" value="70" />
            <span class="settings-slider-value">70</span>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-section-title">Accessibility</h2>

        <div class="settings-row settings-row--stack">
          <label class="settings-row-label">Text size</label>
          <div class="settings-segmented" id="settings-textscale" role="group" aria-label="Text size">
            ${TEXT_SCALE_VALUES.map((scale, i) =>
              `<button type="button" class="settings-seg-btn" data-scale="${scale}">${TEXT_SCALE_LABELS[i]}</button>`,
            ).join('')}
          </div>
        </div>
        <p class="settings-sample">The quick brown fox jumps over the lazy dog.</p>
      </section>

      <section class="settings-section">
        <h2 class="settings-section-title">Match</h2>

        <div class="settings-row">
          <label class="settings-row-label" for="settings-autopause">Auto-pause on key moments</label>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-autopause" />
            <span class="settings-toggle-track"></span>
          </label>
        </div>

        <div class="settings-row">
          <label class="settings-row-label" for="settings-autoslow">Auto-slow to 1× on key moments</label>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-autoslow" />
            <span class="settings-toggle-track"></span>
          </label>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-section-title">Advanced</h2>

        <div class="settings-row">
          <label class="settings-row-label">Reset progress</label>
          <button id="settings-reset" class="settings-danger-btn">Reset</button>
        </div>
      </section>

      <section class="settings-section settings-section--meta">
        <h2 class="settings-section-title">About</h2>

        <div class="settings-meta-row">
          <span class="settings-row-label">App version</span>
          <span class="settings-meta-val">${VERSION}</span>
        </div>
        <div class="settings-meta-row">
          <span class="settings-row-label">Build</span>
          <span class="settings-meta-val">${__BUILD_VERSION__}</span>
        </div>
        <div class="settings-meta-row">
          <span class="settings-row-label">Released</span>
          <span class="settings-meta-val">${__BUILD_DATE__}</span>
        </div>
      </section>
    </div>
  `;

  el.querySelector<HTMLButtonElement>('#settings-back')!.addEventListener('click', () => {
    onBack();
  });

  const sfxInput = el.querySelector<HTMLInputElement>('#settings-sfx')!;
  const volume = el.querySelector<HTMLInputElement>('#settings-volume')!;
  const volumeLabel = el.querySelector<HTMLElement>('.settings-slider-value')!;

  sfxInput.checked = isSfxEnabled();
  const initialVol = Math.round(getVolume() * 100);
  volume.value = String(initialVol);
  volumeLabel.textContent = String(initialVol);

  sfxInput.addEventListener('change', () => setSfxEnabled(sfxInput.checked));
  volume.addEventListener('input', () => {
    setVolume(Number(volume.value));
    volumeLabel.textContent = volume.value;
  });

  const autoPause = el.querySelector<HTMLInputElement>('#settings-autopause')!;
  const autoSlow  = el.querySelector<HTMLInputElement>('#settings-autoslow')!;
  autoPause.checked = loadAutoPauseEnabled();
  autoSlow.checked  = loadAutoSlowEnabled();
  autoPause.addEventListener('change', () => saveAutoPauseEnabled(autoPause.checked));
  autoSlow.addEventListener('change', () => saveAutoSlowEnabled(autoSlow.checked));

  const textScaleGroup = el.querySelector<HTMLElement>('#settings-textscale')!;
  const segButtons = Array.from(textScaleGroup.querySelectorAll<HTMLButtonElement>('.settings-seg-btn'));
  const markActive = (scale: number) => {
    for (const btn of segButtons) {
      const on = Number(btn.dataset.scale) === scale;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };
  markActive(loadTextScale());
  for (const btn of segButtons) {
    btn.addEventListener('click', () => {
      const scale = Number(btn.dataset.scale);
      applyTextScale(scale);   // live preview — rescales the whole app, including this screen
      saveTextScale(scale);
      markActive(scale);
    });
  }

  el.querySelector<HTMLButtonElement>('#settings-reset')!.addEventListener('click', () => {
    const ok = window.confirm(
      'Reset all progress?\n\nThis will permanently delete your saved career and start fresh.',
    );
    if (!ok) return;
    clearSave();
    onReset();
  });
}
