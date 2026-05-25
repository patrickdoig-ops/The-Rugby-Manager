import { isSfxEnabled, setSfxEnabled, getVolume, setVolume } from './SoundManager';

const LIGHT_MODE_EXPERIMENTAL = false;

function backIcon(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>`;
}

export function initSettingsScreen(onBack: () => void): void {
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
      ${LIGHT_MODE_EXPERIMENTAL ? `
      <section class="settings-section">
        <h2 class="settings-section-title">Display</h2>

        <div class="settings-row">
          <label class="settings-row-label" for="settings-theme">Light mode</label>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-theme" />
            <span class="settings-toggle-track"></span>
          </label>
        </div>
      </section>
      ` : ''}

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

  if (LIGHT_MODE_EXPERIMENTAL) {
    const themeInput = el.querySelector<HTMLInputElement>('#settings-theme')!;
    const THEME_KEY = 'rugby-manager-theme';

    // Reflect current state on mount
    themeInput.checked = document.body.classList.contains('light-mode');

    themeInput.addEventListener('change', () => {
      if (themeInput.checked) {
        document.body.classList.add('light-mode');
        localStorage.setItem(THEME_KEY, 'light');
      } else {
        document.body.classList.remove('light-mode');
        localStorage.setItem(THEME_KEY, 'dark');
      }
    });
  }
}
