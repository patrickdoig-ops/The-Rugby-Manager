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
import { playerOverall } from '../engine/RatingEngine';
import { playerLinkHtml, wirePlayerLinks } from './components/playerLink';
import { playId } from './SoundManager';

let activeOnContinue: () => void = () => {};
let activeOutcomes: SigningOutcome[] = [];
let renderImpl: (() => void) | null = null;
// One sting per appearance — render() can re-run, so gate on this and reset it
// when the screen is freshly shown.
let audioPlayed = false;

export function showSigningResults(outcomes: SigningOutcome[], onContinue: () => void): void {
  activeOutcomes = outcomes;
  audioPlayed = false;
  activeOnContinue = onContinue;
  renderImpl?.();
}

function fmtWage(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n}`;
}

function fmtSpend(n: number): string {
  if (n === 0) return '£0';
  return `${n > 0 ? '−' : '+'}${fmtWage(Math.abs(n))}`;
}

function fmtOvrDelta(n: number): string {
  if (n === 0) return '0';
  return `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
}

function fmtCount(n: number): string {
  return `${n}`;
}

// Counter odometer: animates element text from 0 to target over the given
// duration with easeOutCubic. The current numeric value is rounded toward
// target each frame; the formatter renders it. Fires once after a delay
// so the entry stagger across tiles is visually distinct.
function animateCounter(
  el: HTMLElement,
  target: number,
  format: (n: number) => string,
  duration: number,
  delay: number,
): void {
  el.textContent = format(0);
  if (target === 0) return;
  window.setTimeout(() => {
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, delay);
}

export function initSigningResultsScreen(
  // Always called fresh — see HubScreen for the rationale.
  getGameEngine: () => GameCoordinator,
  allTeams: RawTeamInput[],
  // Tap player name → profile. Continue CTA is a separate footer
  // button so it isn't affected.
  onPlayerClick?: (rosterId: number) => void,
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
      ovr: number;
      kind: 'free_agent' | 'poach' | 'retention';
    };
    const userWins: Row[] = [];
    const userLosses: Row[] = [];
    const userHeldOut: Row[] = [];
    const retentionWins: Row[] = [];
    const retentionLosses: Row[] = [];
    const retentionMissed: Row[] = [];

    for (const outcome of activeOutcomes) {
      const p = state.career.roster[outcome.rosterId];
      if (!p) continue;
      const playerName = `${p.firstName} ${p.lastName}`;
      const ovr = playerOverall(p.baseStats, p.position);
      const userBid = outcome.bids.find(b => b.clubId === playerClubId);
      const winnerBid = outcome.winnerBid;
      const winnerClubName = winnerBid ? teamsById.get(winnerBid.clubId)?.shortName ?? winnerBid.clubId : null;

      if (userBid && userBid.kind === 'retention') {
        // User attempted retention.
        if (winnerBid && winnerBid.id === userBid.id) {
          retentionWins.push({
            rosterId: outcome.rosterId, playerName, position: p.position,
            winnerClubName, wage: userBid.annualWage, ovr, kind: 'retention',
          });
        } else {
          retentionLosses.push({
            rosterId: outcome.rosterId, playerName, position: p.position,
            winnerClubName, wage: winnerBid?.annualWage ?? userBid.annualWage, ovr, kind: 'retention',
          });
        }
      } else if (userBid) {
        // User bid as a free-agent or poach offerer.
        if (winnerBid && winnerBid.id === userBid.id) {
          userWins.push({
            rosterId: outcome.rosterId, playerName, position: p.position,
            winnerClubName, wage: userBid.annualWage, ovr, kind: userBid.kind,
          });
        } else if (outcome.heldOut) {
          // The best offer (the user's, unopposed) fell below the
          // player's reservation wage — they held out rather than sign.
          userHeldOut.push({
            rosterId: outcome.rosterId, playerName, position: p.position,
            winnerClubName: null, wage: userBid.annualWage, ovr, kind: userBid.kind,
          });
        } else {
          userLosses.push({
            rosterId: outcome.rosterId, playerName, position: p.position,
            winnerClubName, wage: userBid.annualWage, ovr, kind: userBid.kind,
          });
        }
      } else if (p.contract.clubId === playerClubId && outcome.bids.some(b => b.kind === 'poach')) {
        // User's player was under poach attack and the user didn't bid
        // to retain. Either it stayed (poacher's bid lost to a
        // different scenario — rare) or it left.
        if (winnerBid && winnerBid.clubId !== playerClubId) {
          retentionMissed.push({
            rosterId: outcome.rosterId, playerName, position: p.position,
            winnerClubName, wage: winnerBid.annualWage, ovr, kind: 'poach',
          });
        }
      }
    }

    // Hero summary: net wage spend, OVR delta, count of elite signings.
    // Joiners = new arrivals + retained players (wage commitments);
    // leavers = players poached away (wage savings). OVR delta sums
    // joiner OVRs minus leaver OVRs. Elite tile lights up gold for any
    // ≥85 OVR joiner — the headline-grabbing signings. NB this is NOT
    // the cap-exempt "marquee" designation; that's a separate concept.
    const joiners = [...userWins, ...retentionWins];
    const leavers = [...retentionMissed, ...retentionLosses];
    const wagesIn  = joiners.reduce((sum, r) => sum + r.wage, 0);
    const wagesOut = leavers.reduce((sum, r) => sum + r.wage, 0);
    const netSpend = wagesIn - wagesOut;
    const ovrDelta = joiners.reduce((s, r) => s + r.ovr, 0) - leavers.reduce((s, r) => s + r.ovr, 0);
    const eliteCount = joiners.filter(r => r.ovr >= 85).length;

    const spendCls  = netSpend > 0 ? 'sr-hero-val--neg' : netSpend < 0 ? 'sr-hero-val--pos' : '';
    const ovrCls    = ovrDelta > 0 ? 'sr-hero-val--pos' : ovrDelta < 0 ? 'sr-hero-val--neg' : '';
    const eliteCls = eliteCount > 0 ? 'sr-hero-val--gold' : '';
    const spendDisplay = netSpend === 0
      ? '£0'
      : `${netSpend > 0 ? '−' : '+'}${fmtWage(Math.abs(netSpend))}`;
    const ovrDisplay = ovrDelta === 0 ? '0' : `${ovrDelta > 0 ? '+' : '−'}${Math.abs(ovrDelta)}`;
    const heroHtml = `
      <div id="sr-hero">
        <div class="sr-hero-tile">
          <span class="sr-hero-label">Net Spend</span>
          <span class="sr-hero-val ${spendCls}">${spendDisplay}</span>
          <span class="sr-hero-sub">${netSpend >= 0 ? 'invested' : 'saved'} on wages</span>
        </div>
        <div class="sr-hero-tile">
          <span class="sr-hero-label">OVR Δ</span>
          <span class="sr-hero-val ${ovrCls}">${ovrDisplay}</span>
          <span class="sr-hero-sub">${joiners.length} in · ${leavers.length} out</span>
        </div>
        <div class="sr-hero-tile">
          <span class="sr-hero-label">Elite Signings</span>
          <span class="sr-hero-val ${eliteCls}">${eliteCount}</span>
          <span class="sr-hero-sub">OVR 85+</span>
        </div>
      </div>`;

    const nameHtml = (r: Row): string => onPlayerClick
      ? playerLinkHtml(r.playerName, r.rosterId)
      : r.playerName;
    const renderWinRow = (r: Row, i: number): string => `
      <div class="sr-row sr-row--win" style="--row-delay: ${Math.min(i, 16) * 25}ms">
        <span class="sr-name">${nameHtml(r)} <span class="sr-pos">${r.position}</span></span>
        <span class="sr-result">${kindToLabel(r.kind, 'won')}</span>
        <span class="sr-wage">${fmtWage(r.wage)}</span>
      </div>`;
    const renderLossRow = (r: Row, i: number): string => `
      <div class="sr-row sr-row--loss" style="--row-delay: ${Math.min(i, 16) * 25}ms">
        <span class="sr-name">${nameHtml(r)} <span class="sr-pos">${r.position}</span></span>
        <span class="sr-result">Lost to ${r.winnerClubName ?? '—'}</span>
        <span class="sr-wage">${fmtWage(r.wage)}</span>
      </div>`;
    const renderHeldOutRow = (r: Row, i: number): string => `
      <div class="sr-row sr-row--loss" style="--row-delay: ${Math.min(i, 16) * 25}ms">
        <span class="sr-name">${nameHtml(r)} <span class="sr-pos">${r.position}</span></span>
        <span class="sr-result">Held out</span>
        <span class="sr-wage">${fmtWage(r.wage)}</span>
      </div>`;

    const totalBids = userWins.length + userLosses.length + retentionWins.length + retentionLosses.length;
    const totalWon = userWins.length + retentionWins.length;

    // Deal-done chime if the user landed anyone this round, else a deflating
    // tone for a wasted round. Silent when the user made no bids at all.
    if (!audioPlayed && totalBids > 0) {
      audioPlayed = true;
      playId(totalWon > 0 ? 'stinger.signing.success' : 'stinger.bid.lost');
    }
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
    if (userHeldOut.length > 0) {
      sections.push(`
        <section class="sr-section">
          <h3 class="sr-section-h">Held out — wage too low (${userHeldOut.length})</h3>
          ${userHeldOut.map(renderHeldOutRow).join('')}
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

      ${heroHtml}

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

    if (onPlayerClick) wirePlayerLinks(el!, onPlayerClick);

    const tiles = el!.querySelectorAll<HTMLElement>('#sr-hero .sr-hero-val');
    if (tiles[0]) animateCounter(tiles[0], netSpend,   fmtSpend,    400, 0);
    if (tiles[1]) animateCounter(tiles[1], ovrDelta,   fmtOvrDelta, 400, 120);
    if (tiles[2]) animateCounter(tiles[2], eliteCount, fmtCount,    400, 240);
  }

  renderImpl = render;
}

function kindToLabel(kind: 'free_agent' | 'poach' | 'retention', _outcome: 'won'): string {
  void _outcome;
  if (kind === 'free_agent') return 'Signed';
  if (kind === 'poach')      return 'Pre-Agreed';
  return 'Retained';
}
