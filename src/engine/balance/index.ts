// Single source of truth for every gameplay tuning number.
//
// If a literal influences a match outcome — probability, threshold, modifier,
// gain range, weight, fatigue multiplier, rating point value — it lives here.
// Do not introduce new tuning literals in resolvers, events, or systems.
//
// Exempt by design: rugby pitch geometry (FieldPosition.ts), jersey-number
// position checks, and RNG shape values inside resolver formulas (e.g. rng(1,20)).
//
// One file per logical concern. Importers can read from the barrel
// (`./balance`) — they don't need to know which sub-file holds which constant.

export * from './scoring';
export * from './kicking';
export * from './dropOut';
export * from './kickDecision';
export * from './openPlay';
export * from './lateral';
export * from './offload';
export * from './breakdown';
export * from './scrum';
export * from './lineout';
export * from './maul';
export * from './fatigue';
export * from './form';
export * from './rating';
export * from './positionFamiliarity';
export * from './tactics';
export * from './aiDirector';
export * from './aiSubs';
export * from './clock';
export * from './commentary';
export * from './discipline';
export * from './season';
export * from './homeAdvantage';
export * from './career';
export * from './transfers';
export * from './injuries';
export * from './international';
export * from './training';
export * from './tackling';
export * from './carrying';
export * from './attendance';
export * from './premCup';
export * from './board';
export * from './morale';
export * from './teamTalk';
