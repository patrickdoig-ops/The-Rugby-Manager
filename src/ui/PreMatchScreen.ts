import type { PlayerStats } from '../types/player';
import { DEFAULT_TACTICS } from '../types/team';
import { renderTacticsMenu } from './TacticsMenu';
import type { RawTeamInput } from '../engine/MatchEngine';

type RawPlayer = {
  id: number;
  squadNumber?: number;
  name: string;
  position: string;
  baseStats: PlayerStats;
};

type RawTeam = RawTeamInput;

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

function getSquadNum(p: RawPlayer): number {
  return p.squadNumber ?? p.id;
}

function renderPlayer(p: RawPlayer, color: string, interactive = false, isBench = false): string {
  const ovr = computeOverall(p.baseStats);
  const squadNum = getSquadNum(p);
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
  const benchClass = isBench ? ' pm-player--bench' : ' pm-player--starter';
  const dataAttr   = interactive ? `data-squad="${squadNum}"` : '';
  const swapBtn    = interactive ? `<button class="pm-swap-btn" aria-label="Select for swap" tabindex="-1">⇄</button>` : '';

  return `<div class="pm-player${benchClass}" ${dataAttr}>
    <div class="pm-player-hd">
      <span class="pm-num" style="color:${color}">${squadNum}</span>
      <div class="pm-identity">
        <span class="pm-name">${lastName}</span>
        <span class="pm-pos">${p.position}</span>
      </div>
      ${swapBtn}
    </div>
    <div class="pm-attrs">${ovrGroup}${groupCells}</div>
  </div>`;
}

function renderLegend(): string {
  return `<div class="pm-legend">
    <div class="legend-group legend-group--ovr">
      <span class="legend-item">OVR</span>
    </div>
    ${STAT_GROUPS.map(g =>
      `<div class="legend-group">
        ${g.keys.map(k => `<span class="legend-item">${STAT_ABBR[k]}</span>`).join('')}
      </div>`
    ).join('')}
  </div>`;
}

function renderLineupPanel(starters: RawPlayer[], bench: RawPlayer[], color: string, interactive: boolean): string {
  const starterHtml = starters.map(p => renderPlayer(p, color, interactive, false)).join('');
  const benchHtml   = bench.map(p => renderPlayer(p, color, interactive, true)).join('');
  return `
    ${renderLegend()}
    <div class="pm-section-header">Starting XV</div>
    <div class="pm-starters-list">${starterHtml}</div>
    <div class="pm-section-header pm-section-bench">Bench</div>
    <div class="pm-bench-list">${benchHtml}</div>
  `;
}

export function initPreMatchScreen(
  home: RawTeam,
  away: RawTeam,
  onStart: (configuredHome: RawTeam, configuredAway: RawTeam) => void,
): void {
  const screen = document.getElementById('pre-match')!;

  // Mutable copies for lineup selection — set squadNumber before any swaps
  let homeStarters: RawPlayer[] = (home.players as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  let homeBench:    RawPlayer[] = ((home.bench ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));

  const awayStarters: RawPlayer[] = (away.players as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));
  const awayBench:    RawPlayer[] = ((away.bench ?? []) as RawPlayer[]).map(p => ({ ...p, squadNumber: getSquadNum(p) }));

  function buildScreenHTML(): string {
    return `
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
        <div id="pm-home"    class="pm-panel"></div>
        <div id="pm-away"    class="pm-panel hidden">${renderLineupPanel(awayStarters, awayBench, away.color, false)}</div>
        <div id="pm-tactics" class="pm-panel hidden"></div>
      </div>

      <div id="pm-footer">
        <button id="pm-start">
          <span class="btn-label">Kick off</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;
  }

  screen.innerHTML = buildScreenHTML();

  // Swap state
  let selectedBenchSquadNum: number | null = null;

  function renderHomePanel(): void {
    const panel = screen.querySelector<HTMLElement>('#pm-home')!;
    panel.innerHTML = renderLineupPanel(homeStarters, homeBench, home.color, true);
    selectedBenchSquadNum = null;

    // Wire up bench player selection
    panel.querySelectorAll<HTMLElement>('.pm-player--bench').forEach(el => {
      el.addEventListener('click', () => {
        const squadNum = Number(el.dataset.squad);
        if (selectedBenchSquadNum === squadNum) {
          // Deselect
          selectedBenchSquadNum = null;
          panel.querySelectorAll('.pm-player--selected').forEach(e => e.classList.remove('pm-player--selected'));
          panel.querySelectorAll('.pm-player--starter').forEach(e => e.classList.remove('pm-swap-target'));
        } else {
          selectedBenchSquadNum = squadNum;
          panel.querySelectorAll('.pm-player--selected').forEach(e => e.classList.remove('pm-player--selected'));
          el.classList.add('pm-player--selected');
          panel.querySelectorAll('.pm-player--starter').forEach(e => e.classList.add('pm-swap-target'));
        }
      });
    });

    // Wire up starter swap targets
    panel.querySelectorAll<HTMLElement>('.pm-player--starter').forEach(el => {
      el.addEventListener('click', () => {
        if (selectedBenchSquadNum === null) return;
        const starterSquadNum = Number(el.dataset.squad);
        const starterIdx = homeStarters.findIndex(p => getSquadNum(p) === starterSquadNum);
        const benchIdx   = homeBench.findIndex(p => getSquadNum(p) === selectedBenchSquadNum);
        if (starterIdx === -1 || benchIdx === -1) return;

        // Swap: bench player takes the position slot id; starter moves to bench
        const slotId       = homeStarters[starterIdx].id;
        const benchSlotId  = homeBench[benchIdx].id;
        const newStarter   = { ...homeBench[benchIdx],   id: slotId };
        const newBenchSlot = { ...homeStarters[starterIdx], id: benchSlotId };

        homeStarters[starterIdx] = newStarter;
        homeBench[benchIdx]      = newBenchSlot;
        renderHomePanel();
      });
    });
  }

  renderHomePanel();

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
      const configuredHome = { ...home, players: homeStarters, bench: homeBench } as unknown as RawTeam;
      onStart(configuredHome, away);
    };
    screen.addEventListener('animationend', start, { once: true });
    setTimeout(start, 600);
  });
}
