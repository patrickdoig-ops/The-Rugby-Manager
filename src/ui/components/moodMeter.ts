// 5-pip SVG meter used by TeamTalkScreen and HalfTimeTalkPanel.
// Each pip is a circle — filled ones are full opacity, empty ones ghost at 18%.
// Inherits colour from currentColor so the parent's mood modifier drives hue.
export function moodPipSvg(filled: number, total = 5): string {
  const r = 3.5;
  const gap = 3;
  const step = r * 2 + gap;
  const w = (total - 1) * step + r * 2;
  const circles = Array.from({ length: total }, (_, i) => {
    const cx = i * step + r;
    const extra = i < filled ? '' : ' opacity="0.18"';
    return `<circle cx="${cx}" cy="${r}" r="${r}" fill="currentColor"${extra}/>`;
  }).join('');
  return `<svg class="mood-pip-strip" width="${w}" height="${r * 2}" viewBox="0 0 ${w} ${r * 2}" aria-hidden="true">${circles}</svg>`;
}
