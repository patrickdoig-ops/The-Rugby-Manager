// Form-pip strip — shared renderer for the 5-game W/D/L run that
// appears next to team names on FixtureList, Hub's next-match card,
// LeagueTable's form view, and similar. The visual token lives in
// style/main.css as .form-pip + size + state modifiers.
//
// `form` is the array returned by `recentForm()` in teamStats.ts —
// oldest visible result at index 0, most recent at index n-1, padded
// left with null for unplayed slots.

import type { FormResult } from '../../game/teamStats';

export type FormPipSize = 'sm' | 'md';

export function renderFormPipStrip(
  form: Array<FormResult | null>,
  size: FormPipSize = 'sm',
): string {
  const pips = form.map(r => {
    if (!r) return `<span class="form-pip form-pip--${size} form-pip--empty">–</span>`;
    return `<span class="form-pip form-pip--${size} form-pip--${r.toLowerCase()}">${r}</span>`;
  }).join('');
  return `<span class="form-pip-strip form-pip-strip--${size}">${pips}</span>`;
}
