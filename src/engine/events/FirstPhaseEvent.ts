import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { tackleInfringement } from '../resolvers/TackleInfringementResolver';
import { tryLandingY, tryLocationBand } from '../resolvers/TryLocationResolver';
import { attackDir, isTryScoredAt, onFieldPlayers, availableBacks, availableForwards, pickCoverDefender, pickPrimaryDefender, pickAssistTackler, tryLineDefenceBonus } from '../FieldPosition';
import { emitSweepHops } from '../Lateral';
import { homeEdge } from '../HomeAdvantage';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { HOME_ADVANTAGE, HARD_CARRY_THRESHOLDS, CRASH_BALL_THRESHOLDS, CRASH_BALL_LINE_BREAK_METRES, TACTIC_MODIFIERS, COMMENTARY_CHANCES, SHORT_HANDED, knockOnPct, OBSTRUCTION_BASE_PCT, INTERCEPTION_BASE_PCT, INTERCEPTION_HANDLING_WEIGHT, INTERCEPTION_STAT_CENTRE, INTERCEPTION_FOLLOW_UP_BONUS, FIRST_PHASE_PASS_DISTANCE_M, FIRST_PHASE_CHOREOGRAPHIES } from '../balance';
import { decideKick, buildKickTransition } from '../KickDecisionDirector';
import { SLOT, isBackSlot } from '../Slot';
import { tryOffloadChain } from './offloadChain';

const FULL_BACKLINE = 7;

export function handleFirstPhase({ state, attackTeam, defendTeam, randomPlayer, pickPlayer, silent }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const attackOnField = onFieldPlayers(attackTeam, state, attackSide);
  const style = attackTeam.tactics.attackingStyle;
  const goCrashBall = rng(1, 100) <= CRASH_BALL_THRESHOLDS[style];
  const playType = goCrashBall ? 'crash_ball' : 'out_the_back';


  // Helper to apply uploaded choreography
  function applyChoreography(res: PhaseResult, playType: string, directionOverride?: number): PhaseResult {
    const choreoKey = playType;
    const parsedChoreo = FIRST_PHASE_CHOREOGRAPHIES[choreoKey];
    
    if (!parsedChoreo) return res;

    const choreography: PhaseResult['choreography'] = [];
    const dir = directionOverride ?? attackDir(state);
    const attacksTop = dir === 1;
    const nearTop = state.ball.y >= 50;
    
    const flipX = parsedChoreo.authoredAttacksTop !== attacksTop;
    const flipY = parsedChoreo.authoredNearTop !== nearTop;

    const atkSideStr = attackSide === 'home' ? 'h' : 'a';
    const defSideStr = attackSide === 'home' ? 'a' : 'h';

    const anchorX = flipX ? 100 - parsedChoreo.authoredAnchorX : parsedChoreo.authoredAnchorX;
    const anchorY = flipY ? 100 - parsedChoreo.authoredAnchorY : parsedChoreo.authoredAnchorY;
    
    const dx = state.ball.x - anchorX;
    const dy = state.ball.y - anchorY;

    let authoredBallEvents: any[] = [];

    for (const ent of parsedChoreo.entities) {
      if (ent.id === 'ball') {
        for (let i = 1; i < ent.kf.length; i++) {
          const kf = ent.kf[i];
          let x = kf.x;
          if (flipX) x = 100 - x;
          let y = kf.y;
          if (flipY) y = 100 - y;
          
          x += dx;
          y += dy;
          
          authoredBallEvents.push({ type: 'BALL_REPOSITIONED', x: clamp(x, 0, 100), y: clamp(y, 0, 100), t: kf.t });
        }
        continue;
      }
      
      const authoredSideChar = ent.id.charAt(0);
      let authoredSlot = parseInt(ent.id.substring(1), 10);
      
      if (isNaN(authoredSlot)) continue;

      // Skip forwards in the choreography payload so they don't get animated
      // to 0,0 (unplaced) and override the base set-piece UI layout.
      if (authoredSlot >= 1 && authoredSlot <= 8) continue;

      const swapLateral = flipX !== flipY;
      if (swapLateral) {
        if (authoredSlot === 11) authoredSlot = 14;
        else if (authoredSlot === 14) authoredSlot = 11;
        else if (authoredSlot === 1) authoredSlot = 3;
        else if (authoredSlot === 3) authoredSlot = 1;
        else if (authoredSlot === 6) authoredSlot = 7;
        else if (authoredSlot === 7) authoredSlot = 6;
      }

      const isAuthoredAtk = (authoredSideChar === 'h' && parsedChoreo.authoredAttackingKind === 'home') ||
                            (authoredSideChar === 'a' && parsedChoreo.authoredAttackingKind === 'away');
                            
      const realSideStr = isAuthoredAtk ? atkSideStr : defSideStr;

      const movements = ent.kf.map(kf => {
        let x = kf.x;
        if (flipX) x = 100 - x;

        let y = kf.y;
        if (flipY) y = 100 - y;

        x += dx;
        y += dy;

        return { x: clamp(x, 0, 100), y: clamp(y, 0, 100), t: kf.t };
      });

      choreography.push({
        side: realSideStr as 'h' | 'a',
        id: authoredSlot,
        movements,
      });
    }

    if (authoredBallEvents.length > 0) {
      const carryIdx = res.events.findIndex((e: any) => e.type === 'CARRY_RESOLVED');
      if (carryIdx !== -1) {
        const eventsBeforeCarry = res.events.slice(0, carryIdx);
        const eventsAfterCarry = res.events.slice(carryIdx);
        
        const filteredBefore = eventsBeforeCarry.filter((e: any) => e.type !== 'BALL_REPOSITIONED');
        
        res.events = [
          ...filteredBefore,
          ...authoredBallEvents,
          ...eventsAfterCarry
        ];
      } else {
        res.events.push(...authoredBallEvents);
      }
    }


    // --- Dynamic Truncation ---
    let truncateT = 1.0;
    const koEvent = res.events.find((e: any) => e.type === 'KNOCK_ON') as any;
    const intEvent = res.events.find((e: any) => e.type === 'INTERCEPTION') as any;
    const carryEvent = res.events.find((e: any) => e.type === 'CARRY_RESOLVED') as any;

    if (koEvent || intEvent) {
      const receiverSlot = koEvent ? koEvent.player.id : (intEvent.passer.id === SLOT.SCRUM_HALF ? SLOT.FLY_HALF : (goCrashBall ? SLOT.CENTRE_12 : SLOT.CENTRE_13));
      let mappedSlot = receiverSlot;
      const swapLateral = flipX !== flipY;
      if (swapLateral) {
         if (mappedSlot === 11) mappedSlot = 14;
         else if (mappedSlot === 14) mappedSlot = 11;
         else if (mappedSlot === 1) mappedSlot = 3;
         else if (mappedSlot === 3) mappedSlot = 1;
         else if (mappedSlot === 6) mappedSlot = 7;
         else if (mappedSlot === 7) mappedSlot = 6;
      }
      
      const receiverChoreo = choreography.find(c => c.id === mappedSlot);
      if (receiverChoreo && receiverChoreo.movements.length > 0) {
        let minT = 0;
        let minDist = 9999;
        for (const bk of authoredBallEvents) {
           const rk = receiverChoreo.movements.find(m => m.t === bk.t) || receiverChoreo.movements[0];
           const d = Math.hypot(bk.x - rk.x, bk.y - rk.y);
           if (d < minDist) {
             minDist = d;
             minT = bk.t;
           }
        }
        truncateT = minT;
      }
    } else if (carryEvent && carryEvent.outcome !== 'line_break') {
       let mappedSlot = carryEvent.carrier.id;
       const swapLateral = flipX !== flipY;
       if (swapLateral) {
         if (mappedSlot === 11) mappedSlot = 14;
         else if (mappedSlot === 14) mappedSlot = 11;
         else if (mappedSlot === 1) mappedSlot = 3;
         else if (mappedSlot === 3) mappedSlot = 1;
         else if (mappedSlot === 6) mappedSlot = 7;
         else if (mappedSlot === 7) mappedSlot = 6;
       }
       const carrierChoreo = choreography.find(c => c.id === mappedSlot);
       if (carrierChoreo && carrierChoreo.movements.length > 0) {
         let catchT = 0;
         let minDist = 9999;
         let catchX = 0;
         for (const bk of authoredBallEvents) {
            const ck = carrierChoreo.movements.find(m => m.t === bk.t) || carrierChoreo.movements[0];
            const d = Math.hypot(bk.x - ck.x, bk.y - ck.y);
            if (d < minDist) {
               minDist = d;
               catchT = bk.t;
               catchX = ck.x;
            }
         }
         const targetX = catchX + dir * carryEvent.metres;
         let reachedT = catchT;
         for (const ck of carrierChoreo.movements) {
            if (ck.t >= catchT) {
               if ((dir === 1 && ck.x >= targetX) || (dir === -1 && ck.x <= targetX)) {
                  reachedT = ck.t;
                  break;
               }
               reachedT = ck.t;
            }
         }
         truncateT = reachedT;
       }
    }

    if (truncateT < 1.0) {
      res.events = res.events.filter((e: any) => e.type !== 'BALL_REPOSITIONED' || e.t === undefined || e.t <= truncateT);
      for (const c of choreography) {
         c.movements = c.movements.filter(m => m.t <= truncateT);
      }
    }

    if (res.nextPhase === MatchPhase.TryScored) {
      const finalBallEvents = authoredBallEvents.filter(e => e.t <= truncateT);
      if (finalBallEvents.length > 0) {
        const finalY = finalBallEvents[finalBallEvents.length - 1].y;
        
        const tryRepoEvent = res.events.find((e: any) => e.type === 'BALL_REPOSITIONED' && e.t === undefined) as any;
        if (tryRepoEvent) {
          tryRepoEvent.y = finalY;
        }
        
        if (res.narration && res.narration.steps) {
          const tryLocStep = res.narration.steps.find((s: any) => s.kind === 'announcement' && typeof s.key === 'string' && s.key.startsWith('try_location_'));
          if (tryLocStep) {
            (tryLocStep as any).key = `try_location_${tryLocationBand(finalY)}`;
          }
        }
      }
    }

    return { ...res, choreography };

  }

  // Step 0 — Kick or carry decision (see KickDecisionDirector)
  const decision = decideKick({ state, attackTeam, attackOnField });
  if (decision.kick) {
    const res = buildKickTransition(decision, MatchPhase.FirstPhase, { state, attackTeam, attackOnField });
    return applyChoreography(res, 'kick_decision', attackDir(state));
  }

  // Step 1 — Carrier is always #10 (fly-half); handling gate
  const defSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';
  const defendOnField = onFieldPlayers(defendTeam, state, defSide);
  const carrier   = attackOnField.find(p => p.id === SLOT.FLY_HALF) ?? attackOnField[0] ?? attackTeam.players[0];
  const scrumHalf = attackOnField.find(p => p.id === SLOT.SCRUM_HALF) ?? attackOnField[0] ?? attackTeam.players[0];



  // Defensive line drives the per-pass interception probability and the
  // handling-gate pressure modifier. Hoisted up here so every pass site +
  // gate site below sees the same value.
  const defensiveLine = defendTeam.tactics.defensiveLine;
  const pressureMod   = TACTIC_MODIFIERS.defensiveLineHandlingPressure[defensiveLine];
  const interceptPctBase = INTERCEPTION_BASE_PCT + TACTIC_MODIFIERS.interceptionMod[defensiveLine];

  const events: MatchEvent[] = [];
  // Backline passes on the carry path — drives the per-pass lateral hop count.
  let passCount = 0;

  // Scrum-half → fly-half interception roll. Off the set piece this is
  // the first pass; off-target the ball lands at the interceptor's feet.
  {
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
        { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'interception', primary: interceptor, secondary: scrumHalf },
      ];
      if (defensiveLine === 'blitz') {
        intSteps.push({ kind: 'tactic_note', cause: 'blitz_interception', chancePct: COMMENTARY_CHANCES.blitzInterception, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
      }
      return applyChoreography({
      nextPhase: MatchPhase.KickReturn, narration: { steps: intSteps }, primaryPlayer: interceptor, secondaryPlayer: scrumHalf, events }, playType);
    }
    events.push({ type: 'PASS_COMPLETED', passer: scrumHalf });
    passCount++;
  }

  const { attack: attackMod, defend: defendMod } = state.breakdownMod;
  events.push({ type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 });

  const backfieldPenalty = TACTIC_MODIFIERS.backfieldLineBreakPenalty[defendTeam.tactics.backfieldDefence];
  const missingBacks = FULL_BACKLINE - availableBacks(defendTeam, state, defSide).length;
  const shortHandedMod = missingBacks * SHORT_HANDED.missingBackDefendPenalty;

  if (rng(1, 100) <= knockOnPct(carrier.currentStats.handling, state.clock.clockInTheRed) + pressureMod) {
    events.push({ type: 'KNOCK_ON', player: carrier, attackSide });
    const defender = defendOnField.length > 0 ? defendOnField[rng(0, defendOnField.length - 1)] : randomPlayer(defendTeam);
    const koSteps: NarrationStep[] = [
      { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: carrier, secondary: defender },
    ];
    if (defensiveLine === 'blitz') {
      koSteps.push({ kind: 'tactic_note', cause: 'blitz_pressure_knockon', chancePct: COMMENTARY_CHANCES.blitzPressureKnockOn, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
    }
    return applyChoreography({
      nextPhase: MatchPhase.Scrum,
      narration: { steps: koSteps },
      primaryPlayer: carrier,
      secondaryPlayer: defender,
      events,
    }, playType);
  }

  // Step 2 — Crash Ball or Wide Play
  let ballCarrier;
  let defender;
  // Structural pass steps prefix the outcome step in the descriptor (mirrors
  // the playIntro string concatenation in the previous implementation).
  const playIntroSteps: NarrationStep[] = [];

  if (goCrashBall) {
    // Crash Ball: #10 → #12 (inside centre)
    const insideCentre = attackOnField.find(p => p.id === SLOT.CENTRE_12) ?? attackOnField[0] ?? attackTeam.players[0];
    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'crash_ball', primary: carrier, secondary: insideCentre });

    // Interception roll on the #10 → #12 pass.
    {
      const intPct = interceptPctBase - (carrier.currentStats.handling - INTERCEPTION_STAT_CENTRE) * INTERCEPTION_HANDLING_WEIGHT;
      if (rng(1, 100) <= intPct) {
        const backs = defendOnField.filter(p => isBackSlot(p.id));
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
        return applyChoreography({
      nextPhase: MatchPhase.KickReturn, narration: { steps: intSteps }, primaryPlayer: interceptor, secondaryPlayer: carrier, events }, playType);
      }
    }

    if (rng(1, 100) <= knockOnPct(insideCentre.currentStats.handling, state.clock.clockInTheRed) + pressureMod) {
      events.push({ type: 'KNOCK_ON', player: insideCentre, attackSide });
      const koSteps: NarrationStep[] = [
        ...playIntroSteps,
        { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: insideCentre, secondary: carrier },
      ];
      if (defensiveLine === 'blitz') {
        koSteps.push({ kind: 'tactic_note', cause: 'blitz_pressure_knockon', chancePct: COMMENTARY_CHANCES.blitzPressureKnockOn, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
      }
      return applyChoreography({
      nextPhase: MatchPhase.Scrum,
        narration: { steps: koSteps },
        primaryPlayer: insideCentre,
        secondaryPlayer: carrier,
        events,
    }, playType);
    }

    events.push({ type: 'PASS_COMPLETED', passer: carrier });
    passCount++;
    ballCarrier = insideCentre;
    // Channel-aware: crash-ball carrier is #12 (midfield channel) — defender
    // is weighted across opposite 12/13 plus back-row support.
    defender = pickPrimaryDefender(defendTeam, state, defSide, ballCarrier);
  } else {
    // Wide Play: #10 → #13 → correct wing based on sweep
    const outsideCentre = attackOnField.find(p => p.id === SLOT.CENTRE_13) ?? attackOnField[0] ?? attackTeam.players[0];

    const wings = attackOnField.filter(p => p.id === SLOT.WING_11 || p.id === SLOT.WING_14);
    const attacksTop = attackDir(state) === 1;
    const sweepsTo100 = state.ball.y < 50; // because nearY = 0, sweeps to 100
    const targetSlot = (attacksTop === sweepsTo100) ? SLOT.WING_14 : SLOT.WING_11;
    const wideReceiver = wings.find(p => p.id === targetSlot) ?? wings[0] ?? attackOnField[0] ?? attackTeam.players[0];

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
      const obstructionDefender = defendOnField.find(p => p.id === SLOT.CENTRE_13) ?? (defendOnField[0] ?? pickPlayer(defendTeam, SLOT.CENTRE_13));
      events.push({ type: 'PENALTY_AWARDED', offence: 'obstruction', offender, offendingSide: attackSide });
      return applyChoreography({
      nextPhase: MatchPhase.Penalty,
        narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'obstruction_penalty', primary: offender, secondary: obstructionDefender }] },
        primaryPlayer: offender,
        secondaryPlayer: obstructionDefender,
        events,
    }, playType);
    }

    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'out_the_back', primary: carrier, secondary: outsideCentre });

    // Interception roll on the #10 → #13 pass.
    {
      const intPct = interceptPctBase - (carrier.currentStats.handling - INTERCEPTION_STAT_CENTRE) * INTERCEPTION_HANDLING_WEIGHT;
      if (rng(1, 100) <= intPct) {
        const backs = defendOnField.filter(p => isBackSlot(p.id));
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
        return applyChoreography({
      nextPhase: MatchPhase.KickReturn, narration: { steps: intSteps }, primaryPlayer: interceptor, secondaryPlayer: carrier, events }, playType);
      }
    }

    if (rng(1, 100) <= knockOnPct(outsideCentre.currentStats.handling, state.clock.clockInTheRed) + pressureMod) {
      events.push({ type: 'KNOCK_ON', player: outsideCentre, attackSide });
      const koSteps: NarrationStep[] = [
        ...playIntroSteps,
        { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: outsideCentre, secondary: carrier },
      ];
      if (defensiveLine === 'blitz') {
        koSteps.push({ kind: 'tactic_note', cause: 'blitz_pressure_knockon', chancePct: COMMENTARY_CHANCES.blitzPressureKnockOn, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
      }
      return applyChoreography({
      nextPhase: MatchPhase.Scrum,
        narration: { steps: koSteps },
        primaryPlayer: outsideCentre,
        secondaryPlayer: carrier,
        events,
    }, playType);
    }

    events.push({ type: 'PASS_COMPLETED', passer: carrier });
    passCount++;

    playIntroSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'wide_pass', primary: outsideCentre, secondary: wideReceiver });



    // Interception roll on the #13 → wing pass.
    {
      const intPct = interceptPctBase - (outsideCentre.currentStats.handling - INTERCEPTION_STAT_CENTRE) * INTERCEPTION_HANDLING_WEIGHT;
      if (rng(1, 100) <= intPct) {
        const backs = defendOnField.filter(p => isBackSlot(p.id));
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
        return applyChoreography({
      nextPhase: MatchPhase.KickReturn, narration: { steps: intSteps }, primaryPlayer: interceptor, secondaryPlayer: outsideCentre, events }, playType);
      }
    }

    if (rng(1, 100) <= knockOnPct(wideReceiver.currentStats.handling, state.clock.clockInTheRed) + pressureMod) {
      events.push({ type: 'KNOCK_ON', player: wideReceiver, attackSide });
      const koSteps: NarrationStep[] = [
        ...playIntroSteps,
        { kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'knock_on', primary: wideReceiver, secondary: outsideCentre },
      ];
      if (defensiveLine === 'blitz') {
        koSteps.push({ kind: 'tactic_note', cause: 'blitz_pressure_knockon', chancePct: COMMENTARY_CHANCES.blitzPressureKnockOn, params: { defendTeamName: defendTeam.name, attackTeamName: attackTeam.name } });
      }
      return applyChoreography({
      nextPhase: MatchPhase.Scrum,
        narration: { steps: koSteps },
        primaryPlayer: wideReceiver,
        secondaryPlayer: outsideCentre,
        events,
    }, playType);
    }

    events.push({ type: 'PASS_COMPLETED', passer: outsideCentre });
    passCount++;
    ballCarrier = wideReceiver;
    // Channel-aware: wide-play carrier is a wing — defender weighted across
    // opposite wing / fullback / outside centre.
    defender = pickPrimaryDefender(defendTeam, state, defSide, ballCarrier);
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
  const tlBonus = tryLineDefenceBonus(state);
  const gameMinute = state.clock.gameMinute;
  const ttAttack = state.teamTalkMod[attackSide];
  const ttDef    = state.teamTalkMod[defSide];
  const ttAttackFrac = ttAttack.decayMinutes > 0 ? Math.max(0, 1 - (gameMinute - ttAttack.startMinute) / ttAttack.decayMinutes) : 0;
  const ttDefFrac    = ttDef.decayMinutes > 0    ? Math.max(0, 1 - (gameMinute - ttDef.startMinute)    / ttDef.decayMinutes)    : 0;
  const fpSo = state.teamTalkMod.singleOut;
  const fpSoFrac = fpSo && fpSo.decayMinutes > 0 ? Math.max(0, 1 - (gameMinute - fpSo.startMinute) / fpSo.decayMinutes) : 0;
  const fpSingleOutBonus = fpSo && fpSo.side === attackSide && fpSo.playerId === ballCarrier.id ? fpSo.bonus * fpSoFrac : 0;
  const baseAttackMod = attackMod + ha.attack + tlBonus.evasion + ttAttack.attack * ttAttackFrac + fpSingleOutBonus;
  const baseDefendMod = defendMod + backfieldPenalty + shortHandedMod + dlEvasion + TACTIC_MODIFIERS.defendingBreakdownTackleMod[defendTeam.tactics.defendingBreakdown] + ha.defend + ttDef.defend * ttDefFrac;
  let res = resolveOpenPlay(ballCarrier, defender, baseAttackMod, baseDefendMod, dlCollision + tlBonus.collision);
  const direction = attackDir(state);

  // Crash-ball line breaks are contained by the converging fullback + flanker
  // — re-roll gain into the tighter channel range.
  if (goCrashBall && res.outcome === 'line_break') {
    res.gainMetres = rng(CRASH_BALL_LINE_BREAK_METRES[0], CRASH_BALL_LINE_BREAK_METRES[1]);
  }

  let chainNarration: NarrationStep[] = [];
  if (res.outcome !== 'line_break') {
    const chain = tryOffloadChain({
      state, attackTeam, defendTeam, attackSide, defSide,
      phase: MatchPhase.FirstPhase,
      initialRes: res, initialCarrier: ballCarrier, initialDefender: defender,
      baseAttackMod, baseDefendMod, dlCollision, direction,
    });
    events.push(...chain.chainEvents);
    if (chain.knockedOn) {
      return applyChoreography({
      nextPhase: MatchPhase.Scrum,
        narration: { steps: [...playIntroSteps, ...chain.chainNarration] },
        primaryPlayer: chain.finalCarrier,
        secondaryPlayer: chain.finalDefender,
        events,
    }, playType);
    }
    res = chain.finalRes;
    ballCarrier = chain.finalCarrier;
    defender = chain.finalDefender;
    chainNarration = chain.chainNarration;
  }

  if (res.outcome === 'line_break') {
    res.gainMetres += TACTIC_MODIFIERS.defensiveLineBreakBonus[defensiveLine];
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

  // First phase off a set piece: the ball sweeps to the open side one hop per
  // backline pass (oriented open-side), THEN the carrier drives forward — so the
  // keyframe path reads "across the line, then upfield". Emitted before the carry
  // so the lateral legs precede the x-advance. Try path keeps its tryLandingY
  // grounding below (no per-pass hops on a score).
  let lateralStep: NarrationStep | null = null;
  if (!tryScored) {
    // orient=true (set-piece exit) and scrumHalfFirst=true so the first hop uses
    // the wider SH pass distribution (10-20m) rather than the short backline range.
    lateralStep = emitSweepHops(events, state, attackTeam.tactics.attackingStyle, passCount, true, attackTeam.name, !silent, true, FIRST_PHASE_PASS_DISTANCE_M);
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
  const outcomeSteps: NarrationStep[] = [...playIntroSteps, ...chainNarration];

  if (tryScored) {
    nextPhase = MatchPhase.TryScored;
    const tryKey: 'line_break_try' | 'dominant_carry_try' =
      res.outcome === 'line_break' ? 'line_break_try' : 'dominant_carry_try';
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: tryKey, primary: ballCarrier, secondary: defender });
    const y = tryLandingY(state, attackTeam.tactics.attackingStyle);
    events.push({ type: 'BALL_REPOSITIONED', y });
    outcomeSteps.push({ kind: 'announcement', key: `try_location_${tryLocationBand(y)}` });
  } else if (res.outcome === 'line_break') {
    nextPhase = MatchPhase.Breakdown;
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'line_break', primary: ballCarrier, secondary: defender });
    if (coverTackler) {
      outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'cover_tackle', primary: ballCarrier, secondary: coverTackler });
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
  if (res.outcome !== 'line_break' && tackleInfringement(defender, TACTIC_MODIFIERS.disciplineHighTackleMod[defendTeam.tactics.discipline]) === 'high_tackle') {
    events.push({ type: 'PENALTY_AWARDED', offence: 'high_tackle', offender: defender, offendingSide: defSide });
    outcomeSteps.push({ kind: 'phase_outcome', phase: MatchPhase.FirstPhase, key: 'high_tackle_penalty', primary: defender, secondary: ballCarrier });
    nextPhase = MatchPhase.Penalty;
  }

  // Lateral flavour rides on a normal continuation only — not after a penalty/try.
  if (lateralStep && nextPhase === MatchPhase.Breakdown) outcomeSteps.push(lateralStep);

  const baseRes: PhaseResult = {
    nextPhase,
    narration: { steps: outcomeSteps },
    primaryPlayer: ballCarrier,
    secondaryPlayer: tryScored ? undefined : (res.outcome === 'line_break' ? coverTackler : defender),
    outcome: res.outcome,
    carrierFromStart: false,
    events,
  };

  return applyChoreography(baseRes, playType, direction);
}
