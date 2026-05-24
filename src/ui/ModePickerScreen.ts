// Sits between Team Selector and Hub on the new-game path.
// Two CTAs: Quick Start (jump to Round 1, current behaviour) and
// Squad Builder (Phase B/C — unwinds the 2025-26 inbound transfers
// and opens a pre-season signing window). Phase A wires the screen
// and the navigation flow; the Squad Builder flow itself is
// scaffolded but no transfers are unwound until Phase B lands the
// data file.

import type { RawTeamInput } from '../types/teamData';

function crestHtml(team: RawTeamInput, sizePx: number): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const glow = `box-shadow: 0 0 22px color-mix(in oklch, ${team.color} 40%, transparent), inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 22px rgba(0,0,0,0.5);`;
  const initial = team.shortName[0] ?? '?';
  return `
    <div class="mp-crest" style="width:${sizePx}px;height:${sizePx}px;background:${grad};border:1.5px solid color-mix(in oklch,${team.color} 55%,transparent);${glow}">
      <span>${initial}</span>
    </div>`;
}

export function initModePickerScreen(
  team: RawTeamInput,
  onQuickStart: () => void,
  onSquadBuilder: () => void,
  onBack: () => void,
): void {
  const el = document.getElementById('mode-picker');
  if (!el) return;

  el.innerHTML = `
    <button id="mp-back" aria-label="Back to team selector">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      <span>Teams</span>
    </button>

    <div id="mp-inner">
      <div id="mp-header">
        ${crestHtml(team, 88)}
        <div id="mp-eyebrow">2025/26 Season</div>
        <h2 id="mp-title">${team.name}</h2>
        <p id="mp-subtitle">Choose how you want to start</p>
      </div>

      <div id="mp-cards">
        <button class="mp-card" data-mode="quick">
          <div class="mp-card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>
          </div>
          <div class="mp-card-title">Quick Start</div>
          <div class="mp-card-body">Jump straight to Round 1 with the authored 2025/26 rosters, contracts and marquee.</div>
        </button>

        <button class="mp-card" data-mode="builder">
          <div class="mp-card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>
          </div>
          <div class="mp-card-title">Squad Builder</div>
          <div class="mp-card-body">Unwind the 2025/26 inbound transfers and rebuild your squad in a pre-season signing window.</div>
        </button>
      </div>
    </div>
  `;

  el.querySelector<HTMLButtonElement>('#mp-back')!.addEventListener('click', () => onBack());
  el.querySelector<HTMLButtonElement>('.mp-card[data-mode="quick"]')!.addEventListener('click', () => onQuickStart());
  el.querySelector<HTMLButtonElement>('.mp-card[data-mode="builder"]')!.addEventListener('click', () => onSquadBuilder());
}
