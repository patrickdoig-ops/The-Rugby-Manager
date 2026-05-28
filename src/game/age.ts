// Small calendar / age helpers. All pure, all deterministic.
//
// `getAge` returns whole years between dob and `now`; null when dob is
// missing so callers can render a placeholder.
//
// `seasonOpenIso` and `parseSeasonStartYear` cover the season-label →
// year → "1 September of that year" round-trip used by `careerRollover`
// and `contractSeeder`. One canonical pair so the previous four-site
// `ageOnDate` inlines and two-site `parseSeasonStartYear` duplicates
// collapse here.

import { SEASON_VALUES } from '../engine/balance';

export function getAge(dobIso: string | null, nowIso: string): number | null {
  if (!dobIso) return null;
  const dob = new Date(dobIso);
  const now = new Date(nowIso);
  if (isNaN(dob.getTime()) || isNaN(now.getTime())) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

// ISO yyyy-mm-dd for the season-open anchor of a given start year.
// Uses SEASON_VALUES.seasonOpenMonth / seasonOpenDay so all age and
// contract code agrees on a single "the season is now starting" date.
export function seasonOpenIso(seasonStartYear: number): string {
  const mm = String(SEASON_VALUES.seasonOpenMonth + 1).padStart(2, '0');
  const dd = String(SEASON_VALUES.seasonOpenDay).padStart(2, '0');
  return `${seasonStartYear}-${mm}-${dd}`;
}

// "2025/26 Season" → 2025. Falls back to the current calendar year
// when the label doesn't carry a 4-digit prefix — never happens for
// fixture-list-generated labels but defensive against malformed saves.
export function parseSeasonStartYear(label: string): number {
  const m = label.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : new Date().getUTCFullYear();
}
