// Generates synthetic Player personas for Phase 7's academy graduates
// + foreign imports. Deterministic from rngTransfer — the persona
// (name, dob, baseStats, contract) is fully reproducible from the
// rngTransfer call sequence at the moment of generation.
//
// Name pools per nationality are deliberately small (~15-20 each):
// enough for variety, small enough for the source tree. Per-nationality
// duplicate names within a single rollover are possible but rare;
// across-nationality collisions are blocked by name-uniqueness checks
// in the caller (careerRollover dedupes against the live roster).

import type { Player, Position, PlayerStats } from '../types/player';
import { zeroMatchStats, zeroSeasonStats } from '../types/player';
import { rngTransferRaw, rngTransfer } from '../utils/rng';
import { WAGE_BY_RATING, POSITION_SCARCITY } from '../engine/balance/transfers';

// First names + surnames per nationality. Drawn from Premiership-era
// rosters to feel idiomatic; not exhaustive.
const NAME_POOLS = {
  English: {
    first: ['George', 'Tom', 'Jack', 'Harry', 'Ollie', 'Sam', 'Ben', 'Will', 'Charlie', 'Dan', 'Joe', 'Lewis', 'Marcus', 'Alex', 'Henry', 'Freddie', 'Theo', 'Max', 'Joshua', 'Cameron'],
    last:  ['Smith', 'Jones', 'Hill', 'Walker', 'Lawes', 'Vunipola', 'Cole', 'Wright', 'Thomas', 'Marler', 'Clarke', 'Steward', 'Lawrence', 'Daly', 'Cowan', 'Wilson', 'Robson', 'Hartley', 'Atkinson', 'Roberts'],
  },
  Welsh: {
    first: ['Dan', 'Rhys', 'Gareth', 'Owen', 'Liam', 'Taulupe', 'Justin', 'Aaron', 'Leigh', 'Josh', 'Ellis', 'Jac', 'Tomos', 'Adam', 'Will'],
    last:  ['Williams', 'Davies', 'Jenkins', 'Morgan', 'Evans', 'Faletau', 'Tipuric', 'Wyn Jones', 'North', 'Adams', 'Edwards', 'Watkin', 'Owens', 'Beard', 'Lloyd'],
  },
  Scottish: {
    first: ['Finn', 'Stuart', 'Hamish', 'Duhan', 'Blair', 'Rory', 'Cameron', 'Pierre', 'Sione', 'Kyle', 'Matt', 'Jamie', 'Darcy', 'Mark', 'Sam'],
    last:  ['McLeod', 'Hogg', 'Watson', 'Gray', 'Kinghorn', 'van der Merwe', 'Bennett', 'Tuipulotu', 'Schoeman', 'Steyn', 'Dempsey', 'Ritchie', 'Skinner', 'Bradbury', 'Sutherland'],
  },
  Irish: {
    first: ['Johnny', 'Conor', 'James', 'Tadhg', 'Caelan', 'Hugo', 'Andrew', 'Bundee', 'Joey', 'Garry', 'Robbie', 'Mack', 'Iain', 'Calvin', 'Jamison'],
    last:  ['Murphy', 'Kelleher', 'Beirne', 'Doris', 'Sheehan', 'Carbery', 'Henshaw', 'Aki', 'Ringrose', 'Park', 'Henderson', 'Hansen', 'O\'Connell', 'Nash', 'Gibson-Park'],
  },
  French: {
    first: ['Antoine', 'Romain', 'Damian', 'Cyril', 'Charles', 'Matthieu', 'Pierre-Henri', 'Mohamed', 'Gaël', 'Anthony', 'Jonathan', 'Grégory', 'Maxime', 'Paul', 'Thibaud'],
    last:  ['Dupont', 'Ntamack', 'Penaud', 'Cazeaux', 'Ollivon', 'Jalibert', 'Atonio', 'Bouhraoua', 'Fickou', 'Jelonch', 'Danty', 'Alldritt', 'Lucu', 'Boudehent', 'Flament'],
  },
  'South Africa': {
    first: ['Siya', 'Eben', 'Pieter-Steph', 'Cheslin', 'Damian', 'Faf', 'Handré', 'Lukhanyo', 'Malcolm', 'Bongi', 'Steven', 'Frans', 'Ox', 'Trevor', 'Kurt-Lee'],
    last:  ['Kolisi', 'Etzebeth', 'du Toit', 'Kolbe', 'de Allende', 'de Klerk', 'Pollard', 'Am', 'Marx', 'Mbonambi', 'Kitshoff', 'Malherbe', 'Nche', 'Nyakane', 'Arendse'],
  },
  'New Zealand': {
    first: ['Ardie', 'Beauden', 'Jordie', 'Aaron', 'Sam', 'Brodie', 'Patrick', 'Will', 'Ethan', 'Codie', 'Damian', 'Caleb', 'Akira', 'Sevu', 'Mark'],
    last:  ['Savea', 'Barrett', 'Smith', 'Whitelock', 'Cane', 'Retallick', 'Tuipulotu', 'Jordan', 'Blackadder', 'Taylor', 'McKenzie', 'Clarke', 'Ioane', 'Reece', 'Telea'],
  },
  Australia: {
    first: ['Will', 'Tate', 'Taniela', 'Allan', 'Marika', 'Andrew', 'Rob', 'Quade', 'Samu', 'Carlo', 'Nick', 'Suliasi', 'Hunter', 'Folau', 'Len'],
    last:  ['Skelton', 'McDermott', 'Tupou', 'Alaalatoa', 'Koroibete', 'Kellaway', 'Valetini', 'Cooper', 'Kerevi', 'Tizzano', 'Frost', 'Vailanu', 'Paisami', 'Fainga\'a', 'Ikitau'],
  },
  Fiji: {
    first: ['Semi', 'Levani', 'Albert', 'Waisea', 'Frank', 'Josua', 'Vinaya', 'Manasa', 'Viliame', 'Eroni', 'Setareki', 'Mesake', 'Jiuta', 'Sireli', 'Salesi'],
    last:  ['Radradra', 'Botia', 'Tuisova', 'Nayacalevu', 'Lomani', 'Tuisova', 'Habosi', 'Saulo', 'Mata', 'Mawi', 'Tuwai', 'Doge', 'Wainiqolo', 'Maqala', 'Rayasi'],
  },
  Argentina: {
    first: ['Pablo', 'Tomás', 'Santiago', 'Julián', 'Mateo', 'Marcos', 'Juan', 'Lucio', 'Nicolás', 'Bautista', 'Joaquín', 'Federico', 'Rodrigo', 'Lucas', 'Emiliano'],
    last:  ['Matera', 'Cubelli', 'Carreras', 'Montoya', 'Carreras', 'Kremer', 'Cruz Mallía', 'Cinti', 'Sánchez', 'Delguy', 'Tuculet', 'Wenger', 'Bruni', 'Paulos', 'Boffelli'],
  },
};

type Nationality = keyof typeof NAME_POOLS;

const NATIONALITY_BY_CLUB: Record<string, Nationality[]> = {
  // Premiership clubs lean English with a sprinkle of overseas. Academy
  // grads weight heavily English; foreign imports lean overseas.
  bath:        ['English', 'English', 'English', 'Welsh', 'Scottish', 'Irish'],
  bristol:     ['English', 'English', 'English', 'Welsh', 'Fiji'],
  exeter:      ['English', 'English', 'English', 'Welsh', 'Australia'],
  gloucester:  ['English', 'English', 'English', 'Welsh', 'Argentina'],
  harlequins:  ['English', 'English', 'English', 'Irish', 'Australia'],
  leicester:   ['English', 'English', 'English', 'South Africa', 'Australia'],
  newcastle:   ['English', 'English', 'English', 'Welsh', 'Scottish'],
  northampton: ['English', 'English', 'English', 'Welsh', 'Argentina'],
  sale:        ['English', 'English', 'English', 'South Africa', 'New Zealand'],
  saracens:    ['English', 'English', 'English', 'South Africa', 'Australia'],
};

// All Position values for random selection.
const ALL_POSITIONS: Position[] = [
  'Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8', 'Back Row',
  'Scrum-Half', 'Fly-Half', 'Centre', 'Wing', 'Fullback', 'Utility Back',
];

export interface PersonaSeed {
  rosterId: number;
  clubId?: string;           // when omitted, generates with a random nationality
  ageBand: { min: number; max: number };
  ratingBand: { min: number; max: number };
}

// Generate one persona, fully deterministic given the current rngTransfer
// state. Caller owns rosterId allocation + the calling order.
export function generatePersona(seed: PersonaSeed, calendarDate: string): Player {
  // Pick nationality from the club's bias list (academy) or any pool
  // (imports — caller passes clubId undefined).
  const nationality: Nationality = seed.clubId && NATIONALITY_BY_CLUB[seed.clubId]
    ? NATIONALITY_BY_CLUB[seed.clubId][rngTransfer(0, NATIONALITY_BY_CLUB[seed.clubId].length - 1)]
    : (Object.keys(NAME_POOLS) as Nationality[])[rngTransfer(0, Object.keys(NAME_POOLS).length - 1)];

  const pool = NAME_POOLS[nationality];
  const firstName = pool.first[rngTransfer(0, pool.first.length - 1)];
  const lastName  = pool.last [rngTransfer(0, pool.last.length - 1)];

  // Position uniformly random across the 12 generic positions.
  const position = ALL_POSITIONS[rngTransfer(0, ALL_POSITIONS.length - 1)];

  // Age within band, dob anchored to season-open year. Birth month +
  // day picked randomly so birthdays are spread across the calendar.
  const age = rngTransfer(seed.ageBand.min, seed.ageBand.max);
  const birthYear = parseInt(calendarDate.slice(0, 4), 10) - age;
  const birthMonth = rngTransfer(1, 12);
  const birthDay = rngTransfer(1, 28);
  const dob = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;

  // Stats: pick target overall in the band, distribute around it.
  const targetOverall = rngTransfer(seed.ratingBand.min, seed.ratingBand.max);
  const baseStats = generateStats(targetOverall);

  // Wage: derived from rating + position scarcity, no noise (predictable
  // for academy graduates on a fixed rookie rate).
  const isAcademy = seed.ageBand.max <= 22; // crude — academy ageBand is 18-20
  const wage = isAcademy
    ? 20_000 // RPA rookie fixed academy wage
    : Math.round(wageFromRating(targetOverall) * (POSITION_SCARCITY[position] ?? 1.0) / 5_000) * 5_000;

  // 2-year deal for academy + imports (matches RPA rookie length + a
  // simple default for incoming foreign deals).
  const lengthYears = 2;
  const seasonStartYear = parseInt(calendarDate.slice(0, 4), 10);
  const expiresOn = `${seasonStartYear + lengthYears}-06-30`;

  return {
    id: 0, // matchday slot; reassigned by rosterTeamBuilder
    rosterId: seed.rosterId,
    squadNumber: 0,
    firstName,
    lastName,
    dob,
    nationality,
    position,
    baseStats,
    currentStats: { ...baseStats },
    matchStats: zeroMatchStats(),
    seasonStats: zeroSeasonStats(),
    reputation: Math.max(25, Math.min(60, Math.round(targetOverall * 0.7))),
    contract: {
      clubId: seed.clubId ?? '',
      expiresOn,
      annualWage: wage,
      isMarquee: false,
    },
    fatiguePct: 100,
    formModifier: 0,
    rating: 6.0,
    x: 50,
    y: 50,
  };
}

// Bell-shape stats around `targetOverall`. Each stat ~ N(target, 8)
// clamped to [1, 99]. Crude but produces playable variety.
function generateStats(targetOverall: number): PlayerStats {
  const stat = (): number => {
    const noise = rngTransfer(-12, 12);
    return Math.max(1, Math.min(99, targetOverall + noise));
  };
  return {
    stamina:     stat(),
    strength:    stat(),
    pace:        stat(),
    agility:     stat(),
    handling:    stat(),
    tackling:    stat(),
    breakdown:   stat(),
    kicking:     stat(),
    setPiece:    stat(),
    discipline:  stat(),
    positioning: stat(),
    composure:   stat(),
  };
}

function wageFromRating(rating: number): number {
  const anchors = WAGE_BY_RATING;
  if (rating <= anchors[0].rating) return anchors[0].wage;
  if (rating >= anchors[anchors.length - 1].rating) return anchors[anchors.length - 1].wage;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (rating >= a.rating && rating <= b.rating) {
      const t = (rating - a.rating) / (b.rating - a.rating);
      return a.wage + t * (b.wage - a.wage);
    }
  }
  return anchors[anchors.length - 1].wage;
}

// Suppress the unused-import warning if no caller currently uses it.
// rngTransferRaw kept available for future callers.
void rngTransferRaw;
