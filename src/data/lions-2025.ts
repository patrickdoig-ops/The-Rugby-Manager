// 2025 British & Irish Lions (Australia tour) members based at Gallagher
// Premiership clubs. Name-matched against the seeded roster at the 2025/26
// season open (GameCoordinator.newSeason via internationalDutyEngine.
// lionsConditionEvents); matched players begin the season under-cooked
// (LIONS_RETURN_CONDITION) from a shortened pre-season. Unmatched names are
// silently skipped, so an over-inclusive list is harmless. One-shot — the
// next Lions tour is 2029, out of scope.

export interface LionRef {
  firstName: string;
  lastName: string;
}

export const LIONS_2025_TOURISTS: LionRef[] = [
  // England
  { firstName: 'Maro',    lastName: 'Itoje' },          // Saracens (captain)
  { firstName: 'Ben',     lastName: 'Earl' },           // Saracens
  { firstName: 'Elliot',  lastName: 'Daly' },           // Saracens
  { firstName: 'Tommy',   lastName: 'Freeman' },        // Northampton
  { firstName: 'Henry',   lastName: 'Pollock' },        // Northampton
  { firstName: 'Fin',     lastName: 'Smith' },          // Northampton
  { firstName: 'Alex',    lastName: 'Mitchell' },       // Northampton
  { firstName: 'Marcus',  lastName: 'Smith' },          // Harlequins
  { firstName: 'Ellis',   lastName: 'Genge' },          // Bristol
  { firstName: 'Tom',     lastName: 'Curry' },          // Sale
  { firstName: 'Will',    lastName: 'Stuart' },         // Bath
  { firstName: 'Ollie',   lastName: 'Chessum' },        // Leicester
  { firstName: 'Joe',     lastName: 'Heyes' },          // Leicester
  { firstName: 'Chandler',lastName: 'Cunningham-South' },// Harlequins
  // Scotland
  { firstName: 'Finn',    lastName: 'Russell' },        // Bath
  // Wales
  { firstName: 'Tomos',   lastName: 'Williams' },       // Gloucester
];
