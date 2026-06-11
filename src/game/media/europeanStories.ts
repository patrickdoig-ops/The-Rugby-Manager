// European competition inbox stories. Pure functions — no RNG, no side effects.
// Published via MEDIA_STORY_PUBLISHED at season start (draw) and at elimination.

import type { EuropeanObjective, MediaStory } from '../../types/gameState';

const EURO_OUTLETS = ['RugbyEurope Now', 'The Rugby Chronicle', 'MatchDay Europe', 'Pro Rugby Insider'];

function outlet(seed: number): string {
  return EURO_OUTLETS[seed % EURO_OUTLETS.length]!;
}

// Build the pool-draw inbox story published when European pools are seeded.
export function buildEuropeanDrawStory(
  competition: 'europeanCup' | 'europeanShield',
  compLabel: string,
  seasonLabel: string,
  clubName: string,
  poolId: number,
  opponents: string[],
): MediaStory {
  const oppList = opponents.length > 0 ? opponents.join(', ') : 'their group opponents';
  const body = `The ${compLabel} group stage draw has been made for the ${seasonLabel}. `
    + `${clubName} have been placed in Pool ${poolId}, where they will face ${oppList}. `
    + `Pool matches begin in December, with the knockout stage starting in April.`;
  return {
    id: `euro:draw:${competition}:${seasonLabel}`,
    round: 0,
    subject: `${compLabel} pool draw: ${clubName} in Pool ${poolId}`,
    body,
    outlet: outlet(poolId),
    deepLink: competition === 'europeanCup' ? 'european-cup' : 'european-shield',
  };
}

// Build the elimination inbox story published when the player is knocked out.
export function buildEuropeanEliminationStory(
  competition: 'europeanCup' | 'europeanShield',
  compLabel: string,
  clubName: string,
  stage: EuropeanObjective,
  round: number,
): MediaStory {
  const stageLabel = stage === 'participate' ? 'the pool stage'
    : stage === 'r16' ? 'the Round of 16'
    : stage === 'quarterfinal' ? 'the Quarter-Finals'
    : stage === 'semifinal' ? 'the Semi-Finals'
    : 'the Final';
  const body = `${clubName}'s ${compLabel} campaign has come to an end. `
    + `They bow out at ${stageLabel}, ending what has been an experience on the European stage. `
    + `The ${compLabel} continues without them as the remaining sides battle for the title.`;
  return {
    id: `euro:eliminated:${competition}:${round}`,
    round,
    subject: `${clubName} exit the ${compLabel}`,
    body,
    outlet: outlet(round + 1),
    deepLink: competition === 'europeanCup' ? 'european-cup' : 'european-shield',
  };
}
