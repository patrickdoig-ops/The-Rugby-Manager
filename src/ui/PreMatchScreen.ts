import type { PlayerStats } from '../types/player';
import type { TeamTactics } from '../types/team';
import { DEFAULT_TACTICS } from '../types/team';
import { renderTacticsMenu } from './TacticsMenu';
import { eventBus } from '../utils/eventBus';
import type { RawTeamInput } from '../engine/MatchCoordinator';

type RawPlayer = {
  id: number;
  squadNumber?: number;
  firstName?: string;
  lastName?: string;
  dob?: string | null;
  nationality?: string;
  name?: string;
  position: string;
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
  if (v >= 88) return 'var(--rm-stat-5)';
  if (v >= 78) return 'var(--rm-stat-4)';
  if (v >= 65) return 'var(--rm-stat-3)';
  if (v >= 50) return 'var(--rm-stat-2)';
  return 'var(--rm-stat-1)';
}

function computeOverall(stats: PlayerStats): number {
  const vals = Object.values(stats) as number[];
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
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

function formPins(sequence: string): string {
  return sequence.split('').map(r => {
    const cls = r === 'W' ? 'pm-form-pin--w' : r === 'L' ? 'pm-form-pin--l' : 'pm-form-pin--d';
    return `<span class="pm-form-pin ${cls}">${r}</span>`;
  }).join('');
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

function renderPlayerRow(p: RawPlayer, color: string, interactive: boolean, isBench: boolean): string {
  const ovr = computeOverall(p.baseStats);
  const squadNum = getSquadNum(p);
  const lastName = p.lastName ?? (p.name ? (p.name.split(' ').slice(1).join(' ') || p.name) : '');
  const benchClass = isBench ? ' pm-player--bench' : ' pm-player--starter';
  const dataAttr = interactive ? `data-squad="${squadNum}"` : '';
  const tag = interactive ? 'button' : 'div';

  const statCells = COMPACT_STATS.map(s => {
    const v = p.baseStats[s.key];
    return `<div class="pm-stat" style="color:${statColor(v)}">${v}</div>`;
  }).join('');

  return `<${tag} class="pm-player-row${benchClass}" ${dataAttr}>
    <div class="pm-num" style="color:${color}">${squadNum}</div>
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
      const lastName = p.lastName ?? (p.name ? (p.name.split(' ').slice(1).join(' ') || p.name) : '');
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
  color: string,
  interactive: boolean,
  view: 'list' | 'pitch',
): string {
  if (view === 'pitch') {
    return renderPitchFormation(starters, color);
  }

  const starterHtml = starters.map(p => renderPlayerRow(p, color, interactive, false)).join('');
  const benchHtml   = bench.map(p => renderPlayerRow(p, color, interactive, true)).join('');

  return `
    <div class="pm-roster-scroller">
      <div class="pm-roster-inner">
        ${renderColumnHeader()}
        <div class="pm-section-header">Starting XV</div>
        ${starterHtml}
        <div class="pm-section-header pm-section-bench">
          Bench
          <span class="pm-bench-hint">Select a bench player to swap</span>
        </div>
        ${benchHtml}
      </div>
    </div>
  `;
}

export function initPreMatchScreen(
  home: RawTeam,
  away: RawTeam,
  playerSide: 'home' | 'away',
  roundNumber: number,
  onStart: (configuredHome: RawTeam, configuredAway: RawTeam, playerTactics: TeamTactics) => void,
  onBack: () => void,
): void {
  const screen = document.getElementById('pre-match')!;
  screen.classList.remove('pm-exit');

  let homeStarters: RawPlayer[] = (home.players as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  let homeBench:    RawPlayer[] = ((home.bench ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));

  let awayStarters: RawPlayer[] = (away.players as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  let awayBench:    RawPlayer[] = ((away.bench ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));

  let selectedBenchSquadNum: number | null = null;
  let activeView: 'list' | 'pitch' = 'list';

  const homeFirst = home.shortName[0] ?? 'H';
  const awayFirst = away.shortName[0] ?? 'A';

  screen.innerHTML = `
    <div id="pm-header">
      <div id="pm-topbar">
        <button id="pm-back" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Lobby</span>
        </button>
        <span id="pm-context-label">Match Preview · Round ${roundNumber}</span>
        <div style="width:60px"></div>
      </div>

      <div id="pm-versus">
        <div class="pm-versus-team">
          <div class="pm-versus-badge">
            ${crestHtml(homeFirst, home.color, 44)}
            <div class="pm-form-row">${formPins('WWLWD')}</div>
          </div>
          <div class="pm-versus-names">
            <div class="pm-team-code">${home.shortName}</div>
            <div class="pm-team-full">${home.name}</div>
          </div>
        </div>
        <div class="pm-versus-center">
          <span class="pm-vs-text">vs</span>
        </div>
        <div class="pm-versus-team pm-versus-team--away">
          <div class="pm-versus-badge">
            ${crestHtml(awayFirst, away.color, 44)}
            <div class="pm-form-row">${formPins('WWWLW')}</div>
          </div>
          <div class="pm-versus-names pm-versus-names--right">
            <div class="pm-team-code">${away.shortName}</div>
            <div class="pm-team-full">${away.name}</div>
          </div>
        </div>
      </div>

      <div id="pm-stake-row">
        ${[
          ['LEAGUE', '2nd', '4 pts'],
          ['H2H',    '1W · 2L', 'last 3'],
          ['ODDS',   '+3.5',    `${away.shortName} fav.`],
        ].map(([k, v, sub]) => `
          <div class="pm-stake-card">
            <div class="pm-stake-key">${k}</div>
            <div class="pm-stake-val">${v}</div>
            <div class="pm-stake-sub">${sub}</div>
          </div>
        `).join('')}
      </div>

      <div id="pm-tabs-bar">
        <div id="pm-tabs" role="tablist">
          <button class="pm-tab active" data-tab="home"    style="--tc:${home.color}">${home.name}</button>
          <button class="pm-tab"        data-tab="away"    style="--tc:${away.color}">${away.name}</button>
          <button class="pm-tab"        data-tab="tactics" style="--tc:var(--rm-pitch)">Tactics</button>
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
      <div id="pm-home"    class="pm-panel"></div>
      <div id="pm-away"    class="pm-panel hidden"></div>
      <div id="pm-tactics" class="pm-panel hidden"></div>
    </div>

    <div id="pm-footer">
      <button id="pm-start">
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

  function updateHint(): void {
    const panel = playerSide === 'home' ? homePanel : awayPanel;
    const hintEl = panel.querySelector<HTMLElement>('.pm-bench-hint');
    if (!hintEl) return;
    if (selectedBenchSquadNum === null) {
      hintEl.textContent = 'Select a bench player to swap';
      hintEl.classList.remove('pm-bench-hint--active');
    } else {
      hintEl.textContent = 'Now select a starter to replace';
      hintEl.classList.add('pm-bench-hint--active');
    }
  }

  function renderHomePanel(): void {
    homePanel.innerHTML = renderLineupPanel(homeStarters, homeBench, home.color, playerSide === 'home', activeView);
    if (playerSide === 'home') updateHint();
  }

  function renderAwayPanel(): void {
    awayPanel.innerHTML = renderLineupPanel(awayStarters, awayBench, away.color, playerSide === 'away', activeView);
    if (playerSide === 'away') updateHint();
  }

  // Pre-match jersey assignment: starter slots wear jerseys 1–15, bench slots
  // wear 16–23. Swapping a starter ↔ bench pair reassigns BOTH the player's
  // `id` (used by the engine for position queries) and `squadNumber` (the
  // visible jersey number) to match the slot they end up in. This is the only
  // place squadNumber is re-assigned by slot — in-game substitutions preserve it.
  function assignStartingJersey(starterIdx: number, benchIdx: number): void {
    const slotId      = playerStarters[starterIdx].id;
    const benchSlotId = playerBench[benchIdx].id;
    const newStarter   = { ...playerBench[benchIdx],    id: slotId,      squadNumber: slotId };
    const newBenchSlot = { ...playerStarters[starterIdx], id: benchSlotId, squadNumber: benchSlotId };
    playerStarters[starterIdx] = newStarter;
    playerBench[benchIdx]      = newBenchSlot;
  }

  renderHomePanel();
  renderAwayPanel();

  const activePanel = playerSide === 'home' ? homePanel : awayPanel;
  activePanel.addEventListener('click', (e) => {
    const playerEl = (e.target as HTMLElement).closest<HTMLElement>('.pm-player--bench, .pm-player--starter');
    if (!playerEl) return;

    if (playerEl.classList.contains('pm-player--bench')) {
      const squadNum = Number(playerEl.dataset.squad);
      if (selectedBenchSquadNum === squadNum) {
        selectedBenchSquadNum = null;
        playerEl.classList.remove('pm-player--selected');
        activePanel.querySelectorAll('.pm-player--starter').forEach(el => el.classList.remove('pm-swap-target'));
      } else {
        selectedBenchSquadNum = squadNum;
        activePanel.querySelectorAll('.pm-player--selected').forEach(el => el.classList.remove('pm-player--selected'));
        playerEl.classList.add('pm-player--selected');
        activePanel.querySelectorAll('.pm-player--starter').forEach(el => el.classList.add('pm-swap-target'));
      }
      updateHint();
    } else if (playerEl.classList.contains('pm-player--starter')) {
      if (selectedBenchSquadNum === null) return;

      const starterSquadNum = Number(playerEl.dataset.squad);
      const starterIdx = playerStarters.findIndex(p => getSquadNum(p) === starterSquadNum);
      const benchIdx   = playerBench.findIndex(p => getSquadNum(p) === selectedBenchSquadNum);
      if (starterIdx === -1 || benchIdx === -1) return;

      assignStartingJersey(starterIdx, benchIdx);
      selectedBenchSquadNum = null;
      if (playerSide === 'home') renderHomePanel();
      else renderAwayPanel();
    }
  });

  viewToggle.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.pm-view-btn');
    if (!btn) return;
    const v = btn.dataset.view as 'list' | 'pitch';
    if (v === activeView) return;
    activeView = v;
    selectedBenchSquadNum = null;
    viewToggle.querySelectorAll('.pm-view-btn').forEach(b => {
      b.classList.toggle('pm-view-btn--active', (b as HTMLElement).dataset.view === v);
    });
    renderHomePanel();
    renderAwayPanel();
  });

  let chosenTactics: TeamTactics = { ...DEFAULT_TACTICS };
  const unsubTactics = eventBus.on('ui:tacticsChange', ({ teamId, tactics }) => {
    if (teamId === playerSide) chosenTactics = tactics;
  });

  renderTacticsMenu(tacticsPanel, { ...DEFAULT_TACTICS }, playerSide);

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
        ? { ...home, players: homeStarters, bench: homeBench } as unknown as RawTeam
        : home as unknown as RawTeam;
      const configuredAway = playerSide === 'away'
        ? { ...away, players: awayStarters, bench: awayBench } as unknown as RawTeam
        : away as unknown as RawTeam;
      onStart(configuredHome, configuredAway, chosenTactics);
    }, 600);
  });
}
