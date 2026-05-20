import type { RawTeamInput } from '../engine/MatchCoordinator';

function crestHtml(initial: string, color: string, size: number): string {
  const grad = `linear-gradient(160deg, ${color} 0%, color-mix(in oklch, ${color} 65%, black) 100%)`;
  return `
    <div class="ts-crest" style="width:${size}px;height:${size}px;background:${grad};border:1.5px solid color-mix(in oklch,${color} 55%,transparent)">
      <span>${initial}</span>
    </div>`;
}

export function initTeamSelectorScreen(
  teams: RawTeamInput[],
  onSelect: (team: RawTeamInput) => void,
): void {
  const el = document.getElementById('team-selector');
  if (!el) return;
  el.style.display = '';

  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  el.innerHTML = `
    <button id="ts-back" aria-label="Back">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      <span>Lobby</span>
    </button>
    <div id="ts-inner">
      <div id="ts-header">
        <div id="ts-eyebrow">2025/26 Season · New Manager</div>
        <h2 id="ts-title">Choose Your Team</h2>
        <p id="ts-subtitle">Select the side you want to manage</p>
      </div>
      <div id="ts-grid">
        ${sortedTeams.map(team => `
          <button class="ts-card" data-id="${team.id}">
            ${crestHtml(team.shortName[0] ?? '?', team.color, 64)}
            <div class="ts-card-name">${team.name}</div>
            <div class="ts-card-code">${team.shortName}</div>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  el.querySelector<HTMLButtonElement>('#ts-back')!.addEventListener('click', () => {
    el.style.display = 'none';
    document.getElementById('home-screen')!.style.display = '';
  });

  el.querySelectorAll<HTMLButtonElement>('.ts-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = teams.find(t => t.id === btn.dataset.id)!;
      el.style.display = 'none';
      onSelect(team);
    });
  });
}
