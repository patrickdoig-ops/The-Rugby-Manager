#!/usr/bin/env node
// Audit which Bench / Wider-squad rows in docs/team-data.md need their
// authored stats lifted to meet the Premiership-quality floor (so the
// markdown is consistent with what applyStarBoost produces at runtime).
//
// Target authored values (so post-tier-shift runtime equals the floor):
//   Bench non-star, key stat (weight >= 1.0):     authored >= 75 (+3 -> 78)
//   Bench non-star, non-key relevant stat:        authored >= 62 (+3 -> 65)
//   Squad, key stat:                              authored >= 77 (-5 -> 72)
//   Squad, non-key relevant stat:                 authored >= 65 (-5 -> 60)
//
// Irrelevant stats (kicking for forwards, setPiece for backs) are NEVER
// floored — they get clamped to STAR_BOOST.irrelevantStatMax (15) instead.
//
// Outputs a per-team list of player rows that need updating, with the
// new line ready to drop into docs/team-data.md.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, 'docs/team-data.md');

const STAT_KEYS = ['stamina','strength','pace','agility','handling','tackling','breakdown','kicking','setPiece','discipline','positioning','composure'];
// Column order in the markdown tables:
const COL_ORDER = ['stamina','strength','pace','agility','handling','tackling','breakdown','kicking','setPiece','discipline','positioning','composure'];

// Mirror of PLAYER_OVERALL_WEIGHTS in src/engine/balance/rating.ts —
// re-declared here to keep this script self-contained.
const W = {
  Prop:         { setPiece: 2.0, strength: 2.0, breakdown: 1.5, tackling: 1.5, stamina: 1.2, pace: 0.2, agility: 0.2, kicking: 0,   handling: 0.6 },
  Hooker:       { setPiece: 2.0, breakdown: 1.5, tackling: 1.5, strength: 1.3, handling: 1.1, kicking: 0,   pace: 0.3 },
  Lock:         { setPiece: 2.0, strength: 1.8, tackling: 1.4, breakdown: 1.2, stamina: 1.2, pace: 0.25, agility: 0.25, kicking: 0, handling: 0.7 },
  Flanker:      { breakdown: 2.0, tackling: 1.8, stamina: 1.5, strength: 1.2, pace: 0.9, positioning: 1.2, setPiece: 0.7, kicking: 0 },
  'Number 8':   { strength: 1.8, breakdown: 1.6, tackling: 1.4, handling: 1.3, stamina: 1.3, pace: 0.7, setPiece: 0.8, kicking: 0 },
  'Back Row':   { breakdown: 2.0, tackling: 1.8, stamina: 1.5, strength: 1.2, pace: 0.9, positioning: 1.2, setPiece: 0.7, kicking: 0 },
  'Scrum-Half': { handling: 2.0, pace: 1.5, composure: 1.5, positioning: 1.4, agility: 1.3, kicking: 1.2, setPiece: 0,   strength: 0.3, breakdown: 0.7 },
  'Fly-Half':   { kicking: 2.0, composure: 1.8, handling: 1.6, positioning: 1.4, discipline: 1.2, pace: 0.8, setPiece: 0, strength: 0.3, breakdown: 0 },
  Centre:       { tackling: 1.6, pace: 1.5, handling: 1.5, strength: 1.3, agility: 1.2, positioning: 1.2, setPiece: 0,   kicking: 0.8, breakdown: 0.9 },
  Wing:         { pace: 2.0, agility: 1.6, handling: 1.4, positioning: 1.2, composure: 1.1, setPiece: 0,   strength: 0.7, kicking: 0.6, breakdown: 0.3 },
  Fullback:     { positioning: 1.8, kicking: 1.6, handling: 1.4, pace: 1.4, composure: 1.4, setPiece: 0,   strength: 0.6, breakdown: 0.3 },
  'Utility Back': {},  // simple mean
};
const IRRELEVANT = {
  Prop: ['kicking'], Hooker: ['kicking'], Lock: ['kicking'],
  Flanker: ['kicking'], 'Number 8': ['kicking'], 'Back Row': ['kicking'],
  'Scrum-Half': ['setPiece'], 'Fly-Half': ['setPiece'], Centre: ['setPiece'],
  Wing: ['setPiece'], Fullback: ['setPiece'], 'Utility Back': ['setPiece'],
};

// Normalise position string to the canonical Position enum.
function normalisePosition(raw) {
  const t = raw.trim();
  if (/loose.*head|tight.*head|^prop$/i.test(t)) return 'Prop';
  if (/^hook/i.test(t)) return 'Hooker';
  if (/^lock|second row/i.test(t)) return 'Lock';
  if (/blindside|openside|^flanker$/i.test(t)) return 'Flanker';
  if (/number ?8|no\.? ?8|n8|^8$/i.test(t)) return 'Number 8';
  if (/back ?row/i.test(t)) return 'Back Row';
  if (/scrum.*half|s.h\.?|^9$/i.test(t)) return 'Scrum-Half';
  if (/fly.*half|f.h\.?|^10$/i.test(t)) return 'Fly-Half';
  if (/centre|center/i.test(t)) return 'Centre';
  if (/^wing/i.test(t)) return 'Wing';
  if (/full.*back/i.test(t)) return 'Fullback';
  if (/utility/i.test(t)) return 'Utility Back';
  // Combined slashes ("Lock/Back row") — take the first.
  if (t.includes('/')) return normalisePosition(t.split('/')[0]);
  return t;
}

function parseInt10(s) { return parseInt(s, 10); }

// Floor lookup. Tier in { 'bench', 'squad' }; returns the authored-value
// floor for the stat under the position weights.
//
// Classification:
//   KEY      — weight in PLAYER_OVERALL_WEIGHTS[pos][stat] STRICTLY > 1.0
//              (the position's defining stats — prop's setPiece/strength,
//              wing's pace, fly-half's kicking)
//   MEDIUM   — stat not in the weights table (default 1.0 in playerOverall)
//              OR listed with value = 1.0 — moderately relevant
//   LOW      — explicit weight 0 < w < 1.0 (e.g. prop's pace 0.2) — no floor
//   IRRELEVANT — listed in IRRELEVANT_STATS — no floor
//
// Authored floor = post-floor runtime - tier shift.
// Bench: +3 shift, so authored = runtime - 3.
// Squad: -5 shift, so authored = runtime + 5.
function authoredFloor(position, stat, tier) {
  const irrelevant = (IRRELEVANT[position] ?? []).includes(stat);
  if (irrelevant) return null;
  const weights = W[position] ?? {};
  const w = weights[stat];
  // No entry in the table → default 1.0 → MEDIUM
  if (w === undefined) {
    return tier === 'bench' ? 62 : 65;
  }
  // KEY
  if (w > 1.0) {
    return tier === 'bench' ? 75 : 77;
  }
  // Explicit 1.0 exactly → MEDIUM
  if (w === 1.0) {
    return tier === 'bench' ? 62 : 65;
  }
  // Explicit < 1.0 → LOW, no floor
  return null;
}

const md = readFileSync(SOURCE, 'utf8');
const lines = md.split('\n');

// Section walker: track current team + current sub-table tier
let currentTeam = null;
let currentTier = null;  // 'bench' | 'squad' | null
const changes = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const teamMatch = /^## ([^\n]+)$/.exec(line);
  if (teamMatch && !/^##\s+(Legend|Rating inputs|Telemetry|Data notes)/.test(line)) {
    currentTeam = teamMatch[1].trim();
    currentTier = null;
    continue;
  }
  if (/^\*\*Bench\*\*/.test(line))                       { currentTier = 'bench'; continue; }
  if (/^\*\*Wider squad/.test(line))                     { currentTier = 'squad'; continue; }
  if (/^\*\*(Starting XV|Star players)/.test(line))      { currentTier = null;    continue; }

  // Parse player row (only when in bench/squad section)
  if (!currentTier || !line.startsWith('| ')) continue;
  if (/^\| Name \|/.test(line) || /^\|---/.test(line))   continue;

  // Tokenise pipe-delimited cells
  const cells = line.split('|').map(s => s.trim());
  // Format: '' | Name | Position | DOB | Age | Nationality | 12 stat cells | ''
  if (cells.length < 18) continue;
  const name = cells[1];
  const position = normalisePosition(cells[2]);
  const statValues = cells.slice(6, 18).map(parseInt10);

  let modified = false;
  const newValues = statValues.slice();
  COL_ORDER.forEach((stat, idx) => {
    const floor = authoredFloor(position, stat, currentTier);
    if (floor !== null && newValues[idx] < floor) {
      newValues[idx] = floor;
      modified = true;
    }
  });

  if (modified) {
    // Rebuild the line preserving the original cell formatting
    const newCells = cells.slice();
    COL_ORDER.forEach((_, idx) => { newCells[6 + idx] = String(newValues[idx]); });
    const newLine = newCells.join(' | ').replace(/^ \| /, '| ').replace(/ \| $/, ' |');
    changes.push({
      team: currentTeam,
      tier: currentTier,
      name,
      position,
      lineIndex: i,
      oldLine: line,
      newLine,
      before: statValues,
      after: newValues,
    });
  }
}

// Report
console.log(`# Players requiring floor lift\n`);
console.log(`Total: ${changes.length}\n`);
const byTeam = {};
for (const c of changes) {
  byTeam[c.team] = byTeam[c.team] ?? [];
  byTeam[c.team].push(c);
}
for (const team of Object.keys(byTeam)) {
  console.log(`## ${team} (${byTeam[team].length} players)\n`);
  for (const c of byTeam[team]) {
    const deltas = [];
    COL_ORDER.forEach((stat, idx) => {
      if (c.before[idx] !== c.after[idx]) {
        deltas.push(`${stat} ${c.before[idx]}→${c.after[idx]}`);
      }
    });
    console.log(`- **${c.name}** (${c.position}, ${c.tier}): ${deltas.join(', ')}`);
  }
  console.log('');
}

// Emit machine-readable JSON for the patcher
const fs = await import('node:fs/promises');
await fs.writeFile(resolve(ROOT, 'scripts/floor-changes.json'), JSON.stringify(changes, null, 2));
console.log(`\nWritten ${changes.length} changes to scripts/floor-changes.json`);
