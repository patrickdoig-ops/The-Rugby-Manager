#!/usr/bin/env node
// Apply the floor changes from scripts/floor-changes.json to
// docs/team-data.md in-place. Run auditBenchSquadFloor.mjs first to
// regenerate the change list.
//
// The patch operates on exact line replacement: each change carries a
// lineIndex (0-based) into team-data.md plus the original oldLine and
// the new newLine. We confirm the line still matches oldLine before
// replacing — refuses to apply if the file has drifted.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, 'docs/team-data.md');
const CHANGES = resolve(ROOT, 'scripts/floor-changes.json');

const changes = JSON.parse(readFileSync(CHANGES, 'utf8'));
const lines = readFileSync(SOURCE, 'utf8').split('\n');

let applied = 0;
let mismatched = 0;
for (const c of changes) {
  if (lines[c.lineIndex] !== c.oldLine) {
    mismatched++;
    console.error(`Mismatch at line ${c.lineIndex + 1} (${c.team} / ${c.name}):`);
    console.error(`  expected: ${c.oldLine}`);
    console.error(`  actual:   ${lines[c.lineIndex]}`);
    continue;
  }
  lines[c.lineIndex] = c.newLine;
  applied++;
}

if (mismatched > 0) {
  console.error(`\nAborted: ${mismatched} mismatches. Re-run auditBenchSquadFloor.mjs.`);
  process.exit(1);
}

writeFileSync(SOURCE, lines.join('\n'));
console.log(`Applied ${applied} floor lifts to docs/team-data.md.`);
