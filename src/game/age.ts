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
import { EXPIRING_CONTRACT_WINDOW_MONTHS } from '../engine/balance/transfers';

// True when `expiresOn` falls inside the rolling
// EXPIRING_CONTRACT_WINDOW_MONTHS window measured from `fromDate`.
// Shared by the Contracts screen's "Expiring" tag/badge and the
// mid-season early-renewal eligibility gate so the UI signal and the
// gameplay seam can never disagree.
export function isContractExpiringSoon(expiresOn: string, fromDate: string): boolean {
  if (!expiresOn) return false;
  const exp = new Date(expiresOn);
  const today = new Date(fromDate);
  const monthsAhead = (exp.getUTCFullYear() - today.getUTCFullYear()) * 12
                    + (exp.getUTCMonth() - today.getUTCMonth());
  return monthsAhead >= 0 && monthsAhead <= EXPIRING_CONTRACT_WINDOW_MONTHS;
}

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

// Add `days` (may be negative) to an ISO yyyy-mm-dd date, returning the same
// shape. UTC-based so it's DST-agnostic. One canonical helper so the previous
// three-site private `addDays`/`addDaysIso` copies (cupScheduler, applySeasonEvent,
// the playoff bracket) collapse here.
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
