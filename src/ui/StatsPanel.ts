import { eventBus } from '../utils/eventBus';
import type { MatchState } from '../types/match';

function pct(a: number, b: number): string {
  const total = a + b;
  if (total === 0) return '50%';
  return `${Math.round((a / total) * 100)}%`;
}

function tacklePct(t: { attempted: number; made: number }): string {
  if (t.attempted === 0) return '—';
  return `${Math.round((t.made / t.attempted) * 100)}%`;
}

function renderStats(state: MatchState): string {
  const { stats, homeTeam, awayTeam } = state;
  const hc = homeTeam.color;
  const ac = awayTeam.color;

  const rows: Array<{
    label: string;
    homeVal: string;
    awayVal: string;
    homeNum: number;
    awayNum: number;
    invert?: boolean;
  }> = [
    { label: 'Possession', homeVal: pct(stats.possession.home, stats.possession.away),   awayVal: pct(stats.possession.away, stats.possession.home),   homeNum: stats.possession.home,        awayNum: stats.possession.away },
    { label: 'Territory',  homeVal: pct(stats.territory.home,  stats.territory.away),    awayVal: pct(stats.territory.away,  stats.territory.home),    homeNum: stats.territory.home,         awayNum: stats.territory.away },
    { label: 'Tackle %',   homeVal: tacklePct(stats.tackles.home), awayVal: tacklePct(stats.tackles.away), homeNum: stats.tackles.home.made, awayNum: stats.tackles.away.made },
    { label: 'Errors',     homeVal: String(stats.handlingErrors.home), awayVal: String(stats.handlingErrors.away), homeNum: stats.handlingErrors.home, awayNum: stats.handlingErrors.away, invert: true },
    { label: 'Tries',      homeVal: String(stats.tries.home),    awayVal: String(stats.tries.away),    homeNum: stats.tries.home,    awayNum: stats.tries.away },
    { label: 'Scrums',     homeVal: String(stats.scrums.home),   awayVal: String(stats.scrums.away),   homeNum: stats.scrums.home,   awayNum: stats.scrums.away },
    { label: 'Lineouts',   homeVal: String(stats.lineouts.home), awayVal: String(stats.lineouts.away), homeNum: stats.lineouts.home, awayNum: stats.lineouts.away },
  ];

  const rowsHtml = rows.map(r => {
    const total = r.homeNum + r.awayNum;
    const hPct  = total > 0 ? (r.homeNum / total) * 100 : 50;
    const aPct  = 100 - hPct;
    const hWins = r.invert ? r.homeNum < r.awayNum : r.homeNum > r.awayNum;
    const aWins = r.invert ? r.awayNum < r.homeNum : r.awayNum > r.homeNum;
    return `
      <div class="stat-row">
        <div class="stat-row-header">
          <span class="stat-val${hWins ? ' stat-winner' : ''}">${r.homeVal}</span>
          <span class="stat-label">${r.label}</span>
          <span class="stat-val${aWins ? ' stat-winner' : ''}">${r.awayVal}</span>
        </div>
        <div class="stat-bars">
          <div class="stat-bar-h" style="width:${hPct.toFixed(1)}%;background:${hc};opacity:${hWins ? 1 : 0.4}"></div>
          <div class="stat-bar-a" style="width:${aPct.toFixed(1)}%;background:${ac};opacity:${aWins ? 1 : 0.4}"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="match-stats-header">
      <span class="header-home" style="color:${hc}">${homeTeam.shortName}</span>
      <span></span>
      <span class="header-away" style="color:${ac}">${awayTeam.shortName}</span>
    </div>
    ${rowsHtml}
  `;
}

function ratingClass(r: number): string {
  if (r >= 7.5) return 'rating-high';
  if (r >= 5.5) return 'rating-mid';
  if (r >= 3.5) return 'rating-low';
  return 'rating-poor';
}

function renderPlayerStats(state: MatchState): string {
  const allPlayers = [
    ...state.homeTeam.players.map(p => ({ p, team: state.homeTeam })),
    ...state.awayTeam.players.map(p => ({ p, team: state.awayTeam })),
  ];

  return allPlayers.map(({ p, team }) => {
    const f = Math.round(p.fatiguePct);
    const barClass = f > 60 ? 'fatigue-ok' : f > 30 ? 'fatigue-warn' : 'fatigue-low';
    const r = p.rating.toFixed(1);
    const rClass = ratingClass(p.rating);
    return `
      <div class="player-stat-row">
        <span class="player-jersey" style="color:${team.color}">${p.squadNumber}</span>
        <span class="fatigue-name">${p.name.split(' ')[1] ?? p.name}</span>
        <div class="fatigue-bar-bg">
          <div class="fatigue-bar ${barClass}" style="width:${f}%"></div>
        </div>
        <span class="rating-badge ${rClass}">${r}</span>
      </div>
    `;
  }).join('');
}

function updatePlayerStatsDOM(container: HTMLElement, state: MatchState): void {
  const allPlayers = [
    ...state.homeTeam.players,
    ...state.awayTeam.players,
  ];
  const rows = container.querySelectorAll('.player-stat-row');
  if (rows.length !== allPlayers.length) {
    container.innerHTML = renderPlayerStats(state);
    return;
  }

  // Detect a substitution by checking whether jersey numbers still match
  const hasSubstitution = allPlayers.some((p, i) => {
    const jerseyEl = rows[i].querySelector('.player-jersey');
    return jerseyEl && jerseyEl.textContent !== String(p.squadNumber);
  });
  if (hasSubstitution) {
    container.innerHTML = renderPlayerStats(state);
    return;
  }

  allPlayers.forEach((p, i) => {
    const row = rows[i];
    const f = Math.round(p.fatiguePct);
    const barClass = f > 60 ? 'fatigue-ok' : f > 30 ? 'fatigue-warn' : 'fatigue-low';
    const r = p.rating.toFixed(1);
    const rClass = ratingClass(p.rating);

    const bar = row.querySelector('.fatigue-bar') as HTMLElement;
    if (bar) {
      bar.className = `fatigue-bar ${barClass}`;
      bar.style.width = `${f}%`;
    }

    const badge = row.querySelector('.rating-badge') as HTMLElement;
    if (badge) {
      badge.className = `rating-badge ${rClass}`;
      badge.textContent = r;
    }
  });
}

function statsKey(state: MatchState): string {
  const s = state.stats;
  return `${s.possession.home},${s.possession.away},${s.territory.home},${s.territory.away},`
       + `${s.tackles.home.made},${s.tackles.home.attempted},${s.tackles.away.made},${s.tackles.away.attempted},`
       + `${s.handlingErrors.home},${s.handlingErrors.away},${s.tries.home},${s.tries.away},`
       + `${s.scrums.home},${s.scrums.away},${s.lineouts.home},${s.lineouts.away}`;
}

export function initStatsPanel(): void {
  const statsContent       = document.getElementById('stats-content')!;
  const playerStatsContent = document.getElementById('player-stats-content')!;

  let lastStatsKey          = '';
  let lastPlayerStatsMinute = -1;
  let isPlayerStatsInit     = false;

  eventBus.on('engine:stateChange', ({ state }) => {
    const key = statsKey(state);
    if (key !== lastStatsKey) {
      lastStatsKey = key;
      statsContent.innerHTML = renderStats(state);
    }

    const minute = Math.floor(state.gameMinute);
    if (minute !== lastPlayerStatsMinute) {
      lastPlayerStatsMinute = minute;
      if (!isPlayerStatsInit) {
        playerStatsContent.innerHTML = renderPlayerStats(state);
        isPlayerStatsInit = true;
      } else {
        updatePlayerStatsDOM(playerStatsContent, state);
      }
    }
  });
}
