// Post-resolution summary of one signing round. Shows what happened to
// each of the user's bids: won (signed!) or lost (X chose Y instead).
// Also surfaces retention outcomes for the user's own players that
// were under poach attack.
//
// Reached after every Submit press in the TransferMarketScreen loop.
// Continue → back to the TransferMarketScreen for another round (if
// budget remains and viable candidates exist) or to the rollover (if
// the window is closing).
//
// Initialised once per page lifetime, like the other in-season screens.

import type { RawTeamInput } from '../types/teamData';
import type { GameCoordinator } from '../game/GameCoordinator';
import type { SigningOutcome } from '../game/signingResolver';

let activeOnContinue: () => void = () => {};
let activeOutcomes: SigningOutcome[] = [];
let renderImpl: (() => void) | null = null;

export function showSigningResults(outcomes: SigningOutcome[], onContinue: () => void): void {
  activeOutcomes = outcomes;
  activeOnContinue = onContinue;
  renderImpl?.();
}

function fmtWage(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n}`;
}

export function initSigningResultsScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
): void {
  const el = document.getElementById('signing-results');
  if (!el) return;

  const teamsById = new Map(allTeams.map(t => [t.id, t]));

  function render(): void {
    const state = getGameEngine().getState();
    const playerClubId = state.player.teamId;
    const playerTeam = teamsById.get(playerClubId);
    if (playerTeam) el!.style.setProperty('--team-color', playerTeam.color);

    // Categorise outcomes from the user's POV:
    //   - userWins   : user bid and won
    //   - userLosses : user bid and lost
    //   - retentionWins   : user retention bid won (kept player)
    //   - retentionLosses : user retention bid lost (player poached away)
    //   - retentionMissed : user's player poached, no retention attempt
    type Row = {
      rosterId: number;
      playerName: string;
      position: string;
      winnerClubName: string | null;
      wage: number;
      kind: 'free_agent' | 'poach' | 'retention';
    };
    const userWins: Row[] = [];
    const userLosses: Row[] = [];
    const retentionWins: Row[] = [];
    const retentionLosses: Row[] = [];
    const retentionMissed: Row[] = [];

    for (const outcome of activeOutcomes) {
      const p = state.career.roster[outcome.rosterId];
      if (!p) continue;
      const playerName = `${p.firstName} ${p.lastName}`;
      const userBid = outcome.bids.find(b => b.clubId === playerClubId);
      const winnerBid = outcome.winnerBid;
      const winnerClubName = winnerBid ? teamsById.get(winnerBid.clubId)?.shortName ?? winnerBid.clubId : null;

      if (userBid && userBid.kind === 'retention') {
        // User attempted retention.
        if (winnerBid && winnerBid.id === userBid.id) {
          retentionWins.push({
            rosterId: outcome.rosterId, playerName, position: p.position,
            winnerClubName, wage: userBid.annualWage, kind: 'retention',
          });
        } else {
          retentionLosses.push({
            rosterId: outcome.rosterId, playerName, position: p.position,
            winnerClubName, wage: winnerBid?.annualWage ?? userBid.annualWage, kind: 'retention',
          });
        }
      } else if (userBid) {
        // User bid as a free-agent or poach offerer.
        if (winnerBid && winnerBid.id === userBid.id) {
          userWins.push({
            rosterId: outcome.rosterId, playerName, position: p.position,
            winnerClubName, wage: userBid.annualWage, kind: userBid.kind,
          });
        } else {
          userLosses.push({
            rosterId: outcome.rosterId, playerName, position: p.position,
            winnerClubName, wage: userBid.annualWage, kind: userBid.kind,
          });
        }
      } else if (p.contract.clubId === playerClubId && outcome.bids.some(b => b.kind === 'poach')) {
        // User's player was under poach attack and the user didn't bid
        // to retain. Either it stayed (poacher's bid lost to a
        // different scenario — rare) or it left.
        if (winnerBid && winnerBid.clubId !== playerClubId) {
          retentionMissed.push({
            rosterId: outcome.rosterId, playerName, position: p.position,
            winnerClubName, wage: winnerBid.annualWage, kind: 'poach',
          });
        }
      }
    }

    const renderWinRow = (r: Row): string => `
      <div class="sr-row sr-row--win">
        <span class="sr-name">${r.playerName} <span class="sr-pos">${r.position}</span></span>
        <span class="sr-result">${kindToLabel(r.kind, 'won')}</span>
        <span class="sr-wage">${fmtWage(r.wage)}</span>
      </div>`;
    const renderLossRow = (r: Row): string => `
      <div class="sr-row sr-row--loss">
        <span class="sr-name">${r.playerName} <span class="sr-pos">${r.position}</span></span>
        <span class="sr-result">Lost to ${r.winnerClubName ?? '—'}</span>
        <span class="sr-wage">${fmtWage(r.wage)}</span>
      </div>`;

    const totalBids = userWins.length + userLosses.length + retentionWins.length + retentionLosses.length;
    const totalWon = userWins.length + retentionWins.length;
    const headlineSummary = totalBids > 0
      ? `${totalWon} won · ${totalBids - totalWon} lost`
      : 'No offers in this round';

    const sections: string[] = [];
    if (userWins.length > 0) {
      sections.push(`
        <section class="sr-section">
          <h3 class="sr-section-h">New signings (${userWins.length})</h3>
          ${userWins.map(renderWinRow).join('')}
        </section>`);
    }
    if (userLosses.length > 0) {
      sections.push(`
        <section class="sr-section">
          <h3 class="sr-section-h">Missed out (${userLosses.length})</h3>
          ${userLosses.map(renderLossRow).join('')}
        </section>`);
    }
    if (retentionWins.length > 0) {
      sections.push(`
        <section class="sr-section">
          <h3 class="sr-section-h">Retained (${retentionWins.length})</h3>
          ${retentionWins.map(renderWinRow).join('')}
        </section>`);
    }
    if (retentionLosses.length > 0) {
      sections.push(`
        <section class="sr-section">
          <h3 class="sr-section-h">Lost to a rival (${retentionLosses.length})</h3>
          ${retentionLosses.map(renderLossRow).join('')}
        </section>`);
    }
    if (retentionMissed.length > 0) {
      sections.push(`
        <section class="sr-section">
          <h3 class="sr-section-h">Players you let go (${retentionMissed.length})</h3>
          ${retentionMissed.map(renderLossRow).join('')}
        </section>`);
    }
    const body = sections.length > 0
      ? sections.join('')
      : `<div class="sr-empty">No activity this round.</div>`;

    el!.innerHTML = `
      <div class="app-header">
        <div class="app-topbar">
          <div class="app-topbar-spacer"></div>
          <span class="app-title">Signing Results</span>
          <div class="app-topbar-spacer"></div>
        </div>
        <div class="app-eyebrow">${headlineSummary}</div>
      </div>

      <div id="sr-body">
        ${body}
      </div>

      <div id="sr-footer">
        <button id="sr-continue" class="cta-pulse">
          <span>Continue</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;

    el!.querySelector<HTMLButtonElement>('#sr-continue')!.addEventListener('click', () => activeOnContinue());
  }

  renderImpl = render;
}

function kindToLabel(kind: 'free_agent' | 'poach' | 'retention', _outcome: 'won'): string {
  void _outcome;
  if (kind === 'free_agent') return 'Signed';
  if (kind === 'poach')      return 'Pre-Agreed';
  return 'Retained';
}
