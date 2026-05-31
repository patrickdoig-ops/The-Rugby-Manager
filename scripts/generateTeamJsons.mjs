#!/usr/bin/env node
// Generate team JSON files from docs/team-data.md.
// Re-runnable: parses docs/team-data.md and writes src/data/team-<slug>.json for all 10 Prem teams.
// Run with: node scripts/generateTeamJsons.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, 'docs/team-data.md');
const OUT_DIR = resolve(ROOT, 'src/data');

// ─── Team metadata ─────────────────────────────────────────────────────────

// Colours are parsed from each team's `Club colours:` line in docs/team-data.md.
const TEAM_META = {
  'Gloucester':   { slug: 'gloucester',  shortName: 'GLO' },
  'Bristol':      { slug: 'bristol',     shortName: 'BRI' },
  'Leicester':    { slug: 'leicester',   shortName: 'LEI' },
  'Saracens':     { slug: 'saracens',    shortName: 'SAR' },
  'Bath':         { slug: 'bath',        shortName: 'BAT' },
  'Exeter':       { slug: 'exeter',      shortName: 'EXE' },
  'Harlequins':   { slug: 'harlequins',  shortName: 'HAR' },
  'Newcastle':    { slug: 'newcastle',   shortName: 'NEW' },
  'Northampton':  { slug: 'northampton', shortName: 'NOR' },
  'Sale':         { slug: 'sale',        shortName: 'SAL' },
};

// Map md tactics literals to TeamTactics dimensions in fixed order:
// attackingGamePlan · attackingStyle · attackingBreakdown · defendingBreakdown · backfieldDefence · defensiveLine · offloadStrategy
// Per-team lines that omit trailing values fall back to DEFAULT_TACTICS slot
// by slot, so legacy 6-value lines still round-trip cleanly.
const TACTIC_KEYS = ['attackingGamePlan', 'attackingStyle', 'attackingBreakdown', 'defendingBreakdown', 'backfieldDefence', 'defensiveLine', 'offloadStrategy'];
const DEFAULT_TACTICS = {
  attackingGamePlan: 'balanced',
  attackingStyle: 'balanced',
  attackingBreakdown: 'balanced',
  defendingBreakdown: 'jackal',
  backfieldDefence: 'one_back',
  defensiveLine: 'hybrid',
  offloadStrategy: 'balanced',
};



const STAT_KEYS = ['stamina','strength','pace','agility','handling','tackling','breakdown','kicking','setPiece','discipline','positioning','composure'];

// Normalise the team-data.md position string into the engine's Position enum
// (see src/types/player.ts). Generic forms only — the md is the source of
// truth and we no longer split Loosehead/Tighthead, Left/Right Lock, etc.

const SIMPLE_FROM_TEAMDATA = (s) => {
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
};



// ─── Parser ────────────────────────────────────────────────────────────────

function parseTeamDataMd(md) {
  const teams = {};
  const sections = md.split(/^## /m).slice(1);
  for (const section of sections) {
    const lines = section.split('\n');
    const headerLine = lines[0];
    // Header is the team name, optionally followed by a parenthetical marker
    // (legacy `*(in game)*` / `*(to add)*`); anything not in TEAM_META is skipped.
    const teamName = headerLine.replace(/\s*\*\([^)]+\)\*\s*$/, '').trim();
    if (!TEAM_META[teamName]) continue;

    const body = lines.slice(1).join('\n');

    const stadiumMatch = body.match(/\*\*Home ground:\*\*\s*(.+?)\.\s*$/m);
    const coloursMatch = body.match(/\*\*Club colours:\*\*\s*`(#[0-9a-fA-F]{6})`\s*\/\s*`(#[0-9a-fA-F]{6})`/);
    if (!coloursMatch) throw new Error(`Missing 'Club colours:' line for ${teamName}`);
    const nicknameMatch  = body.match(/\*\*Nickname:\*\*\s*(.+?)\.\s*$/m);
    const foundedMatch   = body.match(/\*\*Founded:\*\*\s*(\d{4})/);
    const capacityMatch  = body.match(/\*\*Stadium capacity:\*\*\s*([\d,]+)/);
    const headCoachMatch = body.match(/\*\*Head coach:\*\*\s*(.+?)\.\s*$/m);
    const ratingMatch = body.match(/\*\*Overall rating:\*\*\s*\*\*(\d+)\/100\*\*/);
    const statBiasMatch = body.match(/\*\*Stat bias:\*\*\s*(.+)$/m);
    const boardAmbitionMatch = body.match(/\*\*Board ambition:\*\*\s*`(\w+)`/);
    const tacticsMatch = body.match(/\*\*Suggested tactics:\*\*\s*(.+)$/m);

    const statBias = statBiasMatch
      ? [...statBiasMatch[1].matchAll(/`(\w+)`/g)].map(m => m[1])
      : [];

    // Suggested tactics: backtick-quoted literals in order. Fall back to
    // DEFAULT_TACTICS for any missing slot (e.g. teams marked `to add`).
    const suggestedTactics = { ...DEFAULT_TACTICS };
    if (tacticsMatch) {
      const vals = [...tacticsMatch[1].matchAll(/`([a-z_]+)`/g)].map(m => m[1]);
      vals.forEach((v, i) => { if (i < TACTIC_KEYS.length) suggestedTactics[TACTIC_KEYS[i]] = v; });
    }

    // Star players — entry line "- **Name** (Position, Nationality) Index high: ... Suggested rating: NN/100. [Marquee: yes.]"
    // The trailing `Marquee: yes` annotation is optional; one per team picks
    // the cap-excluded marquee slot. Anyone without it gets isMarquee=false
    // and the seeder synthesises a normal in-cap wage.
    const stars = [];
    const starsBlockMatch = body.match(/### Star players\s*\n([\s\S]*?)(?=\n### |\n## |\n---|$)/);
    if (starsBlockMatch) {
      const starLines = starsBlockMatch[1].split('\n').filter(l => l.startsWith('- **'));
      for (const line of starLines) {
        const m = line.match(/^- \*\*([^*]+)\*\*\s*\(([^,]+),\s*([^)]+)\)\s*Index high:\s*(.+?)\.\s*Suggested rating:\s*\*\*(\d+)\/100\*\*/);
        if (!m) continue;
        const indexHigh = [...m[4].matchAll(/`(\w+)`/g)].map(x => x[1]);
        const isMarquee = /Marquee:\s*yes/i.test(line);
        // Optional `Wage: £Xm.` or `Wage: £NNNk.` override — used to land
        // hand-tuned marquee wages above what the formulaic seeder would
        // produce. Threaded through to the player JSON's `contract.annualWage`,
        // which contractSeeder honours verbatim.
        const wageMatch = line.match(/Wage:\s*£([\d.]+)\s*(m|k)\b/i);
        const annualWage = wageMatch
          ? (wageMatch[2].toLowerCase() === 'm'
              ? Math.round(parseFloat(wageMatch[1]) * 1_000_000)
              : Math.round(parseFloat(wageMatch[1]) * 1_000))
          : null;
        stars.push({
          name: m[1].trim(),
          position: SIMPLE_FROM_TEAMDATA(m[2]),
          nationality: m[3].trim(),
          indexHigh,
          rating: parseInt(m[5], 10),
          isMarquee,
          annualWage,
        });
      }
    }

    // Squad tables — tiered into five sub-tables under `### Squad (2025-26)`:
    //   **Starting XV — Forwards**    (8 rows: jerseys 1-8 source pool)
    //   **Starting XV — Backs**       (7 rows: jerseys 9-15 source pool)
    //   **Bench**                     (8 rows: jerseys 16-23 source pool)
    //   **Wider squad — Forwards**    (squad players outside the matchday 23)
    //   **Wider squad — Backs**       (squad players outside the matchday 23)
    //
    // Tier = the player's authored role. The generator assigns jersey numbers
    // within each tier by position. Hard-errors on count mismatch or star not
    // in Starting XV.
    const squadMatch = body.match(/### Squad \(2025-26\)\s*\n([\s\S]*?)(?=\n---|\n## |$)/);
    if (!squadMatch) throw new Error(`Missing '### Squad (2025-26)' section for ${teamName}`);
    const squadBlock = squadMatch[1];

    function extractTier(label) {
      const re = new RegExp(`\\*\\*${label.replace(/[—()]/g, c => '\\' + c)}\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*|\\n---|\\n## |$)`);
      const m = squadBlock.match(re);
      if (!m) throw new Error(`Missing '**${label}**' sub-table for ${teamName}`);
      const out = [];
      for (const row of m[1].split('\n')) {
        if (!row.startsWith('|')) continue;
        if (/^\|[-\s|]+\|$/.test(row)) continue;
        if (/\|\s*Name\s*\|/i.test(row)) continue;
        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length < 17) continue;
        const [name, position, dob, age, nationality, ...rawStats] = cells;
        if (!name) continue;
        
        const baseStats = {};
        rawStats.forEach((val, i) => {
          if (i < STAT_KEYS.length) {
            baseStats[STAT_KEYS[i]] = parseInt(val, 10);
          }
        });

        out.push({
          name,
          position: SIMPLE_FROM_TEAMDATA(position),
          dob: dob || null,
          age: age || null,
          nationality: nationality || 'England',
          baseStats,
        });
      }
      return out;
    }

    const startForwards = extractTier('Starting XV — Forwards');
    const startBacks = extractTier('Starting XV — Backs');
    const benchTier = extractTier('Bench');
    const widerForwards = extractTier('Wider squad — Forwards');
    const widerBacks = extractTier('Wider squad — Backs');

    const starters = [...startForwards, ...startBacks];
    const widerSquad = [...widerForwards, ...widerBacks];

    if (starters.length !== 15) {
      throw new Error(`${teamName}: Starting XV has ${starters.length} players (forwards ${startForwards.length} + backs ${startBacks.length}), expected 15.`);
    }
    if (benchTier.length !== 8) {
      throw new Error(`${teamName}: Bench has ${benchTier.length} players, expected 8.`);
    }
    for (const star of stars) {
      if (!starters.some(p => p.name === star.name)) {
        throw new Error(`${teamName}: Star "${star.name}" is not in the Starting XV tables — stars must be tagged as starters.`);
      }
    }

    teams[teamName] = {
      meta: { ...TEAM_META[teamName], color: coloursMatch[1].toLowerCase(), secondaryColor: coloursMatch[2].toLowerCase() },
      stadium: stadiumMatch ? stadiumMatch[1].trim() : undefined,
      nickname: nicknameMatch ? nicknameMatch[1].trim() : undefined,
      founded: foundedMatch ? parseInt(foundedMatch[1], 10) : undefined,
      stadiumCapacity: capacityMatch ? parseInt(capacityMatch[1].replace(/,/g, ''), 10) : undefined,
      headCoach: headCoachMatch ? headCoachMatch[1].trim() : undefined,
      rating: ratingMatch ? parseInt(ratingMatch[1], 10) : undefined,
      boardAmbition: boardAmbitionMatch ? boardAmbitionMatch[1] : undefined,
      suggestedTactics,
      statBias,
      stars,
      starters,
      benchTier,
      widerSquad,
    };
  }
  return teams;
}

// ─── Name split (first / last) ────────────────────────────────────────────

function splitName(full) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// ─── Starter / bench / squad allocator ────────────────────────────────────
//
// Each tier is parsed straight out of its sub-table in team-data.md, so the
// tier membership is authored — we just assign jerseys within each tier.

function bucketByPosition(players, stars) {
  const byPos = { Prop: [], Hooker: [], Lock: [], Flanker: [], 'Number 8': [], 'Back Row': [], 'Scrum-Half': [], 'Fly-Half': [], Centre: [], Wing: [], Fullback: [], 'Utility Back': [] };
  for (const p of players) {
    const bucket = byPos[p.position] ?? byPos['Utility Back'];
    bucket.push({ ...p, isStar: stars.some(s => s.name === p.name) });
  }
  // Stars first within each position bucket (drives jersey allocation order).
  for (const list of Object.values(byPos)) list.sort((a, b) => Number(b.isStar) - Number(a.isStar));
  // Back Row → Flanker/Number 8 redistribution so jerseys 6/7/8 fill cleanly.
  while (byPos['Back Row'].length) {
    const p = byPos['Back Row'].shift();
    if (byPos['Flanker'].length < 4) byPos['Flanker'].push(p);
    else if (byPos['Number 8'].length < 2) byPos['Number 8'].push(p);
    else byPos['Flanker'].push(p);
  }
  return byPos;
}

function assignStarterJerseys(byPos) {
  const takeFirst = (list) => list.length > 0 ? list.shift() : null;
  const starters = [];
  const propA = takeFirst(byPos.Prop);
  const propB = takeFirst(byPos.Prop);
  starters.push({ ...propA, id: 1 });
  starters.push({ ...takeFirst(byPos.Hooker), id: 2 });
  starters.push({ ...propB, id: 3 });
  starters.push({ ...takeFirst(byPos.Lock), id: 4 });
  starters.push({ ...takeFirst(byPos.Lock), id: 5 });
  const flA = takeFirst(byPos.Flanker);
  const flB = takeFirst(byPos.Flanker);
  const n8 = byPos['Number 8'].length > 0 ? takeFirst(byPos['Number 8']) : takeFirst(byPos.Flanker);
  starters.push({ ...flA, id: 6 });
  starters.push({ ...flB, id: 7 });
  starters.push({ ...n8, id: 8 });
  starters.push({ ...takeFirst(byPos['Scrum-Half']), id: 9 });
  starters.push({ ...takeFirst(byPos['Fly-Half']), id: 10 });
  const wingA = takeFirst(byPos.Wing);
  const centreA = takeFirst(byPos.Centre);
  const centreB = takeFirst(byPos.Centre);
  const wingB = takeFirst(byPos.Wing);
  starters.push({ ...wingA, id: 11 });
  starters.push({ ...centreA, id: 12 });
  starters.push({ ...centreB, id: 13 });
  starters.push({ ...wingB, id: 14 });
  const fb = byPos.Fullback.length > 0
    ? takeFirst(byPos.Fullback)
    : byPos['Utility Back'].length > 0
      ? takeFirst(byPos['Utility Back'])
      : takeFirst(byPos.Wing);
  starters.push({ ...fb, id: 15 });
  return starters;
}

function assignBenchJerseys(byPos) {
  const bench = [];
  const benchSlots = [
    { id: 16, src: 'Hooker'       },
    { id: 17, src: 'Prop'         },
    { id: 18, src: 'Prop'         },
    { id: 19, src: 'Lock'         },
    { id: 20, src: 'Flanker'      },
    { id: 21, src: 'Scrum-Half'   },
    { id: 22, src: 'Fly-Half'     },
    { id: 23, src: 'Utility Back' },
  ];
  for (const slot of benchSlots) {
    let pool = byPos[slot.src];
    if (!pool || pool.length === 0) {
      if (slot.src === 'Utility Back') pool = byPos.Wing.length ? byPos.Wing : byPos.Fullback.length ? byPos.Fullback : byPos.Centre;
      else if (slot.src === 'Fly-Half') pool = byPos.Centre.length ? byPos.Centre : byPos.Fullback.length ? byPos.Fullback : byPos.Wing.length ? byPos.Wing : byPos['Scrum-Half'].length ? byPos['Scrum-Half'] : byPos['Utility Back'];
      else if (slot.src === 'Flanker') pool = byPos['Number 8'];
      else if (slot.src === 'Hooker') pool = byPos.Prop;
    }
    const p = pool && pool.length > 0 ? pool.shift() : null;
    if (p) bench.push({ ...p, id: slot.id });
  }
  return bench;
}

function buildLineup(team) {
  const startersByPos = bucketByPosition(team.starters, team.stars);
  const starters = assignStarterJerseys(startersByPos);
  if (starters.some(s => !s || !s.name)) {
    throw new Error(`Could not fill all starter slots. Missing jerseys: ${starters.map((s,i)=>!s||!s.name?(i+1):null).filter(Boolean).join(',')}`);
  }

  const benchByPos = bucketByPosition(team.benchTier, team.stars);
  const bench = assignBenchJerseys(benchByPos);

  // Wider squad — sequential id from 24, preserving authored row order.
  const widerSquad = team.widerSquad.map((p, i) => ({
    ...p,
    isStar: false,
    id: 24 + i,
  }));

  return { starters, bench, squad: widerSquad };
}



// ─── JSON writer ──────────────────────────────────────────────────────────

function buildPlayerJson(p, team) {
  const { firstName, lastName } = splitName(p.name);
  const baseStats = p.baseStats;
  // Carry the marquee designation + optional hand-authored wage through
  // to the JSON. contractSeeder (src/game/contractSeeder.ts) reads the
  // marquee flag and uses `annualWage` verbatim when present, falling
  // back to the WAGE_BY_RATING × POSITION_SCARCITY × WAGE_NOISE formula
  // for everyone else. Expiry / clubId still come from the seeder.
  const marqueeStar = team.stars.find(s => s.name === p.name && s.isMarquee);
  const contract = marqueeStar
    ? {
        isMarquee: true,
        ...(marqueeStar.annualWage ? { annualWage: marqueeStar.annualWage } : {}),
      }
    : null;
  return {
    id: p.id,
    squadNumber: p.id,
    firstName,
    lastName,
    dob: p.dob || null,
    nationality: p.nationality || 'England',
    position: p.position,
    baseStats,
    ...(contract ? { contract } : {}),
  };
}

function buildTeamJson(teamName, team) {
  const { starters, bench, squad } = buildLineup(team);
  return {
    id: team.meta.slug,
    name: teamName,
    shortName: team.meta.shortName,
    color: team.meta.color,
    secondaryColor: team.meta.secondaryColor,
    stadium: team.stadium,
    nickname: team.nickname,
    founded: team.founded,
    stadiumCapacity: team.stadiumCapacity,
    headCoach: team.headCoach,
    boardAmbition: team.boardAmbition,
    suggestedTactics: team.suggestedTactics,
    statBias: team.statBias,
    stars: team.stars.map(s => ({
      name: s.name,
      position: s.position,
      nationality: s.nationality,
      indexHigh: s.indexHigh,
      suggestedRating: s.rating,
    })),
    players: starters.map(p => buildPlayerJson(p, team)),
    bench: bench.map(p => buildPlayerJson(p, team)),
    squad: squad.map(p => buildPlayerJson(p, team)),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────

const md = readFileSync(SOURCE, 'utf8');
const teams = parseTeamDataMd(md);

console.log(`Parsed ${Object.keys(teams).length} teams from ${SOURCE}`);
for (const [name, data] of Object.entries(teams)) {
  try {
    const json = buildTeamJson(name, data);
    const path = resolve(OUT_DIR, `team-${data.meta.slug}.json`);
    writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
    console.log(`  ✓ ${name.padEnd(22)} → ${path} (15 starters, ${json.bench.length} bench, ${json.squad.length} squad)`);
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}
