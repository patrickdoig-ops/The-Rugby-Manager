// Design-system lint — fails on off-system colour tokens, raw px font-sizes,
// and banned icon glyphs. Runs as part of `npm run verify`.
//
// Rules enforced in style/*.css (main.css exempt — it defines the tokens):
//   • No raw hex colour outside :root  (#xxx / #xxxxxx)
//   • No named colour in color-mix()  (white, black)
//   • No raw px font-size  (use var(--rm-fs-*))
//
// Rule enforced in src/ui/**/*.ts:
//   • No banned Unicode glyph used as iconography  (●○★▲▼✓✗✕☆✦•)

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT  = new URL('..', import.meta.url).pathname;
const STYLE = join(ROOT, 'style');
const UI    = join(ROOT, 'src', 'ui');

// Patterns + messages for CSS files
const CSS_RULES: [RegExp, string][] = [
  [/#[0-9a-fA-F]{3,8}\b/,                          'raw hex colour — use an --rm-* token'],
  [/\bcolor-mix\([^)]*,\s*(white|black)\b/,         'named colour in color-mix — use var(--rm-chalk) or transparent'],
  [/\bfont-size:\s*\d+(?:\.\d+)?px\b/,              'raw px font-size — use var(--rm-fs-*)'],
];

const GLYPH_RE: [RegExp, string] = [/[●○★▲▼✓✗✕☆✦•]/, 'banned Unicode glyph — use an SVG icon (DESIGN.md §6.1)'];

let errors = 0;

function flag(file: string, ln: number, msg: string, src: string): void {
  console.error(`${file}:${ln}: ${msg}\n  ${src.trim()}`);
  errors++;
}

// Strip inline CSS comments before pattern-matching
function stripComment(line: string): string {
  return line.replace(/\/\*.*?\*\//, '').replace(/\/\/.*$/, '');
}

// CSS files — skip main.css (token definitions live there)
for (const name of readdirSync(STYLE).filter(f => f.endsWith('.css') && f !== 'main.css')) {
  const file = `style/${name}`;
  readFileSync(join(STYLE, name), 'utf8').split('\n').forEach((raw, i) => {
    const line = stripComment(raw);
    // Hex check: only trigger on property-value lines (contain `:`)
    if (CSS_RULES[0][0].test(line) && line.includes(':')) flag(file, i + 1, CSS_RULES[0][1], raw);
    if (CSS_RULES[1][0].test(line))                       flag(file, i + 1, CSS_RULES[1][1], raw);
    if (CSS_RULES[2][0].test(line))                       flag(file, i + 1, CSS_RULES[2][1], raw);
  });
}

// TS UI files — glyph check
function walkTs(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { walkTs(full); continue; }
    if (!entry.name.endsWith('.ts')) continue;
    const rel = `src/ui${full.slice(UI.length)}`;
    readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
      if (GLYPH_RE[0].test(line)) flag(rel, i + 1, GLYPH_RE[1], line);
    });
  }
}
walkTs(UI);

if (errors > 0) {
  console.error(`\nDesign-system lint: ${errors} violation${errors === 1 ? '' : 's'}. Fix before committing.`);
  process.exit(1);
}
console.log('Design-system lint: OK');
