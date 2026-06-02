// Injects --team-color (branding tints), --team-color-tile (solid fills),
// and --team-color-tile-text (text on those fills).
// For near-black primaries the tile variable flips to secondaryColor so buttons
// and chips remain visible against the dark UI surface.
// For light tile fills (e.g. white) the text variable flips to near-black so
// labels remain readable.

// Returns a colour that is readable on a dark background.
// Near-black primaries return white; all others return the primary colour.
export function colorOnDark(color: string): string {
  return isNearBlack(color) ? '#ffffff' : color;
}

export function injectTeamColors(
  el: HTMLElement,
  team: { color: string; secondaryColor: string },
): void {
  el.style.setProperty('--team-color', team.color);
  const tileColor = isNearBlack(team.color) ? team.secondaryColor : team.color;
  el.style.setProperty('--team-color-tile', tileColor);
  el.style.setProperty('--team-color-tile-text', luminance(tileColor) > 0.4 ? '#1a1a1a' : '#ffffff');
}

// Readable text colour to sit ON a fill of `hex` — near-black on light fills,
// white on dark. Mirrors the tile-text rule in injectTeamColors.
export function textOn(hex: string): string {
  return luminance(hex) > 0.4 ? '#1a1a1a' : '#ffffff';
}

export function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function isNearBlack(hex: string): boolean {
  return luminance(hex) < 0.02;
}
