// Injects --team-color (branding tints) and --team-color-tile (solid fills).
// For near-black primaries the tile variable flips to secondaryColor so buttons
// and chips remain visible against the dark UI surface.
export function injectTeamColors(
  el: HTMLElement,
  team: { color: string; secondaryColor: string },
): void {
  el.style.setProperty('--team-color', team.color);
  el.style.setProperty('--team-color-tile', isNearBlack(team.color) ? team.secondaryColor : team.color);
}

function isNearBlack(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L < 0.01;
}
