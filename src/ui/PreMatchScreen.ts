import type { PlayerStats, Position } from '../types/player';
import type { TeamTactics } from '../types/team';
import { DEFAULT_TACTICS } from '../types/team';
import { renderTacticsMenu } from './TacticsMenu';
import { eventBus } from '../utils/eventBus';
import { shortName } from '../utils/playerName';
import { teamTextColor } from '../utils/teamColor';
import type { RawTeamInput } from '../types/teamData';
import { playerOverall } from '../engine/RatingEngine';
import { computeOverallRating } from '../team/teamProfile';
import { sortStandings } from '../game/leagueTable';
import { recentForm, headToHead, matchSpread, formAdjustment, HOME_ADVANTAGE_PTS, type FormResult } from '../game/teamStats';
import { applyMatchdaySquad, makeInjuredPredicate } from '../game/playerSquad';
import { buildTeamFromRoster } from '../game/rosterTeamBuilder';
import type { GameCoordinator } from '../game/GameCoordinator';

type RawPlayer = {
  id: number;
  squadNumber?: number;
  firstName: string;
  lastName: string;
  dob: string | null;
  nationality: string;
  position: Position;
  baseStats: PlayerStats;
};

type RawTeam = RawTeamInput;

// All 12 stats shown in the horizontally scrollable roster grid
const COMPACT_STATS: { key: keyof PlayerStats; abbr: string }[] = [
  { key: 'stamina',    abbr: 'STM' },
  { key: 'strength',   abbr: 'STR' },
  { key: 'pace',       abbr: 'PAC' },
  { key: 'agility',    abbr: 'AGI' },
  { key: 'handling',   abbr: 'HND' },
  { key: 'tackling',   abbr: 'TKL' },
  { key: 'breakdown',  abbr: 'BRK' },
  { key: 'kicking',    abbr: 'KCK' },
  { key: 'setPiece',   abbr: 'SET' },
  { key: 'discipline', abbr: 'DIS' },
  { key: 'positioning',abbr: 'POS' },
  { key: 'composure',  abbr: 'CMP' },
];

// Formation rows: [jersey ids] from top (front row) to bottom (fullback)
const FORMATION_ROWS: number[][] = [
  [1, 2, 3],
  [4, 5],
  [6, 8, 7],
  [9, 10],
  [12, 13],
  [11, 14],
  [15],
];
const ROW_Y_PCT = [10, 24, 38, 52, 64, 76, 88];

function statColor(v: number): string {
  if (v >= 85) return 'var(--rm-stat-3)';
  if (v >= 78) return 'var(--rm-stat-4)';
  if (v >= 70) return 'var(--rm-stat-5)';
  if (v >= 62) return 'var(--rm-stat-2)';
  return 'var(--rm-stat-1)';
}

function getSquadNum(p: RawPlayer): number {
  return p.squadNumber ?? p.id;
}

function crestHtml(letter: string, color: string, size = 44): string {
  return `<div class="pm-crest" style="
    width:${size}px;height:${size}px;
    background:linear-gradient(160deg,${color} 0%,color-mix(in oklch,${color} 65%,black) 100%);
    border:1px solid color-mix(in oklch,${color} 50%,transparent);
    box-shadow:0 6px 16px color-mix(in oklch,${color} 30%,transparent),inset 0 1px 0 rgba(255,255,255,0.15);
  "><span>${letter}</span></div>`;
}

function formPins(form: Array<FormResult | null>): string {
  return form.map(r => {
    if (r === null) return `<span class="pm-form-pin pm-form-pin--empty">–</span>`;
    const cls = r === 'W' ? 'pm-form-pin--w' : r === 'L' ? 'pm-form-pin--l' : 'pm-form-pin--d';
    return `<span class="pm-form-pin ${cls}">${r}</span>`;
  }).join('');
}

function ordinalSuffix(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function h2hValue(h: { wins: number; draws: number; losses: number; meetings: number }): string {
  if (h.meetings === 0) return '—';
  const parts = [`${h.wins}W`];
  if (h.draws > 0) parts.push(`${h.draws}D`);
  parts.push(`${h.losses}L`);
  return parts.join(' · ');
}

function renderColumnHeader(): string {
  return `<div class="pm-col-header">
    <div></div>
    <div></div>
    <div class="pm-col-label">OVR</div>
    <div></div>
    ${COMPACT_STATS.map(s => `<div class="pm-col-label">${s.abbr}</div>`).join('')}
  </div>`;
}

type Tier = 'starter' | 'bench' | 'squad';

function renderPlayerRow(p: RawPlayer, color: string, interactive: boolean, tier: Tier): string {
  const ovr = playerOverall(p.baseStats, p.position);
  const squadNum = getSquadNum(p);
  const lastName = shortName(p);
  const tierClass = ` pm-player--${tier}`;
  const dataAttr = interactive ? `data-squad="${squadNum}" data-tier="${tier}"` : '';
  const tag = interactive ? 'button' : 'div';

  const statCells = COMPACT_STATS.map(s => {
    const v = p.baseStats[s.key];
    return `<div class="pm-stat" style="color:${statColor(v)}">${v}</div>`;
  }).join('');

  return `<${tag} class="pm-player-row${tierClass}" ${dataAttr}>
    <div class="pm-num" style="color:${teamTextColor(color)}">${squadNum}</div>
    <div class="pm-identity">
      <span class="pm-name">${lastName}</span>
      <span class="pm-pos">${p.position}</span>
    </div>
    <div class="pm-ovr-val" style="color:${statColor(ovr)}">${ovr}</div>
    <div class="pm-row-divider"></div>
    ${statCells}
  </${tag}>`;
}

function renderPitchFormation(starters: RawPlayer[], color: string): string {
  const byId: Record<number, RawPlayer> = {};
  for (const p of starters) byId[p.id] = p;

  const tokens = FORMATION_ROWS.flatMap((row, ri) => {
    const y = ROW_Y_PCT[ri];
    return row.map((id, ci) => {
      const p = byId[id];
      if (!p) return '';
      const x = ((ci + 1) / (row.length + 1)) * 100;
      const lastName = shortName(p);
      return `<div class="pm-player-token" style="top:${y}%;left:${x}%">
        <div class="pm-token-circle" style="background:linear-gradient(180deg,${color} 0%,color-mix(in oklch,${color} 60%,black) 100%)">${id}</div>
        <div class="pm-token-name">${lastName}</div>
      </div>`;
    });
  }).join('');

  return `<div class="pm-pitch-formation">
    <div class="pm-pitch-line" style="top:8%"></div>
    <div class="pm-pitch-line" style="top:50%"></div>
    <div class="pm-pitch-line" style="bottom:8%"></div>
    ${tokens}
  </div>`;
}

function renderLineupPanel(
  starters: RawPlayer[],
  bench: RawPlayer[],
  squad: RawPlayer[],
  color: string,
  interactive: boolean,
  view: 'list' | 'pitch',
): string {
  if (view === 'pitch') {
    return renderPitchFormation(starters, color);
  }

  const starterHtml = starters.map(p => renderPlayerRow(p, color, interactive, 'starter')).join('');
  const benchHtml   = bench.map(p => renderPlayerRow(p, color, interactive, 'bench')).join('');
  const squadHtml   = squad.map(p => renderPlayerRow(p, color, interactive, 'squad')).join('');

  return `
    <div class="pm-roster-scroller">
      <div class="pm-roster-inner">
        ${renderColumnHeader()}
        <div class="pm-section-header">
          Starting XV
          <span class="pm-bench-hint">Select a bench or squad player to swap</span>
        </div>
        ${starterHtml}
        <div class="pm-section-header pm-section-bench">Bench</div>
        ${benchHtml}
        ${squad.length > 0 ? `
          <div class="pm-section-header pm-section-squad">
            Squad
            <span class="pm-section-sub">${squad.length} player${squad.length === 1 ? '' : 's'} not in matchday 23</span>
          </div>
          ${squadHtml}
        ` : ''}
      </div>
    </div>
  `;
}

export function initPreMatchScreen(
  home: RawTeam,
  away: RawTeam,
  playerSide: 'home' | 'away',
  roundNumber: number,
  gameEngine: GameCoordinator,
  onStart: (configuredHome: RawTeam, configuredAway: RawTeam, playerTactics: TeamTactics) => void,
  onBack: () => void,
): void {
  const screen = document.getElementById('pre-match')!;
  screen.classList.remove('pm-exit');

  // Visual layout puts the player's team in the LEFT versus slot and as the
  // first/active tab so the manager's eye lands on it. Engine-side identity
  // (home vs away) is preserved — only the on-screen order changes.
  const playerTeam = playerSide === 'home' ? home : away;
  const oppTeam    = playerSide === 'home' ? away : home;
  const oppSide: 'home' | 'away' = playerSide === 'home' ? 'away' : 'home';

  const state = gameEngine.getState();
  const savedTactics = state.player.tactics;
  const savedSquad   = state.player.matchdaySquad;

  // Both teams come from the persistent career roster so aging /
  // signings / academy intake / injuries all reflect their current
  // state on the matchday squad. buildTeamFromRoster sorts injured
  // players to the wider squad so the auto-built 23 are all fit.
  //
  // The human side additionally gets applyMatchdaySquad on top of the
  // roster-based base so the manager's curated lineup overrides the
  // auto-build — with an injury-aware predicate that falls back to the
  // auto-build when a saved-squad selection is now unavailable. The AI
  // opponent has no equivalent curation; the buildTeamFromRoster order
  // is what runs out.
  const humanTeamJson = playerSide === 'home' ? home : away;
  const oppTeamJson   = playerSide === 'home' ? away : home;
  const humanRosterBased = buildTeamFromRoster(state, humanTeamJson);
  const oppRosterBased   = buildTeamFromRoster(state, oppTeamJson);
  const club = state.career.clubs.find(c => c.id === humanTeamJson.id);
  const isInjured = club ? makeInjuredPredicate(state.career.roster, club.squad) : undefined;
  const humanApplied = applyMatchdaySquad(humanRosterBased, savedSquad, isInjured);
  // Names of the injured players in the saved squad — used to render the
  // "X out injured" banner below. Empty if savedSquad is clean or absent.
  const injuredSavedRefs = (savedSquad && isInjured)
    ? savedSquad.filter(ref => isInjured(ref))
    : [];

  const homeApplied = playerSide === 'home' ? humanApplied : oppRosterBased;
  const awayApplied = playerSide === 'away' ? humanApplied : oppRosterBased;

  const homeStarters: RawPlayer[] = (homeApplied.players as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  const homeBench:    RawPlayer[] = ((homeApplied.bench ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  const homeSquad:    RawPlayer[] = ((homeApplied.squad ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));

  const awayStarters: RawPlayer[] = (awayApplied.players as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  const awayBench:    RawPlayer[] = ((awayApplied.bench ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  const awaySquad:    RawPlayer[] = ((awayApplied.squad ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));

  let selection: { tier: Tier; squadNum: number } | null = null;
  let activeView: 'list' | 'pitch' = 'list';

  const results = state.league.results;
  const playerForm = recentForm(playerTeam.id, results);
  const oppForm    = recentForm(oppTeam.id,    results);

  // Spread = effective home rating vs effective away rating, where each
  // side's effective rating bakes in (1) the home team's flat advantage
  // and (2) a live form modifier from current league standings. The
  // resulting `spread.home` is the home team's handicap (negative when
  // home is favoured), and we display it as "<favourite> by <margin> PTS"
  // to make clear it's a point spread, not a fractional/decimal odds line.
  const homeTeam = playerSide === 'home' ? playerTeam : oppTeam;
  const awayTeam = playerSide === 'home' ? oppTeam : playerTeam;
  const homeStanding = state.league.standings.find(s => s.teamId === homeTeam.id);
  const awayStanding = state.league.standings.find(s => s.teamId === awayTeam.id);
  const homeEffective = computeOverallRating(homeTeam.id)
    + HOME_ADVANTAGE_PTS
    + formAdjustment(homeStanding, state.league.standings);
  const awayEffective = computeOverallRating(awayTeam.id)
    + formAdjustment(awayStanding, state.league.standings);
  const spread = matchSpread(homeEffective, awayEffective);
  const oddsValue =
    spread.home === 0 ? 'Even'
    : spread.home < 0 ? `${homeTeam.shortName} by ${-spread.home}`
    :                   `${awayTeam.shortName} by ${spread.home}`;
  const oddsSub = spread.home === 0 ? 'No favourite' : 'PTS';

  const h2h = headToHead(playerTeam.id, oppTeam.id, results);
  const h2hSub = h2h.meetings === 0 ? 'first meeting' : `last ${h2h.meetings}`;

  const sorted = sortStandings(state.league.standings);
  const playerRankIdx = sorted.findIndex(s => s.teamId === playerTeam.id);
  const playerStanding = playerRankIdx === -1 ? null : sorted[playerRankIdx];
  const leagueValue = playerStanding === null
    ? '—'
    : `${playerRankIdx + 1}${ordinalSuffix(playerRankIdx + 1)}`;
  const leagueSub = playerStanding === null
    ? ''
    : `${playerStanding.leaguePoints} pt${playerStanding.leaguePoints === 1 ? '' : 's'}`;

  const playerInitial = playerTeam.shortName[0] ?? 'P';
  const oppInitial    = oppTeam.shortName[0]    ?? 'O';

  screen.innerHTML = `
    <div id="pm-header">
      <div id="pm-topbar">
        <button id="pm-back" class="app-back" aria-label="Back to hub">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Hub</span>
        </button>
        <span id="pm-context-label">Match Preview · Round ${roundNumber}</span>
        <div style="width:60px"></div>
      </div>

      <div id="pm-versus">
        <div class="pm-versus-team">
          <div class="pm-versus-badge">
            ${crestHtml(playerInitial, playerTeam.color, 44)}
            <div class="pm-form-row">${formPins(playerForm)}</div>
          </div>
          <div class="pm-versus-names">
            <div class="pm-team-code">${playerTeam.shortName}</div>
            <div class="pm-team-full">${playerTeam.name}</div>
          </div>
        </div>
        <div class="pm-versus-center">
          <span class="pm-vs-text">vs</span>
        </div>
        <div class="pm-versus-team pm-versus-team--away">
          <div class="pm-versus-badge">
            ${crestHtml(oppInitial, oppTeam.color, 44)}
            <div class="pm-form-row">${formPins(oppForm)}</div>
          </div>
          <div class="pm-versus-names pm-versus-names--right">
            <div class="pm-team-code">${oppTeam.shortName}</div>
            <div class="pm-team-full">${oppTeam.name}</div>
          </div>
        </div>
      </div>

      <div id="pm-stake-row">
        ${[
          ['LEAGUE', leagueValue, leagueSub],
          ['H2H',    h2hValue(h2h), h2hSub],
          ['SPREAD', oddsValue, oddsSub],
        ].map(([k, v, sub]) => `
          <div class="pm-stake-card">
            <div class="pm-stake-key">${k}</div>
            <div class="pm-stake-val">${v}</div>
            <div class="pm-stake-sub">${sub}</div>
          </div>
        `).join('')}
      </div>

      ${injuredSavedRefs.length > 0 ? `
        <div id="pm-injury-banner" role="status">
          <span class="pm-injury-badge" aria-hidden="true">+</span>
          <span class="pm-injury-text">
            ${injuredSavedRefs.length === 1 ? '1 player is' : `${injuredSavedRefs.length} players are`}
            unavailable through injury (${injuredSavedRefs.map(r => r.lastName).join(', ')}).
            Replacements auto-picked &mdash; visit Squad to confirm.
          </span>
        </div>
      ` : ''}

      <div id="pm-tabs-bar">
        <div id="pm-tabs" role="tablist">
          <button class="pm-tab active" data-tab="${playerSide}" style="--tc:${playerTeam.color}">${playerTeam.shortName}</button>
          <button class="pm-tab"        data-tab="${oppSide}"    style="--tc:${oppTeam.color}">${oppTeam.shortName}</button>
          <button class="pm-tab"        data-tab="tactics"       style="--tc:var(--rm-pitch)">TACTICS</button>
        </div>
        <div id="pm-view-toggle">
          <button class="pm-view-btn pm-view-btn--active" data-view="list" aria-label="List view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
          </button>
          <button class="pm-view-btn" data-view="pitch" aria-label="Pitch view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="1"/><path d="M12 6v12"/></svg>
          </button>
        </div>
      </div>
    </div>

    <div id="pm-body">
      <div id="pm-home"    class="pm-panel${playerSide === 'home' ? '' : ' hidden'}"></div>
      <div id="pm-away"    class="pm-panel${playerSide === 'away' ? '' : ' hidden'}"></div>
      <div id="pm-tactics" class="pm-panel hidden"></div>
    </div>

    <div id="pm-footer">
      <button id="pm-start" class="cta-pulse">
        <span class="btn-label">Kick off</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
      </button>
    </div>
  `;

  const homePanel    = screen.querySelector<HTMLElement>('#pm-home')!;
  const awayPanel    = screen.querySelector<HTMLElement>('#pm-away')!;
  const tacticsPanel = screen.querySelector<HTMLElement>('#pm-tactics')!;
  const tabs         = screen.querySelectorAll<HTMLButtonElement>('.pm-tab');
  const viewToggle   = screen.querySelector<HTMLElement>('#pm-view-toggle')!;

  const playerStarters = playerSide === 'home' ? homeStarters : awayStarters;
  const playerBench    = playerSide === 'home' ? homeBench    : awayBench;
  const playerSquad    = playerSide === 'home' ? homeSquad    : awaySquad;

  function listForTier(t: Tier): RawPlayer[] {
    return t === 'starter' ? playerStarters : t === 'bench' ? playerBench : playerSquad;
  }

  function updateHint(): void {
    const panel = playerSide === 'home' ? homePanel : awayPanel;
    const hintEl = panel.querySelector<HTMLElement>('.pm-bench-hint');
    if (!hintEl) return;
    if (selection === null) {
      hintEl.textContent = 'Select a bench or squad player to swap';
      hintEl.classList.remove('pm-bench-hint--active');
    } else {
      hintEl.textContent = 'Now select another player to swap with';
      hintEl.classList.add('pm-bench-hint--active');
    }
  }

  function renderHomePanel(): void {
    homePanel.innerHTML = renderLineupPanel(homeStarters, homeBench, homeSquad, home.color, playerSide === 'home', activeView);
    if (playerSide === 'home') updateHint();
  }

  function renderAwayPanel(): void {
    awayPanel.innerHTML = renderLineupPanel(awayStarters, awayBench, awaySquad, away.color, playerSide === 'away', activeView);
    if (playerSide === 'away') updateHint();
  }

  // Pre-match selection: any non-starter player can be swap source; any player
  // can be swap target. The player who lands in a slot takes that slot's id and
  // squadNumber (engine routes position by id, jersey UI reads squadNumber).
  // This is the only place id/squadNumber is re-assigned by slot — in-game
  // substitutions preserve squadNumber.

  renderHomePanel();
  renderAwayPanel();

  const activePanel = playerSide === 'home' ? homePanel : awayPanel;
  activePanel.addEventListener('click', (e) => {
    const playerEl = (e.target as HTMLElement).closest<HTMLElement>('.pm-player-row');
    if (!playerEl) return;
    const tierAttr = playerEl.dataset.tier as Tier | undefined;
    if (!tierAttr) return;
    const squadNum = Number(playerEl.dataset.squad);

    // Same player clicked again → deselect
    if (selection && selection.tier === tierAttr && selection.squadNum === squadNum) {
      selection = null;
      if (playerSide === 'home') renderHomePanel(); else renderAwayPanel();
      return;
    }

    // No selection yet → start one (starters can't initiate; they're only swap targets)
    if (selection === null) {
      if (tierAttr === 'starter') return;
      selection = { tier: tierAttr, squadNum };
      if (playerSide === 'home') renderHomePanel(); else renderAwayPanel();
      const sel = activePanel.querySelector<HTMLElement>(`.pm-player-row[data-tier="${tierAttr}"][data-squad="${squadNum}"]`);
      sel?.classList.add('pm-player--selected');
      activePanel.querySelectorAll('.pm-player-row').forEach(el => {
        if (el !== sel) el.classList.add('pm-swap-target');
      });
      return;
    }

    // Selection exists, clicked a different player → swap
    const fromList = listForTier(selection.tier);
    const toList   = listForTier(tierAttr);
    const fromIdx  = fromList.findIndex(p => getSquadNum(p) === selection!.squadNum);
    const toIdx    = toList.findIndex(p => getSquadNum(p) === squadNum);
    if (fromIdx === -1 || toIdx === -1) return;

    const fromId = fromList[fromIdx].id;
    const toId   = toList[toIdx].id;
    const fromPlayer = fromList[fromIdx];
    const toPlayer   = toList[toIdx];
    fromList[fromIdx] = { ...toPlayer, id: fromId, squadNumber: fromId };
    toList[toIdx]     = { ...fromPlayer, id: toId, squadNumber: toId };

    selection = null;
    if (playerSide === 'home') renderHomePanel(); else renderAwayPanel();
  });

  viewToggle.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.pm-view-btn');
    if (!btn) return;
    const v = btn.dataset.view as 'list' | 'pitch';
    if (v === activeView) return;
    activeView = v;
    selection = null;
    viewToggle.querySelectorAll('.pm-view-btn').forEach(b => {
      b.classList.toggle('pm-view-btn--active', (b as HTMLElement).dataset.view === v);
    });
    renderHomePanel();
    renderAwayPanel();
  });

  const initialTactics: TeamTactics = savedTactics ? { ...savedTactics } : { ...DEFAULT_TACTICS };
  let chosenTactics: TeamTactics = { ...initialTactics };
  const unsubTactics = eventBus.on('ui:tacticsChange', ({ teamId, tactics }) => {
    if (teamId === playerSide) chosenTactics = tactics;
  });

  renderTacticsMenu(tacticsPanel, initialTactics, playerSide);

  screen.querySelector('#pm-back')!.addEventListener('click', () => {
    unsubTactics();
    onBack();
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.dataset.tab!;
      tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === t));
      homePanel.classList.toggle('hidden', t !== 'home');
      awayPanel.classList.toggle('hidden', t !== 'away');
      tacticsPanel.classList.toggle('hidden', t !== 'tactics');
      viewToggle.classList.toggle('pm-view-toggle--hidden', t === 'tactics');
    });
  });

  screen.querySelector('#pm-start')!.addEventListener('click', () => {
    screen.classList.add('pm-exit');
    setTimeout(() => {
      unsubTactics();
      const configuredHome = playerSide === 'home'
        ? { ...home, players: homeStarters, bench: homeBench, squad: homeSquad } as unknown as RawTeam
        : home as unknown as RawTeam;
      const configuredAway = playerSide === 'away'
        ? { ...away, players: awayStarters, bench: awayBench, squad: awaySquad } as unknown as RawTeam
        : away as unknown as RawTeam;
      onStart(configuredHome, configuredAway, chosenTactics);
    }, 600);
  });
}
