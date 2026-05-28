import type { RawTeamInput } from '../types/teamData';
import { computeOverallRating } from '../team/teamProfile';

function ovrColor(r: number): string {
  if (r >= 85) return 'var(--rm-stat-3)';
  if (r >= 78) return 'var(--rm-stat-4)';
  if (r >= 70) return 'var(--rm-stat-5)';
  if (r >= 62) return 'var(--rm-stat-2)';
  return 'var(--rm-stat-1)';
}

function tierLabel(ovr: number): string {
  if (ovr >= 85) return 'Title Favourites';
  if (ovr >= 78) return 'Playoffs Push';
  if (ovr >= 70) return 'Mid Table';
  if (ovr >= 62) return 'Rebuilding';
  return 'Underdog';
}

function tierClass(ovr: number): string {
  if (ovr >= 85) return 'elite';
  if (ovr >= 78) return 'strong';
  if (ovr >= 70) return 'mid';
  if (ovr >= 62) return 'rebuild';
  return 'underdog';
}

const TIER_OVERRIDES: Record<string, { label: string; cls: string }> = {
  'Gloucester':  { label: 'Rebuilding',  cls: 'rebuild'    },
  'Harlequins':  { label: 'Rebuilding',  cls: 'rebuild'    },
  'Newcastle':   { label: 'Developing',  cls: 'developing' },
};

function pitchLinesSvg(): string {
  return `<svg class="ts-pitch-lines" aria-hidden="true" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="tsLv" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="white" stop-opacity="0"/>
        <stop offset="35%" stop-color="white" stop-opacity="0.7"/>
        <stop offset="65%" stop-color="white" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="tsLh" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"  stop-color="white" stop-opacity="0"/>
        <stop offset="50%" stop-color="white" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="195" y1="0"   x2="195" y2="844" stroke="url(#tsLv)" stroke-width="0.7"/>
    <line x1="0"   y1="211" x2="390" y2="211" stroke="url(#tsLh)" stroke-width="0.5"/>
    <line x1="0"   y1="633" x2="390" y2="633" stroke="url(#tsLh)" stroke-width="0.5"/>
    <circle cx="195" cy="422" r="90" stroke="url(#tsLv)" stroke-width="0.7" fill="none"/>
  </svg>`;
}

export function initTeamSelectorScreen(
  teams: RawTeamInput[],
  onSelect: (team: RawTeamInput) => void,
  onBack: () => void,
  onInfo: (team: RawTeamInput) => void,
): void {
  const el = document.getElementById('team-selector');
  if (!el) return;

  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  el.innerHTML = `
    ${pitchLinesSvg()}
    <button id="ts-back" class="app-back-floating" aria-label="Back">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      <span>Lobby</span>
    </button>
    <div id="ts-inner">
      <div id="ts-header">
        <h2 id="ts-title">Choose<br>Your Team</h2>
        <p id="ts-subtitle">Pick the club you'll manage this season</p>
      </div>
      <div id="ts-grid">
        ${sortedTeams.map(team => {
          const ovr = computeOverallRating(team.id);
          const c = ovrColor(ovr);
          const eliteShadow = ovr >= 85 ? `text-shadow:0 0 12px color-mix(in oklch,var(--rm-stat-3) 40%,transparent);` : '';
          const [primary, ...rest] = team.name.split(' ');
          const secondary = rest.join(' ');
          const override = TIER_OVERRIDES[primary];
          const tLabel = override ? override.label : tierLabel(ovr);
          const tClass = override ? override.cls  : tierClass(ovr);
          const bg = `linear-gradient(150deg,${team.color} 0%,color-mix(in oklch,${team.color} 45%,oklch(0.10 0.010 150)) 100%)`;
          return `
          <div class="ts-card" data-id="${team.id}" style="--tc:${team.color};background:${bg}">
            <button class="ts-card-info" data-id="${team.id}" aria-label="Team info">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </button>
            <button class="ts-card-select" data-id="${team.id}">
              <div class="ts-name-area">
                <div class="ts-team-primary">${primary}</div>
                ${secondary ? `<div class="ts-team-secondary">${secondary}</div>` : ''}
              </div>
              <div class="ts-card-footer">
                <div class="ts-ovr-group">
                  <span class="ts-ovr-value" style="color:${c};${eliteShadow}">${ovr}</span>
                  <span class="ts-ovr-label">OVR</span>
                </div>
                <div class="ts-tier ts-tier--${tClass}">${tLabel}</div>
              </div>
            </button>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;

  el.querySelector<HTMLButtonElement>('#ts-back')!.addEventListener('click', () => {
    onBack();
  });

  el.querySelectorAll<HTMLButtonElement>('.ts-card-select').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = teams.find(t => t.id === btn.dataset.id)!;
      onSelect(team);
    });
  });

  el.querySelectorAll<HTMLButtonElement>('.ts-card-info').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = teams.find(t => t.id === btn.dataset.id)!;
      onInfo(team);
    });
  });
}
