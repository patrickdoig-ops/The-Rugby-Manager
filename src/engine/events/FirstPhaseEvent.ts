import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { tackleInfringement } from '../resolvers/TackleInfringementResolver';
import { tryLandingY, tryLocationBand } from '../resolvers/TryLocationResolver';
import { attackDir, isTryScoredAt, inOwnHalf, inOwn22, onFieldPlayers, availableBacks, availableForwards } from '../FieldPosition';
import { homeEdge } from '../HomeAdvantage';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { HOME_ADVANTAGE, KICK_PROBABILITIES, HARD_CARRY_THRESHOLDS, TACTIC_MODIFIERS, COMMENTARY_CHANCES, SHORT_HANDED, knockOnThreshold, OBSTRUCTION_BASE_PCT, INTERCEPTION_BASE_PCT, INTERCEPTION_FOLLOW_UP_BONUS } from '../balance';

const FULL_BACKLINE = 7;

export function handleFirstPhase({ state, attackTeam, defendTeam, randomPlayer, pickPlayer }: PhaseContext): PhaseResult {
  // Step 0 — Kick or carry decision
  const plan = attackTeam.tactics.attackingGamePlan;
  const probs = KICK_PROBABILITIES[plan];
  const kickProb = inOwn22(state) ? probs.own22 : (inOwnHalf(state) ? probs.ownHalf : probs.opposition);

  if (rng(1, 100) <= kickProb) {
    const flyHalf = attackTeam.players.find(p => p.id === 10) ?? attackTeam.players[0];
    return {
      nextPhase: MatchPhase.TacticalKick,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'kick_decision' }] },
      primaryPlayer: flyHalf,
      events: [
        { type: 'KICK_RETURN_CARRIER_SET', player: undefined },
        { type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 },
      ],
    };
  }

  // Step 1 — Carrier is always #10 (fly-half); handling gate
  const attackSide = state.possession;
  const defSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';
  const attackOnField = onFieldPlayers(attackTeam, state, attackSide);
  const defendOnField = onFieldPlayers(defendTeam, state, defSide);
  const carrier   = attackOnField.find(p => p.id === 10) ?? pickPlayer(attackTeam, 10);
  const scrumHalf = attackOnField.find(p => p.id === 9) ?? attackOnField[0] ?? attackTeam.players[0];

  // Defensive line drives the per-pass interception probability and the
  // handling-gate pressure modifier. Hoisted up here so every pass site +
  // gate site below sees the same value.
  const defensiveLine = defendTeam.tactics.defensiveLine;
  const pressureMod   = TACTIC_MODIFIERS.defensiveLineHandlingPressure[defensiveLine];
  const interceptPctBase = INTERCEPTION_BASE_PCT + TACTIC_MODIFIERS.interceptionMod[defensiveLine];

  const events: MatchEvent[] = [];

  // Scrum-half → fly-half interception roll. Off the set piece this is
  // the first pass; off-target the ball lands at the interceptor's feet.
  {
    const intPct = interceptPctBase - (scrumHalf.currentStats.handling - 50) * 0.02;
    if (rng(1, 100) <= intPct) {
      const backs = defendOnField.filter(p => p.id >= 9);
      const interceptor = backs.length > 0
        ? backs[rng(0, backs.length - 1)]
        : (defendOnField[rng(0, Math.max(0, defendOnField.length - 1))] ?? randomPlayer(defendTeam));
      events.push({ type: 'INTERCEPTION', interceptor, passer: scrumHalf, attackSide });
      events.push({ type: 'KICK_RETURN_CARRIER_SET', player: interceptor });
      events.push({ type: 'BREAKDOWN_MOD_SET', attack: INTERCEPTION_FOLLOW_UP_BONUS, defend: 0 });
      const intSteps: NarrationStep[] = [
        { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'interception', primary: interceptor, secondary: scrumHalf },
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
  const missingBacks = FULL_BACKLINE - availableBacks(defendTeam, state, defSide).length;
  const shortHandedMod = missingBacks * SHORT_HANDED.missingBackDefendPenalty;

  if (carrier.currentStats.handling + rng(1, 100) < knockOnThreshold(carrier.currentStats.handling, state.clock.clockInTheRed) + pressureMod) {
    events.push({ type: 'KNOCK_ON', player: carrier, attackSide });
    const defender = defendOnField.length > 0 ? defendOnField[rng(0, defendOnField.length - 1)] : randomPlayer(defendTeam);
    const koSteps: NarrationStep[] = [
      { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: carrier, secondary: defender },
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

  // Step 2 — Crash Ball or Wide Play
  const style = attackTeam.tactics.attackingStyle;
  const goCrashBall = rng(1, 100) <= HARD_CARRY_THRESHOLDS[style];

  let ballCarrier;
  let defender;
  // Structural pass steps prefix the outcome step in the descriptor (mirrors
  // the playIntro string concatenation in the previous implementation).
  const playIntroSteps: NarrationStep[] = [];

  if (goCrashBall) {
    // Crash Ball: #10 → #12 (inside centre)
    const insideCentre = attackOnField.find(p => p.id === 12) ?? pickPlayer(attackTeam, 12);
    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'crash_ball', primary: carrier, secondary: insideCentre });

    // Interception roll on the #10 → #12 pass.
    {
      const intPct = interceptPctBase - (carrier.currentStats.handling - 50) * 0.02;
      if (rng(1, 100) <= intPct) {
        const backs = defendOnField.filter(p => p.id >= 9);
        const interceptor = backs.length > 0
          ? backs[rng(0, backs.length - 1)]
          : (defendOnField[rng(0, Math.max(0, defendOnField.length - 1))] ?? randomPlayer(defendTeam));
        events.push({ type: 'INTERCEPTION', interceptor, passer: carrier, attackSide });
        events.push({ type: 'KICK_RETURN_CARRIER_SET', player: interceptor });
        events.push({ type: 'BREAKDOWN_MOD_SET', attack: INTERCEPTION_FOLLOW_UP_BONUS, defend: 0 });
        const intSteps: NarrationStep[] = [
          ...playIntroSteps,
          { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'interception', primary: interceptor, secondary: carrier },
        ];
        if (defensiveLine === 'blitz') {
          intSteps.push({ kind: 'tactic_note', cause: 'blitz_interception', chancePct: COMMENTARY_CHANCES.blitzInterception, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
        }
        return { nextPhase: MatchPhase.KickReturn, narration: { steps: intSteps }, primaryPlayer: interceptor, secondaryPlayer: carrier, events };
      }
    }

    if (insideCentre.currentStats.handling + rng(1, 100) < knockOnThreshold(insideCentre.currentStats.handling, state.clock.clockInTheRed) + pressureMod) {
      events.push({ type: 'KNOCK_ON', player: insideCentre, attackSide });
      const koSteps: NarrationStep[] = [
        ...playIntroSteps,
        { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: insideCentre, secondary: carrier },
      ];
      if (defensiveLine === 'blitz') {
        koSteps.push({ kind: 'tactic_note', cause: 'blitz_pressure_knockon', chancePct: COMMENTARY_CHANCES.blitzPressureKnockOn, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
      }
      return {
        nextPhase: MatchPhase.Scrum,
        narration: { steps: koSteps },
        primaryPlayer: insideCentre,
        secondaryPlayer: carrier,
        events,
      };
    }

    events.push({ type: 'PASS_COMPLETED', passer: carrier });
    ballCarrier = insideCentre;
    defender = defendOnField.find(p => p.id === 12) ?? pickPlayer(defendTeam, 12);
  } else {
    // Wide Play: #10 → #13 → random of #11/#14
    const outsideCentre = attackOnField.find(p => p.id === 13) ?? pickPlayer(attackTeam, 13);

    // Obstruction roll — one chance per wide-play attempt, fired before the
    // first pass so a hit short-circuits the whole sequence. Offender: a
    // random screening forward. Modified by attackingStyle (wide_wide =
    // more screens, keep_it_tight = fewer). Defender is the opposite-13
    // (the player most directly affected by the screen).
    const obstructionPct = OBSTRUCTION_BASE_PCT + TACTIC_MODIFIERS.obstructionStyleMod[style];
    if (rng(1, 100) <= obstructionPct) {
      const attackFwds = availableForwards(attackTeam, state, attackSide);
      const offender = attackFwds.length > 0
        ? attackFwds[rng(0, attackFwds.length - 1)]
        : (attackOnField[0] ?? carrier);
      const obstructionDefender = defendOnField.find(p => p.id === 13) ?? (defendOnField[0] ?? pickPlayer(defendTeam, 13));
      events.push({ type: 'PENALTY_AWARDED', offence: 'obstruction', offender, offendingSide: attackSide });
      return {
        nextPhase: MatchPhase.Penalty,
        narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'obstruction_penalty', primary: offender, secondary: obstructionDefender }] },
        primaryPlayer: offender,
        secondaryPlayer: obstructionDefender,
        events,
      };
    }

    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'out_the_back', primary: carrier, secondary: outsideCentre });

    // Interception roll on the #10 → #13 pass.
    {
      const intPct = interceptPctBase - (carrier.currentStats.handling - 50) * 0.02;
      if (rng(1, 100) <= intPct) {
        const backs = defendOnField.filter(p => p.id >= 9);
        const interceptor = backs.length > 0
          ? backs[rng(0, backs.length - 1)]
          : (defendOnField[rng(0, Math.max(0, defendOnField.length - 1))] ?? randomPlayer(defendTeam));
        events.push({ type: 'INTERCEPTION', interceptor, passer: carrier, attackSide });
        events.push({ type: 'KICK_RETURN_CARRIER_SET', player: interceptor });
        events.push({ type: 'BREAKDOWN_MOD_SET', attack: INTERCEPTION_FOLLOW_UP_BONUS, defend: 0 });
        const intSteps: NarrationStep[] = [
          ...playIntroSteps,
          { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'interception', primary: interceptor, secondary: carrier },
        ];
        if (defensiveLine === 'blitz') {
          intSteps.push({ kind: 'tactic_note', cause: 'blitz_interception', chancePct: COMMENTARY_CHANCES.blitzInterception, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
        }
        return { nextPhase: MatchPhase.KickReturn, narration: { steps: intSteps }, primaryPlayer: interceptor, secondaryPlayer: carrier, events };
      }
    }

    if (outsideCentre.currentStats.handling + rng(1, 100) < knockOnThreshold(outsideCentre.currentStats.handling, state.clock.clockInTheRed) + pressureMod) {
      events.push({ type: 'KNOCK_ON', player: outsideCentre, attackSide });
      const koSteps: NarrationStep[] = [
        ...playIntroSteps,
        { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: outsideCentre, secondary: carrier },
      ];
      if (defensiveLine === 'blitz') {
        koSteps.push({ kind: 'tactic_note', cause: 'blitz_pressure_knockon', chancePct: COMMENTARY_CHANCES.blitzPressureKnockOn, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
      }
      return {
        nextPhase: MatchPhase.Scrum,
        narration: { steps: koSteps },
        primaryPlayer: outsideCentre,
        secondaryPlayer: carrier,
        events,
      };
    }

    events.push({ type: 'PASS_COMPLETED', passer: carrier });

    const wingPool = attackOnField.filter(p => p.id === 11 || p.id === 14);
    const wing = wingPool.length > 0 ? wingPool[rng(0, wingPool.length - 1)] : (attackOnField[rng(0, Math.max(0, attackOnField.length - 1))] ?? randomPlayer(attackTeam));
    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'out_the_back', primary: outsideCentre, secondary: wing });

    // Interception roll on the #13 → wing pass.
    {
      const intPct = interceptPctBase - (outsideCentre.currentStats.handling - 50) * 0.02;
      if (rng(1, 100) <= intPct) {
        const backs = defendOnField.filter(p => p.id >= 9);
        const interceptor = backs.length > 0
          ? backs[rng(0, backs.length - 1)]
          : (defendOnField[rng(0, Math.max(0, defendOnField.length - 1))] ?? randomPlayer(defendTeam));
        events.push({ type: 'INTERCEPTION', interceptor, passer: outsideCentre, attackSide });
        events.push({ type: 'KICK_RETURN_CARRIER_SET', player: interceptor });
        events.push({ type: 'BREAKDOWN_MOD_SET', attack: INTERCEPTION_FOLLOW_UP_BONUS, defend: 0 });
        const intSteps: NarrationStep[] = [
          ...playIntroSteps,
          { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'interception', primary: interceptor, secondary: outsideCentre },
        ];
        if (defensiveLine === 'blitz') {
          intSteps.push({ kind: 'tactic_note', cause: 'blitz_interception', chancePct: COMMENTARY_CHANCES.blitzInterception, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
        }
        return { nextPhase: MatchPhase.KickReturn, narration: { steps: intSteps }, primaryPlayer: interceptor, secondaryPlayer: outsideCentre, events };
      }
    }

    if (wing.currentStats.handling + rng(1, 100) < knockOnThreshold(wing.currentStats.handling, state.clock.clockInTheRed) + pressureMod) {
      events.push({ type: 'KNOCK_ON', player: wing, attackSide });
      const koSteps: NarrationStep[] = [
        ...playIntroSteps,
        { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: wing, secondary: outsideCentre },
      ];
      if (defensiveLine === 'blitz') {
        koSteps.push({ kind: 'tactic_note', cause: 'blitz_pressure_knockon', chancePct: COMMENTARY_CHANCES.blitzPressureKnockOn, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
      }
      return {
        nextPhase: MatchPhase.Scrum,
        narration: { steps: koSteps },
        primaryPlayer: wing,
        secondaryPlayer: outsideCentre,
        events,
      };
    }

    events.push({ type: 'PASS_COMPLETED', passer: outsideCentre });
    ballCarrier = wing;
    const defWingPool = defendOnField.filter(p => p.id === 11 || p.id === 14);
    defender = defWingPool.length > 0 ? defWingPool[rng(0, defWingPool.length - 1)] : (defendOnField[rng(0, Math.max(0, defendOnField.length - 1))] ?? randomPlayer(defendTeam));
  }

  // Step 3 — Evasion → Step 4 Collision (defensiveLine already hoisted)
  const ha = homeEdge(state, HOME_ADVANTAGE.carryMod);
  // Path-specific modifiers fire only on the crash-ball strike
  // (#10 → #12). Both collision AND evasion mods kick in: collision
  // shifts how many metres the defender concedes on contact; evasion
  // shifts how often the carrier beats the line entirely (which is
  // the only path to a try in this engine). On the wide-play branch
  // (#10 → #13 → wing) no path modifier — base mods alone.
  const pathCollisionMod = goCrashBall ? TACTIC_MODIFIERS.crashBallCollisionMod[defensiveLine] : 0;
  const pathEvasionMod   = goCrashBall ? TACTIC_MODIFIERS.crashBallEvasionMod[defensiveLine]   : 0;
  const dlEvasion   = TACTIC_MODIFIERS.defensiveLineEvasionMod[defensiveLine] + pathEvasionMod;
  const dlCollision = TACTIC_MODIFIERS.defensiveLineCollisionMod[defensiveLine] + pathCollisionMod;
  const res = resolveOpenPlay(
    ballCarrier, defender,
    attackMod + ha.attack,
    defendMod + backfieldPenalty + shortHandedMod + dlEvasion + ha.defend,
    dlCollision,
  );
  const direction = attackDir(state);

  if (res.outcome === 'line_break') {
    res.gainMetres += TACTIC_MODIFIERS.defensiveLineBreakBonus[defensiveLine];
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
  const outcomeSteps: NarrationStep[] = [...playIntroSteps];

  // Try check — any forward-progress carry whose projected ballX
  // crosses the attack-direction try line scores. Line breaks AND
  // dominant carries both qualify (a #12 crash that punches through
  // the line counts the same as a wide break). See OpenPlayEvent for
  // the full rationale.
  const projectedBallX = clamp(state.ball.x + direction * res.gainMetres, 0, 100);
  const canScore = res.outcome === 'line_break' || res.outcome === 'dominant_carry';
  const tryScored = canScore && isTryScoredAt(projectedBallX, attackSide, state.clock.halfTimeDone);

  if (tryScored) {
    nextPhase = MatchPhase.TryScored;
    const tryKey: 'line_break_try' | 'dominant_carry_try' =
      res.outcome === 'line_break' ? 'line_break_try' : 'dominant_carry_try';
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: tryKey, primary: ballCarrier, secondary: defender });
    const y = tryLandingY(attackTeam.tactics.attackingStyle);
    events.push({ type: 'BALL_REPOSITIONED', y });
    outcomeSteps.push({ kind: 'announcement', key: `try_location_${tryLocationBand(y)}` });
  } else if (res.outcome === 'line_break') {
    nextPhase = MatchPhase.Breakdown;
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'line_break', primary: ballCarrier, secondary: defender });
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
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'dominant_tackle', primary: ballCarrier, secondary: defender });
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
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: res.outcome, primary: ballCarrier, secondary: defender });
    if (defensiveLine === 'drift' && res.outcome === 'play_on') {
      outcomeSteps.push({
        kind: 'tactic_note',
        cause: 'drift_shepherd_to_touch',
        chancePct: COMMENTARY_CHANCES.driftShepherdToTouch,
        params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name },
      });
    }
  }

  // High-tackle check: applies on top of the carry result (carrier keeps the
  // metres — advantage law). Skipped on line breaks.
  if (res.outcome !== 'line_break' && tackleInfringement(defender) === 'high_tackle') {
    events.push({ type: 'PENALTY_AWARDED', offence: 'high_tackle', offender: defender, offendingSide: defSide });
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'high_tackle_penalty', primary: defender, secondary: ballCarrier });
    nextPhase = MatchPhase.Penalty;
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
