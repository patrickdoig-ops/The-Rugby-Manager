#!/usr/bin/env node
// Generate src/data/european-teams.ts from docs/european-team-data.md.
// Re-runnable — parses the markdown and writes the TypeScript array.
// Run with: node scripts/generateEuropeanTeams.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, 'docs/european-team-data.md');
const OUT = resolve(ROOT, 'src/data/european-teams.ts');

// ─── Slug map ─────────────────────────────────────────────────────────────
// Maps the ## section name to a stable slug for the team id.
const SLUG_MAP = {
  'Toulouse':                       'toulouse',
  'Clermont':                       'clermont',
  'Toulon':                         'toulon',
  'Castres':                        'castres',
  'La Rochelle':                    'la-rochelle',
  'Bayonne':                        'bayonne',
  'Bordeaux Bègles':               'bordeaux',
  'Section Paloise (Pau)':          'pau',
  'Glasgow Warriors':               'glasgow',
  'Hollywoodbets Sharks':           'sharks',
  'Edinburgh Rugby':                'edinburgh',
  'Munster Rugby':                  'munster',
  'Leinster Rugby':                 'leinster',
  'DHL Stormers':                   'stormers',
  'Vodacom Bulls':                  'bulls',
  'Scarlets':                       'scarlets',
  'Montpellier Hérault Rugby':     'montpellier',
  'US Montauban':                   'montauban',
  'Lyon Olympique Universitaire':   'lyon',
  'USAP (Union Sportive Arlequins Perpignanais)': 'usap',
  'Racing 92':                      'racing92',
  'Stade Français Paris':           'stade-francais',
  'Connacht':                       'connacht',
  'Ospreys':                        'ospreys',
  'Zebre Parma':                    'zebre',
  'Black Lion':                     'black-lion',
  'Benetton Rugby':                 'benetton',
  'Dragons RFC':                    'dragons',
  'Emirates Lions':                 'em-lions',
  'Ulster Rugby':                   'ulster',
  'Cardiff Rugby':                  'cardiff',
  'Toyota Cheetahs':                'cheetahs',
};

// Short names for display
const SHORT_NAME_MAP = {
  'toulouse':      'TOU',
  'clermont':      'CLR',
  'toulon':        'TLN',
  'castres':       'CAS',
  'la-rochelle':   'LRO',
  'bayonne':       'BAY',
  'bordeaux':      'BOR',
  'pau':           'PAU',
  'glasgow':       'GLA',
  'sharks':        'SHA',
  'edinburgh':     'EDI',
  'munster':       'MUN',
  'leinster':      'LEI',
  'stormers':      'STO',
  'bulls':         'BUL',
  'scarlets':      'SCA',
  'montpellier':   'MTP',
  'montauban':     'MON',
  'lyon':          'LYO',
  'usap':          'PER',
  'racing92':      'R92',
  'stade-francais':'STF',
  'connacht':      'CON',
  'ospreys':       'OSP',
  'zebre':         'ZEB',
  'black-lion':    'BLI',
  'benetton':      'TRE',
  'dragons':       'DRA',
  'em-lions':      'LIO',
  'ulster':        'ULS',
  'cardiff':       'CAR',
  'cheetahs':      'CHE',
};

// De-branded display names (sponsors stripped; club names reduced to the
// city/town where appropriate). Keyed by slug; only entries that differ from
// the source `##` header. The header + SLUG_MAP stay untouched so team ids
// remain stable.
const DISPLAY_NAME_MAP = {
  'bordeaux':       'Bordeaux',
  'pau':            'Pau',
  'glasgow':        'Glasgow',
  'sharks':         'Sharks',
  'edinburgh':      'Edinburgh',
  'munster':        'Munster',
  'leinster':       'Leinster',
  'stormers':       'Stormers',
  'bulls':          'Bulls',
  'montpellier':    'Montpellier',
  'montauban':      'Montauban',
  'lyon':           'Lyon',
  'usap':           'Perpignan',
  'stade-francais': 'Stade Français',
  'zebre':          'Zebre',
  'benetton':       'Treviso',
  'dragons':        'Dragons',
  'em-lions':       'Lions',
  'ulster':         'Ulster',
  'cardiff':        'Cardiff',
  'cheetahs':       'Cheetahs',
};

// Section headers that are not team entries
const SECTION_HEADERS = new Set([
  'CHAMPIONS CUP — FRENCH CLUBS',
  'CHAMPIONS CUP — URC CLUBS',
  'CHALLENGE CUP — FRENCH CLUBS',
  'CHALLENGE CUP — URC & INVITED CLUBS',
]);

const STAT_KEYS = ['stamina','strength','pace','agility','handling','tackling','breakdown','kicking','setPiece','discipline','positioning','composure'];

const TACTIC_KEYS = ['attackingGamePlan', 'attackingStyle', 'attackingBreakdown', 'defendingBreakdown', 'backfieldDefence', 'defensiveLine', 'offloadStrategy', 'intensity', 'discipline'];
const DEFAULT_TACTICS = {
  attackingGamePlan: 'balanced',
  attackingStyle: 'balanced',
  attackingBreakdown: 'balanced',
  defendingBreakdown: 'jackal',
  backfieldDefence: 'one_back',
  defensiveLine: 'hybrid',
  offloadStrategy: 'balanced',
  intensity: 'balanced',
  discipline: 'balanced',
};

function parsePosition(s) {
  const t = s.trim();
  if (/prop/i.test(t)) return 'Prop';
  if (/hooker/i.test(t)) return 'Hooker';
  if (/lock/i.test(t)) return 'Lock';
  if (/number 8|no\.?\s*8|n\.?8/i.test(t)) return 'Number 8';
  if (/back row|backrow/i.test(t)) return 'Back Row';
  if (/flanker/i.test(t)) return 'Flanker';
  if (/scrum.?half/i.test(t)) return 'Scrum-Half';
  if (/fly.?half/i.test(t)) return 'Fly-Half';
  if (/centre/i.test(t)) return 'Centre';
  if (/full.?back/i.test(t)) return 'Fullback';
  if (/wing/i.test(t)) return 'Wing';
  if (/utility/i.test(t)) return 'Utility Back';
  return t;
}

function splitName(full) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function parseTableSection(squadBlock, label, teamName) {
  const re = new RegExp(`\\*\\*${label.replace(/[—()]/g, c => '\\' + c)}\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*|\\n---|\\n## |$)`);
  const m = squadBlock.match(re);
  if (!m) return null;
  const out = [];
  for (const row of m[1].split('\n')) {
    if (!row.startsWith('|')) continue;
    if (/^\|[-\s|]+\|$/.test(row)) continue;
    if (/\|\s*Name\s*\|/i.test(row)) continue;
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 17) continue;
    const [name, position, dob, , nationality, ...rawStats] = cells;
    if (!name) continue;
    const baseStats = {};
    rawStats.forEach((val, i) => {
      if (i < STAT_KEYS.length) baseStats[STAT_KEYS[i]] = parseInt(val, 10);
    });
    out.push({ name, position: parsePosition(position), dob: dob || null, nationality: nationality || 'Unknown', baseStats });
  }
  return out;
}

function bucketByPosition(players) {
  const byPos = { Prop: [], Hooker: [], Lock: [], Flanker: [], 'Number 8': [], 'Back Row': [], 'Scrum-Half': [], 'Fly-Half': [], Centre: [], Wing: [], Fullback: [], 'Utility Back': [] };
  for (const p of players) {
    const bucket = byPos[p.position] ?? byPos['Utility Back'];
    bucket.push(p);
  }
  while (byPos['Back Row'].length) {
    const p = byPos['Back Row'].shift();
    if (byPos['Flanker'].length < 4) byPos['Flanker'].push(p);
    else if (byPos['Number 8'].length < 2) byPos['Number 8'].push(p);
    else byPos['Flanker'].push(p);
  }
  return byPos;
}

function assignStarterJerseys(players, stars) {
  const byPos = bucketByPosition(players);
  // Stars first within each bucket
  for (const list of Object.values(byPos)) list.sort((a, b) => Number(stars.some(s => s.name === b.name)) - Number(stars.some(s => s.name === a.name)));
  const take = (list) => list.length > 0 ? list.shift() : null;
  const starters = [];
  const propA = take(byPos.Prop);
  const propB = take(byPos.Prop);
  starters.push({ ...propA, id: 1 });
  starters.push({ ...take(byPos.Hooker), id: 2 });
  starters.push({ ...propB, id: 3 });
  starters.push({ ...take(byPos.Lock), id: 4 });
  starters.push({ ...take(byPos.Lock), id: 5 });
  const flA = take(byPos.Flanker);
  const flB = take(byPos.Flanker);
  const n8 = byPos['Number 8'].length > 0 ? take(byPos['Number 8']) : take(byPos.Flanker);
  starters.push({ ...flA, id: 6 });
  starters.push({ ...flB, id: 7 });
  starters.push({ ...n8, id: 8 });
  starters.push({ ...take(byPos['Scrum-Half']), id: 9 });
  starters.push({ ...take(byPos['Fly-Half']), id: 10 });
  starters.push({ ...take(byPos.Wing), id: 11 });
  starters.push({ ...take(byPos.Centre), id: 12 });
  starters.push({ ...take(byPos.Centre), id: 13 });
  starters.push({ ...take(byPos.Wing), id: 14 });
  const fb = byPos.Fullback.length > 0 ? take(byPos.Fullback) : byPos['Utility Back'].length > 0 ? take(byPos['Utility Back']) : take(byPos.Wing);
  starters.push({ ...fb, id: 15 });
  return starters;
}

function assignBenchJerseys(players) {
  const byPos = bucketByPosition(players);
  const bench = [];
  const slots = [
    { id: 16, src: 'Hooker' },
    { id: 17, src: 'Prop' },
    { id: 18, src: 'Prop' },
    { id: 19, src: 'Lock' },
    { id: 20, src: 'Flanker' },
    { id: 21, src: 'Scrum-Half' },
    { id: 22, src: 'Fly-Half' },
    { id: 23, src: 'Utility Back' },
  ];
  for (const slot of slots) {
    let pool = byPos[slot.src];
    if (!pool || pool.length === 0) {
      if (slot.src === 'Utility Back') pool = byPos.Wing.length ? byPos.Wing : byPos.Fullback.length ? byPos.Fullback : byPos.Centre;
      else if (slot.src === 'Fly-Half') pool = byPos.Centre.length ? byPos.Centre : byPos.Fullback.length ? byPos.Fullback : byPos.Wing.length ? byPos.Wing : byPos['Scrum-Half'];
      else if (slot.src === 'Flanker') pool = byPos['Number 8'];
      else if (slot.src === 'Hooker') pool = byPos.Prop;
    }
    const p = pool && pool.length > 0 ? pool.shift() : null;
    if (p) bench.push({ ...p, id: slot.id });
  }
  return bench;
}

function buildPlayerObj(p, stars) {
  const { firstName, lastName } = splitName(p.name);
  const marqueeStar = stars.find(s => s.name === p.name && s.isMarquee);
  const result = {
    id: p.id,
    squadNumber: p.id,
    firstName,
    lastName,
    dob: p.dob || null,
    nationality: p.nationality || 'Unknown',
    position: p.position,
    baseStats: p.baseStats,
  };
  if (marqueeStar) {
    result.contract = { isMarquee: true, ...(marqueeStar.annualWage ? { annualWage: marqueeStar.annualWage } : {}) };
  }
  return result;
}

// ─── Main parser ──────────────────────────────────────────────────────────

function parseEuropeanTeamsMd(md) {
  const teams = [];
  // Split on ## headers
  const sections = md.split(/^## /m).slice(1);
  let currentLeagueGroup = 'urc';

  for (const section of sections) {
    const lines = section.split('\n');
    const headerLine = lines[0].trim();

    // Section dividers — update leagueGroup context
    if (SECTION_HEADERS.has(headerLine)) {
      currentLeagueGroup = /french/i.test(headerLine) ? 'french' : 'urc';
      continue;
    }

    const slug = SLUG_MAP[headerLine];
    if (!slug) {
      console.warn(`  ? Skipping unknown section: "${headerLine}"`);
      continue;
    }

    const body = lines.slice(1).join('\n');

    const coloursMatch = body.match(/\*\*Club colours:\*\*\s*`(#[0-9a-fA-F]{6})`\s*\/\s*`(#[0-9a-fA-F]{6})`/);
    if (!coloursMatch) throw new Error(`Missing Club colours for ${headerLine}`);
    const stadiumMatch = body.match(/\*\*Home ground:\*\*\s*(.+?)\.\s*$/m);
    const capacityMatch = body.match(/\*\*Stadium capacity:\*\*\s*([\d,]+)/);
    const ratingMatch = body.match(/\*\*Overall rating:\*\*\s*\*\*(\d+)\/100\*\*/);

    // Competition line: "Champions Cup, Pool 2" or "Challenge Cup, Pool 1"
    const compMatch = body.match(/\*\*Competition:\*\*\s*(Champions|Challenge)\s+Cup,\s*Pool\s*(\d)/);
    if (!compMatch) throw new Error(`Missing Competition line for ${headerLine}`);
    const competition = compMatch[1] === 'Champions' ? 'europeanCup' : 'europeanShield';
    const pool = parseInt(compMatch[2], 10);

    // Stat bias
    const statBiasMatch = body.match(/\*\*Stat bias:\*\*\s*(.+)$/m);
    const statBias = statBiasMatch ? [...statBiasMatch[1].matchAll(/`(\w+)`/g)].map(m => m[1]) : [];

    // Tactics
    const tacticsMatch = body.match(/\*\*Suggested tactics:\*\*\s*(.+)$/m);
    const suggestedTactics = { ...DEFAULT_TACTICS };
    if (tacticsMatch) {
      const vals = [...tacticsMatch[1].matchAll(/`([a-z_]+)`/g)].map(m => m[1]);
      vals.forEach((v, i) => { if (i < TACTIC_KEYS.length) suggestedTactics[TACTIC_KEYS[i]] = v; });
    }

    // Stars
    const stars = [];
    const starsBlockMatch = body.match(/### Star players\s*\n([\s\S]*?)(?=\n### |\n## |\n---|$)/);
    if (starsBlockMatch) {
      for (const line of starsBlockMatch[1].split('\n').filter(l => l.startsWith('- **'))) {
        const m = line.match(/^- \*\*([^*]+)\*\*\s*\(([^,]+),\s*([^)]+)\)\s*Index high:\s*(.+?)\.\s*Suggested rating:\s*\*\*(\d+)\/100\*\*/);
        if (!m) continue;
        const isMarquee = /Marquee:\s*yes/i.test(line);
        const wageMatch = line.match(/Wage:\s*£([\d.]+)\s*(m|k)\b/i);
        const annualWage = wageMatch ? (wageMatch[2].toLowerCase() === 'm' ? Math.round(parseFloat(wageMatch[1]) * 1_000_000) : Math.round(parseFloat(wageMatch[1]) * 1_000)) : null;
        stars.push({ name: m[1].trim(), position: parsePosition(m[2]), nationality: m[3].trim(), indexHigh: [...m[4].matchAll(/`(\w+)`/g)].map(x => x[1]), rating: parseInt(m[5], 10), isMarquee, annualWage });
      }
    }

    // Squad tables — European teams have only 3 sections (no Wider squad)
    const squadMatch = body.match(/### Squad \(2025-26\)\s*\n([\s\S]*?)(?=\n---|\n## |$)/);
    if (!squadMatch) throw new Error(`Missing Squad section for ${headerLine}`);
    const squadBlock = squadMatch[1];

    const startForwards = parseTableSection(squadBlock, 'Starting XV — Forwards', headerLine);
    const startBacks = parseTableSection(squadBlock, 'Starting XV — Backs', headerLine);
    const benchTier = parseTableSection(squadBlock, 'Bench', headerLine);

    if (!startForwards) throw new Error(`Missing Starting XV Forwards for ${headerLine}`);
    if (!startBacks) throw new Error(`Missing Starting XV Backs for ${headerLine}`);
    if (!benchTier) throw new Error(`Missing Bench for ${headerLine}`);

    const starters = [...startForwards, ...startBacks];
    if (starters.length !== 15) {
      throw new Error(`${headerLine}: Starting XV has ${starters.length} players (fwd ${startForwards.length} + bk ${startBacks.length}), expected 15`);
    }
    if (benchTier.length < 7) {
      throw new Error(`${headerLine}: Bench has only ${benchTier.length} players`);
    }

    const allPlayers = [...starters, ...benchTier];
    for (const star of stars) {
      if (!allPlayers.some(p => p.name === star.name)) {
        throw new Error(`${headerLine}: Star "${star.name}" not in squad tables`);
      }
      if (!starters.some(p => p.name === star.name)) {
        console.warn(`  ! ${headerLine}: Star "${star.name}" is on the bench`);
      }
    }

    const startersFinal = assignStarterJerseys(starters, stars);
    const benchFinal = assignBenchJerseys(benchTier);

    teams.push({
      id: slug,
      name: DISPLAY_NAME_MAP[slug] || headerLine,
      shortName: SHORT_NAME_MAP[slug] || slug.toUpperCase().slice(0, 3),
      color: coloursMatch[1].toLowerCase(),
      secondaryColor: coloursMatch[2].toLowerCase(),
      stadium: stadiumMatch ? stadiumMatch[1].trim() : 'Unknown',
      stadiumCapacity: capacityMatch ? parseInt(capacityMatch[1].replace(/,/g, ''), 10) : undefined,
      suggestedTactics,
      competition,
      leagueGroup: currentLeagueGroup,
      pool,
      rating: ratingMatch ? parseInt(ratingMatch[1], 10) : 75,
      statBias,
      stars: stars.map(s => ({ name: s.name, position: s.position, nationality: s.nationality, indexHigh: s.indexHigh, suggestedRating: s.rating })),
      players: startersFinal.map(p => buildPlayerObj(p, stars)),
      bench: benchFinal.map(p => buildPlayerObj(p, stars)),
    });
  }
  return teams;
}

// ─── TypeScript emitter ────────────────────────────────────────────────────

function jsVal(v, indent) {
  const pad = ' '.repeat(indent);
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.every(x => typeof x !== 'object' || x === null)) return `[${v.map(x => jsVal(x, 0)).join(', ')}]`;
    const items = v.map(x => `${pad}  ${jsVal(x, indent + 2)}`).join(',\n');
    return `[\n${items},\n${pad}]`;
  }
  // object
  const entries = Object.entries(v).filter(([, val]) => val !== undefined);
  if (entries.length === 0) return '{}';
  const lines = entries.map(([k, val]) => {
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
    return `${pad}  ${key}: ${jsVal(val, indent + 2)}`;
  });
  return `{\n${lines.join(',\n')},\n${pad}}`;
}

// ─── Run ──────────────────────────────────────────────────────────────────

const md = readFileSync(SOURCE, 'utf8');
let teams;
try {
  teams = parseEuropeanTeamsMd(md);
} catch (e) {
  console.error('Parse error:', e.message);
  process.exit(1);
}

const ecTeams = teams.filter(t => t.competition === 'europeanCup');
const esTeams = teams.filter(t => t.competition === 'europeanShield');
console.log(`Parsed ${teams.length} teams (${ecTeams.length} European Cup, ${esTeams.length} European Shield)`);

const lines = [
  `// AUTO-GENERATED by scripts/generateEuropeanTeams.mjs — do not edit by hand.`,
  `// Re-generate with: node scripts/generateEuropeanTeams.mjs`,
  ``,
  `import type { RawTeamInput } from '../types/teamData';`,
  ``,
  `export type EuropeanCompetition = 'europeanCup' | 'europeanShield';`,
  `export type EuropeanLeagueGroup = 'french' | 'urc';`,
  ``,
  `export interface StarMeta {`,
  `  name: string;`,
  `  position: string;`,
  `  nationality: string;`,
  `  indexHigh: string[];`,
  `  suggestedRating: number;`,
  `}`,
  ``,
  `export interface EuropeanTeamData extends RawTeamInput {`,
  `  competition: EuropeanCompetition;`,
  `  leagueGroup: EuropeanLeagueGroup;`,
  `  pool: number;`,
  `  rating: number;`,
  `  statBias: string[];`,
  `  stars: StarMeta[];`,
  `}`,
  ``,
  `export const europeanTeams: EuropeanTeamData[] = ${jsVal(teams, 0)};`,
  ``,
];

writeFileSync(OUT, lines.join('\n'));
console.log(`Wrote ${OUT}`);
for (const t of teams) {
  console.log(`  ✓ ${t.name.padEnd(40)} ${t.competition === 'europeanCup' ? 'EC' : 'ES'} Pool ${t.pool}  ${t.players.length} starters / ${t.bench.length} bench`);
}
