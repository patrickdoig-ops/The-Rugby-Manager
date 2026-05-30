import { eventBus } from '../utils/eventBus';
import { shortName } from '../utils/playerName';
import { teamTextColor } from '../utils/teamColor';
import { playerOverall } from '../engine/RatingEngine';
import { createRowExpander } from './components/rowExpand';
import type { MatchState, DisplaySnapshot } from '../types/match';

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
  return `${s.won}/${total}`;
}

function pointsPerEntry(e: { count: number; pointsScored: number }): string {
  if (e.count === 0) return '—';
  return (e.pointsScored / e.count).toFixed(1);
}

interface StatRowSpec {
  id: string;
  label: string;
  homeVal: string;
  awayVal: string;
  homeNum: number;
  awayNum: number;
  invert?: boolean;
}

function buildStatRows(d: DisplaySnapshot): StatRowSpec[] {
  const { stats, aggregates } = d;
  const hCarries = aggregates.carries.home;
  const aCarries = aggregates.carries.away;
  const hRunM = aggregates.runMetres.home;
  const aRunM = aggregates.runMetres.away;
  const hKickM = aggregates.kickMetres.home;
  const aKickM = aggregates.kickMetres.away;
  const hMissed = Math.max(0, stats.tackles.home.attempted - stats.tackles.home.made);
  const aMissed = Math.max(0, stats.tackles.away.attempted - stats.tackles.away.made);
  const hPens = aggregates.penaltiesConceded.home;
  const aPens = aggregates.penaltiesConceded.away;

  return [
    { id: 'possession',       label: 'Possession',     homeVal: pct(stats.possession.home, stats.possession.away),   awayVal: pct(stats.possession.away, stats.possession.home),   homeNum: stats.possession.home, awayNum: stats.possession.away },
    { id: 'territory',        label: 'Territory',      homeVal: pct(stats.territory.home,  stats.territory.away),    awayVal: pct(stats.territory.away,  stats.territory.home),    homeNum: stats.territory.home,  awayNum: stats.territory.away },
    { id: 'tries',            label: 'Tries',          homeVal: String(stats.tries.home),    awayVal: String(stats.tries.away),    homeNum: stats.tries.home,    awayNum: stats.tries.away },
    { id: 'entries22',        label: '22 entries',     homeVal: String(stats.entries22.home.count), awayVal: String(stats.entries22.away.count), homeNum: stats.entries22.home.count, awayNum: stats.entries22.away.count },
    { id: 'pointsPerEntry',   label: 'Points / entry', homeVal: pointsPerEntry(stats.entries22.home), awayVal: pointsPerEntry(stats.entries22.away), homeNum: stats.entries22.home.pointsScored, awayNum: stats.entries22.away.pointsScored },
    { id: 'carries',          label: 'Carries',        homeVal: String(hCarries), awayVal: String(aCarries), homeNum: hCarries, awayNum: aCarries },
    { id: 'runMetres',        label: 'Carry metres',   homeVal: String(hRunM),  awayVal: String(aRunM),  homeNum: hRunM,  awayNum: aRunM },
    { id: 'offloads',         label: 'Offloads',       homeVal: String(aggregates.offloads.home), awayVal: String(aggregates.offloads.away), homeNum: aggregates.offloads.home, awayNum: aggregates.offloads.away },
    { id: 'kickMetres',       label: 'Kick metres',    homeVal: String(hKickM), awayVal: String(aKickM), homeNum: hKickM, awayNum: aKickM },
    { id: 'errors',           label: 'Errors',         homeVal: String(stats.handlingErrors.home), awayVal: String(stats.handlingErrors.away), homeNum: stats.handlingErrors.home, awayNum: stats.handlingErrors.away, invert: true },
    { id: 'penaltiesConceded',label: 'Penalties conceded', homeVal: String(hPens), awayVal: String(aPens), homeNum: hPens, awayNum: aPens, invert: true },
    { id: 'tacklePct',        label: 'Tackle %',       homeVal: tacklePct(stats.tackles.home), awayVal: tacklePct(stats.tackles.away), homeNum: stats.tackles.home.made, awayNum: stats.tackles.away.made },
    { id: 'tacklesMade',      label: 'Tackles made',   homeVal: String(stats.tackles.home.made), awayVal: String(stats.tackles.away.made), homeNum: stats.tackles.home.made, awayNum: stats.tackles.away.made },
    { id: 'missedTackles',    label: 'Missed tackles', homeVal: String(hMissed), awayVal: String(aMissed), homeNum: hMissed, awayNum: aMissed, invert: true },
    { id: 'lineouts',         label: 'Lineouts',        homeVal: String(stats.lineouts.home), awayVal: String(stats.lineouts.away), homeNum: stats.lineouts.home, awayNum: stats.lineouts.away },
    { id: 'lineoutSuccess',   label: 'Lineout success', homeVal: setPieceSuccess(stats.ownLineouts.home), awayVal: setPieceSuccess(stats.ownLineouts.away), homeNum: stats.ownLineouts.home.won, awayNum: stats.ownLineouts.away.won },
    { id: 'scrums',           label: 'Scrums',          homeVal: String(stats.scrums.home),   awayVal: String(stats.scrums.away),   homeNum: stats.scrums.home,   awayNum: stats.scrums.away },
    { id: 'scrumSuccess',     label: 'Scrum success',   homeVal: setPieceSuccess(stats.ownScrums.home),   awayVal: setPieceSuccess(stats.ownScrums.away),   homeNum: stats.ownScrums.home.won,   awayNum: stats.ownScrums.away.won },
  ];
}

// 'home' | 'away' | 'tie' — used both to add `.stat-winner` to the value
// span and to track previous winners so the change-flash fires only on a flip.
type WinnerSide = 'home' | 'away' | 'tie';

function winnerOf(r: StatRowSpec): WinnerSide {
  if (r.homeNum === r.awayNum) return 'tie';
  const homeBeats = r.invert ? r.homeNum < r.awayNum : r.homeNum > r.awayNum;
  return homeBeats ? 'home' : 'away';
}

function renderStats(d: DisplaySnapshot, homeTeam: MatchState['homeTeam'], awayTeam: MatchState['awayTeam']): string {
  const hc = teamTextColor(homeTeam.color);
  const ac = teamTextColor(awayTeam.color);
  const rows = buildStatRows(d);

  const rowsHtml = rows.map(r => {
    const total = r.homeNum + r.awayNum;
    const hPct  = total > 0 ? (r.homeNum / total) * 100 : 50;
    const aPct  = 100 - hPct;
    const win   = winnerOf(r);
    const hWins = win === 'home';
    const aWins = win === 'away';
    return `
      <div class="stat-row" data-stat-id="${r.id}" data-winner="${win}">
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

// Tap-to-expand body: 4 mini-stats + live OVR + form mod context.
// Mirrors the row-expand pattern used on Contracts / TransferMarket /
// SquadManagement / PreMatch. Padding lives on `.sp-expand-body` (the
// inner wrapper, not the grid item) so `grid-template-rows: 0fr` truly
// collapses the panel without leaking the label through the padding box.
function renderPlayerExpand(p: MatchState['homeTeam']['players'][number]): string {
  const s = p.matchStats;
  const ovrLive = playerOverall(p.currentStats, p.position);
  const formPct = Math.round((p.formModifier - 1) * 100);
  const formSign = formPct > 0 ? '+' : '';
  const missedTackles = Math.max(0, s.tacklesAttempted - s.tacklesMade);

  return `
    <div class="sp-expand-grid">
      <div class="sp-expand-stat"><span class="sp-stat-val">${s.carries}</span><span class="sp-stat-label">Carries</span></div>
      <div class="sp-expand-stat"><span class="sp-stat-val">${s.metresCarried}</span><span class="sp-stat-label">Metres</span></div>
      <div class="sp-expand-stat"><span class="sp-stat-val">${s.passes}</span><span class="sp-stat-label">Passes</span></div>
      <div class="sp-expand-stat"><span class="sp-stat-val">${s.tacklesMade}</span><span class="sp-stat-label">Tackles</span></div>
      <div class="sp-expand-stat"><span class="sp-stat-val">${missedTackles}</span><span class="sp-stat-label">Missed</span></div>
      <div class="sp-expand-stat"><span class="sp-stat-val">${s.rucksHit}</span><span class="sp-stat-label">Rucks</span></div>
      <div class="sp-expand-stat"><span class="sp-stat-val">${s.turnoversWon}</span><span class="sp-stat-label">Turnovers</span></div>
      <div class="sp-expand-stat"><span class="sp-stat-val">${s.kicksFromHand}/${s.kickMetres}m</span><span class="sp-stat-label">Kicks</span></div>
    </div>
    <div class="sp-expand-context">
      <span class="sp-context-pip"><span class="sp-context-label">OVR</span><span class="sp-context-val">${ovrLive}</span></span>
      <span class="sp-context-pip"><span class="sp-context-label">Form</span><span class="sp-context-val">${formSign}${formPct}%</span></span>
      ${s.tries > 0 ? `<span class="sp-context-pip sp-context-pip--accent"><span class="sp-context-label">Tries</span><span class="sp-context-val">${s.tries}</span></span>` : ''}
    </div>
  `;
}

// Chevron used to signal expand affordance on each row. Click is handled
// by the delegated `rowExpand` controller via the row's `data-row-id`.
const CHEVRON_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

// Player lists put the human's team first so the manager scans their own
// XV without hunting past the AI rows. Live-match panels only; the snapshot
// keys below still iterate home→away (their identity is just "did anything
// change?", and order is irrelevant to that).
function teamsInHumanOrder(state: MatchState): [MatchState['homeTeam'], MatchState['awayTeam']] {
  return state.engine.humanSide === 'away'
    ? [state.awayTeam, state.homeTeam]
    : [state.homeTeam, state.awayTeam];
}

function renderPlayerStats(state: MatchState, isExpanded: (id: string) => boolean): string {
  const [first, second] = teamsInHumanOrder(state);
  const allPlayers = [
    ...first.players.map(p => ({ p, team: first })),
    ...second.players.map(p => ({ p, team: second })),
  ];

  return allPlayers.map(({ p, team }) => {
    const f = Math.round(p.fatiguePct);
    const barClass = f > 60 ? 'fatigue-ok' : f > 30 ? 'fatigue-warn' : 'fatigue-low';
    const r = p.rating.toFixed(1);
    const rClass = ratingClass(p.rating);
    const rowId = `rid-${p.rosterId}`;
    const expanded = isExpanded(rowId);
    return `
      <div class="player-stat-row" data-row-id="${rowId}">
        <div class="player-stat-row-main">
          <span class="player-jersey" style="color:${teamTextColor(team.color)}">${p.squadNumber}</span>
          <span class="fatigue-name">${shortName(p)}</span>
          <div class="fatigue-bar-bg">
            <div class="fatigue-bar ${barClass}" style="width:${f}%"></div>
          </div>
          <span class="rating-badge ${rClass}">${r}</span>
          <button class="row-expand-chevron sp-chevron" type="button" aria-label="${expanded ? 'Hide' : 'Show'} match stats" aria-expanded="${expanded}" data-expand-skip>${CHEVRON_SVG}</button>
        </div>
        <div class="row-expand-panel sp-expand" data-expanded="${expanded}">
          <div class="row-expand-inner"><div class="sp-expand-body">${renderPlayerExpand(p)}</div></div>
        </div>
      </div>
    `;
  }).join('');
}

// Per-tick hot-patch path. Updates the row-main children (fatigue bar,
// rating badge, expand body) in place; never touches the row's
// `data-row-id` or the expand panel's `data-expanded` so the expander's
// open/closed Set stays authoritative. Returns `false` when the shape of
// the rendered list no longer matches the current state (substitution
// or roster change) — caller should trigger a full re-render.
function updatePlayerStatsDOM(container: HTMLElement, state: MatchState): boolean {
  const [first, second] = teamsInHumanOrder(state);
  const allPlayers = [
    ...first.players,
    ...second.players,
  ];
  const rows = container.querySelectorAll('.player-stat-row');
  if (rows.length !== allPlayers.length) return false;

  // Detect a substitution by checking whether jersey numbers still match
  const hasSubstitution = allPlayers.some((p, i) => {
    const jerseyEl = rows[i].querySelector('.player-jersey');
    return jerseyEl && jerseyEl.textContent !== String(p.squadNumber);
  });
  if (hasSubstitution) return false;

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

    // Refresh the expand body so an open panel reflects live stats.
    const expandBody = row.querySelector('.sp-expand-body') as HTMLElement | null;
    if (expandBody) expandBody.innerHTML = renderPlayerExpand(p);
  });
  return true;
}

function statsKey(d: DisplaySnapshot): string {
  const s = d.stats;
  const hRunM = d.aggregates.runMetres.home;
  const aRunM = d.aggregates.runMetres.away;
  const hKickM = d.aggregates.kickMetres.home;
  const aKickM = d.aggregates.kickMetres.away;
  const hPens = d.aggregates.penaltiesConceded.home;
  const aPens = d.aggregates.penaltiesConceded.away;
  return `${s.possession.home},${s.possession.away},${s.territory.home},${s.territory.away},`
       + `${s.tackles.home.made},${s.tackles.home.attempted},${s.tackles.away.made},${s.tackles.away.attempted},`
       + `${s.handlingErrors.home},${s.handlingErrors.away},${s.tries.home},${s.tries.away},`
       + `${s.scrums.home},${s.scrums.away},${s.lineouts.home},${s.lineouts.away},`
       + `${s.ownLineouts.home.thrown},${s.ownLineouts.home.won},${s.ownLineouts.away.thrown},${s.ownLineouts.away.won},`
       + `${s.ownScrums.home.putIn},${s.ownScrums.home.won},${s.ownScrums.away.putIn},${s.ownScrums.away.won},`
       + `${s.entries22.home.count},${s.entries22.home.pointsScored},${s.entries22.away.count},${s.entries22.away.pointsScored},`
       + `${hRunM},${aRunM},${hKickM},${aKickM},${hPens},${aPens}`;
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
  const teamSection = (team: MatchState['homeTeam']): string[] => {
    const tc = teamTextColor(team.color);
    return [
      `<tr class="team-row"><td colspan="15" style="color:${tc}">${team.name}</td></tr>`,
      ...team.players.map(p => playerTableRow(p, tc, false)),
      ...team.substitutedOff.map(p => playerTableRow(p, tc, true)),
    ];
  };
  const [first, second] = teamsInHumanOrder(state);
  return `<table class="player-table">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${[...teamSection(first), ...teamSection(second)].join('')}</tbody>
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

// Row-flash duration matches the row-expand transition for visual coherence.
const STAT_FLASH_MS = 600;

export function initStatsPanel(): void {
  const statsContent        = document.getElementById('stats-content')!;
  const playerStatsContent  = document.getElementById('player-stats-content')!;
  const playerDetailContent = document.getElementById('player-detail-content')!;

  let lastStatsKey          = '';
  let lastPlayerStatsMinute = -1;
  let isPlayerStatsInit     = false;
  let lastPlayerTableKey    = '';
  // null on first render — the change-flash only fires on a winner FLIP,
  // not on initial assignment from "no value" to first value.
  let prevWinners: Map<string, WinnerSide> | null = null;
  let lastStateRef: MatchState | null = null;

  // Tap-to-expand for player rows. Delegated click on the container; rows
  // carry `data-row-id="rid-${rosterId}"`. Re-renders the player list on
  // toggle so the expand panel HTML is injected; the per-tick patch path
  // refreshes its body in place without disturbing the expander state.
  const playerExpander = createRowExpander({
    rowSelector: '.player-stat-row',
    onChange: () => {
      if (lastStateRef) {
        playerStatsContent.innerHTML = renderPlayerStats(lastStateRef, playerExpander.isExpanded);
      }
    },
  });
  playerExpander.attach(playerStatsContent);

  eventBus.on('engine:initialized', () => {
    lastStatsKey          = '';
    lastPlayerStatsMinute = -1;
    isPlayerStatsInit     = false;
    lastPlayerTableKey    = '';
    prevWinners           = null;
    lastStateRef          = null;
    statsContent.innerHTML        = '';
    playerStatsContent.innerHTML  = '';
    playerDetailContent.innerHTML = '';
    playerExpander.collapseAll();
  });

  eventBus.on('engine:stateChange', ({ state, display }) => {
    lastStateRef = state;

    // Summary stat rows read the per-event snapshot (beat-time), so they track
    // the narrated line even while the producer runs ahead. The per-player
    // list + detail table below read live state (the documented compromise —
    // per-player snapshots would be squad-sized allocations per beat).
    const key = statsKey(display);
    if (key !== lastStatsKey) {
      lastStatsKey = key;
      // Compute the new winners BEFORE the re-render so we can flash the
      // freshly-rendered rows whose winner has flipped.
      const newRows = buildStatRows(display);
      const newWinners = new Map<string, WinnerSide>(newRows.map(r => [r.id, winnerOf(r)]));

      statsContent.innerHTML = renderStats(display, state.homeTeam, state.awayTeam);

      if (prevWinners !== null) {
        for (const [id, win] of newWinners) {
          const prev = prevWinners.get(id);
          if (prev !== undefined && prev !== win && win !== 'tie' && prev !== 'tie') {
            const row = statsContent.querySelector<HTMLElement>(`.stat-row[data-stat-id="${id}"]`);
            if (row) {
              row.classList.add('stat-row--changed');
              setTimeout(() => row.classList.remove('stat-row--changed'), STAT_FLASH_MS);
            }
          }
        }
      }
      prevWinners = newWinners;
    }

    const minute = Math.floor(state.clock.gameMinute);
    if (minute !== lastPlayerStatsMinute) {
      lastPlayerStatsMinute = minute;
      if (!isPlayerStatsInit) {
        playerStatsContent.innerHTML = renderPlayerStats(state, playerExpander.isExpanded);
        isPlayerStatsInit = true;
      } else if (!updatePlayerStatsDOM(playerStatsContent, state)) {
        // Substitution or roster shape change — re-render to inject the
        // new player's row + expand panel. Expander state survives via
        // its rosterId-keyed Set, so any open panel on a still-present
        // player stays open.
        playerStatsContent.innerHTML = renderPlayerStats(state, playerExpander.isExpanded);
      }
    }

    const tableKey = playerTableKey(state);
    if (tableKey !== lastPlayerTableKey) {
      lastPlayerTableKey = tableKey;
      playerDetailContent.innerHTML = renderPlayerTable(state);
    }
  });
}
