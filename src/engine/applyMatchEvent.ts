import type { MatchState } from '../types/match';
import type { MatchEvent } from '../types/matchEvent';
import { MatchPhase } from '../types/engine';
import { clamp } from '../utils/math';
import { attackDir } from './FieldPosition';
import { computeRating } from './RatingEngine';
import { assertInvariants } from './invariants';
import { CLOCK_VALUES, SCORE_VALUES, SIN_BIN_DURATION, slotFamiliarity, SLOT_POSITION } from './balance';
import type { Player, PlayerStats } from '../types/player';

// The single function permitted to mutate MatchState (or any Player field).
// Every handler / orchestrator builds an array of MatchEvent and routes them
// through here. In-place mutation; returns void.
//
// After every mutation, assertInvariants() runs as a tripwire — if any code
// path drives score/possession/phase/ball/clock/player numeric ranges outside
// their legal bounds, the throw surfaces at the offending event rather than
// at some downstream consumer.

export function applyMatchEvent(state: MatchState, event: MatchEvent): void {
  applyEventToState(state, event);
  // Silent AI fixtures skip the per-event sweep (state.engine.skipInvariants)
  // for speed; force one full sweep on the terminal MATCH_ENDED event so
  // structural corruption still surfaces before the season snapshot is taken.
  // Live play / harnesses (skipInvariants false) sweep every event as before.
  assertInvariants(state, event.type === 'MATCH_ENDED');
}

function applyEventToState(state: MatchState, event: MatchEvent): void {
  switch (event.type) {

    // ── Scoring ──────────────────────────────────────────────────────────
    case 'TRY_SCORED': {
      // Tripwire: the scorer must belong to the side being credited. event.side
      // (= possession at the carry) drives the 5 points and the home/away crowd
      // narration; event.scorer is the carrier threaded via PENDING_TRY_SCORER_SET.
      // If the two disagree the try lands on the wrong player's sheet while the
      // points go to the right team — surface it here, not on the scoreboard.
      // Membership is checked against the full matchday squad (XV + bench +
      // subbed-off) since a substitute keeps their bench squadNumber.
      const credited = event.side === 'home' ? state.homeTeam : state.awayTeam;
      if (!credited.players.includes(event.scorer)
          && !credited.bench.includes(event.scorer)
          && !credited.substitutedOff.includes(event.scorer)) {
        throw new Error(
          `Invariant violated [TRY_SCORED.scorer]: scorer squad#${event.scorer.squadNumber} not on ${event.side} matchday squad`,
        );
      }
      event.scorer.matchStats.tries++;
      state.score[event.side] += SCORE_VALUES.try;
      state.stats.tries[event.side]++;
      // A try is always scored inside the opposition 22 — auto-register the entry
      // if a same-tick break-and-score arrived before the tick-boundary detection.
      const e = state.stats.entries22[event.side];
      if (!e.active) { e.count++; e.active = true; }
      e.pointsScored += SCORE_VALUES.try;
      return;
    }

    case 'CONVERSION_KICKED':
      event.kicker.matchStats.kicksAtGoal++;
      if (event.success) {
        event.kicker.matchStats.kicksMade++;
        event.kicker.matchStats.conversionsMade++;
        state.score[event.side] += SCORE_VALUES.conversion;
        if (state.stats.entries22[event.side].active) {
          state.stats.entries22[event.side].pointsScored += SCORE_VALUES.conversion;
        }
      } else {
        event.kicker.matchStats.kicksMissed++;
      }
      return;

    case 'PENALTY_GOAL_KICKED':
      event.kicker.matchStats.kicksAtGoal++;
      if (event.success) {
        event.kicker.matchStats.kicksMade++;
        event.kicker.matchStats.penaltiesMade++;
        state.score[event.side] += SCORE_VALUES.penaltyGoal;
        if (state.stats.entries22[event.side].active) {
          state.stats.entries22[event.side].pointsScored += SCORE_VALUES.penaltyGoal;
        }
      } else {
        event.kicker.matchStats.kicksMissed++;
      }
      return;

    // ── Carry / tackle ──────────────────────────────────────────────────
    case 'CARRY_RESOLVED': {
      const { carrier, defender, metres, direction, outcome, defSide } = event;
      carrier.matchStats.carries++;
      carrier.matchStats.metresCarried += metres;
      defender.matchStats.tacklesAttempted++;
      state.stats.tackles[defSide].attempted++;
      if (!event.suppressBallMove) {
        state.ball.x = clamp(state.ball.x + direction * metres, 0, 100);
      }
      switch (outcome) {
        case 'line_break':
          carrier.matchStats.lineBreaks++;
          carrier.matchStats.defendersBeaten++;
          // Non-try line break: the initial defender is BEATEN — they keep the
          // missed tackle (attempted at the top, no make). The cover defender
          // is a SECOND tackler who completes the stop, so they record their
          // OWN attempt + make (mirrors the assist-tackler accounting below).
          // Counting only the cover's make — as before — hid every covered
          // break, inflating team tackle completion toward 100%; now a covered
          // break is correctly 2 attempts / 1 make.
          if (event.coverTackler) {
            event.coverTackler.matchStats.tacklesAttempted++;
            event.coverTackler.matchStats.tacklesMade++;
            state.stats.tackles[defSide].attempted++;
            state.stats.tackles[defSide].made++;
          }
          break;
        case 'dominant_carry':
          carrier.matchStats.defendersBeaten++;
          defender.matchStats.tacklesMade++;
          state.stats.tackles[defSide].made++;
          break;
        case 'dominant_tackle':
          defender.matchStats.tacklesMade++;
          defender.matchStats.dominantTackles++;
          state.stats.tackles[defSide].made++;
          break;
        case 'play_on':
          defender.matchStats.tacklesMade++;
          state.stats.tackles[defSide].made++;
          break;
      }
      // Assist tackler — second player credited on every made outcome.
      // Bumps both attempted and made (player + team) so the team-level
      // made ≤ attempted invariant stays balanced.
      if (event.assistTackler
          && (outcome === 'dominant_carry' || outcome === 'play_on' || outcome === 'dominant_tackle')) {
        event.assistTackler.matchStats.tacklesAttempted++;
        event.assistTackler.matchStats.tacklesMade++;
        state.stats.tackles[defSide].attempted++;
        state.stats.tackles[defSide].made++;
      }
      state.lastCarryOutcome = outcome;
      state.lastCarryCarrierId = carrier.id;
      return;
    }

    // ── Errors / turnovers ──────────────────────────────────────────────
    case 'KNOCK_ON':
      event.player.matchStats.knockOns++;
      state.stats.handlingErrors[event.attackSide]++;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      state.breakdownMod = { attack: 0, defend: 0 };
      return;

    case 'TURNOVER_AT_BREAKDOWN':
      event.jackal.matchStats.turnoversWon++;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      state.breakdownMod = { attack: 0, defend: 0 };
      return;

    case 'INTERCEPTION':
      // Reusing turnoversWon (per design choice — interception is a kind of
      // turnover and the stat already drives the jackal/turnover leaderboard).
      event.interceptor.matchStats.turnoversWon++;
      state.possession = state.possession === 'home' ? 'away' : 'home';
      // Note: state.breakdownMod is intentionally NOT reset here — the
      // call site emits BREAKDOWN_MOD_SET with the front-foot boost
      // AFTER this event, so a default {0,0} reset would erase the bonus.
      return;

    case 'PENALTY_AWARDED': {
      const preFlipPossession = state.possession;
      event.offender.matchStats.penaltiesConceded++;
      state.possession = event.offendingSide === 'home' ? 'away' : 'home';
      state.breakdownMod = { attack: 0, defend: 0 };
      // Penalties cannot be taken within 5m of either try line.
      state.ball.x = clamp(state.ball.x, 5, 95);
      state.lastPenalty = {
        offence: event.offence,
        offender: event.offender,
        offendingSide: event.offendingSide,
        preFlipPossession,
        gameMinute: state.clock.gameMinute,
      };
      return;
    }

    // ── Discipline / cards ──────────────────────────────────────────────
    case 'CARD_ISSUED': {
      const kind = event.kind;
      switch (kind) {
        case 'yellow':
          event.player.matchStats.yellowCards++;
          state.cards.sinBin[event.side].push({
            player: event.player,
            kind,
            returnMinute: state.clock.gameMinute + SIN_BIN_DURATION[kind],
          });
          break;
        case 'red_20':
          event.player.matchStats.redCards++;
          state.cards.sinBin[event.side].push({
            player: event.player,
            kind,
            returnMinute: state.clock.gameMinute + SIN_BIN_DURATION[kind],
          });
          break;
        case 'red_full':
          event.player.matchStats.redCards++;
          state.cards.sentOff[event.side].push(event.player);
          break;
        default: {
          const _: never = kind;
          throw new Error(`unhandled CardKind: ${_ as string}`);
        }
      }
      state.cards.version++;
      return;
    }

    case 'SIN_BIN_RETURNED': {
      const bin = state.cards.sinBin[event.side];
      const idx = bin.findIndex(e => e.player === event.player);
      if (idx >= 0) bin.splice(idx, 1);
      state.cards.version++;
      return;
    }

    case 'RED_20_EXPIRED': {
      const bin = state.cards.sinBin[event.side];
      const idx = bin.findIndex(e => e.player === event.player);
      if (idx >= 0) bin.splice(idx, 1);
      state.cards.sentOff[event.side].push(event.player);
      state.cards.version++;
      return;
    }

    case 'TEAM_PENALTY_22_RECORDED':
      state.cards.teamPenalty22[event.side]++;
      return;

    case 'TEAM_22_WARNING_ISSUED':
      state.cards.teamWarned22[event.side] = true;
      return;

    case 'TMO_REVIEW_STARTED':
      state.tmoReview = {
        step: 1,
        outcome: event.outcome,
        offender: event.offender,
        offendingSide: event.offendingSide,
      };
      return;

    case 'TMO_REVIEW_TICK_ADVANCED':
      if (!state.tmoReview) throw new Error('TMO_REVIEW_TICK_ADVANCED with no review in progress');
      if (state.tmoReview.step >= 3) throw new Error('TMO_REVIEW_TICK_ADVANCED past step 3');
      state.tmoReview.step = (state.tmoReview.step + 1) as 1 | 2 | 3;
      return;

    case 'TMO_REVIEW_RESOLVED':
      state.tmoReview = undefined;
      return;

    case 'KICK_AT_GOAL_STARTED':
      state.kickAtGoal = {
        kicker: event.kicker,
        kind: event.kind,
        distFromPosts: event.distFromPosts,
      };
      return;

    case 'KICK_AT_GOAL_RESOLVED':
      state.kickAtGoal = undefined;
      return;

    // ── Injuries ────────────────────────────────────────────────────────
    case 'PLAYER_INJURED_IN_MATCH': {
      // Defensive: a duplicate emit (same player twice in one match)
      // should not double-list the player. The flag carries the kind so
      // the teardown severity roll can read it; we don't overwrite the
      // first injury kind if a duplicate sneaks through.
      const bucket = state.cards.injured[event.side];
      if (!bucket.some(p => p === event.player)) {
        bucket.push(event.player);
        state.cards.version++;
      }
      if (!event.player.pendingInjuryKind) {
        event.player.pendingInjuryKind = event.kind;
      }
      return;
    }

    case 'INJURY_STRANDED': {
      const injured = state.cards.injured[event.teamSide];
      const injIdx = injured.findIndex(p => p === event.player);
      if (injIdx >= 0) {
        injured.splice(injIdx, 1);
        state.cards.sentOff[event.teamSide].push(event.player);
        state.cards.version++;
      }
      return;
    }

    // ── Offload ─────────────────────────────────────────────────────────
    case 'OFFLOAD_ATTEMPTED':
      event.offloader.matchStats.offloadsAttempted++;
      return;

    case 'OFFLOAD_COMPLETED':
      event.offloader.matchStats.offloadsCompleted++;
      return;

    // ── Passing / breakdown bookkeeping ─────────────────────────────────
    case 'PASS_COMPLETED':
      event.passer.matchStats.passes++;
      return;

    case 'BREAKDOWN_HIT':
      for (const p of event.players) p.matchStats.rucksHit++;
      return;

    case 'BREAKDOWN_MOD_SET':
      state.breakdownMod = { attack: event.attack, defend: event.defend };
      return;

    case 'BALL_QUALITY_SET':
      state.lastBallQuality = event.quality;
      return;

    case 'KICK_INTENT_SET':
      state.pendingKick = event.intent;
      return;

    case 'KICK_INTENT_CLEARED':
      state.pendingKick = undefined;
      return;

    case 'FIFTY_22_ATTEMPTED':
      // Telemetry-only — kicker matchStats counter isn't bumped here, the
      // KICK_FROM_HAND event handles that. This event exists so the
      // telemetry report can break out deliberate 50/22 attempts (and
      // their success rate) from accidental territory kicks that happen
      // to land in opposition 22.
      return;

    // ── Set piece ───────────────────────────────────────────────────────
    case 'LINEOUT_THROWN':
      event.hooker.matchStats.lineoutThrows++;
      return;

    case 'LINEOUT_RESOLVED':
      switch (event.outcome) {
        case 'crooked_throw':
          // possession flips to the non-throwing team (scrum awarded)
          break;
        case 'clean_catch':
          event.hooker.matchStats.lineoutWins++;
          event.attackJumper.matchStats.lineoutCatches++;
          state.stats.lineouts[event.possessionSideAfter]++;
          break;
        case 'steal':
          event.defendJumper.matchStats.lineoutSteals++;
          state.stats.lineouts[event.possessionSideAfter]++;
          break;
      }
      state.stats.ownLineouts[event.attackSide].thrown++;
      if (event.possessionSideAfter === event.attackSide) {
        state.stats.ownLineouts[event.attackSide].won++;
      }
      state.possession = event.possessionSideAfter;
      return;

    case 'SCRUM_RESOLVED':
      switch (event.outcome) {
        case 'attacking_dominant_penalty':
          event.attackFrontRow.forEach(p => { p.matchStats.scrumPenaltiesWon++; });
          event.defendFrontRow.forEach(p => { p.matchStats.scrumPenaltiesConceded++; });
          state.stats.scrums[event.possessionSideAfter]++;
          state.consecutiveWheels = 0;
          break;
        case 'stable_win':
          state.stats.scrums[event.possessionSideAfter]++;
          state.consecutiveWheels = 0;
          break;
        case 'wheel':
          state.consecutiveWheels++;
          break;
        case 'defending_dominant_penalty':
          event.defendFrontRow.forEach(p => { p.matchStats.scrumPenaltiesWon++; });
          event.attackFrontRow.forEach(p => { p.matchStats.scrumPenaltiesConceded++; });
          state.stats.scrums[event.possessionSideAfter]++;
          state.consecutiveWheels = 0;
          break;
      }
      // A wheel is a reset, not a completed scrum — skip the ownScrums
      // counters (mirrors stats.scrums above), else every wheel inflates
      // both putIn and won for the attacking side.
      if (event.outcome !== 'wheel') {
        state.stats.ownScrums[event.attackSide].putIn++;
        if (event.possessionSideAfter === event.attackSide) {
          state.stats.ownScrums[event.attackSide].won++;
        }
      }
      state.possession = event.possessionSideAfter;
      return;

    case 'MAUL_RESOLVED':
      // Team-level maul counters. `mauls` increments for any resolution
      // that produced a possession decision (won or collapse-penalty); a
      // held maul that turns over to scrum isn't counted as a completed
      // maul, mirroring the scrums convention. `maulMetres` accumulates
      // the gained ground on the attacking side (gainMetres is 0 for
      // held / collapse, so no special branching needed).
      if (event.outcome === 'maul_won' || event.outcome === 'maul_collapse_penalty') {
        state.stats.mauls[event.attackSide]++;
      }
      state.stats.maulMetres[event.attackSide] += event.gainMetres;
      state.possession = event.possessionSideAfter;
      return;

    // ── Kicking ─────────────────────────────────────────────────────────
    case 'KICK_FROM_HAND':
      event.kicker.matchStats.kicksFromHand++;
      event.kicker.matchStats.kickMetres += event.metres;
      return;

    case 'BALL_REPOSITIONED':
      if (event.x !== undefined) state.ball.x = event.x;
      if (event.y !== undefined) state.ball.y = event.y;
      if (event.lateralDir !== undefined) state.ball.lateralDir = event.lateralDir;
      return;

    case 'KICK_RETURN_CARRIER_SET':
      state.kickReturnCarrier = event.player;
      state.kickReturnIsRegather = event.isRegather ?? false;
      return;

    case 'PENDING_TRY_SCORER_SET':
      state.pendingTryScorer = event.scorer;
      return;

    // ── Possession & phase ──────────────────────────────────────────────
    case 'POSSESSION_SWAPPED':
      state.possession = state.possession === 'home' ? 'away' : 'home';
      // The team taking over orients its sweep toward the open side — the
      // touchline with more space (away from the nearer one). Matches
      // openSideDir() in Lateral.ts; midline defaults to +1.
      state.ball.lateralDir = state.ball.y <= 50 ? 1 : -1;
      return;

    case 'POSSESSION_SET':
      state.possession = event.side;
      state.ball.lateralDir = state.ball.y <= 50 ? 1 : -1;
      return;

    case 'PHASE_CHANGED':
      state.phase = event.phase;
      // ballQuality survives Breakdown → PhasePlay (the carry phase reads
      // the breakdown's slow/clean signal). Every other transition resets
      // it to 'clean' so a stale 'slow' from an earlier breakdown doesn't
      // leak into a fresh phase (FirstPhase from set piece, KickReturn
      // after a kick, etc.).
      if (event.phase !== MatchPhase.PhasePlay) {
        state.lastBallQuality = 'clean';
      }
      // pendingKick is set when entering BoxKick / TacticalKick and consumed
      // by their handlers; clear on any transition away so a future kick
      // doesn't read stale intent.
      if (event.phase !== MatchPhase.BoxKick && event.phase !== MatchPhase.TacticalKick) {
        state.pendingKick = undefined;
      }
      return;

    // ── Clock & period ──────────────────────────────────────────────────
    case 'CLOCK_ADVANCED': {
      const periodTarget =
        state.clock.period === 'first'        ? CLOCK_VALUES.halfTimeMinute
        : state.clock.period === 'second'     ? CLOCK_VALUES.fullTimeMinute
        : state.clock.period === 'extra_first' ? CLOCK_VALUES.extraFirstMinute
        :                                        CLOCK_VALUES.extraSecondMinute;
      if (state.clock.clockInTheRed) {
        state.clock.gameMinute += event.delta / 2;
      } else {
        state.clock.gameMinute = Math.min(periodTarget, state.clock.gameMinute + event.delta);
      }
      return;
    }

    case 'CLOCK_IN_RED_TRIPPED':
      state.clock.clockInTheRed = true;
      return;

    case 'HALF_TIME_REACHED':
      state.clock.halfTimeDone = true;
      state.clock.period = 'second';
      state.clock.clockInTheRed = false;
      state.clock.penaltyKickToTouchLineout = false;
      return;

    case 'EXTRA_TIME_STARTED':
      state.clock.period = 'extra_first';
      state.clock.clockInTheRed = false;
      state.clock.penaltyKickToTouchLineout = false;
      return;

    case 'EXTRA_TIME_HALF_REACHED':
      state.clock.period = 'extra_second';
      state.clock.clockInTheRed = false;
      state.clock.penaltyKickToTouchLineout = false;
      return;

    case 'EXTRA_TIME_WINNER_SET':
      state.engine.extraTimeWinner = event.side;
      return;

    case 'MATCH_ENDED':
      state.engine.isRunning = false;
      return;

    case 'PENALTY_KICK_TO_TOUCH_FLAG_SET':
      state.clock.penaltyKickToTouchLineout = event.value;
      return;

    // ── Tick bookkeeping ────────────────────────────────────────────────
    case 'TICK_BOOKKEEPING':
      state.stats.possession[event.possessionSide]++;
      state.stats.territory[event.territorySide]++;
      return;

    case 'HANDLING_ERROR':
      state.stats.handlingErrors[event.side]++;
      return;

    // ── 22-entry tracking ───────────────────────────────────────────────
    case 'ENTRY22_REGISTERED':
      state.stats.entries22[event.side].count++;
      state.stats.entries22[event.side].active = true;
      return;

    case 'ENTRY22_CLEARED':
      state.stats.entries22[event.side].active = false;
      return;

    // ── Fatigue ─────────────────────────────────────────────────────────
    case 'FATIGUE_APPLIED':
      event.player.fatiguePct = event.newFatiguePct;
      event.player.currentStats = event.newCurrentStats;
      return;

    // ── Tactics & subs ──────────────────────────────────────────────────
    case 'TACTICS_UPDATED': {
      const team = event.side === 'home' ? state.homeTeam : state.awayTeam;
      team.tactics = { ...event.tactics };
      return;
    }

    // In-game substitution preserves the bench player's squadNumber — they run
    // onto the pitch wearing their bench number. Only `id`/`position`/coords
    // are re-assigned to the field slot (used for engine position queries).
    // Pre-match jersey assignment (PreMatchScreen.assignStartingJersey) is
    // the only place squadNumber is re-assigned by slot.
    case 'SUBSTITUTION_APPLIED': {
      const team = event.teamSide === 'home' ? state.homeTeam : state.awayTeam;
      const { off, on, benchIdx, fieldIdx } = event;
      // Out-of-position penalty for the incoming player. Computed from their
      // natural position (`on.position`) vs the slot's role (`off.position`)
      // *before* the position reassignment below overwrites it. The bench
      // player's match-clone baseStats were left unscaled at initPlayer, so
      // this is their first and only scale. Mirrors the starter path in
      // MatchCoordinator.initPlayer — see balance/positionFamiliarity.ts.
      const subMult = slotFamiliarity(on.position, off.id);
      if (subMult !== 1.0) {
        for (const key of Object.keys(on.baseStats) as (keyof PlayerStats)[]) {
          on.baseStats[key] = clamp(Math.round(on.baseStats[key] * subMult), 1, 100);
          on.currentStats[key] = clamp(Math.round(on.currentStats[key] * subMult), 1, 100);
        }
      }
      on.id = off.id;
      on.position = SLOT_POSITION[off.id] ?? off.position;
      on.x = off.x;
      on.y = off.y;
      team.players[fieldIdx] = on;
      team.bench.splice(benchIdx, 1);
      team.substitutedOff.push(off);
      // A forced sub after a red_20 backfills the sent-off player's slot —
      // remove them from cards.sentOff so the availability filter no longer
      // counts them against the team's strength. Same shape for an injury
      // forced sub: the off player came from cards.injured, drop them so
      // the new on-field player at this slot isn't filtered out.
      //
      // Match by reference, not by `id`: the line above reassigns `on.id =
      // off.id`, and a second sub at the same slot would otherwise match
      // an unrelated bin entry with the same numeric id. Player object
      // identity is the only safe key here.
      const sentOff = state.cards.sentOff[event.teamSide];
      const sentIdx = sentOff.findIndex(p => p === off);
      if (sentIdx >= 0) sentOff.splice(sentIdx, 1);
      const injured = state.cards.injured[event.teamSide];
      const injIdx = injured.findIndex(p => p === off);
      if (injIdx >= 0) injured.splice(injIdx, 1);
      if (sentIdx >= 0 || injIdx >= 0) state.cards.version++;
      return;
    }

    case 'POSITION_SWAP': {
      const team = event.side === 'home' ? state.homeTeam : state.awayTeam;
      const p1 = team.players.find(p => p.squadNumber === event.squadNum1);
      const p2 = team.players.find(p => p.squadNumber === event.squadNum2);
      if (!p1 || !p2 || p1 === p2) return;
      // Recompute the out-of-position familiarity scaling for the slot each
      // player now fills. Their match-clone baseStats are already scaled for
      // slotFamiliarity(position, current slot) (initPlayer for a starter, the
      // sub path for a replacement), so re-scale by the ratio of new-slot to
      // old-slot familiarity — keeping the invariant baseStats ≈ roster ×
      // slotFamiliarity(position, id) across repeated swaps. `position` (the
      // natural role) is left intact so the ratio stays well-defined. Mirrors
      // SUBSTITUTION_APPLIED, which scales on its own first reposition.
      const rescale = (p: Player, newSlot: number): void => {
        const ratio = slotFamiliarity(p.position, newSlot) / slotFamiliarity(p.position, p.id);
        if (ratio === 1) return;
        for (const key of Object.keys(p.baseStats) as (keyof PlayerStats)[]) {
          p.baseStats[key]    = clamp(Math.round(p.baseStats[key] * ratio), 1, 100);
          p.currentStats[key] = clamp(Math.round(p.currentStats[key] * ratio), 1, 100);
        }
      };
      rescale(p1, p2.id);
      rescale(p2, p1.id);
      const tmpId = p1.id; p1.id = p2.id; p2.id = tmpId;
      const tmpX = p1.x, tmpY = p1.y; p1.x = p2.x; p1.y = p2.y; p2.x = tmpX; p2.y = tmpY;
      return;
    }

    // ── Engine lifecycle ────────────────────────────────────────────────
    case 'IS_RUNNING_SET':
      state.engine.isRunning = event.value;
      return;

    case 'TICK_DELAY_SET':
      state.engine.tickDelayMs = event.value;
      return;

    case 'FIRST_HALF_KICKER_SET':
      state.engine.firstHalfKicker = event.side;
      return;

    case 'COMMENTARY_BUFFER_CAP_SET':
      state.engine.commentaryBufferCap = event.value;
      return;

    // ── Ratings ─────────────────────────────────────────────────────────
    case 'RATINGS_RECALCULATED':
      // substitutedOff players are intentionally excluded — their matchStats no longer change
      for (const p of state.homeTeam.players) p.rating = computeRating(p);
      for (const p of state.awayTeam.players) p.rating = computeRating(p);
      return;

    // ── Team talk ────────────────────────────────────────────────────────
    case 'TEAM_TALK_APPLIED':
      state.teamTalkMod[event.side] = {
        attack: event.attack,
        defend: event.defend,
        startMinute: event.startMinute,
        decayMinutes: event.decayMinutes,
      };
      if (event.singleOut) {
        state.teamTalkMod.singleOut = {
          side: event.side,
          playerId: event.singleOut.playerId,
          bonus: event.singleOut.bonus,
          startMinute: event.startMinute,
          decayMinutes: event.decayMinutes,
        };
      } else {
        delete state.teamTalkMod.singleOut;
      }
      return;

    // ── Commentary feed ─────────────────────────────────────────────────
    case 'COMMENTARY_LOGGED': {
      state.events.push(event.event);
      const cap = state.engine.commentaryBufferCap;
      if (state.events.length > cap) {
        state.events.splice(0, state.events.length - cap);
      }
      return;
    }

    default: {
      // Exhaustiveness check — TS will error here if a new MatchEvent type is added
      // without a case above. Also throws at runtime (matching the nested
      // CardKind default) to catch malformed events from a future
      // replay/migration path.
      const _exhaustive: never = event;
      throw new Error(`unhandled MatchEvent: ${(_exhaustive as { type?: string }).type}`);
    }
  }
}

// Convenience: apply many events in order. Phase handlers / orchestrators that build
// a queue typically pass it through this to avoid `for` loops at every call site.
export function applyMatchEvents(state: MatchState, events: MatchEvent[]): void {
  for (const e of events) applyMatchEvent(state, e);
}

// `attackDir` is re-exported for handler code that needs the direction at the moment
// it builds CARRY_RESOLVED. Keeps the import surface in handler files tidy.
export { attackDir };
