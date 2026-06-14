import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import { MatchPhase } from '../../types/engine';
import { resolveOpenPlay, resolveOpenPlaySpatial } from '../resolvers/OpenPlayResolver';
import { runCarrySim, seedWorld } from '../spatial/CarrySim';
import type { CarrySimResult } from '../spatial/CarrySim';
import { selectPlay, selectChannel } from '../playSelection';
import { tackleInfringement } from '../resolvers/TackleInfringementResolver';
import { tryLandingY, tryLocationBand } from '../resolvers/TryLocationResolver';
import { attackDir, isTryScoredAt, onFieldPlayers, availableBacks, availableForwards, pickCoverDefender, breaksCover, pickPrimaryDefender, pickAssistTackler, tryLineDefenceBonus } from '../FieldPosition';
import { emitSweepHops } from '../Lateral';
import { homeEdge } from '../HomeAdvantage';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { HOME_ADVANTAGE, HARD_CARRY_THRESHOLDS, CRASH_BALL_THRESHOLDS, CRASH_BALL_LINE_BREAK_METRES, BACKFIELD_COUNT, EVASION, GAP_BREAK, TACTIC_MODIFIERS, COMMENTARY_CHANCES, SHORT_HANDED, knockOnPct, OBSTRUCTION_BASE_PCT, INTERCEPTION_BASE_PCT, INTERCEPTION_HANDLING_WEIGHT, INTERCEPTION_STAT_CENTRE, INTERCEPTION_FOLLOW_UP_BONUS, FIRST_PHASE_PASS_DISTANCE_M, FIRST_PHASE_CHOREOGRAPHIES, SWEEP_STYLE_MULT, TRY_LANDING_JITTER } from '../balance';
import { decideKick, buildKickTransition } from '../KickDecisionDirector';
import { SLOT, isBackSlot } from '../Slot';
import { tryOffloadChain } from './offloadChain';
import { applyFirstPhaseChoreography } from '../choreography/applyChoreography';
import { effDefendingBreakdown, effBackfieldDefence, effDefensiveLine, effDisciplineScalar, effStyleScalar, effAttackingStyle } from '../tacticsResolve';

// Collapse consecutive duplicate slots in a pass chain (the spatial sweep reads it
// as one pass per distinct receiver) — mirror of the helper in OpenPlayEvent.
function dedupeChain(chain: number[]): number[] {
  const out: number[] = [];
  for (const s of chain) if (out.length === 0 || out[out.length - 1] !== s) out.push(s);
  return out;
}

const FULL_BACKLINE = 7;

export function handleFirstPhase({ state, attackTeam, defendTeam, randomPlayer, pickPlayer, silent, spatial, world, worldContinuation }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const attackOnField = onFieldPlayers(attackTeam, state, attackSide);
  const goCrashBall = rng(1, 100) <= effStyleScalar(state, attackTeam, CRASH_BALL_THRESHOLDS);
  const playType = goCrashBall ? 'crash_ball' : 'out_the_back';

  // Cold-entry formation seed (Upgrade.md § 3; WP6 — FirstPhase is now spatial).
  // A FirstPhase beat always follows a staged set piece (Scrum/Lineout) that left
  // the World dirty, so it is a FRESH beat: snap the World into a believable strike
  // shape BEFORE any branch reads it (mirrors handlePhasePlay). carrierSlot defaults
  // to the scrum-half — the actual carry re-solves its corridor for the real strike
  // carrier inside runCarrySim; this only gets agents OFF the ball into shape. No rng
  // draw happens in seedWorld, so determinism is untouched.
  if (spatial && world && !worldContinuation) {
    const defSideSeed = attackSide === 'home' ? 'away' : 'home';
    seedWorld(world, {
      attackSide,
      defendSide: defSideSeed,
      attackDir: attackDir(state),
      mark: { x: state.ball.x, y: state.ball.y },
      defensiveLine: effDefensiveLine(state, defendTeam),
      backfield: BACKFIELD_COUNT[effBackfieldDefence(state, defendTeam)],
      defendDiscipline: defendTeam.tactics.discipline,
      carrierSlot: SLOT.SCRUM_HALF,
      attackingStyle: effAttackingStyle(state, attackTeam),
    });
  }

  // Apply an uploaded Phase Animator play to the result, reconciling the authored
  // timeline against the engine outcome. Thin closure over the shared pipeline so the
  // many call sites below keep their (res, playType, directionOverride?) signature.
  const applyChoreography = (res: PhaseResult, pType: string, directionOverride?: number): PhaseResult =>
    applyFirstPhaseChoreography(res, FIRST_PHASE_CHOREOGRAPHIES[pType], {
      state, dir: directionOverride ?? attackDir(state), attackSide, goCrashBall,
    });

  // Step 0 — Kick or carry decision (see KickDecisionDirector)
  const decision = decideKick({ state, attackTeam, attackOnField });
  if (decision.kick) {
    const res = buildKickTransition(decision, MatchPhase.FirstPhase, { state, attackTeam, attackOnField });
    // A scrum-half kick routes to BoxKick and is taken from the set-piece mark itself —
    // there is no sweep out to the fly-half. So don't overlay the kick_decision (9→10)
    // choreography: its authored ball path would both animate the ball out to the #10
    // channel and (since it splices BALL_REPOSITIONED) relocate the kick origin there.
    if (decision.kicker.id === SLOT.SCRUM_HALF) return res;
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
  // The slots the ball sweeps along before the carry (spatial pass phase, WP6):
  // ruck (scrum-half) → fly-half → … → strike carrier. Set in each branch.
  let passChainSlots: number[] = [];
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
    passChainSlots = [scrumHalf.id, carrier.id, insideCentre.id];
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
    passChainSlots = [scrumHalf.id, carrier.id, outsideCentre.id, wideReceiver.id];
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
  const direction = attackDir(state);

  // ── Spatial carry resolution (Upgrade.md §§ 4.1, 5.2; WP6 — FirstPhase) ──────
  // Same hybrid template as handlePhasePlay: when the phase resolves spatially the
  // line-break VERDICT comes from the spatial World (the strike carrier runs his
  // corridor; gap/contact detection over the folding line decides break / tackle /
  // metres and WHO the nearest defender is), while resolveOpenPlaySpatial draws the
  // identical rng() sequence as the legacy resolver so the outcome stream stays
  // determinate. All spatial draws are on the isolated spatial stream. Removing
  // FirstPhase from SPATIAL_PHASES (the one-line revert) takes the legacy branch.
  let res: ReturnType<typeof resolveOpenPlay>;
  let frames: import('../spatial/types').Frame[] | undefined;
  let sim: CarrySimResult | undefined;
  if (spatial && world) {
    // PLAY SELECTION (WP6, § 7.1) — strike plays off the set piece. Same seam as
    // handlePhasePlay: offer a play (phase 'FirstPhase'), weighted by attackingStyle
    // and damped by familiarity; a hit overlays the carry and records PLAY_SELECTED.
    // The crash-ball strike is a TIGHT/MID channel; out-the-back is the WIDE play —
    // selectChannel reads !goCrashBall as the wide call. openSpaceWide gates the wide
    // strikes. The fire-gate draw is on the OUTCOME stream, so this re-baselines.
    const openSpaceWide = Math.max(state.ball.y, 100 - state.ball.y);
    const sel = selectPlay({
      phase: 'FirstPhase',
      channel: selectChannel(!goCrashBall, openSpaceWide),
      spaceWide: openSpaceWide,
      style: effAttackingStyle(state, attackTeam),
      recency: state.playRecency[attackSide],
    });
    if (sel) events.push({ type: 'PLAY_SELECTED', playId: sel.play.id, side: attackSide });

    const s = runCarrySim(world, state, {
      attackSide,
      defendSide: defSide,
      attackDir: direction,
      defensiveLine,
      backfield: BACKFIELD_COUNT[effBackfieldDefence(state, defendTeam)],
      defendDiscipline: defendTeam.tactics.discipline,
      carrierSlot: ballCarrier.id,
      attackingStyle: effAttackingStyle(state, attackTeam),
      // The ball sweeps ruck → fly-half → … → strike carrier before the carry.
      passChain: dedupeChain(passChainSlots),
      modShift: baseAttackMod - baseDefendMod,
      // Set defence is the hardest to beat 1-on-1 — bias the contact evasion toward
      // the defender for a strike off a set piece so first-phase clean breaks sit at
      // the legacy ~13.3/match (the over-broken breaks become dominant tackles).
      contactDefenderBonus: EVASION.firstPhaseDefenderBonus,
      // The selected strike play + the defence's familiarity with it (undefined → a
      // byte-identical plain strike carry).
      play: sel?.play,
      playFamiliarity: sel?.familiarity,
      silent,
    });
    sim = s;
    if (!silent) frames = s.frames;
    // Spatial picks the tackler (nearest line defender); map the slot back to the
    // on-field Player, falling back to the channel-aware pick if it is off the field.
    defender = defendOnField.find(p => p.id === s.tacklerSlot) ?? defender;
    res = resolveOpenPlaySpatial(ballCarrier, defender, s.lineBreak, s.spatialMetres, baseAttackMod, baseDefendMod, dlCollision + tlBonus.collision);
    // WP3 contact model: the spatial contact resolved the outcome — override what the
    // legacy collision formula returned (its 5 rng() draws were still consumed above).
    if (s.contactOccurred && s.contactOutcome !== null) {
      res.outcome = s.contactOutcome as typeof res.outcome;
      if (s.contactOutcome === 'dominant_carry') res.collisionResult = 'dominant_carry';
      else if (s.contactOutcome === 'dominant_tackle') res.collisionResult = 'dominant_tackle';
      else res.collisionResult = 'broken_tackle';
    }
    // Push spatial offload events (if any) BEFORE the CARRY_RESOLVED below.
    if (s.offloadAttempted) {
      const catcher = s.catcherSlot != null ? attackOnField.find(p => p.id === s.catcherSlot) ?? null : null;
      if (catcher) {
        events.push({ type: 'OFFLOAD_ATTEMPTED', offloader: ballCarrier, catcher, attackSide });
        if (s.offloadCompleted) events.push({ type: 'OFFLOAD_COMPLETED', offloader: ballCarrier, catcher, attackSide });
      }
    }
  } else {
    res = resolveOpenPlay(ballCarrier, defender, baseAttackMod, baseDefendMod, dlCollision + tlBonus.collision);
  }

  // Crash-ball line breaks are contained by the converging fullback + flanker
  // — re-roll gain into the tighter channel range. Legacy path only: spatial owns
  // every line-break decision + its metres (the conditional rng draw is dropped on
  // the spatial path, so its stream stays determinate).
  if (!spatial && goCrashBall && res.outcome === 'line_break') {
    res.gainMetres = rng(CRASH_BALL_LINE_BREAK_METRES[0], CRASH_BALL_LINE_BREAK_METRES[1]);
  }

  let chainNarration: NarrationStep[] = [];
  let chainMetres = 0;
  // Skip the legacy offload chain when the spatial contact system already rolled an
  // offload (it would double-emit) — the spatial offload events were pushed above.
  if (res.outcome !== 'line_break' && !sim?.offloadAttempted) {
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
    // A first-phase strike breaks into open, structured field — the break carries
    // further (more first-phase tries, fewer breaks stopped short into a downfield
    // breakdown). Spatial path only (WP6); the legacy path keeps its tuned metres.
    if (spatial) res.gainMetres += GAP_BREAK.firstPhaseBreakMetresBonus;
  }

  // Try check hoisted above CARRY_RESOLVED so the cover-tackler pick can
  // be gated on a non-try line break. Include chainMetres so offload-chain
  // gains don't cause the projected position to undershoot the try line.
  let projectedBallX = clamp(state.ball.x + direction * (chainMetres + res.gainMetres), 0, 100);
  const canScore = res.outcome === 'line_break' || res.outcome === 'dominant_carry';
  let tryScored = canScore && isTryScoredAt(projectedBallX, attackSide, state.clock.halfTimeDone);

  // Cover-beat run-on: a clean break short of the line — the carrier races the
  // covering defender. Beating the cover (distance-graded — see breaksCover) runs
  // the break on to the try line; otherwise the cover tackle stands below.
  if (!tryScored && res.outcome === 'line_break') {
    const distToLine = direction > 0 ? 100 - projectedBallX : projectedBallX;
    if (breaksCover(distToLine)) {
      res.gainMetres += distToLine;
      projectedBallX = direction > 0 ? 100 : 0;
      tryScored = true;
    }
  }

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
  if (res.outcome !== 'line_break' && tackleInfringement(defender, effDisciplineScalar(defendTeam, TACTIC_MODIFIERS.disciplineHighTackleMod), state.engine.refStrictness) === 'high_tackle') {
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
    // Spatial frames ride on the GameEvent (WP6); the authored choreography still
    // drives the live display until the WP8 frame renderer consumes these.
    frames,
  };

  return applyChoreography(baseRes, playType, direction);
}
