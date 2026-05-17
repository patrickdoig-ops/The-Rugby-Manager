import { VERSION } from '../version';

const THEME_KEY = 'rugby-manager-theme';

function sunIcon(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>`;
}

function moonIcon(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`;
}

function syncThemeBtn(btn: HTMLButtonElement): void {
  const light = document.body.classList.contains('light-mode');
  btn.innerHTML = light ? moonIcon() : sunIcon();
  btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
}

function pitchLinesSvg(): string {
  return `<svg class="home-pitch-lines" aria-hidden="true" viewBox="0 0 402 874" preserveAspectRatio="none">
    <defs>
      <linearGradient id="lineFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="white" stop-opacity="0"/>
        <stop offset="50%"  stop-color="white" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="0"   y1="220" x2="402" y2="220" stroke="url(#lineFade)" stroke-width="0.6"/>
    <line x1="0"   y1="654" x2="402" y2="654" stroke="url(#lineFade)" stroke-width="0.6"/>
    <line x1="201" y1="0"   x2="201" y2="874" stroke="url(#lineFade)" stroke-width="0.6"/>
    <circle cx="201" cy="437" r="80" stroke="url(#lineFade)" stroke-width="0.6" fill="none"/>
  </svg>`;
}

function arrowIcon(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 5l7 7-7 7"/>
  </svg>`;
}

export function initHomeScreen(onStart: () => void): void {
  const el = document.getElementById('home-screen');
  if (!el) return;

  el.innerHTML = `
    ${pitchLinesSvg()}

    <div id="home-chrome">
      <div id="home-status">
        <span class="home-live-dot"></span>
        <span class="home-status-text">Season 2026</span>
      </div>
      <button id="theme-toggle"></button>
    </div>

    <div id="home-hero">
      <div class="home-eyebrow">&#9658;&nbsp; A Simulated Rugby Season</div>
      <h1 id="home-title">Rugby<br>Manager</h1>
      <div class="home-version-row">
        <span class="home-version-badge">v${VERSION}</span>
        <span class="home-version-hr"></span>
      </div>
      <p id="home-tagline">
        <strong>Build your squad. Call the shots.</strong>
        Every phase, every decision, every point.
      </p>
    </div>

    <div id="home-cta">
      <button id="start-game-btn">
        <span class="btn-label">Start Game</span>
        ${arrowIcon()}
      </button>
    </div>
  `;

  const themeBtn = el.querySelector<HTMLButtonElement>('#theme-toggle')!;
  syncThemeBtn(themeBtn);

  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    localStorage.setItem(THEME_KEY, document.body.classList.contains('light-mode') ? 'light' : 'dark');
    syncThemeBtn(themeBtn);
  });

  el.querySelector<HTMLButtonElement>('#start-game-btn')!.addEventListener('click', () => {
    el.style.display = 'none';
    onStart();
  });
}
