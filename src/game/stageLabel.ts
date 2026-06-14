// Shared, pure competition/stage labelling for a BlockFixtureRef.
//
// One source of truth for how a fixture's competition + stage are named, used
// by both the inbox's "next opponent" line (`stageLabelLong` — the combined
// competition+stage string it has always shown) and the cross-competition
// Fixture List screen (which wants the competition name, stage, a short badge
// tag + stage chip, and a per-competition accent class, rendered separately).
//
// No RNG, no state — derives purely from the BlockFixtureRef discriminants.

import type { BlockFixtureRef } from './blockFixture';

// Full competition name — distinguishes European Cup from European Shield.
export function competitionLabel(ref: BlockFixtureRef): string {
  switch (ref.comp) {
    case 'league':   return 'League';
    case 'cup':      return 'League Cup';
    case 'european': return ref.ref.competition === 'europeanCup' ? 'European Cup' : 'European Shield';
    case 'playoff':  return 'Play-off';
  }
}

// Short uppercase tag for the 40px badge column. Both European competitions
// share "EUR"; the accent class + the full competitionLabel disambiguate them.
export function competitionTag(ref: BlockFixtureRef): string {
  switch (ref.comp) {
    case 'league':   return 'LGE';
    case 'cup':      return 'CUP';
    case 'european': return 'EUR';
    case 'playoff':  return 'P/O';
  }
}

// Per-competition accent modifier class (styled in fixturelist.css). European
// Cup vs Shield get distinct accents so the list reads at a glance.
export function competitionAccentClass(ref: BlockFixtureRef): string {
  switch (ref.comp) {
    case 'league':   return 'fl-comp--league';
    case 'cup':      return 'fl-comp--cup';
    case 'european': return ref.ref.competition === 'europeanCup' ? 'fl-comp--european-cup' : 'fl-comp--european-shield';
    case 'playoff':  return 'fl-comp--playoff';
  }
}

// Full stage name for the per-row meta line: "Round 7", "Pool", "Round of 16",
// "Quarter-Final", "Semi-Final", "Final".
export function stageNameLong(ref: BlockFixtureRef): string {
  switch (ref.comp) {
    case 'league':
      return `Round ${ref.round}`;
    case 'cup':
      return ref.ref.kind === 'knockout'
        ? (ref.ref.stage === 'final' ? 'Final' : 'Semi-Final')
        : 'Pool';
    case 'european':
      if (ref.ref.kind === 'pool') return 'Pool';
      switch (ref.ref.stage) {
        case 'r16':          return 'Round of 16';
        case 'quarterfinal': return 'Quarter-Final';
        case 'semifinal':    return 'Semi-Final';
        case 'final':        return 'Final';
      }
      break;
    case 'playoff':
      return ref.ref.kind === 'final' ? 'Final' : 'Semi-Final';
  }
  return '';
}

// Compact stage chip for the badge column: "7" (league round), "P" (pool),
// "R16" / "QF" / "SF" / "F" (knockouts).
export function stageBadge(ref: BlockFixtureRef): string {
  switch (ref.comp) {
    case 'league':
      return `${ref.round}`;
    case 'cup':
      return ref.ref.kind === 'knockout' ? (ref.ref.stage === 'final' ? 'F' : 'SF') : 'P';
    case 'european':
      if (ref.ref.kind === 'pool') return 'P';
      switch (ref.ref.stage) {
        case 'r16':          return 'R16';
        case 'quarterfinal': return 'QF';
        case 'semifinal':    return 'SF';
        case 'final':        return 'F';
      }
      break;
    case 'playoff':
      return ref.ref.kind === 'final' ? 'F' : 'SF';
  }
  return '';
}

// The combined competition+stage string the inbox's next-opponent line has
// always shown. Kept byte-identical to the previous inline switch so the inbox
// copy (and its determinism-covered output) does not change.
export function stageLabelLong(ref: BlockFixtureRef): string {
  switch (ref.comp) {
    case 'league':
      return `Round ${ref.round}`;
    case 'cup':
      return ref.ref.kind === 'knockout'
        ? (ref.ref.stage === 'final' ? 'League Cup Final' : 'League Cup Semi-Final')
        : 'League Cup';
    case 'european': {
      const compName = ref.ref.competition === 'europeanCup' ? 'European Cup' : 'European Shield';
      return ref.ref.kind === 'knockout' ? `${compName} Knockout` : compName;
    }
    case 'playoff':
      return ref.ref.kind === 'final' ? 'Play-off Final' : 'Play-off Semi-Final';
  }
}
