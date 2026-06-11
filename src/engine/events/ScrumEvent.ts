import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { MatchState } from '../../types/match';
import type { NarrationStep } from '../../types/narration';
import type { Player } from '../../types/player';
import { MatchPhase } from '../../types/engine';
import { resolveScrum } from '../resolvers/ScrumResolver';
import { availableForwards, onFieldPlayers, attackDir } from '../FieldPosition';
import { rng } from '../../utils/rng';
import { clamp } from '../../utils/math';
import { SLOT, isFrontRowSlot } from '../Slot';
import { SCRUM_VALUES, TACTIC_MODIFIERS } from '../balance';
import { effIntensityScalar, effDisciplineScalar } from '../tacticsResolve';
import { FIRST_PHASE_CHOREOGRAPHIES } from '../balance/firstPhaseChoreography';
import { swapPairedSlot } from '../choreography/transform';

// Random front-row offender for a scrum penalty — props and hooker can all
// be cited, not just the hooker. Falls back to the hooker (and onward) when
// the front row is empty (e.g. multiple cards have taken the front row off).
function pickFrontRowOffender(frontRow: Player[], hookerFallback: Player): Player {
  if (frontRow.length === 0) return hookerFallback;
  return frontRow[rng(0, frontRow.length - 1)];
}

export function handleScrum({ state, attackTeam, defendTeam }: PhaseContext): PhaseResult {
  const attackSide = state.possession;
  const flipSide: 'home' | 'away' = attackSide === 'home' ? 'away' : 'home';

  const attackForwards = availableForwards(attackTeam, state, attackSide);
  const defendForwards = availableForwards(defendTeam, state, flipSide);
  const attackFrontRow = attackForwards.filter(p => isFrontRowSlot(p.id));
  const defendFrontRow = defendForwards.filter(p => isFrontRowSlot(p.id));
  // Hooker (#2) — fallback to first available forward, then any on-field player,
  // covering the (extreme) case of all hookers off.
  const attackOnField  = onFieldPlayers(attackTeam, state, attackSide);
  const defendOnField  = onFieldPlayers(defendTeam, state, flipSide);
  const attackHooker   = attackForwards.find(p => p.id === SLOT.HOOKER) ?? attackForwards[0] ?? attackOnField[0]!;
  const defendHooker   = defendForwards.find(p => p.id === SLOT.HOOKER) ?? defendForwards[0] ?? defendOnField[0]!;
  // Intensity adds a flat shove edge to each side; discipline scales each
  // side's noise variance (risky = fatter tails = more dominant penalties
  // won AND more conceded on own ball; cautious = stable, rarely pinged).
  const res = resolveScrum(
    attackForwards, defendForwards,
    effIntensityScalar(attackTeam, TACTIC_MODIFIERS.intensityScrumMod),
    effIntensityScalar(defendTeam, TACTIC_MODIFIERS.intensityScrumMod),
    effDisciplineScalar(attackTeam, TACTIC_MODIFIERS.disciplineScrumVarianceMult),
    effDisciplineScalar(defendTeam, TACTIC_MODIFIERS.disciplineScrumVarianceMult),
  );

  // Wheel cap: after SCRUM_VALUES.wheelCap consecutive wheels in this scrum
  // sequence, a wheel-band 3rd contest is promoted to a penalty. Side is
  // picked by margin on THIS resolve — whichever pack was pushing harder
  // gets the call, mirroring how a referee cites the side being driven
  // backwards. capFired feeds the prepended commentary step in the two
  // penalty branches so the user sees why a penalty appeared instead of
  // yet another reset. state.consecutiveWheels is maintained by the
  // SCRUM_RESOLVED reducer; reset to 0 by any non-wheel outcome, so the
  // next scrum sequence starts fresh.
  const capFired = res.result === 'wheel' && state.consecutiveWheels >= SCRUM_VALUES.wheelCap;
  if (capFired) {
    res.result = res.margin >= 0 ? 'attacking_dominant_penalty' : 'defending_dominant_penalty';
  }

  const events: MatchEvent[] = [
    { type: 'BREAKDOWN_MOD_SET', attack: 0, defend: 0 },
  ];

  const capStep: NarrationStep | null = capFired
    ? { kind: 'announcement', key: 'scrum_reset_cap' }
    : null;

  if (res.result === 'attacking_dominant_penalty') {
    // Cite a random member of the offending side's front row (prop or hooker)
    // rather than always the hooker. SCRUM_RESOLVED below still credits every
    // front-row player with scrumPenaltiesConceded so team-level stats are
    // unaffected; this only changes who the referee names.
    const defendOffender = pickFrontRowOffender(defendFrontRow, defendHooker);
    events.push({
      type: 'SCRUM_RESOLVED',
      outcome: 'attacking_dominant_penalty',
      attackFrontRow, defendFrontRow,
      attackSide,
      possessionSideAfter: attackSide,
    });
    events.push({
      type: 'PENALTY_AWARDED',
      offence: 'scrum_infringement',
      offender: defendOffender,
      offendingSide: flipSide,
    });
    const steps: NarrationStep[] = [];
    if (capStep) steps.push(capStep);
    steps.push({ kind: 'phase_outcome', phase: MatchPhase.Scrum, key: 'attacking_dominant_penalty', primary: defendOffender, secondary: attackHooker });
    return {
      nextPhase: MatchPhase.Penalty,
      narration: { steps },
      primaryPlayer: attackHooker,
      secondaryPlayer: defendOffender,
      events,
    };
  }

  if (res.result === 'stable_win') {
    events.push({
      type: 'SCRUM_RESOLVED',
      outcome: 'stable_win',
      attackFrontRow, defendFrontRow,
      attackSide,
      possessionSideAfter: attackSide,
    });
    return {
      nextPhase: MatchPhase.FirstPhase,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Scrum, key: 'stable_win', primary: attackHooker, secondary: defendHooker }] },
      primaryPlayer: attackHooker,
      secondaryPlayer: defendHooker,
      events,
    };
  }

  if (res.result === 'wheel') {
    events.push({
      type: 'SCRUM_RESOLVED',
      outcome: 'wheel',
      attackFrontRow, defendFrontRow,
      attackSide,
      possessionSideAfter: attackSide,
    });
    const baseRes: PhaseResult = {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Scrum, key: 'wheel', primary: attackHooker, secondary: defendHooker }] },
      primaryPlayer: attackHooker,
      secondaryPlayer: defendHooker,
      events,
    };
    return applyScrumChoreography(baseRes, state, attackSide);
  }

  // defending_dominant_penalty — defending team wins the penalty
  // See pickFrontRowOffender comment in the attacking-penalty branch.
  const attackOffender = pickFrontRowOffender(attackFrontRow, attackHooker);
  events.push({
    type: 'SCRUM_RESOLVED',
    outcome: 'defending_dominant_penalty',
    attackFrontRow, defendFrontRow,
    attackSide,
    possessionSideAfter: flipSide,
  });
  events.push({
    type: 'PENALTY_AWARDED',
    offence: 'scrum_infringement',
    offender: attackOffender,
    offendingSide: attackSide,
  });
  const steps: NarrationStep[] = [];
  if (capStep) steps.push(capStep);
  steps.push({ kind: 'phase_outcome', phase: MatchPhase.Scrum, key: 'defending_dominant_penalty', primary: attackOffender, secondary: defendHooker });
  return {
    nextPhase: MatchPhase.Penalty,
    narration: { steps },
    primaryPlayer: defendHooker,
    secondaryPlayer: attackOffender,
    events,
  };
}

function applyScrumChoreography(res: PhaseResult, state: MatchState, attackSide: 'home' | 'away'): PhaseResult {
  const parsedChoreo = FIRST_PHASE_CHOREOGRAPHIES['SCRUM:wheel'];
  if (!parsedChoreo) return res;

  const choreography: PhaseResult['choreography'] = [];
  const dir = attackDir(state);
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

  for (const ent of parsedChoreo.entities) {
    if (ent.id === 'ball') continue;
    
    const authoredSideChar = ent.id.charAt(0);
    let authoredSlot = parseInt(ent.id.substring(1), 10);
    
    if (isNaN(authoredSlot)) continue;

    // Only animate forwards (1-8). Backs remain in their un-choreographed positions.
    if (authoredSlot > 8) continue;

    const swapLateral = flipX !== flipY;
    if (swapLateral) authoredSlot = swapPairedSlot(authoredSlot);

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

  return { ...res, choreography };
}
