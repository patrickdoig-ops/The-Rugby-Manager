import { eventBus } from '../utils/eventBus';
import { shortName } from '../utils/playerName';
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

function setPieceSuccess(s: { won: number; thrown?: number; putIn?: number }): string {
  const total = s.thrown ?? s.putIn ?? 0;
  if (total === 0) return '—';
  return `${s.won}/${total} (${Math.round((s.won / total) * 100)}%)`;
}

function teamMetres(team: MatchState['homeTeam'], key: 'metresCarried' | 'kickMetres'): number {
  let sum = 0;
  for (const p of team.players) sum += p.matchStats[key];
  for (const p of team.substitutedOff) sum += p.matchStats[key];
  return sum;
}

function pointsPerEntry(e: { count: number; pointsScored: number }): string {
  if (e.count === 0) return '—';
  return (e.pointsScored / e.count).toFixed(1);
}

function renderStats(state: MatchState): string {
  const { stats, homeTeam, awayTeam } = state;
  const hc = homeTeam.color;
  const ac = awayTeam.color;

  const hRunM = teamMetres(homeTeam, 'metresCarried');
  const aRunM = teamMetres(awayTeam, 'metresCarried');
  const hKickM = teamMetres(homeTeam, 'kickMetres');
  const aKickM = teamMetres(awayTeam, 'kickMetres');
  const hMissed = Math.max(0, stats.tackles.home.attempted - stats.tackles.home.made);
  const aMissed = Math.max(0, stats.tackles.away.attempted - stats.tackles.away.made);

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
    { label: 'Lineout success', homeVal: setPieceSuccess(stats.ownLineouts.home), awayVal: setPieceSuccess(stats.ownLineouts.away), homeNum: stats.ownLineouts.home.won, awayNum: stats.ownLineouts.away.won },
    { label: 'Scrum success',   homeVal: setPieceSuccess(stats.ownScrums.home),   awayVal: setPieceSuccess(stats.ownScrums.away),   homeNum: stats.ownScrums.home.won,   awayNum: stats.ownScrums.away.won },
    { label: 'Run metres',      homeVal: String(hRunM),  awayVal: String(aRunM),  homeNum: hRunM,  awayNum: aRunM },
    { label: 'Kick metres',     homeVal: String(hKickM), awayVal: String(aKickM), homeNum: hKickM, awayNum: aKickM },
    { label: 'Tackles made',    homeVal: String(stats.tackles.home.made), awayVal: String(stats.tackles.away.made), homeNum: stats.tackles.home.made, awayNum: stats.tackles.away.made },
    { label: 'Missed tackles',  homeVal: String(hMissed), awayVal: String(aMissed), homeNum: hMissed, awayNum: aMissed, invert: true },
    { label: '22 entries',      homeVal: String(stats.entries22.home.count), awayVal: String(stats.entries22.away.count), homeNum: stats.entries22.home.count, awayNum: stats.entries22.away.count },
    { label: 'Points / entry',  homeVal: pointsPerEntry(stats.entries22.home), awayVal: pointsPerEntry(stats.entries22.away), homeNum: stats.entries22.home.pointsScored, awayNum: stats.entries22.away.pointsScored },
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

function statChipsInner(p: MatchState['homeTeam']['players'][number]): string {
  const s = p.matchStats;
  const tryClass = s.tries > 0 ? ' chip-try' : '';
  return `<span class="chip">${s.carries}c</span>`
    + `<span class="chip">${s.metresCarried}m</span>`
    + `<span class="chip">${s.tacklesMade}tk</span>`
    + `<span class="chip">${s.turnoversWon}to</span>`
    + `<span class="chip">${s.lineBreaks}lb</span>`
    + `<span class="chip${tryClass}">${s.tries}T</span>`;
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
        <span class="fatigue-name">${shortName(p)}</span>
        <div class="fatigue-bar-bg">
          <div class="fatigue-bar ${barClass}" style="width:${f}%"></div>
        </div>
        <span class="rating-badge ${rClass}">${r}</span>
        <div class="player-stat-chips">${statChipsInner(p)}</div>
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

    const chips = row.querySelector('.player-stat-chips') as HTMLElement | null;
    if (chips) chips.innerHTML = statChipsInner(p);
  });
}

function statsKey(state: MatchState): string {
  const s = state.stats;
  const hRunM = teamMetres(state.homeTeam, 'metresCarried');
  const aRunM = teamMetres(state.awayTeam, 'metresCarried');
  const hKickM = teamMetres(state.homeTeam, 'kickMetres');
  const aKickM = teamMetres(state.awayTeam, 'kickMetres');
  return `${s.possession.home},${s.possession.away},${s.territory.home},${s.territory.away},`
       + `${s.tackles.home.made},${s.tackles.home.attempted},${s.tackles.away.made},${s.tackles.away.attempted},`
       + `${s.handlingErrors.home},${s.handlingErrors.away},${s.tries.home},${s.tries.away},`
       + `${s.scrums.home},${s.scrums.away},${s.lineouts.home},${s.lineouts.away},`
       + `${s.ownLineouts.home.thrown},${s.ownLineouts.home.won},${s.ownLineouts.away.thrown},${s.ownLineouts.away.won},`
       + `${s.ownScrums.home.putIn},${s.ownScrums.home.won},${s.ownScrums.away.putIn},${s.ownScrums.away.won},`
       + `${s.entries22.home.count},${s.entries22.home.pointsScored},${s.entries22.away.count},${s.entries22.away.pointsScored},`
       + `${hRunM},${aRunM},${hKickM},${aKickM}`;
}

// ─── Player detail table ───────────────────────────────────────────────────

const TABLE_HEADERS = ['#', 'Player', 'Rt', 'Car', 'M', 'Pass', 'Tkl', 'MT', 'Kick', 'KM', 'Ruck', 'TO', 'T', 'GK+', 'GK-'];

function playerTableRow(p: MatchState['homeTeam']['players'][number], teamColor: string, isSubbedOff: boolean): string {
  const s = p.matchStats;
  const rowClass = isSubbedOff ? ' class="player-subbed"' : '';
  const triesClass = s.tries > 0 ? ' class="td-tries"' : '';
  const mt = Math.max(0, s.tacklesAttempted - s.tacklesMade);
  return `<tr${rowClass}>
    <td style="color:${teamColor}">${p.squadNumber}</td>
    <td>${shortName(p)}</td>
    <td class="${ratingClass(p.rating)}">${p.rating.toFixed(1)}</td>
    <td>${s.carries}</td>
    <td>${s.metresCarried}</td>
    <td>${s.passes}</td>
    <td>${s.tacklesMade}</td>
    <td>${mt}</td>
    <td>${s.kicksFromHand}</td>
    <td>${s.kickMetres}</td>
    <td>${s.rucksHit}</td>
    <td>${s.turnoversWon}</td>
    <td${triesClass}>${s.tries}</td>
    <td>${s.kicksMade}</td>
    <td>${s.kicksMissed}</td>
  </tr>`;
}

function renderPlayerTable(state: MatchState): string {
  const headerCells = TABLE_HEADERS.map(h => `<th>${h}</th>`).join('');
  const teamSection = (team: MatchState['homeTeam']): string[] => [
    `<tr class="team-row"><td colspan="15" style="color:${team.color}">${team.name}</td></tr>`,
    ...team.players.map(p => playerTableRow(p, team.color, false)),
    ...team.substitutedOff.map(p => playerTableRow(p, team.color, true)),
  ];
  return `<table class="player-table">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${[...teamSection(state.homeTeam), ...teamSection(state.awayTeam)].join('')}</tbody>
  </table>`;
}

function playerTableKey(state: MatchState): string {
  const all = [
    ...state.homeTeam.players, ...state.homeTeam.substitutedOff,
    ...state.awayTeam.players, ...state.awayTeam.substitutedOff,
  ];
  return `${state.homeTeam.players.length},${state.homeTeam.substitutedOff.length},`
       + `${state.awayTeam.players.length},${state.awayTeam.substitutedOff.length},`
       + all.map(p => {
           const s = p.matchStats;
           return `${p.rating.toFixed(1)},${s.carries},${s.metresCarried},${s.passes},`
                + `${s.tacklesMade},${s.tacklesAttempted},${s.kicksFromHand},${s.kickMetres},`
                + `${s.rucksHit},${s.turnoversWon},${s.tries},${s.kicksMade},${s.kicksMissed}`;
         }).join(';');
}

export function initStatsPanel(): void {
  const statsContent        = document.getElementById('stats-content')!;
  const playerStatsContent  = document.getElementById('player-stats-content')!;
  const playerDetailContent = document.getElementById('player-detail-content')!;

  let lastStatsKey          = '';
  let lastPlayerStatsMinute = -1;
  let isPlayerStatsInit     = false;
  let lastPlayerTableKey    = '';

  eventBus.on('engine:initialized', () => {
    lastStatsKey          = '';
    lastPlayerStatsMinute = -1;
    isPlayerStatsInit     = false;
    lastPlayerTableKey    = '';
    statsContent.innerHTML        = '';
    playerStatsContent.innerHTML  = '';
    playerDetailContent.innerHTML = '';
  });

  eventBus.on('engine:stateChange', ({ state }) => {
    const key = statsKey(state);
    if (key !== lastStatsKey) {
      lastStatsKey = key;
      statsContent.innerHTML = renderStats(state);
    }

    const minute = Math.floor(state.clock.gameMinute);
    if (minute !== lastPlayerStatsMinute) {
      lastPlayerStatsMinute = minute;
      if (!isPlayerStatsInit) {
        playerStatsContent.innerHTML = renderPlayerStats(state);
        isPlayerStatsInit = true;
      } else {
        updatePlayerStatsDOM(playerStatsContent, state);
      }
    }

    const tableKey = playerTableKey(state);
    if (tableKey !== lastPlayerTableKey) {
      lastPlayerTableKey = tableKey;
      playerDetailContent.innerHTML = renderPlayerTable(state);
    }
  });
}
