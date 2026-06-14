import { isUiSfxEnabled, setUiSfxEnabled, isMatchSfxEnabled, setMatchSfxEnabled, getVolume, setVolume } from './SoundManager';
import { isHapticsEnabled, setHapticsEnabled } from './HapticsManager';
import { clearSave } from './SaveManager';
import { VERSION } from '../version';
import {
  loadKeyMomentMode, saveKeyMomentMode, type KeyMomentMode,
  TEXT_SCALE_VALUES, TEXT_SCALE_LABELS,
} from './uiPrefs';
import {
  setManualTextScale, setFollowSystem, setTextScaleChangeHandler,
  isFollowingSystem, systemFollowAvailable, getEffectiveTextScale,
} from './textScale';
import { helpButtonHtml } from './help/helpButton';
import { restartOnboarding } from './onboarding/OnboardingDirector';

function backIcon(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>`;
}

export function initSettingsScreen(onBack: () => void, onReset = onBack, onSaves: () => void = () => {}, onSaveAndHome: (() => void) | null = null): void {
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
        <div class="app-topbar-spacer">${helpButtonHtml('settings')}</div>
      </div>
    </div>

    <div id="settings-body">
      <section class="settings-section">
        <h2 class="settings-section-title">Audio</h2>

        <div class="settings-row">
          <label class="settings-row-label" for="settings-sfx-ui">UI sound effects</label>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-sfx-ui" />
            <span class="settings-toggle-track"></span>
          </label>
        </div>

        <div class="settings-row">
          <label class="settings-row-label" for="settings-sfx-match">Match sound effects</label>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-sfx-match" />
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

        <div class="settings-row">
          <label class="settings-row-label" for="settings-haptics">Haptic feedback</label>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-haptics" />
            <span class="settings-toggle-track"></span>
          </label>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-section-title">Accessibility</h2>

        <div class="settings-row">
          <label class="settings-row-label" for="settings-theme">Light theme</label>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-theme" />
            <span class="settings-toggle-track"></span>
          </label>
        </div>

        <div class="settings-row">
          <label class="settings-row-label" for="settings-cb">Colour-blind dot shapes</label>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-cb" />
            <span class="settings-toggle-track"></span>
          </label>
        </div>

        ${systemFollowAvailable() ? `
        <div class="settings-row">
          <label class="settings-row-label" for="settings-followsystem">Follow system text size</label>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-followsystem" />
            <span class="settings-toggle-track"></span>
          </label>
        </div>` : ''}

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

        <div class="settings-row settings-row--stack">
          <label class="settings-row-label">Key moments</label>
          <div class="settings-segmented" id="settings-keymoment" role="group" aria-label="Key moment behaviour">
            <button type="button" class="settings-seg-btn" data-mode="off">Off</button>
            <button type="button" class="settings-seg-btn" data-mode="slow">Slow</button>
            <button type="button" class="settings-seg-btn" data-mode="pause">Pause</button>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-section-title">Saves</h2>

        ${onSaveAndHome ? `
        <div class="settings-row">
          <label class="settings-row-label">Save and back to Home</label>
          <button id="settings-save-home" class="settings-secondary-btn">Save</button>
        </div>` : ''}

        <div class="settings-row">
          <label class="settings-row-label">Manage saves &amp; backup</label>
          <button id="settings-saves" class="settings-secondary-btn">Open</button>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-section-title">Advanced</h2>

        <div class="settings-row">
          <label class="settings-row-label">Reset progress</label>
          <button id="settings-reset" class="settings-danger-btn">Reset</button>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-section-title">Help</h2>

        <div class="settings-row">
          <label class="settings-row-label">Replay guided tour</label>
          <button id="settings-replay-tour" class="settings-secondary-btn">Start</button>
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
    setTextScaleChangeHandler(null);   // detach — this render is going away
    onBack();
  });

  const sfxUiInput    = el.querySelector<HTMLInputElement>('#settings-sfx-ui')!;
  const sfxMatchInput = el.querySelector<HTMLInputElement>('#settings-sfx-match')!;
  const volume        = el.querySelector<HTMLInputElement>('#settings-volume')!;
  const volumeLabel   = el.querySelector<HTMLElement>('.settings-slider-value')!;

  sfxUiInput.checked    = isUiSfxEnabled();
  sfxMatchInput.checked = isMatchSfxEnabled();
  const initialVol = Math.round(getVolume() * 100);
  volume.value = String(initialVol);
  volumeLabel.textContent = String(initialVol);

  sfxUiInput.addEventListener('change',    () => setUiSfxEnabled(sfxUiInput.checked));
  sfxMatchInput.addEventListener('change', () => setMatchSfxEnabled(sfxMatchInput.checked));
  volume.addEventListener('input', () => {
    setVolume(Number(volume.value));
    volumeLabel.textContent = volume.value;
  });

  const hapticsInput = el.querySelector<HTMLInputElement>('#settings-haptics')!;
  hapticsInput.checked = isHapticsEnabled();
  hapticsInput.addEventListener('change', () => setHapticsEnabled(hapticsInput.checked));

  const kmGroup = el.querySelector<HTMLElement>('#settings-keymoment')!;
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

  if (onSaveAndHome) {
    el.querySelector<HTMLButtonElement>('#settings-save-home')!.addEventListener('click', () => {
      setTextScaleChangeHandler(null);
      onSaveAndHome();
    });
  }

  el.querySelector<HTMLButtonElement>('#settings-saves')!.addEventListener('click', () => {
    onSaves();
  });

  el.querySelector<HTMLButtonElement>('#settings-replay-tour')!.addEventListener('click', () => {
    setTextScaleChangeHandler(null);   // detach — this render is going away
    restartOnboarding();               // resets the tour and jumps to team select
  });

  const textScaleGroup = el.querySelector<HTMLElement>('#settings-textscale')!;
  const segButtons = Array.from(textScaleGroup.querySelectorAll<HTMLButtonElement>('.settings-seg-btn'));
  const followInput = el.querySelector<HTMLInputElement>('#settings-followsystem');
  // Snap the effective scale (which, when following the system, may sit between
  // the discrete steps) to the nearest step for the active highlight.
  const nearestStep = (scale: number) =>
    TEXT_SCALE_VALUES.reduce((a, b) => (Math.abs(b - scale) < Math.abs(a - scale) ? b : a));
  const refresh = () => {
    const following = isFollowingSystem() && systemFollowAvailable();
    const active = nearestStep(getEffectiveTextScale());
    for (const btn of segButtons) {
      const on = Number(btn.dataset.scale) === active;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.disabled = following;
    }
    textScaleGroup.classList.toggle('is-disabled', following);
    if (followInput) followInput.checked = following;
  };
  if (followInput) {
    followInput.addEventListener('change', () => {
      setFollowSystem(followInput.checked);   // live — rescales the whole app, including this screen
      refresh();
    });
  }
  for (const btn of segButtons) {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      setManualTextScale(Number(btn.dataset.scale));
      refresh();
    });
  }
  // Live-update the highlight if the system size changes while Settings is open.
  setTextScaleChangeHandler(() => refresh());
  refresh();

  // Light theme toggle
  const themeInput = el.querySelector<HTMLInputElement>('#settings-theme')!;
  themeInput.checked = document.documentElement.getAttribute('data-theme') === 'light';
  themeInput.addEventListener('change', () => {
    const next = themeInput.checked ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('rugbyTheme', next);
  });

  // Colour-blind dot shapes toggle
  const cbInput = el.querySelector<HTMLInputElement>('#settings-cb')!;
  cbInput.checked = document.documentElement.getAttribute('data-a11y') === 'cb';
  cbInput.addEventListener('change', () => {
    if (cbInput.checked) {
      document.documentElement.setAttribute('data-a11y', 'cb');
      localStorage.setItem('rugbyA11y', 'cb');
    } else {
      document.documentElement.removeAttribute('data-a11y');
      localStorage.removeItem('rugbyA11y');
    }
  });

  el.querySelector<HTMLButtonElement>('#settings-reset')!.addEventListener('click', () => {
    const ok = window.confirm(
      'Reset all progress?\n\nThis will permanently delete your saved career and start fresh.',
    );
    if (!ok) return;
    clearSave();
    onReset();
  });
}
