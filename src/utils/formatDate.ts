const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// "2025-10-03" → "03 Oct 2025"
export function formatDateMedium(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${dd} ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
