import { VERSION } from '../version';
import { loadSave, clearSave } from './SaveManager';
import type { RawTeamInput } from '../types/teamData';
import { buildSaveContext, ordinalSuffix, type SaveContext } from '../game/saveSummary';
import { helpButtonHtml } from './help/helpButton';
import { formatDateMedium } from '../utils/formatDate';

function pitchLinesSvg(): string {
  return `<svg class="home-pitch-lines" aria-hidden="true" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="hsLineFadeV" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="white" stop-opacity="0"/>
        <stop offset="35%" stop-color="white" stop-opacity="1"/>
        <stop offset="65%" stop-color="white" stop-opacity="1"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="hsLineFadeH" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"  stop-color="white" stop-opacity="0"/>
        <stop offset="50%" stop-color="white" stop-opacity="1"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="hsLineFadeHF" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"  stop-color="white" stop-opacity="0"/>
        <stop offset="50%" stop-color="white" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <!-- Centre line -->
    <line x1="195" y1="0"   x2="195" y2="844" stroke="url(#hsLineFadeV)"  stroke-width="0.7"/>
    <!-- Try lines -->
    <line x1="0"   y1="80"  x2="390" y2="80"  stroke="url(#hsLineFadeH)"  stroke-width="0.8"/>
    <line x1="0"   y1="764" x2="390" y2="764" stroke="url(#hsLineFadeH)"  stroke-width="0.8"/>
    <!-- 22m lines -->
    <line x1="0"   y1="210" x2="390" y2="210" stroke="url(#hsLineFadeH)"  stroke-width="0.55"/>
    <line x1="0"   y1="634" x2="390" y2="634" stroke="url(#hsLineFadeH)"  stroke-width="0.55"/>
    <!-- 10m lines (faint) -->
    <line x1="0"   y1="310" x2="390" y2="310" stroke="url(#hsLineFadeHF)" stroke-width="0.45"/>
    <line x1="0"   y1="534" x2="390" y2="534" stroke="url(#hsLineFadeHF)" stroke-width="0.45"/>
    <!-- Halfway line (no circle — rugby pitch has no centre circle) -->
    <!-- Goal posts top -->
    <line x1="168" y1="0"   x2="168" y2="55"  stroke="url(#hsLineFadeV)"  stroke-width="0.6"/>
    <line x1="222" y1="0"   x2="222" y2="55"  stroke="url(#hsLineFadeV)"  stroke-width="0.6"/>
    <line x1="155" y1="38"  x2="235" y2="38"  stroke="url(#hsLineFadeHF)" stroke-width="0.6"/>
    <!-- Goal posts bottom -->
    <line x1="168" y1="844" x2="168" y2="789" stroke="url(#hsLineFadeV)"  stroke-width="0.6"/>
    <line x1="222" y1="844" x2="222" y2="789" stroke="url(#hsLineFadeV)"  stroke-width="0.6"/>
    <line x1="155" y1="806" x2="235" y2="806" stroke="url(#hsLineFadeHF)" stroke-width="0.6"/>
  </svg>`;
}

function arrowIcon(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 5l7 7-7 7"/>
  </svg>`;
}

function saveCardHtml(ctx: SaveContext): string {
  const progressPct = Math.round((ctx.week / ctx.totalRounds) * 100);
  const rankStr = ctx.rank > 0 ? `${ctx.rank}${ordinalSuffix(ctx.rank)}` : '—';
  return `
    <button id="home-save-card" type="button">
      <div class="save-card-label">
        <span>&#9658;&nbsp; Continue Career</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
      </div>
      <div class="save-card-main">
        <span class="save-card-team">${ctx.teamName}</span>
        <div class="save-card-stats">
          ${ctx.rank > 0 ? `
          <div class="save-stat">
            <span class="save-stat-val">${rankStr}</span>
            <span class="save-stat-lbl">Position</span>
          </div>` : ''}
          <div class="save-stat">
            <span class="save-stat-val">${ctx.pts}</span>
            <span class="save-stat-lbl">Points</span>
          </div>
        </div>
      </div>
      <div class="save-card-footer">
        <div class="save-card-meta">
          <span class="save-card-season">${ctx.seasonLabel}</span>
          <span>${ctx.date ? formatDateMedium(ctx.date) : `Wk ${ctx.week}`}</span>
        </div>
        <div class="save-progress-track">
          <div class="save-progress-fill" style="width:${progressPct}%"></div>
        </div>
      </div>
    </button>
  `;
}

function confirmModalHtml(ctx: SaveContext): string {
  return `
    <div class="home-confirm-backdrop" id="home-confirm-backdrop">
      <div class="home-confirm">
        <div class="home-confirm-handle"></div>
        <div class="home-confirm-title">Start New Game?</div>
        <div class="home-confirm-body">This will permanently delete your save — ${ctx.teamName}, ${ctx.date ? formatDateMedium(ctx.date) : `Week ${ctx.week}`}${ctx.rank > 0 ? `, ${ctx.rank}${ordinalSuffix(ctx.rank)} place` : ''}. This cannot be undone.</div>
        <div class="home-confirm-actions">
          <button class="home-confirm-btn home-confirm-cancel" id="home-confirm-cancel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            Cancel
          </button>
          <button class="home-confirm-btn home-confirm-proceed" id="home-confirm-proceed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m4.5 12.75 6 6 9-13.5"/></svg>
            New Game
          </button>
        </div>
      </div>
    </div>
  `;
}

function gearIcon(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>`;
}

export function initHomeScreen(
  onStart: () => void,
  onContinue: () => void,
  onSettings: () => void,
  allTeams: RawTeamInput[] = [],
  onSaves: () => void = () => {},
): void {
  const el = document.getElementById('home-screen');
  if (!el) return;

  const save = loadSave();
  const hasSave = save !== null;
  const ctx = save ? buildSaveContext(save, allTeams) : null;
  const statusLabel = ctx?.seasonLabel ?? '2025/26';

  el.innerHTML = `
    ${pitchLinesSvg()}

    <div id="home-chrome">
      <div id="home-status">
        <button id="settings-btn" aria-label="Settings">${gearIcon()}</button>
      </div>
      <div id="home-chrome-actions">
        <span class="home-chrome-version">v${VERSION}</span>
        ${helpButtonHtml('home')}
      </div>
    </div>

    <div id="home-hero">
      <div class="home-eyebrow"><svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor" aria-hidden="true" style="vertical-align:-1px;margin-right:6px"><path d="M0 0 L9 5 L0 10 Z"/></svg>For rugby fans, by a rugby fan</div>
      <h1 id="home-title">
        <span class="title-pre">The</span>
        <span class="title-top">Rugby</span>
        <span class="title-bottom">Manager</span>
      </h1>
      <div class="home-broadcast-strip">
        <span class="broadcast-item">${statusLabel} Season</span>
      </div>
    </div>

    ${ctx ? saveCardHtml(ctx) : ''}

    <div id="home-cta">
      <button id="start-game-btn" class="cta-pulse">
        <span class="btn-label">Start New Game</span>
        ${arrowIcon()}
      </button>
      <button id="home-saves-btn" type="button">Manage Saves</button>
    </div>
  `;

  el.querySelector<HTMLButtonElement>('#start-game-btn')!.addEventListener('click', () => {
    if (hasSave && ctx) {
      // Mount the confirmation overlay; it removes itself on either action.
      el.insertAdjacentHTML('beforeend', confirmModalHtml(ctx));
      const backdrop = el.querySelector<HTMLDivElement>('#home-confirm-backdrop')!;
      const cleanup = (): void => backdrop.remove();
      backdrop.querySelector<HTMLButtonElement>('#home-confirm-cancel')!
        .addEventListener('click', cleanup);
      backdrop.querySelector<HTMLButtonElement>('#home-confirm-proceed')!
        .addEventListener('click', () => {
          clearSave();
          cleanup();
          onStart();
        });
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) cleanup();
      });
    } else {
      onStart();
    }
  });

  el.querySelector<HTMLButtonElement>('#settings-btn')!.addEventListener('click', () => {
    onSettings();
  });

  el.querySelector<HTMLButtonElement>('#home-save-card')?.addEventListener('click', () => {
    onContinue();
  });

  el.querySelector<HTMLButtonElement>('#home-saves-btn')!.addEventListener('click', () => {
    onSaves();
  });
}
