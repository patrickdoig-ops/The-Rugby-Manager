// Guard: the play editor (public/tools/phase-animator.html) embeds a JS copy of
// the play library as `PLAYBOOK_SEED` so it can offer the shipped plays for import
// (the HTML can't import the TS module). That copy is hand-maintained, so it can
// silently drift from the source of truth in src/data/playbook/index.ts — the doc
// even promises the editor "round-trips the shipped library byte-for-byte". This
// check parses the embedded seed and asserts it is deep-equal to the canonical
// PLAYBOOK, failing `npm run verify` on any drift. (WP6 code-review finding M1.)

import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { PLAYBOOK } from '../src/data/playbook/index.js';

const html = readFileSync('public/tools/phase-animator.html', 'utf8');
const start = html.indexOf('const PLAYBOOK_SEED = [');
const bracket = html.indexOf('[', start);
const end = html.indexOf('\n  ];', bracket);
if (start < 0 || end < 0) {
  console.error('FAIL: could not locate `const PLAYBOOK_SEED = [ … ];` in phase-animator.html');
  process.exit(1);
}
const ctx: { OUT: { V?: unknown } } = { OUT: {} };
createContext(ctx);
runInContext('OUT.V=' + html.slice(bracket, end + 4) + ';', ctx);
const seed = ctx.OUT.V as { id: string }[];

// Order-invariant canonical stringify so a pure key-reorder is NOT flagged.
function stable(x: unknown): string {
  if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
  }
  return JSON.stringify(x);
}

let fails = 0;
if (seed.length !== PLAYBOOK.length) {
  console.error(`FAIL: PLAYBOOK_SEED has ${seed.length} plays, library has ${PLAYBOOK.length}`);
  fails++;
}
for (const play of PLAYBOOK) {
  const s = seed.find(z => z.id === play.id);
  if (!s) { console.error(`FAIL: play '${play.id}' missing from PLAYBOOK_SEED`); fails++; continue; }
  if (stable(s) !== stable(play)) { console.error(`FAIL: play '${play.id}' differs between PLAYBOOK_SEED and the library`); fails++; }
}

if (fails) {
  console.error('PLAYBOOK_SEED in phase-animator.html has drifted from src/data/playbook/index.ts — re-sync the embedded copy.');
  process.exit(1);
}
console.log(`OK: PLAYBOOK_SEED matches the play library (${PLAYBOOK.length} plays).`);
