import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, 'docs/team-data.md');
const OUT_DIR = resolve(ROOT, 'src/data');

const TEAM_META = {
  'Gloucester':            { slug: 'gloucester' },
  'Bristol Bears':         { slug: 'bristol' },
  'Leicester Tigers':      { slug: 'leicester' },
  'Saracens':              { slug: 'saracens' },
  'Bath':                  { slug: 'bath' },
  'Exeter Chiefs':         { slug: 'exeter' },
  'Harlequins':            { slug: 'harlequins' },
  'Newcastle Falcons':   { slug: 'newcastle' },
  'Northampton Saints':    { slug: 'northampton' },
  'Sale Sharks':           { slug: 'sale' },
};

const STAT_KEYS = ['stamina','strength','pace','agility','handling','tackling','breakdown','kicking','setPiece','discipline','positioning','composure'];

const md = readFileSync(SOURCE, 'utf8');
const lines = md.split('\n');

const statsLookup = {}; // statsLookup[slug][name] = { ...stats }

for (const [teamName, meta] of Object.entries(TEAM_META)) {
  try {
    const jsonStr = readFileSync(resolve(OUT_DIR, `team-${meta.slug}.json`), 'utf8');
    const teamObj = JSON.parse(jsonStr);
    statsLookup[meta.slug] = {};
    const allPlayers = [...teamObj.players, ...teamObj.bench, ...teamObj.squad];
    for (const p of allPlayers) {
      const fullName = (p.firstName ? p.firstName + ' ' : '') + p.lastName;
      statsLookup[meta.slug][fullName] = p.baseStats;
    }
  } catch (e) {
    console.error(`Failed to load ${meta.slug}: ${e.message}`);
  }
}

let currentTeamSlug = null;
const newLines = [];
let inSquadTable = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Match team header
  const teamMatch = line.match(/^##\s+(.+)$/);
  if (teamMatch) {
    const name = teamMatch[1].replace(/\s*\*\([^)]+\)\*\s*$/, '').trim();
    if (TEAM_META[name]) {
      currentTeamSlug = TEAM_META[name].slug;
    }
  }

  if (line.match(/^\| Name \| Position \| DOB \| Age \| Nationality \|/)) {
    newLines.push('| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |');
    inSquadTable = true;
    continue;
  }
  if (line.match(/^\|---\|---\|---\|---\|---\|/)) {
    newLines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    continue;
  }

  if (inSquadTable && line.startsWith('|')) {
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length >= 5) {
      const name = cells[0];
      // Lookup stats
      let stats = statsLookup[currentTeamSlug]?.[name];
      if (!stats) {
        const parts = name.trim().split(/\s+/);
        const lastPart = parts.length === 1 ? parts[0] : parts.slice(1).join(' ');
        const possible = Object.keys(statsLookup[currentTeamSlug] || {}).find(k => k.endsWith(lastPart));
        if (possible) {
          stats = statsLookup[currentTeamSlug][possible];
        }
      }
      
      if (stats) {
        const statsStr = STAT_KEYS.map(k => ` ${stats[k]} `).join('|');
        newLines.push(`${line}${statsStr}|`);
      } else {
        console.warn(`Could not find stats for ${name} in ${currentTeamSlug}`);
        const defaultStats = STAT_KEYS.map(k => ` 50 `).join('|');
        newLines.push(`${line}${defaultStats}|`);
      }
      continue;
    }
  }

  // End of table check
  if (inSquadTable && !line.startsWith('|')) {
    inSquadTable = false;
  }
  
  newLines.push(line);
}

writeFileSync(SOURCE, newLines.join('\n'));
console.log('Migration complete!');
