// Shared presentation of a player's form value as a friendly star + label
// rating, used across the in-match StatsPanel (actual rolled formModifier) and
// the out-of-match PreMatch / Contracts screens (deterministic form trend).
//
// Input is a signed form scalar on roughly the [-10, +10] modifier scale.

export interface FormRating {
  stars: number;   // 1–5
  label: string;
}

export function formRating(value: number): FormRating {
  if (value >= 6)  return { stars: 5, label: 'On fire' };
  if (value >= 2)  return { stars: 4, label: 'In form' };
  if (value >= -1) return { stars: 3, label: 'Steady' };
  if (value >= -5) return { stars: 2, label: 'Off form' };
  return { stars: 1, label: 'Poor' };
}

// Inline star glyphs (★ filled, ☆ empty) for a 1–5 rating.
export function formStars(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
}
