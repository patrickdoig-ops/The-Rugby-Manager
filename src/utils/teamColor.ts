// Returns a text-safe version of a team's primary colour for use against the
// dark app background. Colours below the perceived-luminance threshold are
// mixed toward white via CSS color-mix so they remain readable while still
// hinting at the team's identity (e.g. Saracens' black becomes a dark grey).
// Bright colours are returned unchanged.
//
// Used wherever team colour is applied to TEXT (Scoreboard codes, StatsPanel
// headers and jersey numbers, CommentaryFeed names, etc.). Background uses
// (crest gradients, bars) keep the original colour — they have their own
// contrast against surrounding chrome.

const LUMA_THRESHOLD = 0.25;

export function teamTextColor(hex: string): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luma >= LUMA_THRESHOLD) return hex;
  return `color-mix(in oklch, ${hex} 40%, white)`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([\da-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Mirrors colorOnDark() from ui/teamColors.ts — near-black colours are
// rendered as white on the dark pitch. Duplicated here so engine code
// never imports from ui/.
const NEAR_BLACK_WCAG = 0.02;
function wcagLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
}
function displayColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return wcagLuminance(...rgb) < NEAR_BLACK_WCAG ? '#ffffff' : hex;
}

// True when two team colours are close enough to be hard to tell apart on
// screen. Compares the display-resolved colours (near-black → white) so that
// a dark-navy away kit that renders white is never flagged as clashing with a
// green home kit that renders green — they are clearly distinct on the pitch.
// Threshold 80 keeps genuinely distinct pairs like LEI green vs SAR black
// (both rendering their own hue, distance ~117) apart.
const CLASH_THRESHOLD = 80;

export function colorsClash(hex1: string, hex2: string): boolean {
  const a = hexToRgb(displayColor(hex1));
  const b = hexToRgb(displayColor(hex2));
  if (!a || !b) return false;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) < CLASH_THRESHOLD;
}
