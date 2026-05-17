import { VERSION } from '../version';

const THEME_KEY = 'rugby-manager-theme';

function sunIcon(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`;
}

function syncThemeBtn(btn: HTMLButtonElement): void {
  const light = document.body.classList.contains('light-mode');
  btn.innerHTML = light ? moonIcon() : sunIcon();
  btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
}

export function initHomeScreen(onStart: () => void): void {
  const el = document.getElementById('home-screen');
  if (!el) return;

  el.innerHTML = `
    <button id="theme-toggle"></button>
    <div id="home-content">
      <h1 id="home-title">Rugby Manager</h1>
      <p id="home-version">v${VERSION}</p>
      <button id="start-game-btn">Start Game</button>
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
