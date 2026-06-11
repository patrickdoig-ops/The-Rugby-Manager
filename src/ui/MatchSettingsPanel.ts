import {
  isUiSfxEnabled, setUiSfxEnabled,
  isMatchSfxEnabled, setMatchSfxEnabled,
  getVolume, setVolume,
} from './SoundManager';
import { isHapticsEnabled, setHapticsEnabled } from './HapticsManager';
import { loadKeyMomentMode, saveKeyMomentMode, type KeyMomentMode } from './uiPrefs';
import { VERSION } from '../version';

export function renderMatchSettingsPanel(container: HTMLElement, onClose: () => void): void {
  container.innerHTML = `
    <div class="msp-sheet">
      <div class="msp-header">
        <h2 class="msp-title">Settings</h2>
        <button class="msp-close" aria-label="Close settings" type="button">&times;</button>
      </div>
      <div class="msp-body">
        <section class="settings-section">
          <h2 class="settings-section-title">Audio</h2>
          <div class="settings-row">
            <label class="settings-row-label" for="msp-sfx-ui">UI sound effects</label>
            <label class="settings-toggle">
              <input type="checkbox" id="msp-sfx-ui" />
              <span class="settings-toggle-track"></span>
            </label>
          </div>
          <div class="settings-row">
            <label class="settings-row-label" for="msp-sfx-match">Match sound effects</label>
            <label class="settings-toggle">
              <input type="checkbox" id="msp-sfx-match" />
              <span class="settings-toggle-track"></span>
            </label>
          </div>
          <div class="settings-row">
            <label class="settings-row-label" for="msp-volume">Volume</label>
            <div class="settings-slider-wrap">
              <input type="range" id="msp-volume" min="0" max="100" value="70" />
              <span class="settings-slider-value">70</span>
            </div>
          </div>
          <div class="settings-row">
            <label class="settings-row-label" for="msp-haptics">Haptic feedback</label>
            <label class="settings-toggle">
              <input type="checkbox" id="msp-haptics" />
              <span class="settings-toggle-track"></span>
            </label>
          </div>
        </section>

        <section class="settings-section">
          <h2 class="settings-section-title">Match</h2>
          <div class="settings-row settings-row--stack">
            <label class="settings-row-label">Key moments</label>
            <div class="settings-segmented" id="msp-keymoment" role="group" aria-label="Key moment behaviour">
              <button type="button" class="settings-seg-btn" data-mode="off">Off</button>
              <button type="button" class="settings-seg-btn" data-mode="slow">Slow</button>
              <button type="button" class="settings-seg-btn" data-mode="pause">Pause</button>
            </div>
          </div>
        </section>

        <section class="settings-section settings-section--meta">
          <h2 class="settings-section-title">About</h2>
          <div class="settings-meta-row">
            <span class="settings-row-label">App version</span>
            <span class="settings-meta-val">${VERSION}</span>
          </div>
        </section>
      </div>
    </div>
  `;

  container.querySelector<HTMLButtonElement>('.msp-close')!.addEventListener('click', onClose);

  const sfxUiInput    = container.querySelector<HTMLInputElement>('#msp-sfx-ui')!;
  const sfxMatchInput = container.querySelector<HTMLInputElement>('#msp-sfx-match')!;
  const volumeInput   = container.querySelector<HTMLInputElement>('#msp-volume')!;
  const volumeLabel   = container.querySelector<HTMLElement>('.settings-slider-value')!;

  sfxUiInput.checked    = isUiSfxEnabled();
  sfxMatchInput.checked = isMatchSfxEnabled();
  const initialVol = Math.round(getVolume() * 100);
  volumeInput.value = String(initialVol);
  volumeLabel.textContent = String(initialVol);

  sfxUiInput.addEventListener('change',    () => setUiSfxEnabled(sfxUiInput.checked));
  sfxMatchInput.addEventListener('change', () => setMatchSfxEnabled(sfxMatchInput.checked));
  volumeInput.addEventListener('input', () => {
    setVolume(Number(volumeInput.value));
    volumeLabel.textContent = volumeInput.value;
  });

  const hapticsInput = container.querySelector<HTMLInputElement>('#msp-haptics')!;
  hapticsInput.checked = isHapticsEnabled();
  hapticsInput.addEventListener('change', () => setHapticsEnabled(hapticsInput.checked));

  const kmGroup = container.querySelector<HTMLElement>('#msp-keymoment')!;
  const kmBtns  = Array.from(kmGroup.querySelectorAll<HTMLButtonElement>('.settings-seg-btn'));
  const refreshKm = (mode: KeyMomentMode) => {
    for (const btn of kmBtns) {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };
  refreshKm(loadKeyMomentMode());
  for (const btn of kmBtns) {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as KeyMomentMode;
      saveKeyMomentMode(mode);
      refreshKm(mode);
    });
  }
}
