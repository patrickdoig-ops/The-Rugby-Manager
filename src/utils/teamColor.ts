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

// True when two team primaries are close enough that they'd be hard to tell
// apart at a glance on small chips (crests, jersey numbers, chart bars).
// Used by `MatchCoordinator` to decide whether the home team flips to its
// change strip. Plain RGB Euclidean — a CIEDE2000 implementation would be
// more perceptually correct but the threshold here is tuned against this
// league's actual palette and only needs to catch obvious clashes (identical
// black/black, navy/navy, green/green, black vs near-black navy). Threshold
// 80 keeps distinct colours like LEI green vs SAR black (~117) apart.
const CLASH_THRESHOLD = 80;

export function colorsClash(hex1: string, hex2: string): boolean {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  if (!a || !b) return false;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) < CLASH_THRESHOLD;
}
