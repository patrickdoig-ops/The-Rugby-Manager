import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import type { Player, InjuryKind } from '../../types/player';
import type { PossessionSide } from '../../types/engine';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { tackleInfringement } from '../resolvers/TackleInfringementResolver';
import { tryLandingY, tryLocationBand } from '../resolvers/TryLocationResolver';
import { attackDir, isTryScoredAt, onFieldPlayers, availableBacks, availableForwards } from '../FieldPosition';
import { homeEdge } from '../HomeAdvantage';
import { clamp } from '../../utils/math';
import { rng } from '../../utils/rng';
import { HOME_ADVANTAGE, HARD_CARRY_THRESHOLDS, TACTIC_MODIFIERS, COMMENTARY_CHANCES, SHORT_HANDED, knockOnPct, INJURY, INJURY_KIND_WEIGHTS, OBSTRUCTION_BASE_PCT, INTERCEPTION_BASE_PCT, INTERCEPTION_HANDLING_WEIGHT, INTERCEPTION_STAT_CENTRE, INTERCEPTION_FOLLOW_UP_BONUS } from '../balance';
import { decideKick, buildKickTransition } from '../KickDecisionDirector';
import { SLOT, isBackSlot } from '../Slot';

const FULL_BACKLINE = 7;  // jersey ids 9–15

export function handlePhasePlay({ state, attackTeam, defendTeam, randomPlayer, pickPlayer }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const attackOnField = onFieldPlayers(attackTeam, state, attackSide);

  // Step 0 — Kick or carry decision (unified across PhasePlay / FirstPhase /
  // KickReturn). Director consumes attackingGamePlan + field zone today;
  // ballQuality + family routing arrive in later stages.
  const decision = decideKick({ state, attackTeam, attackOnField });
  if (decision.kick) {
    return buildKickTransition(decision, MatchPhase.PhasePlay);
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
  const carrier   = goWide
    ? (attackOnField.find(p => p.id === SLOT.FLY_HALF) ?? pickPlayer(attackTeam, SLOT.FLY_HALF))
    : (attackFwds.length > 0 ? attackFwds[rng(0, attackFwds.length - 1)] : (attackOnField[0] ?? randomPlayer(attackTeam)));
  const defender  = defendOnField.length > 0 ? defendOnField[rng(0, defendOnField.length - 1)] : randomPlayer(defendTeam);

  // Defensive line drives both the knock-on pressure modifier (handling
  // gates harder vs blitz) and the per-pass interception probability.
  // Hoisted above the gates so every check below sees the same value.
  const defensiveLine = defendTeam.tactics.defensiveLine;
  const pressureMod   = TACTIC_MODIFIERS.defensiveLineHandlingPressure[defensiveLine];
  const interceptPctBase = INTERCEPTION_BASE_PCT + TACTIC_MODIFIERS.interceptionMod[defensiveLine];

  const events: MatchEvent[] = [];

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
    ballCarrier = outsideBack;
  }

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
  const res = resolveOpenPlay(
    ballCarrier, defender,
    attackMod + breakdownWideEvasion + ha.attack,
    defendMod + backfieldPenalty + shortHandedMod + dlEvasion + ha.defend,
    dlCollision,
  );
  const direction = attackDir(state);

  // Line break gain bonus — blitz cover is behind the runner so a break
  // concedes more metres; drift cover is wide and shallow so the break is
  // shorter. Applied post-resolve so the resolver stays tactic-pure.
  if (res.outcome === 'line_break') {
    res.gainMetres += TACTIC_MODIFIERS.defensiveLineBreakBonus[defensiveLine];
    res.gainMetres += TACTIC_MODIFIERS.backfieldLineBreakGainBonus[defendTeam.tactics.backfieldDefence];
  }

  events.push({
    type: 'CARRY_RESOLVED',
    carrier: ballCarrier,
    defender,
    metres: res.gainMetres,
    direction,
    outcome: res.outcome,
    defSide,
  });

  let nextPhase: MatchPhase;
  const outcomeSteps: NarrationStep[] = [...wideIntroSteps];

  // Try check — any forward-progress carry whose projected ballX
  // crosses the attack-direction try line scores. Line breaks AND
  // dominant carries both qualify (a centre crash that reaches the
  // line scores just the same as a winger break). play_on and
  // dominant_tackle don't score: play_on metres are too short to
  // matter from > 5m out, dominant_tackle is by definition pushed back.
  const projectedBallX = clamp(state.ball.x + direction * res.gainMetres, 0, 100);
  const canScore = res.outcome === 'line_break' || res.outcome === 'dominant_carry';
  const tryScored = canScore && isTryScoredAt(projectedBallX, attackSide, state.clock.halfTimeDone);

  if (tryScored) {
    nextPhase = MatchPhase.TryScored;
    const tryKey: 'line_break_try' | 'dominant_carry_try' =
      res.outcome === 'line_break' ? 'line_break_try' : 'dominant_carry_try';
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: tryKey, primary: ballCarrier, secondary: defender });
    const y = tryLandingY(attackTeam.tactics.attackingStyle);
    events.push({ type: 'BALL_REPOSITIONED', y });
    outcomeSteps.push({ kind: 'announcement', key: `try_location_${tryLocationBand(y)}` });
  } else if (res.outcome === 'line_break') {
    nextPhase = MatchPhase.Breakdown;
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.PhasePlay, key: 'line_break', primary: ballCarrier, secondary: defender });
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
  if (res.outcome !== 'line_break' && tackleInfringement(defender) === 'high_tackle') {
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

  return {
    nextPhase,
    narration: { steps: outcomeSteps },
    primaryPlayer: ballCarrier,
    secondaryPlayer: defender,
    outcome: res.outcome,
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
