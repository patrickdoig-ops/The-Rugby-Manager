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

const TEAM_META = {
  'Gloucester':            { slug: 'gloucester',   shortName: 'GLO', color: '#c8102e', secondaryColor: '#ffffff' },
  'Bristol Bears':         { slug: 'bristol',      shortName: 'BRI', color: '#003087', secondaryColor: '#ffd700' },
  'Leicester Tigers':      { slug: 'leicester',    shortName: 'LEI', color: '#1c5e3f', secondaryColor: '#ffffff' },
  'Saracens':              { slug: 'saracens',     shortName: 'SAR', color: '#000000', secondaryColor: '#ed1c24' },
  'Bath Rugby':            { slug: 'bath',         shortName: 'BAT', color: '#0033a0', secondaryColor: '#ffffff' },
  'Exeter Chiefs':         { slug: 'exeter',       shortName: 'EXE', color: '#0a1b40', secondaryColor: '#ffffff' },
  'Harlequins':            { slug: 'harlequins',   shortName: 'HAR', color: '#73144a', secondaryColor: '#23bcad' },
  'Newcastle Red Bulls':   { slug: 'newcastle',    shortName: 'NEW', color: '#00006a', secondaryColor: '#dc1e25' },
  'Northampton Saints':    { slug: 'northampton',  shortName: 'NOR', color: '#000000', secondaryColor: '#1b4b9c' },
  'Sale Sharks':           { slug: 'sale',         shortName: 'SAL', color: '#0a1b40', secondaryColor: '#0fb5d1' },
};

// ─── 12-stat position template (offsets from baseline) ────────────────────

const POSITION_TEMPLATE = {
  'Loosehead Prop':    { stamina:  0, strength: 12, pace: -15, agility: -10, handling: -8, tackling:  8, breakdown:  5, kicking: -20, setPiece: 18, discipline:  0, positioning:  0, composure:  0 },
  'Tighthead Prop':    { stamina:  0, strength: 13, pace: -15, agility: -10, handling: -8, tackling:  8, breakdown:  5, kicking: -20, setPiece: 18, discipline:  0, positioning:  0, composure:  0 },
  'Hooker':            { stamina:  0, strength:  5, pace: -10, agility:  -5, handling: -2, tackling:  6, breakdown:  6, kicking: -15, setPiece: 15, discipline:  0, positioning:  2, composure:  0 },
  'Left Lock':         { stamina:  2, strength: 10, pace: -10, agility:  -8, handling: -5, tackling:  6, breakdown:  4, kicking: -18, setPiece: 18, discipline:  0, positioning:  2, composure:  0 },
  'Right Lock':        { stamina:  2, strength: 10, pace: -10, agility:  -8, handling: -5, tackling:  6, breakdown:  4, kicking: -18, setPiece: 18, discipline:  0, positioning:  2, composure:  0 },
  'Blindside Flanker': { stamina:  5, strength:  8, pace:  -2, agility:   0, handling: -2, tackling: 10, breakdown: 10, kicking: -10, setPiece:  5, discipline:  0, positioning:  3, composure:  0 },
  'Openside Flanker':  { stamina:  6, strength:  5, pace:   0, agility:   3, handling:  0, tackling: 10, breakdown: 15, kicking: -10, setPiece:  3, discipline:  0, positioning:  5, composure:  0 },
  'Number 8':          { stamina:  5, strength: 10, pace:   0, agility:   2, handling:  2, tackling:  8, breakdown:  8, kicking:  -8, setPiece:  5, discipline:  0, positioning:  3, composure:  0 },
  'Scrum-Half':        { stamina:  0, strength: -5, pace:   8, agility:   5, handling:  5, tackling:  0, breakdown:  2, kicking:   5, setPiece:-10, discipline:  2, positioning:  5, composure:  5 },
  'Fly-Half':          { stamina:  0, strength: -5, pace:   3, agility:   3, handling:  8, tackling: -2, breakdown: -3, kicking:  18, setPiece:-10, discipline:  3, positioning:  5, composure:  8 },
  'Inside Centre':     { stamina:  2, strength:  5, pace:   5, agility:   5, handling:  5, tackling:  5, breakdown:  0, kicking:  -2, setPiece: -8, discipline:  0, positioning:  3, composure:  2 },
  'Outside Centre':    { stamina:  2, strength:  5, pace:   6, agility:   5, handling:  5, tackling:  5, breakdown:  0, kicking:  -2, setPiece: -8, discipline:  0, positioning:  3, composure:  2 },
  'Left Wing':         { stamina:  0, strength: -3, pace:  15, agility:  12, handling:  5, tackling: -2, breakdown: -5, kicking:  -2, setPiece:-12, discipline:  0, positioning:  3, composure:  0 },
  'Right Wing':        { stamina:  0, strength: -3, pace:  15, agility:  12, handling:  5, tackling: -2, breakdown: -5, kicking:  -2, setPiece:-12, discipline:  0, positioning:  3, composure:  0 },
  'Fullback':          { stamina:  0, strength: -3, pace:   8, agility:   8, handling:  5, tackling:  3, breakdown: -3, kicking:   5, setPiece:-10, discipline:  2, positioning:  8, composure:  3 },
  'Utility Back':      { stamina:  0, strength:  0, pace:   3, agility:   3, handling:  3, tackling:  2, breakdown:  0, kicking:   0, setPiece: -5, discipline:  0, positioning:  3, composure:  2 },
};

const STAT_KEYS = ['stamina','strength','pace','agility','handling','tackling','breakdown','kicking','setPiece','discipline','positioning','composure'];

// ─── Position-string normalisation ────────────────────────────────────────

const SIMPLE_FROM_TEAMDATA = (s) => {
  const t = s.trim();
  if (/prop/i.test(t)) return 'Prop';
  if (/hooker/i.test(t)) return 'Hooker';
  if (/lock/i.test(t)) return 'Lock';
  if (/number 8|no\.?\s*8|n\.?8/i.test(t)) return 'Number 8';
  if (/back row|backrow/i.test(t)) return 'Back Row';
  if (/flanker/i.test(t)) return 'Flanker';
  if (/scrum.?half/i.test(t)) return 'Scrum-half';
  if (/fly.?half/i.test(t)) return 'Fly-half';
  if (/centre/i.test(t)) return 'Centre';
  if (/full.?back/i.test(t)) return 'Full-back';
  if (/wing/i.test(t)) return 'Wing';
  if (/utility/i.test(t)) return 'Utility Back';
  return t;
};

// ─── Deterministic RNG (mulberry32) keyed by team slug + player name ─────

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const r = mulberry32(seed);
  return (lo, hi) => Math.round(lo + r() * (hi - lo));
}

// ─── Parser ────────────────────────────────────────────────────────────────

function parseTeamDataMd(md) {
  const teams = {};
  const sections = md.split(/^## /m).slice(1);
  for (const section of sections) {
    const lines = section.split('\n');
    const headerLine = lines[0];
    const headerMatch = headerLine.match(/^(.+?)\s*\*\((in game|to add)\)\*/);
    if (!headerMatch) continue;
    const teamName = headerMatch[1].trim();
    if (!TEAM_META[teamName]) continue;

    const body = lines.slice(1).join('\n');

    const stadiumMatch = body.match(/\*\*Home ground:\*\*\s*(.+?)\.\s*$/m);
    const ratingMatch = body.match(/\*\*Overall rating:\*\*\s*\*\*(\d+)\/100\*\*/);
    const statBiasMatch = body.match(/\*\*Stat bias:\*\*\s*(.+)$/m);

    const statBias = statBiasMatch
      ? [...statBiasMatch[1].matchAll(/`(\w+)`/g)].map(m => m[1])
      : [];

    // Star players
    const stars = [];
    const starsBlockMatch = body.match(/### Star players\s*\n([\s\S]*?)(?=\n### |\n## |\n---|$)/);
    if (starsBlockMatch) {
      const starLines = starsBlockMatch[1].split('\n').filter(l => l.startsWith('- **'));
      for (const line of starLines) {
        const m = line.match(/^- \*\*([^*]+)\*\*\s*\(([^,]+),\s*([^)]+)\).+?Index high:\s*(.+?)\.\s*Suggested rating:\s*\*\*(\d+)\/100\*\*/);
        if (!m) continue;
        const indexHigh = [...m[4].matchAll(/`(\w+)`/g)].map(x => x[1]);
        stars.push({
          name: m[1].trim(),
          position: SIMPLE_FROM_TEAMDATA(m[2]),
          nationality: m[3].trim(),
          indexHigh,
          rating: parseInt(m[5], 10),
        });
      }
    }

    // Squad tables (forwards + backs)
    const squadMatch = body.match(/### Squad \(2025-26\)\s*\n([\s\S]*?)(?=\n---|\n## |$)/);
    const squad = [];
    if (squadMatch) {
      const rows = squadMatch[1].split('\n');
      for (const row of rows) {
        if (!row.startsWith('|')) continue;
        if (/^\|[-\s|]+\|$/.test(row)) continue;
        if (/\|\s*Name\s*\|/i.test(row)) continue;
        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length < 5) continue;
        const [name, position, dob, age, nationality] = cells;
        if (!name) continue;
        squad.push({
          name,
          position: SIMPLE_FROM_TEAMDATA(position),
          dob: dob || null,
          age: age || null,
          nationality: nationality || 'England',
        });
      }
    }

    teams[teamName] = {
      meta: TEAM_META[teamName],
      stadium: stadiumMatch ? stadiumMatch[1].trim() : undefined,
      rating: ratingMatch ? parseInt(ratingMatch[1], 10) : undefined,
      statBias,
      stars,
      squad,
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

function buildLineup(team) {
  const byPos = { Prop: [], Hooker: [], Lock: [], Flanker: [], 'Number 8': [], 'Back Row': [], 'Scrum-half': [], 'Fly-half': [], Centre: [], Wing: [], 'Full-back': [], 'Utility Back': [] };
  for (const p of team.squad) {
    const bucket = byPos[p.position] ?? byPos['Utility Back'];
    bucket.push({ ...p, isStar: team.stars.some(s => s.name === p.name) });
  }
  // Stars first within each bucket
  for (const list of Object.values(byPos)) list.sort((a, b) => Number(b.isStar) - Number(a.isStar));

  // Distribute Back Row entries: fill remaining Flanker/N8 slots in order
  while (byPos['Back Row'].length) {
    const p = byPos['Back Row'].shift();
    if (byPos['Flanker'].length < 4) byPos['Flanker'].push(p);
    else if (byPos['Number 8'].length < 2) byPos['Number 8'].push(p);
    else byPos['Flanker'].push(p);
  }

  // Build the 15 starters in canonical jersey order
  const takeFirst = (list) => list.length > 0 ? list.shift() : null;
  const starters = [];
  // 1 LHP, 2 H, 3 THP
  const propA = takeFirst(byPos.Prop);
  const propB = takeFirst(byPos.Prop);
  starters.push({ ...propA, engPos: 'Loosehead Prop', id: 1 });
  starters.push({ ...takeFirst(byPos.Hooker), engPos: 'Hooker', id: 2 });
  starters.push({ ...propB, engPos: 'Tighthead Prop', id: 3 });
  // 4 L1, 5 L2
  starters.push({ ...takeFirst(byPos.Lock), engPos: 'Left Lock', id: 4 });
  starters.push({ ...takeFirst(byPos.Lock), engPos: 'Right Lock', id: 5 });
  // 6 BSF, 7 OSF, 8 N8 — prefer dedicated N8 if available
  const flA = takeFirst(byPos.Flanker);
  const flB = takeFirst(byPos.Flanker);
  const n8 = byPos['Number 8'].length > 0 ? takeFirst(byPos['Number 8']) : takeFirst(byPos.Flanker);
  starters.push({ ...flA, engPos: 'Blindside Flanker', id: 6 });
  starters.push({ ...flB, engPos: 'Openside Flanker', id: 7 });
  starters.push({ ...n8, engPos: 'Number 8', id: 8 });
  // 9 SH, 10 FH
  starters.push({ ...takeFirst(byPos['Scrum-half']), engPos: 'Scrum-Half', id: 9 });
  starters.push({ ...takeFirst(byPos['Fly-half']), engPos: 'Fly-Half', id: 10 });
  // 11 LW, 12 IC, 13 OC, 14 RW, 15 FB
  const wingA = takeFirst(byPos.Wing);
  const centreA = takeFirst(byPos.Centre);
  const centreB = takeFirst(byPos.Centre);
  const wingB = takeFirst(byPos.Wing);
  starters.push({ ...wingA, engPos: 'Left Wing', id: 11 });
  starters.push({ ...centreA, engPos: 'Inside Centre', id: 12 });
  starters.push({ ...centreB, engPos: 'Outside Centre', id: 13 });
  starters.push({ ...wingB, engPos: 'Right Wing', id: 14 });
  // FB fallback: dedicated Full-back, else Utility Back, else any remaining Wing
  const fb = byPos['Full-back'].length > 0
    ? takeFirst(byPos['Full-back'])
    : byPos['Utility Back'].length > 0
      ? takeFirst(byPos['Utility Back'])
      : takeFirst(byPos.Wing);
  starters.push({ ...fb, engPos: 'Fullback', id: 15 });

  if (starters.some(s => !s || !s.name)) {
    throw new Error(`Could not fill all starter slots for team. Missing positions: ${starters.map((s,i)=>!s||!s.name?(i+1):null).filter(Boolean).join(',')}`);
  }

  // Bench: standard 16-23 layout
  const bench = [];
  const benchSlots = [
    { id: 16, src: 'Hooker',       engPos: 'Hooker' },
    { id: 17, src: 'Prop',         engPos: 'Loosehead Prop' },
    { id: 18, src: 'Prop',         engPos: 'Tighthead Prop' },
    { id: 19, src: 'Lock',         engPos: 'Left Lock' },
    { id: 20, src: 'Flanker',      engPos: 'Blindside Flanker' },
    { id: 21, src: 'Scrum-half',   engPos: 'Scrum-Half' },
    { id: 22, src: 'Fly-half',     engPos: 'Fly-Half' },
    { id: 23, src: 'Utility Back', engPos: 'Utility Back' },
  ];
  for (const slot of benchSlots) {
    let pool = byPos[slot.src];
    if (!pool || pool.length === 0) {
      // Fallback chain by slot
      if (slot.src === 'Utility Back') pool = byPos.Wing.length ? byPos.Wing : byPos['Full-back'].length ? byPos['Full-back'] : byPos.Centre;
      else if (slot.src === 'Flanker') pool = byPos['Number 8'];
      else if (slot.src === 'Hooker') pool = byPos.Prop;
    }
    const p = pool && pool.length > 0 ? pool.shift() : null;
    if (p) bench.push({ ...p, engPos: slot.engPos, id: slot.id });
  }

  // Squad — everyone left over. Assign sequential id starting at 24.
  const squadExtras = [];
  let nextId = 24;
  const allLeft = Object.entries(byPos).flatMap(([k, list]) => list.map(p => ({ ...p, srcPos: k })));
  for (const p of allLeft) {
    // Map to canonical engine position (best fit)
    const engPos =
      p.srcPos === 'Prop'         ? 'Loosehead Prop' :
      p.srcPos === 'Hooker'       ? 'Hooker' :
      p.srcPos === 'Lock'         ? 'Left Lock' :
      p.srcPos === 'Flanker'      ? 'Openside Flanker' :
      p.srcPos === 'Number 8'     ? 'Number 8' :
      p.srcPos === 'Scrum-half'   ? 'Scrum-Half' :
      p.srcPos === 'Fly-half'     ? 'Fly-Half' :
      p.srcPos === 'Centre'       ? 'Inside Centre' :
      p.srcPos === 'Wing'         ? 'Left Wing' :
      p.srcPos === 'Full-back'    ? 'Fullback' :
                                    'Utility Back';
    squadExtras.push({ ...p, engPos, id: nextId++ });
  }

  return { starters, bench, squad: squadExtras };
}

// ─── baseStats generator ──────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }

function genStats(p, team, rng) {
  const star = team.stars.find(s => s.name === p.name);
  const tmpl = POSITION_TEMPLATE[p.engPos];
  const baseline = 40 + (team.rating / 100) * 40;
  const stats = {};
  for (const stat of STAT_KEYS) {
    if (star && star.indexHigh.includes(stat)) {
      stats[stat] = clamp(star.rating + rng(-2, 2), 35, 95);
    } else if (star) {
      stats[stat] = clamp(baseline + tmpl[stat] + rng(-3, 3), 35, 95);
    } else {
      const biasBonus = team.statBias.includes(stat) ? 3 : 0;
      stats[stat] = clamp(baseline + tmpl[stat] + biasBonus + rng(-4, 4), 35, 95);
    }
  }
  return stats;
}

// ─── JSON writer ──────────────────────────────────────────────────────────

function buildPlayerJson(p, team) {
  const { firstName, lastName } = splitName(p.name);
  const rng = makeRng(hash32(`${team.meta.slug}|${p.name}`));
  const baseStats = genStats(p, team, rng);
  return {
    id: p.id,
    squadNumber: p.id,
    firstName,
    lastName,
    dob: p.dob || null,
    nationality: p.nationality || 'England',
    position: p.engPos,
    baseStats,
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
    rating: team.rating,
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
