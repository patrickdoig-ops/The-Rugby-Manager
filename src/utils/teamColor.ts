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
