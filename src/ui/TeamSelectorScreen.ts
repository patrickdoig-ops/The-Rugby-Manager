import type { RawTeamInput } from '../engine/MatchEngine';

function crestHtml(initial: string, color: string, size: number): string {
  const grad = `linear-gradient(160deg, ${color} 0%, color-mix(in oklch, ${color} 65%, black) 100%)`;
  return `
    <div class="ts-crest" style="width:${size}px;height:${size}px;background:${grad};border:1.5px solid color-mix(in oklch,${color} 55%,transparent)">
      <span>${initial}</span>
    </div>`;
}

export function initTeamSelectorScreen(
  home: RawTeamInput,
  away: RawTeamInput,
  onSelect: (side: 'home' | 'away') => void,
): void {
  const el = document.getElementById('team-selector');
  if (!el) return;

  el.innerHTML = `
    <div id="ts-inner">
      <div id="ts-header">
        <div id="ts-eyebrow">Season 2026 · New Manager</div>
        <h2 id="ts-title">Choose Your Team</h2>
        <p id="ts-subtitle">Select the side you want to manage</p>
      </div>
      <div id="ts-matchup">
        <button class="ts-card" data-side="home">
          ${crestHtml(home.shortName[0] ?? 'H', home.color, 72)}
          <div class="ts-card-name">${home.name}</div>
          <div class="ts-card-code">${home.shortName}</div>
          <div class="ts-card-cta">Manage this team</div>
        </button>
        <div id="ts-vs">VS</div>
        <button class="ts-card" data-side="away">
          ${crestHtml(away.shortName[0] ?? 'A', away.color, 72)}
          <div class="ts-card-name">${away.name}</div>
          <div class="ts-card-code">${away.shortName}</div>
          <div class="ts-card-cta">Manage this team</div>
        </button>
      </div>
    </div>
  `;

  el.querySelectorAll<HTMLButtonElement>('.ts-card').forEach(btn => {
    btn.addEventListener('click', () => {
      el.style.display = 'none';
      onSelect(btn.dataset.side as 'home' | 'away');
    });
  });
}
