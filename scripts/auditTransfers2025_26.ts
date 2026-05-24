// One-off Phase B audit script. Loads every team JSON, builds a set of
// "firstName lastName" full names, then walks the candidate inbound
// transfer list and reports matched vs unmatched names so we can write
// a clean src/data/transfers-2025-26.ts.
//
// Run with: npx tsx scripts/auditTransfers2025_26.ts

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEAM_IDS = [
  'bath', 'bristol', 'exeter', 'gloucester', 'harlequins',
  'leicester', 'newcastle', 'northampton', 'sale', 'saracens',
];

const dataDir = join(__dirname, '..', 'src', 'data');

interface RosterEntry {
  firstName: string;
  lastName: string;
  position: string;
}

// Strip diacritics + lowercase for fuzzy matching.
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const fullNames = new Map<string, { teamId: string; pos: string; canonical: string }>();
const normFullToCanonical = new Map<string, string>();
const lastNameIndex = new Map<string, string[]>(); // normLast → canonical names
for (const id of TEAM_IDS) {
  const raw = readFileSync(join(dataDir, `team-${id}.json`), 'utf8');
  const json = JSON.parse(raw) as {
    players: RosterEntry[];
    bench: RosterEntry[];
    squad: RosterEntry[];
  };
  for (const arr of [json.players, json.bench, json.squad]) {
    for (const p of arr) {
      const full = `${p.firstName} ${p.lastName}`;
      fullNames.set(full, { teamId: id, pos: p.position, canonical: full });
      normFullToCanonical.set(norm(full), full);
      const normLast = norm(p.lastName);
      const arr2 = lastNameIndex.get(normLast) ?? [];
      arr2.push(full);
      lastNameIndex.set(normLast, arr2);
    }
  }
}

// Raw candidate list from the user's Wikipedia paste, in the same order.
// 132 entries. fromClub is descriptive; toClub is the canonical team id.
const CANDIDATES: { name: string; fromClub: string; toClub: string }[] = [
  // --- Bath ---
  { name: 'Dan Frost',              fromClub: 'Exeter Chiefs',         toClub: 'bath' },
  { name: 'Bernard van der Linde',  fromClub: 'Bulls',                 toClub: 'bath' },
  { name: 'Santiago Carreras',      fromClub: 'Gloucester',            toClub: 'bath' },
  { name: 'Henry Arundell',         fromClub: 'Racing 92',             toClub: 'bath' },
  { name: 'Chris Harris',           fromClub: 'Gloucester',            toClub: 'bath' },
  { name: 'Henry Mountford',        fromClub: 'Leicester Tigers',      toClub: 'bath' },

  // --- Bristol Bears ---
  { name: 'Tom Jordan',             fromClub: 'Glasgow Warriors',                       toClub: 'bristol' },
  { name: 'Pedro Rubiolo',          fromClub: 'Newcastle Red Bulls',                    toClub: 'bristol' },
  { name: 'Max Pepper',             fromClub: 'Newcastle Red Bulls',                    toClub: 'bristol' },
  { name: 'Josh Carrington',        fromClub: 'Cardiff Metropolitan University',        toClub: 'bristol' },
  { name: 'Will Ramply',            fromClub: 'University of Nottingham',               toClub: 'bristol' },
  { name: 'Luka Ivanishvili',       fromClub: 'Black Lion',                             toClub: 'bristol' },
  { name: 'Louis Rees-Zammit',      fromClub: 'Jacksonville Jaguars (NFL)',             toClub: 'bristol' },
  { name: 'Oscar Lennon',           fromClub: 'New England Free Jacks',                 toClub: 'bristol' },
  { name: 'Matías Moroni',          fromClub: 'Brive',                                  toClub: 'bristol' },
  { name: 'Ellis Bevan',            fromClub: 'Cardiff (short-term loan)',              toClub: 'bristol' },
  { name: 'Mat Protheroe',          fromClub: 'Hartpury University (short-term loan)',  toClub: 'bristol' },
  { name: 'Khalik Kareem',          fromClub: 'Worcester Warriors (season-long loan)',  toClub: 'bristol' },
  { name: 'Fred Davies',            fromClub: 'Doncaster Knights (short-term loan)',    toClub: 'bristol' },

  // --- Exeter Chiefs ---
  { name: 'Tom Hooper',             fromClub: 'ACT Brumbies',          toClub: 'exeter' },
  { name: 'Joseph Dweba',           fromClub: 'Stormers',              toClub: 'exeter' },
  { name: 'Stephen Varney',         fromClub: 'Vannes',                toClub: 'exeter' },
  { name: 'Julian Heaven',          fromClub: 'NSW Waratahs',          toClub: 'exeter' },
  { name: 'Charlie Chapman',        fromClub: 'Gloucester',            toClub: 'exeter' },
  { name: 'Len Ikitau',             fromClub: 'ACT Brumbies',          toClub: 'exeter' },
  { name: 'Andrea Zambonin',        fromClub: 'Zebre Parma',           toClub: 'exeter' },
  { name: 'Bachuki Tchumbadze',     fromClub: 'Black Lion',            toClub: 'exeter' },
  { name: 'Marlon Farouk-Roy',      fromClub: 'Saracens',              toClub: 'exeter' },
  { name: 'Khwezi Mona',            fromClub: 'Sharks',                toClub: 'exeter' },
  { name: 'Harry Ascherl',          fromClub: 'Sydney University',     toClub: 'exeter' },

  // --- Gloucester ---
  { name: 'Will Joseph',            fromClub: 'Harlequins',                        toClub: 'gloucester' },
  { name: 'Ross Byrne',             fromClub: 'Leinster',                          toClub: 'gloucester' },
  { name: 'Ben Loader',             fromClub: 'Stormers',                          toClub: 'gloucester' },
  { name: 'James Venter',           fromClub: 'Sharks',                            toClub: 'gloucester' },
  { name: 'Jack Innard',            fromClub: 'Exeter Chiefs',                     toClub: 'gloucester' },
  { name: 'Ben Redshaw',            fromClub: 'Newcastle Red Bulls',               toClub: 'gloucester' },
  { name: 'Jack Mann',              fromClub: 'Glasgow Warriors',                  toClub: 'gloucester' },
  { name: 'Will Trenholm',          fromClub: 'Harlequins',                        toClub: 'gloucester' },
  { name: 'Mike Austin',            fromClub: 'Hartpury University',               toClub: 'gloucester' },
  { name: 'Josh Basham',            fromClub: 'Shimizu Koto Blue Sharks',          toClub: 'gloucester' },
  { name: 'Hugh Bokenham',          fromClub: 'Cornish Pirates',                   toClub: 'gloucester' },
  { name: 'Rob Russell',            fromClub: 'Leinster',                          toClub: 'gloucester' },
  { name: 'Nepo Laulala',           fromClub: 'Toulouse',                          toClub: 'gloucester' },
  { name: 'Jono Benz-Salomon',      fromClub: 'Hartpury University',               toClub: 'gloucester' },
  { name: 'Danny Eite',             fromClub: 'Academy (promoted)',                toClub: 'gloucester' },
  { name: 'Afolabi Fasogbon',       fromClub: 'Academy (promoted)',                toClub: 'gloucester' },
  { name: 'Josh Hathaway',          fromClub: 'Academy (promoted)',                toClub: 'gloucester' },
  { name: 'Archie McArthur',        fromClub: 'Academy (promoted)',                toClub: 'gloucester' },
  { name: 'Dian Bleuler',           fromClub: 'Sharks',                            toClub: 'gloucester' },
  { name: 'Harrison James',         fromClub: 'Cardiff University (short loan)',   toClub: 'gloucester' },
  { name: 'Manaaki Boyle-Tiatia',   fromClub: 'Waikato (short-term deal)',         toClub: 'gloucester' },
  { name: 'Callum Braley',          fromClub: 'unattached (short-term deal)',      toClub: 'gloucester' },

  // --- Harlequins ---
  { name: 'Kieran Treadwell',       fromClub: 'Ulster',                              toClub: 'harlequins' },
  { name: 'Guido Petti',            fromClub: 'Bordeaux',                            toClub: 'harlequins' },
  { name: 'Harry Williams',         fromClub: 'Pau',                                 toClub: 'harlequins' },
  { name: 'George Turner',          fromClub: 'Kobelco Kobe Steelers',               toClub: 'harlequins' },
  { name: 'Stu Townsend',           fromClub: 'Exeter Chiefs',                       toClub: 'harlequins' },
  { name: 'Max Green',              fromClub: 'Périgueux',                           toClub: 'harlequins' },
  { name: 'Boris Wenger',           fromClub: 'Dogos',                               toClub: 'harlequins' },
  { name: 'Pedro Delgado',          fromClub: 'Dogos',                               toClub: 'harlequins' },
  { name: 'Cameron Doak',           fromClub: 'Ulster (short-term loan)',            toClub: 'harlequins' },
  { name: 'Alex Everett',           fromClub: 'Cornish Pirates (short-term loan)',   toClub: 'harlequins' },
  { name: 'Sean Kerr',              fromClub: 'Academy (promoted)',                  toClub: 'harlequins' },
  { name: 'Jack Grant',             fromClub: 'NSW Waratahs',                        toClub: 'harlequins' },
  { name: 'Alessandro Heaney',      fromClub: 'RFC Los Angeles (short-term deal)',   toClub: 'harlequins' },
  { name: 'Joe Jones',              fromClub: 'Doncaster Knights (short-term deal)', toClub: 'harlequins' },
  { name: 'Andrew Turner',          fromClub: 'Doncaster Knights (short-term deal)', toClub: 'harlequins' },
  { name: 'Luke Yendle',            fromClub: 'Dragons (short-term deal)',           toClub: 'harlequins' },

  // --- Leicester Tigers ---
  { name: 'Jamie Blamire',          fromClub: 'Newcastle Red Bulls',                 toClub: 'leicester' },
  { name: 'Tarek Haffar',           fromClub: 'Northampton Saints',                  toClub: 'leicester' },
  { name: 'Wilf McCarthy',          fromClub: 'Hartpury University',                 toClub: 'leicester' },
  { name: 'Joaquin Moro',           fromClub: 'Pampas XV',                           toClub: 'leicester' },
  { name: 'Charlie Titcombe',       fromClub: 'Scarlets',                            toClub: 'leicester' },
  { name: 'Ollie Allan',            fromClub: 'Academy (promoted)',                  toClub: 'leicester' },
  { name: 'Lewis Chessum',          fromClub: 'Academy (promoted)',                  toClub: 'leicester' },
  { name: 'Archie van der Flier',   fromClub: 'Academy (promoted)',                  toClub: 'leicester' },
  { name: 'Josh Manz',              fromClub: 'Academy (promoted)',                  toClub: 'leicester' },
  { name: 'Cameron Miell',          fromClub: 'Academy (promoted)',                  toClub: 'leicester' },
  { name: 'Orlando Bailey',         fromClub: 'Bath',                                toClub: 'leicester' },
  { name: 'Gabriel Hamer-Webb',     fromClub: 'Cardiff',                             toClub: 'leicester' },
  { name: "James O'Connor",         fromClub: 'Crusaders',                           toClub: 'leicester' },
  { name: 'Billy Searle',           fromClub: 'Agen',                                toClub: 'leicester' },
  { name: 'John Stewart',           fromClub: 'Bath',                                toClub: 'leicester' },
  { name: 'James Thompson',         fromClub: 'Chiefs (NZ)',                         toClub: 'leicester' },
  { name: 'Tonga Kofe',             fromClub: 'Utah Warriors',                       toClub: 'leicester' },
  { name: 'Ryan Crowley',           fromClub: 'Chinnor',                             toClub: 'leicester' },
  { name: 'Hamish Watson',          fromClub: 'Edinburgh (short-term loan)',         toClub: 'leicester' },

  // --- Newcastle Red Bulls ---
  { name: 'Ethan Grayson',          fromClub: 'San Diego Legion',                    toClub: 'newcastle' },
  { name: 'Connor Doherty',         fromClub: 'Sale Sharks',                         toClub: 'newcastle' },
  { name: 'George McGuigan',        fromClub: 'Ospreys',                             toClub: 'newcastle' },
  { name: 'Jamie Hodgson',          fromClub: 'Edinburgh',                           toClub: 'newcastle' },
  { name: 'Freddie Clarke',         fromClub: 'Gloucester',                          toClub: 'newcastle' },
  { name: 'Amanaki Mafi',           fromClub: 'Yokohama Canon Eagles',               toClub: 'newcastle' },
  { name: 'Simón Benítez Cruz',     fromClub: 'Tarucas',                             toClub: 'newcastle' },
  { name: 'Tom Christie',           fromClub: 'Crusaders',                           toClub: 'newcastle' },
  { name: 'Fergus Lee-Warner',      fromClub: 'NSW Waratahs',                        toClub: 'newcastle' },
  { name: 'Boeta Chamberlain',      fromClub: 'Bulls',                               toClub: 'newcastle' },
  { name: 'Hame Faiva',             fromClub: 'Bath',                                toClub: 'newcastle' },
  { name: 'Christian Wade',         fromClub: 'Wigan Warriors (Rugby League)',       toClub: 'newcastle' },
  { name: 'Joel Grayson',           fromClub: 'Old Northamptonians',                 toClub: 'newcastle' },
  { name: 'Harrison Obatoyinbo',    fromClub: 'Mont-de-Marsan',                      toClub: 'newcastle' },
  { name: 'Sam Waugh',              fromClub: 'Loughborough Students',               toClub: 'newcastle' },
  { name: 'Stefan Coetzee',         fromClub: 'Pumas',                               toClub: 'newcastle' },
  { name: 'Liam Williams',          fromClub: 'Saracens',                            toClub: 'newcastle' },
  { name: 'Cammy Hutchison',        fromClub: 'Saracens',                            toClub: 'newcastle' },
  { name: 'Stewart Moore',          fromClub: 'Ulster (short-term loan)',            toClub: 'newcastle' },
  { name: 'Samson Adejimi',         fromClub: 'Saracens (season-long loan)',         toClub: 'newcastle' },
  { name: 'Bryn Gordon',            fromClub: 'North Harbour',                       toClub: 'newcastle' },
  { name: 'Jamie Clark',            fromClub: 'Old Wesley',                          toClub: 'newcastle' },

  // --- Northampton Saints ---
  { name: 'Cleopas Kundiona',       fromClub: 'Nevers',                              toClub: 'northampton' },
  { name: 'Amena Caqusau',          fromClub: 'Glasgow Warriors',                    toClub: 'northampton' },
  { name: 'Danilo Fischetti',       fromClub: 'Zebre Parma',                         toClub: 'northampton' },
  { name: 'Callum Chick',           fromClub: 'Newcastle Red Bulls',                 toClub: 'northampton' },
  { name: 'Anthony Belleau',        fromClub: 'Clermont',                            toClub: 'northampton' },
  { name: 'JJ van der Mescht',      fromClub: 'Stade Français',                      toClub: 'northampton' },
  { name: 'James Martin',           fromClub: 'Coventry',                            toClub: 'northampton' },
  { name: 'Aidan Pugh',             fromClub: 'Bath',                                toClub: 'northampton' },
  { name: 'Marco Manfredi',         fromClub: 'Benetton',                            toClub: 'northampton' },

  // --- Sale Sharks ---
  { name: 'Nathan Jibulu',          fromClub: 'Harlequins',                          toClub: 'sale' },
  { name: 'Marius Louw',            fromClub: 'Lions',                               toClub: 'sale' },
  { name: 'Jacques Vermeulen',      fromClub: 'Exeter Chiefs',                       toClub: 'sale' },
  { name: 'Reuben Logan',           fromClub: 'Northampton Saints',                  toClub: 'sale' },
  { name: 'Patrick Hogg',           fromClub: 'Newcastle Red Bulls',                 toClub: 'sale' },
  { name: 'Regan Grace',            fromClub: 'Cardiff (short-term deal)',           toClub: 'sale' },
  { name: 'Gurshwin Wehr',          fromClub: 'Griquas (short-term loan)',           toClub: 'sale' },

  // --- Saracens ---
  { name: 'Max Malins',             fromClub: 'Bristol Bears',                       toClub: 'saracens' },
  { name: 'Marcus Street',          fromClub: 'Exeter Chiefs',                       toClub: 'saracens' },
  { name: 'Vilikesa Nairau',        fromClub: 'Coventry',                            toClub: 'saracens' },
  { name: 'Tietie Tuimauga',        fromClub: 'Montauban',                           toClub: 'saracens' },
  { name: 'Owen Farrell',           fromClub: 'Racing 92',                           toClub: 'saracens' },
  { name: 'Cammy Hutchison',        fromClub: 'Newcastle Red Bulls (short-term loan)', toClub: 'saracens' },
  { name: "Totoa Auva'a",           fromClub: "Lauli'i Lions",                       toClub: 'saracens' },
];

console.log(`Loaded ${fullNames.size} roster names across 10 clubs`);
console.log(`Candidate inbound transfers: ${CANDIDATES.length}\n`);

const matched: { name: string; canonical: string; toClub: string; rosterTeam: string; pos: string; via: string }[] = [];
const unmatched: { name: string; fromClub: string; toClub: string; suggestions: string[] }[] = [];

for (const c of CANDIDATES) {
  // 1. Exact match
  let hit = fullNames.get(c.name);
  if (hit) {
    matched.push({ name: c.name, canonical: hit.canonical, toClub: c.toClub, rosterTeam: hit.teamId, pos: hit.pos, via: 'exact' });
    continue;
  }
  // 2. Diacritic-stripped match
  const canonical = normFullToCanonical.get(norm(c.name));
  if (canonical) {
    const hit2 = fullNames.get(canonical)!;
    matched.push({ name: c.name, canonical: hit2.canonical, toClub: c.toClub, rosterTeam: hit2.teamId, pos: hit2.pos, via: 'diacritic' });
    continue;
  }
  // 3. Last-name fallback (single hit only — otherwise too ambiguous).
  // Tightened: only accept when the first names share an initial AND
  // first-name prefix overlaps (handles Cammy/Cameron, Aidan/Aiden but
  // rejects Stefan/Jaco). This keeps unrelated same-surname pairs out.
  const parts = c.name.split(' ');
  const last = parts[parts.length - 1];
  const candidateFirst = parts.slice(0, -1).join(' ');
  const candidates = lastNameIndex.get(norm(last)) ?? [];
  const cf = norm(candidateFirst);
  // Filter same-surname candidates whose firstName initial AND 3-char prefix
  // overlap with the Wikipedia name. Pick if exactly one survives —
  // handles Josh/Joshua Manz even when a Tom Manz also exists.
  const compatible = candidates.filter(cand => {
    const rf = norm(cand.split(' ').slice(0, -1).join(' '));
    if (cf[0] !== rf[0]) return false;
    return cf.startsWith(rf.slice(0, 3)) || rf.startsWith(cf.slice(0, 3));
  });
  if (compatible.length === 1) {
    const hit3 = fullNames.get(compatible[0])!;
    matched.push({ name: c.name, canonical: hit3.canonical, toClub: c.toClub, rosterTeam: hit3.teamId, pos: hit3.pos, via: 'lastname' });
    continue;
  }
  unmatched.push({ ...c, suggestions: candidates });
}

const byVia = { exact: 0, diacritic: 0, lastname: 0 };
for (const m of matched) byVia[m.via as 'exact'|'diacritic'|'lastname']++;
console.log(`=== MATCHED (${matched.length}) — exact:${byVia.exact} diacritic:${byVia.diacritic} lastname:${byVia.lastname} ===`);
for (const m of matched) {
  const flag = m.toClub === m.rosterTeam ? '✓' : `✗ on roster as ${m.rosterTeam}`;
  const renamed = m.via === 'exact' ? '' : `  [${m.via}: ${m.canonical}]`;
  console.log(`  ${m.name.padEnd(28)} → ${m.toClub.padEnd(12)} ${flag}${renamed}`);
}

console.log(`\n=== UNMATCHED (${unmatched.length}) ===`);
for (const u of unmatched) {
  const sug = u.suggestions.length ? ` ?? ${u.suggestions.join(' | ')}` : '';
  console.log(`  ${u.name.padEnd(28)} (would join ${u.toClub} from ${u.fromClub})${sug}`);
}

console.log(`\nSummary: ${matched.length}/${CANDIDATES.length} matched (${Math.round(100 * matched.length / CANDIDATES.length)}%)`);
const wrongClub = matched.filter(m => m.toClub !== m.rosterTeam);
if (wrongClub.length > 0) {
  console.log(`Mismatches between Wikipedia and roster club assignment: ${wrongClub.length}`);
}

// Lastname-fuzzy matches that are NOT legitimate diminutives — reject
// these from the final output (Bryn ≠ Bryce, etc.). Everything else
// passing the lastname heuristic is on a known-good shortlist.
const LASTNAME_REJECT = new Set<string>([
  'Bryn Gordon', // matched to Bryce Gordon — different player
]);

// Dedupe by canonical roster name (same player listed twice in
// Wikipedia, e.g. a permanent move + a later short-term loan in the
// same season). Keep the first entry's `toClub` — that's where the
// player actually ended up at the start of 2025-26.
const seen = new Set<string>();
const finalEntries: { name: string; fromClub: string; toClub: string; canonical: string }[] = [];
const skippedRejects: string[] = [];
const skippedDupes: string[] = [];

for (const m of matched) {
  if (LASTNAME_REJECT.has(m.name)) {
    skippedRejects.push(m.name);
    continue;
  }
  if (seen.has(m.canonical)) {
    skippedDupes.push(`${m.name} → ${m.toClub} (already unwound as ${m.canonical})`);
    continue;
  }
  seen.add(m.canonical);
  const orig = CANDIDATES.find(c => c.name === m.name && c.toClub === m.toClub)!;
  finalEntries.push({ name: m.canonical, fromClub: orig.fromClub, toClub: m.toClub, canonical: m.canonical });
}

console.log(`\n=== FINAL CURATED LIST (${finalEntries.length}) ===`);
console.log(`Rejected fuzzy matches: ${skippedRejects.length} (${skippedRejects.join(', ')})`);
console.log(`Skipped duplicates: ${skippedDupes.length}`);
for (const d of skippedDupes) console.log(`  · ${d}`);

console.log(`\n=== TS FILE OUTPUT ===\n`);
console.log(`// Generated by scripts/auditTransfers2025_26.ts on ${new Date().toISOString().slice(0, 10)}.`);
console.log(`// Source: https://en.wikipedia.org/wiki/List_of_2025-26_Premiership_Rugby_transfers`);
console.log(`// Audit summary: ${matched.length}/${CANDIDATES.length} Wikipedia entries matched; ${finalEntries.length} entries after dedupe + reject.`);
console.log(`// ${unmatched.length} Wikipedia entries unmatched (foreign/loan/lower-league signings not in the seed roster — they aren't anywhere to unwind from).`);
console.log(`export const PRE_SEASON_TRANSFERS_2025_26: PreSeasonTransfer[] = [`);
let lastClub = '';
for (const e of finalEntries) {
  if (e.toClub !== lastClub) {
    console.log(`  // ${e.toClub}`);
    lastClub = e.toClub;
  }
  const esc = e.name.includes("'") ? `"${e.name}"` : `'${e.name}'`;
  console.log(`  { name: ${esc.padEnd(28)}, fromClub: '${e.fromClub.replace(/'/g, "\\'")}' },`);
}
console.log(`];`);
