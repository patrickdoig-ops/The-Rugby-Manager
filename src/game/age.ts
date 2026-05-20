// Pure date-arithmetic helper. Returns whole years between dob and `now`.
// Returns null when dob is missing so callers can render a placeholder.

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
