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
  const rows = [
    ['Possession', pct(stats.possession.home, stats.possession.away), pct(stats.possession.away, stats.possession.home)],
    ['Territory',  pct(stats.territory.home,  stats.territory.away),  pct(stats.territory.away,  stats.territory.home)],
    ['Tackle %',   tacklePct(stats.tackles.home), tacklePct(stats.tackles.away)],
    ['Handling Err', String(stats.handlingErrors.home), String(stats.handlingErrors.away)],
    ['Tries',      String(stats.tries.home),   String(stats.tries.away)],
    ['Scrums Won', String(stats.scrums.home),  String(stats.scrums.away)],
    ['Lineouts Won', String(stats.lineouts.home), String(stats.lineouts.away)],
  ];

  return `
    <table class="stats-table">
      <thead>
        <tr>
          <th class="stat-col-home" style="color:${homeTeam.color}">${homeTeam.shortName}</th>
          <th class="stat-col-label"></th>
          <th class="stat-col-away" style="color:${awayTeam.color}">${awayTeam.shortName}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(([label, h, a]) => `
          <tr>
            <td class="stat-val">${h}</td>
            <td class="stat-label">${label}</td>
            <td class="stat-val">${a}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
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
        <span class="fatigue-name" style="color:${team.color}">#${p.id} ${p.name.split(' ')[1] ?? p.name}</span>
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

export function initStatsPanel(): void {
  const statsContent       = document.getElementById('stats-content')!;
  const playerStatsContent = document.getElementById('player-stats-content')!;

  let lastStatsHtml        = '';
  let lastPlayerStatsMinute = -1;
  let isPlayerStatsInit    = false;

  eventBus.on('engine:stateChange', ({ state }) => {
    const newStatsHtml = renderStats(state);
    if (newStatsHtml !== lastStatsHtml) {
      lastStatsHtml = newStatsHtml;
      statsContent.innerHTML = newStatsHtml;
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
