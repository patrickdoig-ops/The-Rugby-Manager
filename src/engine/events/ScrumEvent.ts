import type { PhaseContext, PhaseResult } from './types';
import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import type { Player } from '../../types/player';
import { MatchPhase } from '../../types/engine';
import { resolveScrum } from '../resolvers/ScrumResolver';
import { availableForwards, onFieldPlayers } from '../FieldPosition';
import { rng } from '../../utils/rng';
import { SLOT, isFrontRowSlot } from '../Slot';
import { SCRUM_VALUES, TACTIC_MODIFIERS } from '../balance';

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
    TACTIC_MODIFIERS.intensityScrumMod[attackTeam.tactics.intensity],
    TACTIC_MODIFIERS.intensityScrumMod[defendTeam.tactics.intensity],
    TACTIC_MODIFIERS.disciplineScrumVarianceMult[attackTeam.tactics.discipline],
    TACTIC_MODIFIERS.disciplineScrumVarianceMult[defendTeam.tactics.discipline],
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
    return {
      nextPhase: MatchPhase.Scrum,
      narration: { steps: [{ kind: 'phase_outcome', phase: MatchPhase.Scrum, key: 'wheel', primary: attackHooker, secondary: defendHooker }] },
      primaryPlayer: attackHooker,
      secondaryPlayer: defendHooker,
      events,
    };
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
