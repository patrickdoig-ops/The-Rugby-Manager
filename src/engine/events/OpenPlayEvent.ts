import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import type { Player, InjuryKind } from '../../types/player';
import type { PossessionSide } from '../../types/engine';
import type { MatchState } from '../../types/match';
import type { Team } from '../../types/team';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { tackleInfringement } from '../resolvers/TackleInfringementResolver';
import { tryLandingY, tryLocationBand } from '../resolvers/TryLocationResolver';
import { attackDir, isTryScoredAt, onFieldPlayers, availableBacks, availableForwards, pickCoverDefender, pickPrimaryDefender, pickAssistTackler, pickHardCarrier, pickPickAndGoCarrier, tryLineDefenceBonus } from '../FieldPosition';
import { sweepStep, emitSweepHops } from '../Lateral';
import { homeEdge } from '../HomeAdvantage';
import { clamp } from '../../utils/math';
import { rng } from '../../utils/rng';
import { HOME_ADVANTAGE, HARD_CARRY_THRESHOLDS, HARD_CARRY_LINE_BREAK_UPGRADE_PCT, HARD_CARRY_LINE_BREAK_METRES, TACTIC_MODIFIERS, COMMENTARY_CHANCES, SHORT_HANDED, knockOnPct, INJURY, INJURY_KIND_WEIGHTS, OBSTRUCTION_BASE_PCT, INTERCEPTION_BASE_PCT, INTERCEPTION_HANDLING_WEIGHT, INTERCEPTION_STAT_CENTRE, INTERCEPTION_FOLLOW_UP_BONUS, PICK_AND_GO_PCT } from '../balance';
import { decideKick, buildKickTransition } from '../KickDecisionDirector';
import { SLOT, isBackSlot } from '../Slot';
import { tryOffloadChain } from './offloadChain';

const FULL_BACKLINE = 7;  // jersey ids 9–15

export function handlePhasePlay({ state, attackTeam, defendTeam, randomPlayer, silent }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const attackOnField = onFieldPlayers(attackTeam, state, attackSide);

  // Step 0 — Kick or carry decision (unified across PhasePlay / FirstPhase /
  // KickReturn). Director consumes attackingGamePlan + field zone today;
  // ballQuality + family routing arrive in later stages.
  const decision = decideKick({ state, attackTeam, attackOnField });
  if (decision.kick) {
    return buildKickTransition(decision, MatchPhase.PhasePlay);
  }

  // Step 0b — Pick and Go: rolled before the hard-carry / wide decision.
  // On hit, a back-row or prop picks the ball at the base of the ruck and
  // drives 0-4m into contact. No pass (no scrum-half pop, no interception,
  // no handling gate), no offload chain, no line break, no try — always
  // lands at Breakdown. Falls through to the regular decision below if no
  // eligible forward is on the field.
  if (rng(1, 100) <= PICK_AND_GO_PCT[attackTeam.tactics.attackingStyle]) {
    const pagCarrier = pickPickAndGoCarrier(attackTeam, state, attackSide);
    if (pagCarrier) {
      return resolvePickAndGo(state, attackTeam, defendTeam, attackSide, pagCarrier);
    }
  }

  // Step 1 — Hard Carry / Out the Back decision happens FIRST so we can
  // pick the right carrier for each path: hard carry → random forward
  // (the pack hits up off #9), wide → fly-half (#10) who then passes on
  // to an outside back. attackingStyle controls the split.
  const defSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';
  const defendOnField = onFieldPlayers(defendTeam, state, defSide);
  const scrumHalf = attackOnField.find(p => p.id === SLOT.SCRUM_HALF) ?? attackOnField[0] ?? attackTeam.players[0];
  const style = attackTeam.tactics.attackingStyle;
  const goWide = rng(1, 100) > HARD_CARRY_THRESHOLDS[style];

  const attackFwds = availableForwards(attackTeam, state, attackSide);
  // Hard-carry path picks from the forward pool weighted so back row + props
  // dominate (locks second, hooker rare); wide path keeps the fly-half as the
  // first receiver. `attackFwds` is still consumed by the obstruction-offender
  // pool inside the goWide branch below.
  const carrier   = goWide
    ? (attackOnField.find(p => p.id === SLOT.FLY_HALF) ?? attackOnField[0] ?? attackTeam.players[0])
    : pickHardCarrier(attackTeam, state, attackSide);
  let defender = defendOnField.length > 0 ? defendOnField[rng(0, defendOnField.length - 1)] : randomPlayer(defendTeam);

  // Defensive line drives both the knock-on pressure modifier (handling
  // gates harder vs blitz) and the per-pass interception probability.
  // Hoisted above the gates so every check below sees the same value.
  const defensiveLine = defendTeam.tactics.defensiveLine;
  // Per-carry knock-on rate shift. Combines the defender's defensiveLine
  // pressure with the attacker's gameplan-driven handling pressure
  // (possession-plan teams carry more, drop more — v2.184a rebalance).
  // Both terms are pp added on top of the base knockOnPct.
  const pressureMod   = TACTIC_MODIFIERS.defensiveLineHandlingPressure[defensiveLine]
                      + TACTIC_MODIFIERS.gamePlanHandlingPressure[attackTeam.tactics.attackingGamePlan];
  const interceptPctBase = INTERCEPTION_BASE_PCT + TACTIC_MODIFIERS.interceptionMod[defensiveLine];

  const events: MatchEvent[] = [];
  // Backline passes on the carry path — drives the per-pass lateral hop count.
  let passCount = 0;

  // Scrum-half → carrier interception opportunity (only when the pass
  // actually happens). On hit, possession flips and the interceptor runs
  // the next phase with a front-foot breakdownMod boost.
  if (scrumHalf !== carrier) {
    const intPct = interceptPctBase - (scrumHalf.currentStats.handling - INTERCEPTION_STAT_CENTRE) * INTERCEPTION_HANDLING_WEIGHT;
    if (rng(1, 100) <= intPct) {
      const backs = defendOnField.filter(p => isBackSlot(p.id));
      const interceptor = backs.length > 0
        ? backs[rng(0, backs.length - 1)]
        : (defendOnField[rng(0, Math.max(0, defendOnField.length - 1))] ?? randomPlayer(defendTeam));
      events.push({ type: 'INTERCEPTION', interceptor, passer: scrumHalf, attackSide });
      events.push({ type: 'KICK_RETURN_CARRIER_SET', player: interceptor });
      events.push({ type: 'BREAKDOWN_MOD_SET', attack: INTERCEPTION_FOLLOW_UP_BONUS, defend: 0 });
      const intSteps: NarrationStep[] = [
        { kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'interception', primary: interceptor, secondary: scrumHalf },
      ];
      if (defensiveLine === 'blitz') {
        intSteps.push({ kind: 'tactic_note', cause: 'blitz_interception', chancePct: COMMENTARY_CHANCES.blitzInterception, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
      }
      return { nextPhase: MatchPhase.KickReturn, narration: { steps: intSteps }, primaryPlayer: interceptor, secondaryPlayer: scrumHalf, events };
    }
    events.push({ type: 'PASS_COMPLETED', passer: scrumHalf });
    passCount++;
  }

  const { attack: attackMod, defend: defendMod } = state.breakdownMod;
  events.push({ type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 });

  const backfieldPenalty = TACTIC_MODIFIERS.backfieldLineBreakPenalty[defendTeam.tactics.backfieldDefence];
  // Short-handed backline: missing backs make wide defence thinner → more
  // line breaks. Mirrors the backfieldLineBreakPenalty shape; both feed defendMod.
  const missingBacks = FULL_BACKLINE - availableBacks(defendTeam, state, defSide).length;
  const shortHandedMod = missingBacks * SHORT_HANDED.missingBackDefendPenalty;

  if (rng(1, 100) <= knockOnPct(carrier.currentStats.handling, state.clock.clockInTheRed) + pressureMod) {
    events.push({ type: 'KNOCK_ON', player: carrier, attackSide });
    const koSteps: NarrationStep[] = [
      { kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'knock_on', primary: carrier, secondary: defender },
    ];
    if (defensiveLine === 'blitz') {
      koSteps.push({ kind: 'tactic_note', cause: 'blitz_pressure_knockon', chancePct: COMMENTARY_CHANCES.blitzPressureKnockOn, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
    }
    if (state.engine.isDerby || state.engine.neutralVenue || state.engine.isPlayoffSemi) {
      koSteps.push({ kind: 'tactic_note', cause: 'occasion_error_pressure', chancePct: COMMENTARY_CHANCES.occasionErrorPressure });
    }
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: koSteps },
      primaryPlayer: carrier,
      secondaryPlayer: defender,
      events,
    };
  }

  let ballCarrier = carrier;
  // Tracks the "out the back" pass step that prefixes the eventual outcome
  // commentary on the wide path.
  let wideIntroSteps: NarrationStep[] = [];

  if (goWide) {
    // carrier is the fly-half (#10) by construction; the wide path is
    // scrum-half → fly-half → outside back. Obstruction → KO on outside
    // back → fly-half → outside-back interception, in that order.

    // Obstruction roll — fires at most once per out-the-back attempt. Offender
    // is a random screening forward. Modified by attackingStyle (wide_wide =
    // more screens, keep_it_tight = fewer). If it fires, the play stops here
    // and the defending side gets the penalty.
    const obstructionPct = OBSTRUCTION_BASE_PCT + TACTIC_MODIFIERS.obstructionStyleMod[style];
    if (rng(1, 100) <= obstructionPct) {
      const offender = attackFwds.length > 0
        ? attackFwds[rng(0, attackFwds.length - 1)]
        : (attackOnField[0] ?? carrier);
      events.push({ type: 'PENALTY_AWARDED', offence: 'obstruction', offender, offendingSide: attackSide });
      return {
        nextPhase: MatchPhase.Penalty,
        narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'obstruction_penalty', primary: offender, secondary: defender }] },
        primaryPlayer: offender,
        secondaryPlayer: defender,
        events,
      };
    }

    // Outside back handling gate (outside centre, both wings, fullback)
    const obPool = attackOnField.filter(p =>
      p.id === SLOT.WING_11 || p.id === SLOT.CENTRE_13 || p.id === SLOT.WING_14 || p.id === SLOT.FULL_BACK);
    const outsideBack = obPool.length > 0 ? obPool[rng(0, obPool.length - 1)] : (attackOnField[rng(0, Math.max(0, attackOnField.length - 1))] ?? randomPlayer(attackTeam));
    wideIntroSteps = [{ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'out_the_back', primary: carrier, secondary: outsideBack }];
    if (rng(1, 100) <= knockOnPct(outsideBack.currentStats.handling, state.clock.clockInTheRed) + pressureMod) {
      events.push({ type: 'KNOCK_ON', player: outsideBack, attackSide });
      const koSteps: NarrationStep[] = [
        ...wideIntroSteps,
        { kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'knock_on', primary: outsideBack, secondary: defender },
      ];
      if (defensiveLine === 'blitz') {
        koSteps.push({ kind: 'tactic_note', cause: 'blitz_pressure_knockon', chancePct: COMMENTARY_CHANCES.blitzPressureKnockOn, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
      }
      if (state.engine.isDerby || state.engine.neutralVenue || state.engine.isPlayoffSemi) {
        koSteps.push({ kind: 'tactic_note', cause: 'occasion_error_pressure', chancePct: COMMENTARY_CHANCES.occasionErrorPressure });
      }
      return {
        nextPhase: MatchPhase.Scrum,
        narration: { steps: koSteps },
        primaryPlayer: outsideBack,
        secondaryPlayer: defender,
        events,
      };
    }

    // Fly-half → outside-back interception opportunity. Same mechanism as
    // the scrumHalf → carrier roll up top.
    const intPctWide = interceptPctBase - (carrier.currentStats.handling - INTERCEPTION_STAT_CENTRE) * INTERCEPTION_HANDLING_WEIGHT;
    if (rng(1, 100) <= intPctWide) {
      const backs = defendOnField.filter(p => isBackSlot(p.id));
      const interceptor = backs.length > 0
        ? backs[rng(0, backs.length - 1)]
        : (defendOnField[rng(0, Math.max(0, defendOnField.length - 1))] ?? randomPlayer(defendTeam));
      events.push({ type: 'INTERCEPTION', interceptor, passer: carrier, attackSide });
      events.push({ type: 'KICK_RETURN_CARRIER_SET', player: interceptor });
      events.push({ type: 'BREAKDOWN_MOD_SET', attack: INTERCEPTION_FOLLOW_UP_BONUS, defend: 0 });
      const intSteps: NarrationStep[] = [
        ...wideIntroSteps,
        { kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'interception', primary: interceptor, secondary: carrier },
      ];
      if (defensiveLine === 'blitz') {
        intSteps.push({ kind: 'tactic_note', cause: 'blitz_interception', chancePct: COMMENTARY_CHANCES.blitzInterception, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
      }
      return { nextPhase: MatchPhase.KickReturn, narration: { steps: intSteps }, primaryPlayer: interceptor, secondaryPlayer: carrier, events };
    }

    events.push({ type: 'PASS_COMPLETED', passer: carrier });
    passCount++;
    ballCarrier = outsideBack;
  }

  // Channel-aware primary defender — picked AFTER ballCarrier is finalised
  // (the goWide branch above swaps it to the outsideBack). The early-pick
  // `defender` from line 47 stays in scope for any KO / obstruction
  // narration that fired before this point (those paths don't emit
  // CARRY_RESOLVED, so the swap doesn't affect tackle stats).
  defender = pickPrimaryDefender(defendTeam, state, defSide, ballCarrier);

  // Step 3 — Evasion → Step 4 Collision (handling gate already cleared)
  const ha = homeEdge(state, HOME_ADVANTAGE.carryMod);
  // defensiveLine was hoisted up top for the pressure / interception
  // rolls; reused here for the carry-resolution mods.
  // Path-specific modifiers fire only on !goWide ("hard carry" — Step 2
  // in this handler: scrum-half pop + carrier into contact). Both the
  // collision AND evasion mods kick in: collision shifts how many
  // metres the defender concedes on contact; evasion shifts how often
  // the carrier beats the line entirely. Wide / out-the-back path
  // (goWide) gets no path modifier — base mods only.
  const isHardCarry = !goWide;
  const pathCollisionMod = isHardCarry ? TACTIC_MODIFIERS.hardCarryCollisionMod[defensiveLine] : 0;
  const pathEvasionMod   = isHardCarry ? TACTIC_MODIFIERS.hardCarryEvasionMod[defensiveLine]   : 0;
  
  // Attacking breakdown evasion synergy: the bonus/penalty for having extra
  // men out wide ONLY applies if the play actually goes wide.
  const breakdownWideEvasion = goWide ? TACTIC_MODIFIERS.breakdownAttack[attackTeam.tactics.attackingBreakdown] : 0;
  
  const dlEvasion   = TACTIC_MODIFIERS.defensiveLineEvasionMod[defensiveLine] + pathEvasionMod;
  const dlCollision = TACTIC_MODIFIERS.defensiveLineCollisionMod[defensiveLine] + pathCollisionMod;
  const tlBonus = tryLineDefenceBonus(state);
  // Team talk modifier — decays linearly from startMinute over decayMinutes.
  const gameMinute = state.clock.gameMinute;
  const ttAttack = state.teamTalkMod[attackSide];
  const ttDef    = state.teamTalkMod[defSide];
  const ttAttackFrac = ttAttack.decayMinutes > 0 ? Math.max(0, 1 - (gameMinute - ttAttack.startMinute) / ttAttack.decayMinutes) : 0;
  const ttDefFrac    = ttDef.decayMinutes > 0    ? Math.max(0, 1 - (gameMinute - ttDef.startMinute)    / ttDef.decayMinutes)    : 0;
  const ttAttackBonus = ttAttack.attack * ttAttackFrac;
  const ttDefendBonus = ttDef.defend * ttDefFrac;
  // singleOut: targeted bonus for one specific ball-carrier on the attacking side.
  const so = state.teamTalkMod.singleOut;
  const soFrac = so && so.decayMinutes > 0 ? Math.max(0, 1 - (gameMinute - so.startMinute) / so.decayMinutes) : 0;
  const singleOutBonus = so && so.side === attackSide && so.playerId === ballCarrier.id ? so.bonus * soFrac : 0;
  const baseAttackMod = attackMod + breakdownWideEvasion + ha.attack + tlBonus.evasion + ttAttackBonus + singleOutBonus;
  const baseDefendMod = defendMod + backfieldPenalty + shortHandedMod + dlEvasion + TACTIC_MODIFIERS.defendingBreakdownTackleMod[defendTeam.tactics.defendingBreakdown] + ha.defend + ttDefendBonus;
  let res = resolveOpenPlay(ballCarrier, defender, baseAttackMod, baseDefendMod, dlCollision + tlBonus.collision);
  const direction = attackDir(state);

  let chainNarration: NarrationStep[] = [];
  if (res.outcome !== 'line_break') {
    const chain = tryOffloadChain({
      state, attackTeam, defendTeam, attackSide, defSide,
      phase: MatchPhase.PhasePlay,
      initialRes: res, initialCarrier: ballCarrier, initialDefender: defender,
      baseAttackMod, baseDefendMod, dlCollision, direction,
    });
    events.push(...chain.chainEvents);
    if (chain.knockedOn) {
      return {
        nextPhase: MatchPhase.Scrum,
        narration: { steps: [...wideIntroSteps, ...chain.chainNarration] },
        primaryPlayer: chain.finalCarrier,
        secondaryPlayer: chain.finalDefender,
        events,
      };
    }
    res = chain.finalRes;
    ballCarrier = chain.finalCarrier;
    defender = chain.finalDefender;
    chainNarration = chain.chainNarration;
  }

  // Hard-carry line-break upgrade — forwards rarely clear the standard
  // line-break margin on raw stats. A small upgrade on a dominant_carry
  // outcome lets back-row + props occasionally feature on the line-break
  // / try-scorer leaderboards. Hard-carry path only (the wide path's
  // existing line-break math already produces wing/FB breaks). Gain re-
  // rolls into a smaller range than wide-line-breaks (close-channel cover
  // tracks back faster than a fullback in the 15m channel).
  if (!goWide && res.outcome === 'dominant_carry'
      && rng(1, 100) <= HARD_CARRY_LINE_BREAK_UPGRADE_PCT) {
    res.outcome = 'line_break';
    res.gainMetres = rng(HARD_CARRY_LINE_BREAK_METRES[0], HARD_CARRY_LINE_BREAK_METRES[1]);
  }

  // Line break gain bonus — blitz cover is behind the runner so a break
  // concedes more metres; drift cover is wide and shallow so the break is
  // shorter. Applied post-resolve so the resolver stays tactic-pure.
  if (res.outcome === 'line_break') {
    res.gainMetres += TACTIC_MODIFIERS.defensiveLineBreakBonus[defensiveLine];
    res.gainMetres += TACTIC_MODIFIERS.backfieldLineBreakGainBonus[defendTeam.tactics.backfieldDefence];
  }

  // Try check hoisted above CARRY_RESOLVED so the cover-tackler pick can
  // be gated on a non-try line break.
  const projectedBallX = clamp(state.ball.x + direction * res.gainMetres, 0, 100);
  const canScore = res.outcome === 'line_break' || res.outcome === 'dominant_carry';
  const tryScored = canScore && isTryScoredAt(projectedBallX, attackSide, state.clock.halfTimeDone);

  const coverTackler = res.outcome === 'line_break' && !tryScored
    ? pickCoverDefender(defendTeam, state, defSide)
    : undefined;

  const assistTackler = (res.outcome === 'dominant_carry' || res.outcome === 'play_on' || res.outcome === 'dominant_tackle')
    ? pickAssistTackler(defendTeam, state, defSide, defender)
    : undefined;

  // Lateral hops: the ball steps across the field one hop per backline pass
  // (continuing the current sweep direction), THEN the carrier drives forward —
  // emitted before the carry so the lateral legs precede the x-advance. Try path
  // keeps its tryLandingY grounding below (no per-pass hops on a score).
  let lateralStep: NarrationStep | null = null;
  if (!tryScored) {
    lateralStep = emitSweepHops(events, state, attackTeam.tactics.attackingStyle, passCount, false, attackTeam.name, !silent);
  }

  events.push({
    type: 'CARRY_RESOLVED',
    carrier: ballCarrier,
    defender,
    metres: res.gainMetres,
    direction,
    outcome: res.outcome,
    defSide,
    coverTackler,
    assistTackler,
  });

  let nextPhase: MatchPhase;
  const outcomeSteps: NarrationStep[] = [...wideIntroSteps, ...chainNarration];

  if (tryScored) {
    nextPhase = MatchPhase.TryScored;
    const tryKey: 'line_break_try' | 'dominant_carry_try' =
      res.outcome === 'line_break' ? 'line_break_try' : 'dominant_carry_try';
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: tryKey, primary: ballCarrier, secondary: defender });
    const y = tryLandingY(state, attackTeam.tactics.attackingStyle);
    events.push({ type: 'BALL_REPOSITIONED', y });
    outcomeSteps.push({ kind: 'announcement', key: `try_location_${tryLocationBand(y)}` });
  } else if (res.outcome === 'line_break') {
    nextPhase = MatchPhase.Breakdown;
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'line_break', primary: ballCarrier, secondary: defender });
    if (coverTackler) {
      outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'cover_tackle', primary: ballCarrier, secondary: coverTackler });
    }
    if (backfieldPenalty < 0) {
      outcomeSteps.push({
        kind: 'tactic_note',
        cause: 'line_break_backfield_thin',
        chancePct: COMMENTARY_CHANCES.lineBreakBackfieldThin,
        params: { defendTeamName: defendTeam.name, backfieldDefence: defendTeam.tactics.backfieldDefence },
      });
    }
    if (defensiveLine === 'blitz') {
      outcomeSteps.push({
        kind: 'tactic_note',
        cause: 'blitz_line_break_punished',
        chancePct: COMMENTARY_CHANCES.blitzLineBreakPunished,
        params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name },
      });
    }
    if (state.engine.isDerby || state.engine.neutralVenue || state.engine.isPlayoffSemi) {
      outcomeSteps.push({ kind: 'tactic_note', cause: 'occasion_rising_to_occasion', chancePct: COMMENTARY_CHANCES.occasionRisingToOccasion });
    }
  } else if (res.outcome === 'dominant_tackle') {
    nextPhase = MatchPhase.Breakdown;
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'dominant_tackle', primary: ballCarrier, secondary: defender });
    if (defensiveLine === 'blitz') {
      outcomeSteps.push({
        kind: 'tactic_note',
        cause: 'blitz_dominant_tackle',
        chancePct: COMMENTARY_CHANCES.blitzDominantTackle,
        params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name },
      });
    }
  } else {
    nextPhase = MatchPhase.Breakdown;
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: res.outcome, primary: ballCarrier, secondary: defender });
    // Drift commentary fires on the milder play_on / dominant_carry outcomes
    // — the shepherd-to-touch flavour is "they got metres but not what they
    // wanted", which fits any non-line-break attacking-side carry.
    if (defensiveLine === 'drift' && res.outcome === 'play_on') {
      outcomeSteps.push({
        kind: 'tactic_note',
        cause: 'drift_shepherd_to_touch',
        chancePct: COMMENTARY_CHANCES.driftShepherdToTouch,
        params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name },
      });
    }
  }

  // High-tackle check: applies on top of the carry result so the carrier still
  // earns the metres (advantage law). Skipped on line breaks — no completed
  // tackle to be high.
  if (res.outcome !== 'line_break' && tackleInfringement(defender, TACTIC_MODIFIERS.disciplineHighTackleMod[defendTeam.tactics.discipline]) === 'high_tackle') {
    events.push({ type: 'PENALTY_AWARDED', offence: 'high_tackle', offender: defender, offendingSide: defSide });
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'high_tackle_penalty', primary: defender, secondary: ballCarrier });
    nextPhase = MatchPhase.Penalty;
  }

  // Injury roll. Single rng(1, 10000) gate (4-digit precision so the small
  // base percentage isn't dominated by integer rounding); single rng(1, 100)
  // for the kind weighted pick; on a dominant_tackle, an extra rng(1, 100)
  // decides carrier-vs-tackler victim. Skipped on line breaks — no completed
  // tackle to cause contact injury.
  if (res.outcome !== 'line_break') {
    const injuryEvent = rollMatchInjury(res.outcome, ballCarrier, defender, attackSide, defSide);
    if (injuryEvent) {
      events.push(injuryEvent);
      const victim = injuryEvent.player;
      outcomeSteps.push({ kind: 'announcement', key: 'injury_off', primary: victim });
    }
  }

  // Lateral flavour rides on a normal continuation only — not after a penalty/try.
  if (lateralStep && nextPhase === MatchPhase.Breakdown) outcomeSteps.push(lateralStep);

  return {
    nextPhase,
    narration: { steps: outcomeSteps },
    primaryPlayer: ballCarrier,
    secondaryPlayer: defender,
    outcome: res.outcome,
    events,
  };
}

// Pick-and-go branch — self-contained carry resolution for a forward
// picking the ball at the base of the ruck. Reuses resolveOpenPlay for
// outcome generation so the carrier's stats still drive quality, but
// downgrades any line_break to dominant_carry (defenders are committed,
// the line can't be broken from a ruck pick) and clamps gain to 0-4m.
// Skips the interception roll, knock-on gate, offload chain, and try-
// scoring branch; always lands at Breakdown (or Penalty on a high tackle).
function resolvePickAndGo(
  state: MatchState,
  attackTeam: Team,
  defendTeam: Team,
  attackSide: PossessionSide,
  carrier: Player,
): PhaseResult {
  const defSide: PossessionSide = attackSide === 'home' ? 'away' : 'home';
  const { attack: attackMod, defend: defendMod } = state.breakdownMod;
  const events: MatchEvent[] = [
    { type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 },
  ];

  const defender = pickPrimaryDefender(defendTeam, state, defSide, carrier);
  const backfieldPenalty = TACTIC_MODIFIERS.backfieldLineBreakPenalty[defendTeam.tactics.backfieldDefence];
  const missingBacks = FULL_BACKLINE - availableBacks(defendTeam, state, defSide).length;
  const shortHandedMod = missingBacks * SHORT_HANDED.missingBackDefendPenalty;

  const ha = homeEdge(state, HOME_ADVANTAGE.carryMod);
  const defensiveLine = defendTeam.tactics.defensiveLine;
  const dlEvasion   = TACTIC_MODIFIERS.defensiveLineEvasionMod[defensiveLine];
  const dlCollision = TACTIC_MODIFIERS.defensiveLineCollisionMod[defensiveLine];
  const tlBonus = tryLineDefenceBonus(state);
  // Team talk modifier (same decay formula as handlePhasePlay).
  const pagGameMinute = state.clock.gameMinute;
  const pagTtAttack = state.teamTalkMod[attackSide];
  const pagTtDef    = state.teamTalkMod[defSide];
  const pagTtAttackFrac = pagTtAttack.decayMinutes > 0 ? Math.max(0, 1 - (pagGameMinute - pagTtAttack.startMinute) / pagTtAttack.decayMinutes) : 0;
  const pagTtDefFrac    = pagTtDef.decayMinutes > 0    ? Math.max(0, 1 - (pagGameMinute - pagTtDef.startMinute)    / pagTtDef.decayMinutes)    : 0;
  const pagSo = state.teamTalkMod.singleOut;
  const pagSoFrac = pagSo && pagSo.decayMinutes > 0 ? Math.max(0, 1 - (pagGameMinute - pagSo.startMinute) / pagSo.decayMinutes) : 0;
  const pagSingleOutBonus = pagSo && pagSo.side === attackSide && pagSo.playerId === carrier.id ? pagSo.bonus * pagSoFrac : 0;
  const baseAttackMod = attackMod + ha.attack + tlBonus.evasion + pagTtAttack.attack * pagTtAttackFrac + pagSingleOutBonus;
  const baseDefendMod = defendMod + backfieldPenalty + shortHandedMod + dlEvasion + TACTIC_MODIFIERS.defendingBreakdownTackleMod[defendTeam.tactics.defendingBreakdown] + ha.defend + pagTtDef.defend * pagTtDefFrac;
  const res = resolveOpenPlay(carrier, defender, baseAttackMod, baseDefendMod, dlCollision + tlBonus.collision);

  // Downgrade line_break → dominant_carry; pick-and-go can't break the line.
  const outcome: 'play_on' | 'dominant_carry' | 'dominant_tackle' =
    res.outcome === 'line_break' ? 'dominant_carry' : res.outcome;
  // 1-4m floor: even a stuffed pick-and-go drives at least a metre at the
  // ruck base — defenders absorb but the ball still moves forward.
  const gainMetres = clamp(res.gainMetres, 1, 4);
  const direction = attackDir(state);

  const assistTackler = pickAssistTackler(defendTeam, state, defSide, defender);

  events.push({
    type: 'CARRY_RESOLVED',
    carrier,
    defender,
    metres: gainMetres,
    direction,
    outcome,
    defSide,
    coverTackler: undefined,
    assistTackler,
  });

  // A pick-and-go is a tight forward drive, not a pass — only a small lateral
  // creep in the current sweep direction (keep_it_tight = smallest step).
  const sweep = sweepStep(state, 'keep_it_tight');
  events.push({ type: 'BALL_REPOSITIONED', y: sweep.y, lateralDir: sweep.lateralDir });

  const outcomeKey: 'pick_and_go_play_on' | 'pick_and_go_dominant_carry' | 'pick_and_go_dominant_tackle' =
    outcome === 'dominant_carry'  ? 'pick_and_go_dominant_carry'
  : outcome === 'dominant_tackle' ? 'pick_and_go_dominant_tackle'
  :                                 'pick_and_go_play_on';
  const steps: NarrationStep[] = [
    { kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: outcomeKey, primary: carrier, secondary: defender },
  ];

  let nextPhase: MatchPhase = MatchPhase.Breakdown;
  if (tackleInfringement(defender, TACTIC_MODIFIERS.disciplineHighTackleMod[defendTeam.tactics.discipline]) === 'high_tackle') {
    events.push({ type: 'PENALTY_AWARDED', offence: 'high_tackle', offender: defender, offendingSide: defSide });
    steps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'high_tackle_penalty', primary: defender, secondary: carrier });
    nextPhase = MatchPhase.Penalty;
  }

  const injuryEvent = rollMatchInjury(outcome, carrier, defender, attackSide, defSide);
  if (injuryEvent) {
    events.push(injuryEvent);
    steps.push({ kind: 'announcement', key: 'injury_off', primary: injuryEvent.player });
  }

  return {
    nextPhase,
    narration: { steps },
    primaryPlayer: carrier,
    secondaryPlayer: defender,
    outcome,
    events,
  };
}

// Pure helper — uses the outcome RNG stream. Returns either a
// PLAYER_INJURED_IN_MATCH event or null. Two rolls in a fixed order:
// trigger first (always consumed when reached), then kind, then (on
// dominant_tackle) victim selection. Consumers must call in this order
// only when the trigger passes — otherwise downstream RNG shifts.
type InjuryMatchEvent = Extract<MatchEvent, { type: 'PLAYER_INJURED_IN_MATCH' }>;
function rollMatchInjury(
  outcome: 'dominant_carry' | 'dominant_tackle' | 'play_on',
  carrier: Player,
  defender: Player,
  attackSide: PossessionSide,
  defSide: PossessionSide,
): InjuryMatchEvent | null {
  const isDom = outcome === 'dominant_tackle';
  // Use the higher-impact side's vulnerability for the trigger probability.
  // The actual victim is decided below; the trigger weight reflects the
  // shape of the contact.
  const carrierVuln = INJURY.positionVuln[carrier.position] ?? 1;
  // Lower fatiguePct (towards 0) = more tired = more injury-prone. Players
  // start at 100 and drift downward; the boost scales with how far below
  // 100 they are.
  const fatigueBoost = 1 + INJURY.fatigueWeight * (1 - carrier.fatiguePct / 100);
  const pct = INJURY.basePctPerTackle * (isDom ? INJURY.dominantTackleMult : 1) * carrierVuln * fatigueBoost;
  // rng(1, 10000); compare to pct% × 100 = pct × 100 / 100 = … just
  // multiply pct by 100 to get the integer ceiling.
  if (rng(1, 10000) > pct * 100) return null;

  const kind = pickInjuryKind();

  const victim: Player = isDom && rng(1, 100) <= INJURY.tacklerVictimPct ? defender : carrier;
  const victimSide: PossessionSide = victim === carrier ? attackSide : defSide;

  return { type: 'PLAYER_INJURED_IN_MATCH', player: victim, side: victimSide, kind };
}

function pickInjuryKind(): InjuryKind {
  const roll = rng(1, 100);
  let cum = 0;
  for (const [k, w] of Object.entries(INJURY_KIND_WEIGHTS) as Array<[InjuryKind, number]>) {
    cum += w;
    if (roll <= cum) return k;
  }
  return 'knock';
}
