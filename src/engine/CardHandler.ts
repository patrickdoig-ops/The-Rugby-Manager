import type { MatchState, GameEvent } from '../types/match';
import type { Player } from '../types/player';
import type { PossessionSide } from '../types/engine';
import type { CardAnnouncementKey, NarrationStep } from '../types/narration';
import { MatchPhase } from '../types/engine';
import { rng } from '../utils/rng';
import { makeId } from './eventId';
import { inOwn22For, metresFromOppositionTryLine } from './FieldPosition';
import { applyMatchEvent } from './applyMatchEvent';
import { TMO, TEAM_22, OFFENCE_SPEC, MAUL_COLLAPSE_YELLOW } from './balance';
import type { CommentaryStreamer } from './CommentaryStreamer';

export interface CardHandlerDeps {
  state: MatchState;
  humanSide: PossessionSide;
  silent: boolean;
  // Events route through the streamer so they pace evenly across the tick.
  streamer: CommentaryStreamer;
}

// Verdict returned by evaluateNewPenalty so MatchCoordinator knows whether to
// run PenaltyHandler's modal this tick or defer (TMO will own the next 3 ticks
// and then transition back to Penalty).
export type CardVerdict = 'tmo' | 'team22_card' | 'none';

type TmoOutcome = 'no_card' | 'yellow' | 'red_20';

export class CardHandler {
  constructor(private deps: CardHandlerDeps) {}

  // Called after PENALTY_AWARDED has fired and state.phase is Penalty. Decides:
  // 1. Was this a defensive-in-own-22 penalty? Bump counter, warn at 3rd,
  //    auto-yellow at 4th.
  // 2. If not already carded by (1), is this a high tackle eligible for TMO?
  //    Roll TMO trigger, pre-roll outcome. Live mode enters TmoReview; silent
  //    mode applies the card inline (RNG order identical to live).
  evaluateNewPenalty(): CardVerdict {
    const { state, silent } = this.deps;
    const last = state.lastPenalty;
    if (!last) return 'none';

    // Team-22 rule: only count penalties where the offender was DEFENDING
    // (i.e. didn't have possession before this PENALTY_AWARDED flipped it).
    const wasDefending = last.preFlipPossession !== last.offendingSide;
    if (wasDefending && inOwn22For(state, last.offendingSide)) {
      applyMatchEvent(state, { type: 'TEAM_PENALTY_22_RECORDED', side: last.offendingSide });
      const count = state.cards.teamPenalty22[last.offendingSide];
      // Strict equality (per user spec: "the fourth penalty triggers the
      // yellow"). A 5th/6th/7th in the same match doesn't card again — the
      // first yellow already cost the team a player, that's the punishment.
      if (count === TEAM_22.cardAt) {
        this.issueCard(last.offender, last.offendingSide, 'yellow', true);
        return 'team22_card';
      }
      if (count === TEAM_22.warnAt && !state.cards.teamWarned22[last.offendingSide]) {
        applyMatchEvent(state, { type: 'TEAM_22_WARNING_ISSUED', side: last.offendingSide });
        this.emitAnnouncement('team_22_warning', last.offendingSide);
        // fall through to TMO/normal-penalty path
      }
    }

    // Maul collapse — direct yellow (no TMO narrative) at a zone-scaled
    // probability. The penalty itself was already awarded by handleMaul;
    // this branch only decides whether the offender additionally sees
    // yellow. After PENALTY_AWARDED has fired, state.possession is the
    // team that WON the penalty (the attacking maul side), so
    // metresFromOppositionTryLine reads the distance to the DEFENDING
    // team's own try line — i.e. how close to scoring the collapse was.
    if (last.offence === 'maul_collapse') {
      const pct = pickMaulCollapseYellowPct(metresFromOppositionTryLine(state));
      if (rng(1, 100) <= pct) {
        this.issueCard(last.offender, last.offendingSide, 'yellow', true);
      }
      // Either way, return 'none' — the maul-collapse path doesn't enter
      // TMO review, and the penalty modal still fires next.
      return 'none';
    }

    // TMO gate. The per-offence trigger probability lives in OFFENCE_SPEC
    // (balance/discipline.ts) so adding a new TMO-eligible offence is a
    // one-line registry edit. Offences with tmoTriggerPct === 0 never reach
    // the review path.
    const spec = OFFENCE_SPEC[last.offence];
    if (spec.tmoTriggerPct > 0 && rng(1, 100) <= spec.tmoTriggerPct) {
      const outcome = pickTmoOutcome();
      if (silent) {
        // Silent path: collapse the 3 narrative ticks into a single tick. RNG
        // order above is identical to live; only the bus emits + tick-budget
        // differ. The intervenes + decision announcements still fire so the
        // event log carries the same audit trail (telemetry counts TMOs +
        // outcomes by walking these keys).
        this.emitAnnouncement('tmo_intervenes', last.offendingSide, last.offender);
        const decisionKey = `tmo_decision_${outcome}` as const;
        this.emitAnnouncement(decisionKey, last.offendingSide, last.offender, 'tmo_ref_returns');
        if (outcome !== 'no_card') {
          this.issueCard(last.offender, last.offendingSide, outcome, false);
        }
        return 'none';
      }
      applyMatchEvent(state, {
        type: 'TMO_REVIEW_STARTED',
        offender: last.offender,
        offendingSide: last.offendingSide,
        outcome,
      });
      applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.TmoReview });
      this.emitAnnouncement('tmo_intervenes', last.offendingSide, last.offender);
      return 'tmo';
    }

    return 'none';
  }

  // Called by MatchCoordinator.tick each tick while state.phase === TmoReview.
  // Emits the next scripted narrative step; on step 3 applies CARD_ISSUED (if
  // the outcome isn't 'no_card'), clears state.tmoReview, transitions back to
  // Penalty so the existing PenaltyHandler.handlePenaltyDecision fires next tick.
  advanceTmoReview(): void {
    const { state } = this.deps;
    const review = state.tmoReview;
    if (!review) return;

    if (review.step === 1) {
      this.emitAnnouncement('tmo_reviewing', review.offendingSide, review.offender);
      applyMatchEvent(state, { type: 'TMO_REVIEW_TICK_ADVANCED' });
      return;
    }
    if (review.step === 2) {
      // Step 2 narrates the decision; step 3 applies the card. The prepended
      // `tmo_ref_returns` beat lets CommentaryFeed stagger-reveal the verdict
      // as "official back on pitch → verdict" — adds suspense on the moment
      // that decides whether a card lands.
      const key = `tmo_decision_${review.outcome}` as const;
      this.emitAnnouncement(key, review.offendingSide, review.offender, 'tmo_ref_returns');
      applyMatchEvent(state, { type: 'TMO_REVIEW_TICK_ADVANCED' });
      return;
    }
    // step 3 — apply card + clear + transition back to Penalty
    if (review.outcome !== 'no_card') {
      this.issueCard(review.offender, review.offendingSide, review.outcome, false);
    }
    applyMatchEvent(state, { type: 'TMO_REVIEW_RESOLVED' });
    applyMatchEvent(state, { type: 'PHASE_CHANGED', phase: MatchPhase.Penalty });
  }

  // Called each tick from MatchCoordinator after the clock advances. Scans the
  // sin-bin for entries whose returnMinute has elapsed and emits the matching
  // expiry event + commentary. Returns the list of red_20 expirations so the
  // coordinator can run the forced-sub flow.
  scanSinBinReturns(): Array<{ player: Player; side: PossessionSide }> {
    const { state } = this.deps;
    const expiredRed20: Array<{ player: Player; side: PossessionSide }> = [];
    for (const side of ['home', 'away'] as const) {
      // Snapshot — the reducer mutates the live array.
      const expired = state.cards.sinBin[side].filter(e => e.returnMinute <= state.clock.gameMinute);
      for (const entry of expired) {
        if (entry.kind === 'yellow') {
          applyMatchEvent(state, { type: 'SIN_BIN_RETURNED', player: entry.player, side });
          this.emitAnnouncement('sin_bin_returned', side, entry.player);
        } else {
          applyMatchEvent(state, { type: 'RED_20_EXPIRED', player: entry.player, side });
          expiredRed20.push({ player: entry.player, side });
        }
      }
    }
    return expiredRed20;
  }

  // `summons` is true on the direct-card paths (team-22 rule, maul collapse) —
  // prepends a "ref calls the player over" beat so the CommentaryFeed's step
  // stagger reveals "summons → card_shown" as two paced lines. False on the
  // TMO-triggered paths because the 3-tick tmo_intervenes/reviewing/decision
  // sequence is itself the build-up; another summons beat would over-egg it.
  private issueCard(player: Player, side: PossessionSide, kind: 'yellow' | 'red_20' | 'red_full', summons: boolean): void {
    const { state } = this.deps;
    applyMatchEvent(state, { type: 'CARD_ISSUED', player, side, kind });
    const key = kind === 'yellow' ? 'card_yellow'
              : kind === 'red_20' ? 'card_red_20'
              :                     'card_red_full';
    this.emitAnnouncement(key, side, player, summons ? 'card_ref_summons' : undefined);
  }

  private emitAnnouncement(key: Parameters<typeof buildAnnounce>[0]['key'], side: PossessionSide, primary?: Player, prependKey?: CardAnnouncementKey): void {
    const { state, silent } = this.deps;
    const team = side === 'home' ? state.homeTeam : state.awayTeam;
    const teamName = team.name;
    // Name the manager's captain only when it's the human side being warned;
    // the AI side keeps the generic "the captain" wording.
    let captainName: string | undefined;
    if (key === 'team_22_warning' && side === state.engine.humanSide) {
      const cap = team.players.find(p => p.rosterId === state.engine.humanCaptainRosterId);
      if (cap) captainName = `${cap.firstName} ${cap.lastName}`;
    }
    const ev = buildAnnounce({
      key,
      state,
      side,
      primary,
      teamName,
      prependKey,
      captainName,
    });
    applyMatchEvent(state, { type: 'COMMENTARY_LOGGED', event: ev });
    if (!silent) this.deps.streamer.enqueue(ev);
  }
}

function pickTmoOutcome(): TmoOutcome {
  // Single rng(1,100) bucketed by the configured weights.
  const roll = rng(1, 100);
  if (roll <= TMO.outcomeNoCardPct) return 'no_card';
  if (roll <= TMO.outcomeNoCardPct + TMO.outcomeYellowPct) return 'yellow';
  return 'red_20';
}

// Yellow card probability for a maul_collapse, keyed by how close to the
// defending team's own try line the collapse happened. The mapping comes
// from MAUL_COLLAPSE_YELLOW (balance/maul.ts) — direct percentages, no
// TMO bucketing — so the closer to the line, the more likely cynical
// play gets carded.
function pickMaulCollapseYellowPct(metresToOppTryLine: number): number {
  if (metresToOppTryLine <= 5)  return MAUL_COLLAPSE_YELLOW.inside5mPct;
  if (metresToOppTryLine <= 22) return MAUL_COLLAPSE_YELLOW.inside22Pct;
  if (metresToOppTryLine <= 50) return MAUL_COLLAPSE_YELLOW.inOppHalfPct;
  return MAUL_COLLAPSE_YELLOW.ownHalfPct;
}

interface AnnounceArgs {
  key: CardAnnouncementKey;
  state: MatchState;
  side: PossessionSide;
  primary?: Player;
  secondary?: Player;
  teamName: string;
  // Captain name for the team-22 warning. Undefined ⇔ the bank's generic
  // "the captain" fallback is used.
  captainName?: string;
  // Optional prepended announcement step. Used by the direct-card path to land
  // a "ref calls the player over" beat before the card-shown line — the
  // CommentaryFeed step-stagger queue then reveals them ~350ms apart.
  prependKey?: CardAnnouncementKey;
}

export function buildAnnounce(args: AnnounceArgs): GameEvent {
  const { key, state, side, primary, secondary, teamName, captainName, prependKey } = args;
  const steps: NarrationStep[] = [];
  if (prependKey) {
    steps.push({ kind: 'announcement', key: prependKey, primary, secondary, params: { teamName, captainName } });
  }
  steps.push({ kind: 'announcement', key, primary, secondary, params: { teamName, captainName } });
  return {
    id: makeId(),
    gameMinute: state.clock.gameMinute,
    phase: state.phase,
    side,
    sideName: teamName,
    primaryPlayer: primary,
    secondaryPlayer: secondary,
    ballX: state.ball.x,
    ballY: state.ball.y,
    narration: { steps },
  };
}
