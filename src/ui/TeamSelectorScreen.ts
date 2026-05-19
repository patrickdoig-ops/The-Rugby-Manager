import type { RawTeamInput } from '../engine/MatchEngine';

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

  el.innerHTML = `
    <div id="ts-inner">
      <div id="ts-header">
        <div id="ts-eyebrow">Season 2026 · New Manager</div>
        <h2 id="ts-title">Choose Your Team</h2>
        <p id="ts-subtitle">Select the side you want to manage</p>
      </div>
      <div id="ts-grid">
        ${teams.map(team => `
          <button class="ts-card" data-id="${team.id}">
            ${crestHtml(team.shortName[0] ?? '?', team.color, 64)}
            <div class="ts-card-name">${team.name}</div>
            <div class="ts-card-code">${team.shortName}</div>
            <div class="ts-card-cta">Manage this team</div>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  el.querySelectorAll<HTMLButtonElement>('.ts-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = teams.find(t => t.id === btn.dataset.id)!;
      el.style.display = 'none';
      onSelect(team);
    });
  });
}
