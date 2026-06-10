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
import { HOME_ADVANTAGE, HARD_CARRY_THRESHOLDS, CRASH_BALL_THRESHOLDS, CRASH_BALL_LINE_BREAK_METRES, TACTIC_MODIFIERS, COMMENTARY_CHANCES, SHORT_HANDED, knockOnPct, OBSTRUCTION_BASE_PCT, INTERCEPTION_BASE_PCT, INTERCEPTION_HANDLING_WEIGHT, INTERCEPTION_STAT_CENTRE, INTERCEPTION_FOLLOW_UP_BONUS, FIRST_PHASE_PASS_DISTANCE_M, FIRST_PHASE_CHOREOGRAPHIES, SWEEP_STYLE_MULT, TRY_LANDING_JITTER } from '../balance';
import { decideKick, buildKickTransition } from '../KickDecisionDirector';
import { SLOT, isBackSlot } from '../Slot';
import { tryOffloadChain } from './offloadChain';
import { effDefendingBreakdown, effBackfieldDefence, effDefensiveLine, effDisciplineScalar, effStyleScalar } from '../tacticsResolve';

const FULL_BACKLINE = 7;

export function handleFirstPhase({ state, attackTeam, defendTeam, randomPlayer, pickPlayer, silent }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const attackOnField = onFieldPlayers(attackTeam, state, attackSide);
  const goCrashBall = rng(1, 100) <= effStyleScalar(state, attackTeam, CRASH_BALL_THRESHOLDS);
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
        const carryEvt = res.events[carryIdx];
        if (carryEvt.type === 'CARRY_RESOLVED') {
          carryEvt.suppressBallMove = true;
        }
        const eventsBeforeCarry = res.events.slice(0, carryIdx);
        const eventsAfterCarry = res.events.slice(carryIdx);
        
        const filteredBefore = eventsBeforeCarry.filter((e: any) => e.type !== 'BALL_REPOSITIONED');
        
        res.events = [
          ...filteredBefore,
          ...authoredBallEvents,
          ...eventsAfterCarry
        ];
      } else {
        const hasPenalty = res.events.some((e: any) => e.type === 'PENALTY_AWARDED');
        if (!hasPenalty) {
          res.events.push(...authoredBallEvents);
        }
      }
    }

    // --- Dynamic Truncation ---
    let truncateT = 1.0;
    
    const firstCarryIdx = res.events.findIndex((e: any) => e.type === 'CARRY_RESOLVED');
    const firstKoIdx = res.events.findIndex((e: any) => e.type === 'KNOCK_ON');
    const firstIntIdx = res.events.findIndex((e: any) => e.type === 'INTERCEPTION');
    
    const isInitialKo = firstKoIdx !== -1 && (firstCarryIdx === -1 || firstKoIdx < firstCarryIdx);
    const isInitialInt = firstIntIdx !== -1 && (firstCarryIdx === -1 || firstIntIdx < firstCarryIdx);
    
    const koEvent = isInitialKo ? res.events[firstKoIdx] as Extract<MatchEvent, { type: 'KNOCK_ON' }> : null;
    const intEvent = isInitialInt ? res.events[firstIntIdx] as Extract<MatchEvent, { type: 'INTERCEPTION' }> : null;
    const carryEvent = firstCarryIdx !== -1 ? res.events[firstCarryIdx] as Extract<MatchEvent, { type: 'CARRY_RESOLVED' }> : null;

    if (koEvent || intEvent) {
      const receiverSlot = koEvent ? koEvent.player.id : (intEvent!.passer.id === SLOT.SCRUM_HALF ? SLOT.FLY_HALF : (goCrashBall ? SLOT.CENTRE_12 : SLOT.CENTRE_13));
      const targetSideStr = koEvent ? atkSideStr : defSideStr;
      const receiverChoreo = choreography.find(c => c.id === receiverSlot && c.side === targetSideStr);
      if (receiverChoreo && receiverChoreo.movements.length > 0) {
        let globalMinDist = 9999;
        for (const bk of authoredBallEvents) {
           const rk = receiverChoreo.movements.find(m => Math.abs(m.t - bk.t) < 0.05) || receiverChoreo.movements[0];
           const d = Math.hypot(bk.x - rk.x, bk.y - rk.y);
           if (d < globalMinDist) globalMinDist = d;
        }
        let minT = 1.0;
        for (const bk of authoredBallEvents) {
           const rk = receiverChoreo.movements.find(m => Math.abs(m.t - bk.t) < 0.05) || receiverChoreo.movements[0];
           const d = Math.hypot(bk.x - rk.x, bk.y - rk.y);
           if (d <= globalMinDist + 0.5) {
             minT = bk.t;
             break;
           }
        }
        truncateT = minT;
      }
    } else if (carryEvent) {
       // Ball-keyframe truncation: compute where the engine says the ball
       // should end up, then find the time in the authored ball path when
       // the ball crosses that x-position. The ball keyframes are already
       // in game coordinates (flipX + dx applied), so the directional
       // comparison with `dir` is always correct.
       const engineFinalX = clamp(state.ball.x + dir * carryEvent.metres, 0, 100);

       // First find when the carrier catches the ball so we don't truncate during the pass
       let catchT = 0;
       const carrierSlot = carryEvent.carrier.id;
       const carrierChoreo = choreography.find(c => c.id === carrierSlot && c.side === atkSideStr);
       if (carrierChoreo && carrierChoreo.movements.length > 0) {
         let globalMinDist = 9999;
         for (const bk of authoredBallEvents) {
            const ck = carrierChoreo.movements.find(m => Math.abs(m.t - bk.t) < 0.05) || carrierChoreo.movements[0];
            const d = Math.hypot(bk.x - ck.x, bk.y - ck.y);
            if (d < globalMinDist) globalMinDist = d;
         }
         for (const bk of authoredBallEvents) {
            const ck = carrierChoreo.movements.find(m => Math.abs(m.t - bk.t) < 0.05) || carrierChoreo.movements[0];
            const d = Math.hypot(bk.x - ck.x, bk.y - ck.y);
            if (d <= globalMinDist + 0.5) {
               catchT = bk.t;
               break;
            }
         }
       }

       if (authoredBallEvents.length > 1) {
         let prevBk = authoredBallEvents[0];
         let found = false;
         for (let i = 1; i < authoredBallEvents.length; i++) {
           const bk = authoredBallEvents[i];
           // Only look for crossings after the pass has reached the carrier
           if (prevBk.t >= catchT) {
             const crosses =
               (dir === 1  && prevBk.x <= engineFinalX && bk.x >= engineFinalX) ||
               (dir === -1 && prevBk.x >= engineFinalX && bk.x <= engineFinalX);
             if (crosses) {
               const totalDist = Math.abs(bk.x - prevBk.x);
               const neededDist = Math.abs(engineFinalX - prevBk.x);
               const frac = totalDist > 0 ? neededDist / totalDist : 0;
               truncateT = prevBk.t + (bk.t - prevBk.t) * frac;
               found = true;
               break;
             }
           }
           prevBk = bk;
         }
         if (!found) truncateT = 1.0;
       }
    }

    if (truncateT < 1.0) {
      // Interpolate keyframes exactly at truncateT before filtering
      for (const c of choreography) {
        let pCk = c.movements[0];
        for (const ck of c.movements) {
          if (ck.t >= truncateT) {
            if (ck.t > truncateT && pCk) {
              const frac = (truncateT - pCk.t) / (ck.t - pCk.t);
              c.movements.push({ t: truncateT, x: pCk.x + (ck.x - pCk.x) * frac, y: pCk.y + (ck.y - pCk.y) * frac });
            }
            break;
          }
          pCk = ck;
        }
      }
      
      let pBk = authoredBallEvents[0];
      let interpBk: any = null;
      for (const bk of authoredBallEvents) {
        if (bk.t >= truncateT) {
          if (bk.t > truncateT && pBk) {
            const frac = (truncateT - pBk.t) / (bk.t - pBk.t);
            interpBk = { type: 'BALL_REPOSITIONED', x: pBk.x + (bk.x - pBk.x) * frac, y: pBk.y + (bk.y - pBk.y) * frac, t: truncateT };
          }
          break;
        }
        pBk = bk;
      }

      if (interpBk) {
        const carryIdx2 = res.events.findIndex((e: any) => e.type === 'CARRY_RESOLVED');
        if (carryIdx2 !== -1) {
          res.events.splice(carryIdx2, 0, interpBk);
        }
        authoredBallEvents.push(interpBk);
      }

      res.events = res.events.filter((e: any) => e.type !== 'BALL_REPOSITIONED' || e.t === undefined || e.t <= truncateT);
      for (const e of res.events) {
        if (e.type === 'BALL_REPOSITIONED' && e.t !== undefined) {
          e.t = e.t / truncateT; // Scale t for WAAPI so ball syncs with player
        }
      }
      for (const c of choreography) {
         c.movements = c.movements.filter(m => m.t <= truncateT).sort((a, b) => a.t - b.t);
         for (const m of c.movements) m.t = m.t / truncateT; // Scale t for WAAPI
      }
      authoredBallEvents = authoredBallEvents.filter(e => e.t <= truncateT).sort((a, b) => a.t - b.t);
      for (const bk of authoredBallEvents) bk.t = bk.t / truncateT;
    }
    
    // --- Dynamic Offload Extension ---
    // If there were offload passes (or knock-ons from offloads), we procedurally 
    // add keyframes extending beyond the initial authored sequence.
    const hasOffloadAttempt = res.events.some((e: any) => e.type === 'OFFLOAD_ATTEMPTED');
    if (hasOffloadAttempt && carryEvent) {
      let currentT = 1.0; 
      
      const carries = res.events.filter((e): e is Extract<MatchEvent, { type: 'CARRY_RESOLVED' }> => e.type === 'CARRY_RESOLVED');
      const offloads = res.events.filter((e): e is Extract<MatchEvent, { type: 'OFFLOAD_ATTEMPTED' }> => e.type === 'OFFLOAD_ATTEMPTED');
      
      for (let i = 0; i < offloads.length; i++) {
        const offloadEvt = offloads[i];
        const catcher = offloadEvt.catcher;
        if (!catcher) continue;
        
        // NOTE: this block was previously dormant because `catcherSideStr` was 'home'/'away'
        // while `c.side` was 'h'/'a'. The crash it exposed (`carries[j]` undefined) was 
        // because `offloads` included BOTH 'OFFLOAD_COMPLETED' and 'OFFLOAD_ATTEMPTED',
        // doubling the array length and causing out-of-bounds indexing into `carries`.
        const catcherSideStr: string = offloadEvt.attackSide === 'home' ? 'h' : 'a';
        const catcherChoreo = choreography.find(c => c.id === catcher.id && c.side === catcherSideStr);
        if (!catcherChoreo || catcherChoreo.movements.length === 0) continue;
        
        const lastCatcherK = catcherChoreo.movements[catcherChoreo.movements.length - 1];
        
        // Ensure no forward pass (Checking Run). The catch happens after the
        // offloading carrier's carry, so the ball has advanced by carries[0..i].
        let previousMetres = 0;
        for (let j = 0; j <= i; j++) {
          previousMetres += carries[j].metres;
        }
        const engineCurrentX = clamp(state.ball.x + dir * previousMetres, 0, 100);
        
        if ((dir === 1 && lastCatcherK.x >= engineCurrentX) || (dir === -1 && lastCatcherK.x <= engineCurrentX)) {
          lastCatcherK.x = clamp(engineCurrentX - dir * 1.5, 0, 100);
        }
        
        // Pre-calculate final run position so we can intercept the player on the run
        let catchX = lastCatcherK.x;
        let catchY = lastCatcherK.y;
        let catcherFinalX = catchX;
        let catcherFinalY = catchY;
        
        // The catcher's own carry is the NEXT carry after the offloader's
        // (carries[i+1]). It is absent only when this offload was knocked on —
        // the chain returns before emitting a carry for the catcher — in which
        // case there is no forward run, just the pass to the (dropped) catch.
        const nextCarry = carries[i + 1];
        if (nextCarry) {
          let accumulatedMetres = 0;
          for (let j = 0; j <= i + 1; j++) {
            accumulatedMetres += carries[j].metres;
          }
          catcherFinalX = clamp(state.ball.x + dir * accumulatedMetres, 0, 100);
          
          // Player interpolates from lastCatcherK to catcherFinalX over 0.40s (0.15 + 0.25).
          // At t = 0.15 (catch time), they are at 37.5% of the distance.
          catchX = lastCatcherK.x + (catcherFinalX - lastCatcherK.x) * (0.15 / 0.40);
        }
        
        // 1. Pass the ball to the catcher's intercept point
        currentT += 0.15; 
        const passEvent = { type: 'BALL_REPOSITIONED' as const, x: catchX, y: catchY, t: currentT };
        
        const offloadIdx = res.events.indexOf(offloadEvt);
        if (offloadIdx !== -1) {
          res.events.splice(offloadIdx + 1, 0, passEvent);
        } else {
          authoredBallEvents.push(passEvent);
        }

        // 2. Catcher runs with the ball to the final tackle point. Skipped when
        // this offload was knocked on (no catcher carry — nextCarry is absent).
        if (nextCarry) {
          currentT += 0.25;

          catcherChoreo.movements.push({ t: currentT, x: catcherFinalX, y: catcherFinalY });
          const runEvent = { type: 'BALL_REPOSITIONED' as const, x: catcherFinalX, y: catcherFinalY, t: currentT };

          // The runEvent is the authoritative ball position for the catcher's
          // carry (catcherFinalX already includes its metres). Suppress the
          // CARRY_RESOLVED's own ball advance so it isn't double-counted on top
          // of the explicit keyframe — otherwise the ball overshoots the catcher
          // dot, which rests at catcherFinalX.
          nextCarry.suppressBallMove = true;

          const carryIdx = res.events.indexOf(nextCarry);
          if (carryIdx !== -1) {
            res.events.splice(carryIdx, 0, runEvent);
          } else {
            authoredBallEvents.push(runEvent);
          }
        }
      }
      
      const maxT = currentT;
      if (maxT > 1.0) {
        for (const e of res.events) {
          if (e.type === 'BALL_REPOSITIONED' && e.t !== undefined) e.t /= maxT;
        }
        for (const c of choreography) {
          for (const m of c.movements) m.t /= maxT;
        }
        for (const bk of authoredBallEvents) bk.t /= maxT;
      }
    }

    if (res.nextPhase === MatchPhase.TryScored) {
      // authoredBallEvents has already been truncated + rescaled above (the last
      // entry is the interpolated boundary point at the truncation), so its final
      // entry IS the authentic grounding position. Re-filtering here with the
      // pre-rescale truncateT would chop off that final entry and snap the try Y
      // (and conversion alignment) back to a mid-path keyframe.
      if (authoredBallEvents.length > 0) {
        let finalY = authoredBallEvents[authoredBallEvents.length - 1].y;
        for (const e of res.events) {
          if (e.type === 'BALL_REPOSITIONED' && e.y !== undefined) finalY = e.y;
        }

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
  const defensiveLine = effDefensiveLine(state, defendTeam);
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

  const backfieldPenalty = TACTIC_MODIFIERS.backfieldLineBreakPenalty[effBackfieldDefence(state, defendTeam)];
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
    const sweepsTo100 = state.ball.y <= 50; // matches openSideDir's nearTouch tie-break at y=50
    const targetSlot = (attacksTop === sweepsTo100) ? SLOT.WING_14 : SLOT.WING_11;
    const wideReceiver = wings.find(p => p.id === targetSlot) ?? wings[0] ?? attackOnField[0] ?? attackTeam.players[0];

    // Obstruction roll — one chance per wide-play attempt, fired before the
    // first pass so a hit short-circuits the whole sequence. Offender: a
    // random screening forward. Modified by attackingStyle (wide_wide =
    // more screens, keep_it_tight = fewer). Defender is the opposite-13
    // (the player most directly affected by the screen).
    const obstructionPct = OBSTRUCTION_BASE_PCT + effStyleScalar(state, attackTeam, TACTIC_MODIFIERS.obstructionStyleMod);
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
  const baseDefendMod = defendMod + backfieldPenalty + shortHandedMod + dlEvasion + TACTIC_MODIFIERS.defendingBreakdownTackleMod[effDefendingBreakdown(state, defendTeam)] + ha.defend + ttDef.defend * ttDefFrac;
  let res = resolveOpenPlay(ballCarrier, defender, baseAttackMod, baseDefendMod, dlCollision + tlBonus.collision);
  const direction = attackDir(state);

  // Crash-ball line breaks are contained by the converging fullback + flanker
  // — re-roll gain into the tighter channel range.
  if (goCrashBall && res.outcome === 'line_break') {
    res.gainMetres = rng(CRASH_BALL_LINE_BREAK_METRES[0], CRASH_BALL_LINE_BREAK_METRES[1]);
  }

  let chainNarration: NarrationStep[] = [];
  let chainMetres = 0;
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
    chainMetres = chain.chainMetres;
  }

  if (res.outcome === 'line_break') {
    res.gainMetres += TACTIC_MODIFIERS.defensiveLineBreakBonus[defensiveLine];
  }

  // Try check hoisted above CARRY_RESOLVED so the cover-tackler pick can
  // be gated on a non-try line break. Include chainMetres so offload-chain
  // gains don't cause the projected position to undershoot the try line.
  const projectedBallX = clamp(state.ball.x + direction * (chainMetres + res.gainMetres), 0, 100);
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
    lateralStep = emitSweepHops(events, state, effStyleScalar(state, attackTeam, SWEEP_STYLE_MULT), passCount, true, attackTeam.name, !silent, true, FIRST_PHASE_PASS_DISTANCE_M);
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
    const y = tryLandingY(state, effStyleScalar(state, attackTeam, TRY_LANDING_JITTER));
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
        params: { defendTeamName: defendTeam.name, backfieldDefence: effBackfieldDefence(state, defendTeam) },
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
  if (res.outcome !== 'line_break' && tackleInfringement(defender, effDisciplineScalar(defendTeam, TACTIC_MODIFIERS.disciplineHighTackleMod)) === 'high_tackle') {
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
