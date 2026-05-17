import type { PlayerStats } from '../types/player';
import { DEFAULT_TACTICS } from '../types/team';
import { renderTacticsMenu } from './TacticsMenu';

type RawPlayer = {
  id: number;
  name: string;
  position: string;
  baseStats: PlayerStats;
};

type RawTeam = {
  name: string;
  shortName: string;
  color: string;
  players: RawPlayer[];
};

const STAT_GROUPS: Array<{ label: string; keys: (keyof PlayerStats)[] }> = [
  { label: 'Physical',  keys: ['stamina', 'strength', 'pace', 'agility'] },
  { label: 'Technical', keys: ['handling', 'tackling', 'breakdown', 'kicking', 'setPiece'] },
  { label: 'Mental',    keys: ['discipline', 'positioning', 'composure'] },
];

const STAT_ABBR: Record<keyof PlayerStats, string> = {
  stamina:     'STM',
  strength:    'STR',
  pace:        'PAC',
  agility:     'AGI',
  handling:    'HND',
  tackling:    'TKL',
  breakdown:   'BRK',
  kicking:     'KCK',
  setPiece:    'SET',
  discipline:  'DIS',
  positioning: 'POS',
  composure:   'CMP',
};

function computeOverall(stats: PlayerStats): number {
  const vals = Object.values(stats) as number[];
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function tierClass(v: number): string {
  if (v >= 90) return 'tier-elite';
  if (v >= 80) return 'tier-great';
  if (v >= 70) return 'tier-good';
  if (v >= 60) return 'tier-avg';
  return 'tier-poor';
}

function renderPlayer(p: RawPlayer, color: string): string {
  const ovr = computeOverall(p.baseStats);
  const ovrGroup = `<div class="attr-group attr-group--ovr">
    <div class="attr-cell ${tierClass(ovr)}">
      <span class="attr-key">OVR</span>
      <span class="attr-val">${ovr}</span>
    </div>
  </div>`;

  const groupCells = STAT_GROUPS.map(g =>
    `<div class="attr-group">
      ${g.keys.map(k => {
        const v = p.baseStats[k];
        return `<div class="attr-cell ${tierClass(v)}">
          <span class="attr-key">${STAT_ABBR[k]}</span>
          <span class="attr-val">${v}</span>
        </div>`;
      }).join('')}
    </div>`
  ).join('');

  const lastName = p.name.split(' ').slice(1).join(' ') || p.name;

  return `<div class="pm-player">
    <div class="pm-player-hd">
      <span class="pm-num" style="color:${color}">${p.id}</span>
      <div class="pm-identity">
        <span class="pm-name">${lastName}</span>
        <span class="pm-pos">${p.position}</span>
      </div>
    </div>
    <div class="pm-attrs">${ovrGroup}${groupCells}</div>
  </div>`;
}

function renderRoster(team: RawTeam): string {
  return `<div class="pm-legend">
    <div class="legend-group legend-group--ovr">
      <span class="legend-item">OVR</span>
    </div>
    ${STAT_GROUPS.map(g =>
      `<div class="legend-group">
        ${g.keys.map(k => `<span class="legend-item">${STAT_ABBR[k]}</span>`).join('')}
      </div>`
    ).join('')}
  </div>
  ${team.players.map(p => renderPlayer(p, team.color)).join('')}`;
}

export function initPreMatchScreen(
  home: RawTeam,
  away: RawTeam,
  onStart: () => void,
): void {
  const screen = document.getElementById('pre-match')!;

  const homeHtml = renderRoster(home);
  const awayHtml = renderRoster(away);

  screen.innerHTML = `
    <div id="pm-header">
      <h1 id="pm-title">Match Preview</h1>
      <div id="pm-matchup">
        <span class="pm-team-badge" style="color:${home.color}">${home.shortName}</span>
        <span id="pm-vs">vs</span>
        <span class="pm-team-badge" style="color:${away.color}">${away.shortName}</span>
      </div>
      <div id="pm-tabs" role="tablist">
        <button class="pm-tab active" data-tab="home"    style="--tc:${home.color}">${home.name}</button>
        <button class="pm-tab"        data-tab="away"    style="--tc:${away.color}">${away.name}</button>
        <button class="pm-tab"        data-tab="tactics" style="--tc:var(--rm-pitch)">Tactics</button>
      </div>
    </div>

    <div id="pm-body">
      <div id="pm-home"    class="pm-panel">${homeHtml}</div>
      <div id="pm-away"    class="pm-panel hidden">${awayHtml}</div>
      <div id="pm-tactics" class="pm-panel hidden"></div>
    </div>

    <div id="pm-footer">
      <button id="pm-start">
        <span class="btn-label">Kick off</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
      </button>
    </div>
  `;

  const tacticsContainer = screen.querySelector<HTMLElement>('#pm-tactics')!;
  renderTacticsMenu(tacticsContainer, { ...DEFAULT_TACTICS });

  const tabs         = screen.querySelectorAll<HTMLButtonElement>('.pm-tab');
  const homePanel    = screen.querySelector<HTMLElement>('#pm-home')!;
  const awayPanel    = screen.querySelector<HTMLElement>('#pm-away')!;
  const tacticsPanel = screen.querySelector<HTMLElement>('#pm-tactics')!;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.dataset.tab!;
      tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === t));
      homePanel.classList.toggle('hidden', t !== 'home');
      awayPanel.classList.toggle('hidden', t !== 'away');
      tacticsPanel.classList.toggle('hidden', t !== 'tactics');
    });
  });

  screen.querySelector('#pm-start')!.addEventListener('click', () => {
    screen.classList.add('pm-exit');
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      screen.style.display = 'none';
      onStart();
    };
    screen.addEventListener('animationend', start, { once: true });
    setTimeout(start, 600);
  });
}

