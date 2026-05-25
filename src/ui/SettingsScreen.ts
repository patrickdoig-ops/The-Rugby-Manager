// Skeleton settings screen. Rendered fields (sound effects toggle, volume
// slider) are intentionally NOT wired to engine state — they exist so the
// screen is laid out and reachable. Wire them up when audio/preferences land.

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

      <section class="settings-section">
        <h2 class="settings-section-title">Audio</h2>

        <div class="settings-row">
          <label class="settings-row-label" for="settings-sfx">Sound effects</label>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-sfx" checked />
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

  const volume = el.querySelector<HTMLInputElement>('#settings-volume')!;
  const volumeLabel = el.querySelector<HTMLElement>('.settings-slider-value')!;
  volume.addEventListener('input', () => {
    volumeLabel.textContent = volume.value;
  });

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
