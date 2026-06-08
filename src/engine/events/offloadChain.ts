import type { MatchEvent } from '../../types/matchEvent';
import type { NarrationStep } from '../../types/narration';
import type { Player } from '../../types/player';
import type { PossessionSide, MatchPhase } from '../../types/engine';
import type { MatchState } from '../../types/match';
import type { Team } from '../../types/team';
import type { OpenPlayResolution } from '../resolvers/OpenPlayResolver';
import { resolveOpenPlay } from '../resolvers/OpenPlayResolver';
import { availableForwards, availableBacks, pickPrimaryDefender, pickAssistTackler } from '../FieldPosition';
import { rng } from '../../utils/rng';
import { OFFLOAD_VALUES, knockOnPct } from '../balance';
import { isForwardSlot } from '../Slot';

// Offload-in-tackle helper. Called by every carry-phase handler after the
// initial evasion+collision but before the final CARRY_RESOLVED is emitted.
// Loops up to OFFLOAD_VALUES.maxChain times; each link runs a trigger roll,
// a receiver pick, a catch gate, and (on success) a fresh resolveOpenPlay
// against a new defender with a flat attack bonus.
//
// Always consumes the trigger rng(1, 100) first (determinism — never short-
// circuit on a pool check). Returns the passed-through initial resolution
// when no offload fires.

export interface OffloadChainArgs {
  state: MatchState;
  attackTeam: Team;
  defendTeam: Team;
  attackSide: PossessionSide;
  defSide: PossessionSide;
  phase: MatchPhase;
  initialRes: OpenPlayResolution;
  initialCarrier: Player;
  initialDefender: Player;
  baseAttackMod: number;
  baseDefendMod: number;
  dlCollision: number;
  direction: 1 | -1;
}

export interface OffloadChainResult {
  finalRes: OpenPlayResolution;
  finalCarrier: Player;
  finalDefender: Player;
  chainEvents: MatchEvent[];
  chainNarration: NarrationStep[];
  knockedOn: boolean;
  chainFired: boolean;
}

function pickReceiver(carrier: Player, attackTeam: Team, state: MatchState, attackSide: PossessionSide): Player | undefined {
  const pool = (isForwardSlot(carrier.id) ? availableForwards : availableBacks)(attackTeam, state, attackSide)
    .filter(p => p !== carrier);
  if (pool.length === 0) return undefined;
  return pool[rng(0, pool.length - 1)];
}

export function tryOffloadChain(args: OffloadChainArgs): OffloadChainResult {
  const {
    state, attackTeam, defendTeam, attackSide, defSide, phase,
    initialRes, initialCarrier, initialDefender,
    baseAttackMod, baseDefendMod, dlCollision, direction,
  } = args;

  const chainEvents: MatchEvent[] = [];
  const chainNarration: NarrationStep[] = [];

  let currentRes = initialRes;
  let currentCarrier = initialCarrier;
  let currentDefender = initialDefender;
  let chainFired = false;
  const attemptPct = OFFLOAD_VALUES.attemptPctByStrategy[attackTeam.tactics.offloadStrategy];

  for (let link = 0; link < OFFLOAD_VALUES.maxChain; link++) {
    // Trigger roll always consumed — keeps RNG sequence determinism-stable
    // regardless of pool availability.
    const triggerRoll = rng(1, 100);
    if (triggerRoll > attemptPct) break;

    const catcher = pickReceiver(currentCarrier, attackTeam, state, attackSide);
    if (!catcher) break;

    // Channel-aware: defender drawn from the table matching the catcher's
    // channel (close / midfield / wide), excluding the previous chain
    // defender. Falls back to any other on-field defender if the weighted
    // pool is empty.
    const newDefender = pickPrimaryDefender(defendTeam, state, defSide, catcher, currentDefender);

    chainNarration.push({ kind: 'phase_outcome', phase, key: 'offload_attempt', primary: currentCarrier, secondary: catcher });
    chainEvents.push({ type: 'OFFLOAD_ATTEMPTED', offloader: currentCarrier, catcher, attackSide });

    const catchPct = knockOnPct(catcher.currentStats.handling, state.clock.clockInTheRed) + OFFLOAD_VALUES.catchHandlingPenalty;
    const catchRoll = rng(1, 100);

    // Original carrier credit lands the same way whether catch succeeds or
    // fails: a play_on CARRY_RESOLVED with metres = currentRes.gainMetres — carries++ on prev
    // carrier, tacklesMade++ on prev defender. The intermediate link is
    // always a made tackle, so it gets an assist too.
    chainEvents.push({
      type: 'CARRY_RESOLVED',
      carrier: currentCarrier,
      defender: currentDefender,
      metres: currentRes.gainMetres,
      direction,
      outcome: 'play_on',
      defSide,
      assistTackler: pickAssistTackler(defendTeam, state, defSide, currentDefender),
    });

    if (catchRoll <= catchPct) {
      chainEvents.push({ type: 'KNOCK_ON', player: catcher, attackSide });
      chainNarration.push({ kind: 'phase_outcome', phase, key: 'offload_knock_on', primary: catcher, secondary: currentCarrier });
      return {
        finalRes: currentRes,
        finalCarrier: currentCarrier,
        finalDefender: currentDefender,
        chainEvents,
        chainNarration,
        knockedOn: true,
        chainFired: true,
      };
    }

    chainEvents.push({ type: 'OFFLOAD_COMPLETED', offloader: currentCarrier, catcher, attackSide });
    chainEvents.push({ type: 'PASS_COMPLETED', passer: currentCarrier });

    currentRes = resolveOpenPlay(
      catcher, newDefender,
      baseAttackMod + OFFLOAD_VALUES.secondCarryAttackBonus,
      baseDefendMod,
      dlCollision,
    );
    currentCarrier = catcher;
    currentDefender = newDefender;
    chainFired = true;

    // A line break on the chain carry exits — no second offload from a
    // runner already in space.
    if (currentRes.outcome === 'line_break') break;
  }

  return {
    finalRes: currentRes,
    finalCarrier: currentCarrier,
    finalDefender: currentDefender,
    chainEvents,
    chainNarration,
    knockedOn: false,
    chainFired,
  };
}
