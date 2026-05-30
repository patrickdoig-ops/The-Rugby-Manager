// Audio manifest validator — keeps the manifest honest against reality.
//
// Two checks, run over src/ui/audio/audioManifest.ts:
//   1. Every declared file (base + each variant take) exists on disk under
//      public/audio/. A missing file is a hard error (exit 1) — the cue would
//      silently fall back to the synth or go quiet in production.
//   2. Every cue id is referenced somewhere in src/ as a string literal
//      (playId/playBed/SCREEN_MUSIC/data-sfx map/ternary all use the literal).
//      A cue nothing triggers is "dead" — reported as a warning, since some
//      are intentionally retired or deferred (see DEAD_CUE_ALLOWLIST).
//
// Run: npx tsx scripts/validateAudioManifest.ts

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MANIFEST = join(ROOT, 'src/ui/audio/audioManifest.ts');
const AUDIO_DIR = join(ROOT, 'public/audio');
const SRC_DIR = join(ROOT, 'src');

// Cues that are deliberately not triggered today — retired tiers kept as assets,
// or features awaiting a proper signal. Documented so the warning stays quiet.
const DEAD_CUE_ALLOWLIST = new Set<string>([
  'crowd.bed.tension', // retired when the crowd bed went continuous; asset kept
  'crowd.bed.chant',   // retired half-time bed; asset kept
  'ui.notify',         // needs a notification-delta signal; would spam per-week
  'impact.post',       // needs a "hit the post" near-miss signal the kick resolver doesn't expose
]);

// synth.ts lists cue ids as procedural fallback generators, not as triggers —
// exclude it so a synth-only cue still counts as "not wired to play".
const SYNTH = join(ROOT, 'src/ui/audio/synth.ts');

interface Cue { id: string; folder: string; base: string; variants: number; }

function parseManifest(): Cue[] {
  const txt = readFileSync(MANIFEST, 'utf8');
  const cues: Cue[] = [];
  const re = /id:\s*'([\w.]+)'[\s\S]*?\/([a-z]+)\/([a-z0-9-]+)\.mp3`([\s\S]*?)(?=\n {2}\},)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt)) !== null) {
    const [, id, folder, base, tail] = m;
    const vm = /variants:\s*(\d+)/.exec(tail);
    cues.push({ id, folder, base, variants: vm ? Number(vm[1]) : 1 });
  }
  return cues;
}

function allTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...allTsFiles(p));
    else if (entry.endsWith('.ts')) out.push(p);
  }
  return out;
}

const cues = parseManifest();
const missing: string[] = [];
for (const c of cues) {
  const files = [`${c.base}.mp3`];
  for (let i = 2; i <= c.variants; i++) files.push(`${c.base}-${i}.mp3`);
  for (const f of files) {
    if (!existsSync(join(AUDIO_DIR, c.folder, f))) missing.push(`${c.folder}/${f}  (cue ${c.id})`);
  }
}

// Build the set of cue ids referenced anywhere in src (excluding the manifest).
const srcText = allTsFiles(SRC_DIR)
  .filter(f => f !== MANIFEST && f !== SYNTH)
  .map(f => readFileSync(f, 'utf8'))
  .join('\n');
const dead = cues.filter(c => !srcText.includes(`'${c.id}'`) && !DEAD_CUE_ALLOWLIST.has(c.id));

console.log(`Audio manifest: ${cues.length} cues checked.`);
if (dead.length) {
  console.warn(`\n⚠️  ${dead.length} cue(s) declared but never triggered in code:`);
  for (const c of dead) console.warn(`   - ${c.id}`);
}
if (missing.length) {
  console.error(`\n❌ ${missing.length} declared file(s) missing on disk:`);
  for (const f of missing) console.error(`   - ${f}`);
  process.exit(1);
}
console.log(dead.length ? '\nOK (no missing files; dead cues are warnings).' : '\nOK: all cues wired, all files present.');
