// 2025/26 England and Wales summer tour members based at Gallagher
// Premiership clubs. Name-matched against the seeded roster at the 2025/26
// season open (GameCoordinator.newSeason via internationalDutyEngine.
// summerTourReturnEvents); matched players begin the season under-cooked
// (SUMMER_TOUR_RETURN_CONDITION). Unmatched names are silently skipped.
// England tourists are also excluded from pre-season cup leg-0 selection.

export interface SummerTourRef {
  firstName: string;
  lastName: string;
}

// England toured Argentina & USA, July 5–19 2025. Squad excludes B&I Lions
// tourists (already handled by lionsReturnEvents). Premiership clubs only.
export const ENGLAND_SUMMER_2025_TOURISTS: SummerTourRef[] = [
  // Bath
  { firstName: 'Ben',      lastName: 'Spencer' },
  { firstName: 'Sam',      lastName: 'Underhill' },
  { firstName: 'Charlie',  lastName: 'Ewels' },
  { firstName: 'Ted',      lastName: 'Hill' },
  { firstName: 'Guy',      lastName: 'Pepper' },
  { firstName: 'Max',      lastName: 'Ojomoh' },
  { firstName: 'Will',     lastName: 'Muir' },
  // Bristol
  { firstName: 'Harry',    lastName: 'Randall' },
  // Exeter
  { firstName: 'Immanuel', lastName: 'Feyi-Waboso' },
  { firstName: 'Henry',    lastName: 'Slade' },
  // Gloucester
  { firstName: 'Arthur',   lastName: 'Clark' },
  { firstName: 'Seb',      lastName: 'Atkinson' },
  { firstName: 'Charlie',  lastName: 'Atkinson' },
  // Harlequins
  { firstName: 'Fin',      lastName: 'Baxter' },
  { firstName: 'Chandler', lastName: 'Cunningham-South' },
  { firstName: 'Alex',     lastName: 'Dombrandt' },
  { firstName: 'Oscar',    lastName: 'Beard' },
  { firstName: 'Cadan',    lastName: 'Murley' },
  { firstName: 'Luke',     lastName: 'Northmore' },
  // Leicester
  { firstName: 'Joe',      lastName: 'Heyes' },
  { firstName: 'Freddie',  lastName: 'Steward' },
  { firstName: 'Jack',     lastName: 'van Poortvliet' },
  // Northampton
  { firstName: 'Alex',     lastName: 'Coles' },
  { firstName: 'Trevor',   lastName: 'Davison' },
  { firstName: 'Curtis',   lastName: 'Langdon' },
  // Sale
  { firstName: 'George',   lastName: 'Ford' },
  { firstName: 'Tom',      lastName: 'Roebuck' },
  { firstName: 'Bevan',    lastName: 'Rodd' },
  { firstName: 'Ben',      lastName: 'Curry' },
  { firstName: 'Joe',      lastName: 'Carpenter' },
  { firstName: 'Asher',    lastName: 'Opoku-Fordjour' },
  // Saracens
  { firstName: 'Nick',     lastName: 'Isiekwe' },
  { firstName: 'Tom',      lastName: 'Willis' },
  { firstName: 'Theo',     lastName: 'Dan' },
];

// Wales toured Japan, July 5–12 2025. Premiership clubs only.
export const WALES_SUMMER_2025_TOURISTS: SummerTourRef[] = [
  // Leicester
  { firstName: 'Tommy',  lastName: 'Reffell' },
  { firstName: 'Nicky',  lastName: 'Smith' },
  // Bath
  { firstName: 'Archie', lastName: 'Griffin' },
];
