// Post-match summary of every fixture in the round just completed.
// Reached from the match-result screen's Continue CTA; its own Continue
// CTA advances to the league table (which then has its own Continue → Hub).
//
// Initialised once per page lifetime (like the other in-season screens)
// and re-renders on every `game:fixtureRecorded` so headless AI fixtures
// fill in their scores as they resolve. The `round` to show is set
// imperatively via `setRoundResultsRound(n)` immediately before
// `screenRouter.show('round-results')`.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { Fixture, FixtureResult, GameState, TeamSeasonStats } from '../types/gameState';
import { eventBus } from '../utils/eventBus';
import { createRowExpander } from './components/rowExpand';

let activeRound = 1;
let activeOnContinue: () => void = () => {};
let renderImpl: (() => void) | null = null;

export function showRoundResults(round: number, onContinue: () => void): void {
  activeRound = round;
  activeOnContinue = onContinue;
  renderImpl?.();
}

function crest(team: RawTeamInput): string {
  const grad = `linear-gradient(160deg, ${team.color} 0%, color-mix(in oklch, ${team.color} 30%, black) 100%)`;
  const initial = team.shortName[0] ?? '?';
  const glow = `box-shadow: 0 0 12px color-mix(in oklch, ${team.color} 35%, transparent), inset 0 1px 0 rgba(255,255,255,0.18);`;
  return `<div class="rr-crest" style="background:${grad};border:1px solid color-mix(in oklch,${team.color} 45%,transparent);${glow}"><span>${initial}</span></div>`;
}

export function initRoundResultsScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('round-results');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  // Per-fixture expand controller. Re-renders when a row toggles —
  // module-level state survives `game:fixtureRecorded` re-renders too,
  // so a fixture the user expanded stays expanded as the rest of the
  // round fills in.
  const expander = createRowExpander({
    rowSelector: '.rr-row',
    onChange: () => render(),
  });

  function roundFixtures(state: GameState): Array<{ fixture: Fixture; result: FixtureResult | undefined }> {
    return state.league.fixtures
      .filter(f => f.round === activeRound)
      .map(fixture => ({
        fixture,
        result: state.league.results.find(r =>
          r.round === fixture.round && r.homeId === fixture.homeId && r.awayId === fixture.awayId
        ),
      }));
  }

  function render(): void {
    const state = getGameEngine().getState();
    const playerTeamId = state.player.teamId;
    const fixtures = roundFixtures(state);

    const rowsHtml = fixtures.map(({ fixture, result }, i) => {
      const home = teamsById.get(fixture.homeId)!;
      const away = teamsById.get(fixture.awayId)!;
      const isPlayer = fixture.homeId === playerTeamId || fixture.awayId === playerTeamId;
      const rowDelay = Math.min(i, 16) * 25;
      const mid = result
        ? `<span class="rr-score">${result.homeScore}–${result.awayScore}</span>`
        : `<span class="rr-pending">…</span>`;
      const rowId = `${fixture.homeId}-${fixture.awayId}-${fixture.round}`;
      const isExpanded = expander.isExpanded(rowId);
      const expandPanel = renderExpandPanel(result, home.color, away.color);
      const expandable = !!result;
      return `
        <div class="rr-row${isPlayer ? ' rr-row--me' : ''}${expandable ? ' rr-row--expandable' : ''}" data-row-id="${rowId}" style="--row-delay: ${rowDelay}ms">
          <div class="rr-fixture-line">
            <div class="rr-team rr-team--home">
              ${crest(home)}
              <span class="rr-team-name">${home.shortName}</span>
              <span class="rr-venue-pill">H</span>
            </div>
            ${mid}
            <div class="rr-team rr-team--away">
              <span class="rr-team-name">${away.shortName}</span>
              ${crest(away)}
            </div>
            ${expandable ? `<span class="rr-expand-cue" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </span>` : ''}
          </div>
          <div class="row-expand-panel rr-expand" data-expanded="${isExpanded}">
            <div class="row-expand-inner"><div class="rr-expand-body">${expandPanel}</div></div>
          </div>
        </div>
      `;
    }).join('');

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Round ${activeRound} Results</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${state.calendar.seasonLabel}</div>
      </div>
      <div id="rr-list">${rowsHtml}</div>
      <div id="rr-footer">
        <button id="rr-continue" class="cta-pulse">
          <span>League Table</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#rr-continue')!.addEventListener('click', () => {
      activeOnContinue();
    });

    const list = el!.querySelector<HTMLElement>('#rr-list');
    if (list) expander.attach(list);
  }

  renderImpl = render;

  // Re-render as each headless AI fixture resolves so pending scores fill in.
  eventBus.on('game:fixtureRecorded', () => render());
}

// Tug-of-war row for one stat pair. Centred zero — both bars grow
// outward from the middle by their respective shares.
function tugRow(label: string, homeVal: number, awayVal: number, homeColor: string, awayColor: string): string {
  const total = homeVal + awayVal;
  const hp = total > 0 ? (homeVal / total) * 100 : 50;
  const ap = total > 0 ? (awayVal / total) * 100 : 50;
  return `
    <div class="rr-tug">
      <div class="rr-tug-val rr-tug-val--home">${Math.round(hp)}%</div>
      <div class="rr-tug-track">
        <div class="rr-tug-fill" style="width:${hp.toFixed(1)}%;background:${homeColor}"></div>
        <div class="rr-tug-fill rr-tug-fill--away" style="width:${ap.toFixed(1)}%;background:${awayColor}"></div>
      </div>
      <div class="rr-tug-val rr-tug-val--away">${Math.round(ap)}%</div>
      <div class="rr-tug-label">${label}</div>
    </div>`;
}

function setPieceRatio(won: number, attempts: number): number {
  return attempts > 0 ? (won / attempts) : 0;
}

function renderExpandPanel(result: FixtureResult | undefined, homeColor: string, awayColor: string): string {
  if (!result) return '';
  const h = result.homeStats;
  const a = result.awayStats;
  if (!h || !a) {
    return `<div class="rr-expand-empty">Detailed stats not recorded for this fixture.</div>`;
  }
  // Possession + territory pull from seconds; set-piece pulls from
  // won-vs-attempts ratios scaled to 100 each so the tug widths are
  // comparable. Lineouts: home % of own lineouts won vs away % of
  // their own lineouts won — same for scrums.
  const possession = tugRow('POSSESSION',
    h.possessionSeconds, a.possessionSeconds, homeColor, awayColor);
  const territory = tugRow('TERRITORY',
    h.territorySeconds, a.territorySeconds, homeColor, awayColor);
  const linePct = (s: TeamSeasonStats) => Math.round(setPieceRatio(s.lineoutsWon, s.lineoutsThrown) * 100);
  const scrumPct = (s: TeamSeasonStats) => Math.round(setPieceRatio(s.scrumsWon, s.scrumsPutIn) * 100);
  // Tug-of-war needs comparable raw values. For set-piece accuracy we
  // pass the percentages themselves — that puts both bars in the same
  // 0-100 frame and the relative widths reflect who was tidier on
  // their own ball. Falls back to a 50/50 mid-bar when both teams have
  // zero attempts (a possible silent-fixture edge case).
  const lineouts = tugRow('LINEOUTS', linePct(h), linePct(a), homeColor, awayColor);
  const scrums   = tugRow('SCRUMS',   scrumPct(h), scrumPct(a), homeColor, awayColor);
  return `
    <div class="rr-expand-grid">
      ${possession}
      ${territory}
      ${lineouts}
      ${scrums}
    </div>`;
}
