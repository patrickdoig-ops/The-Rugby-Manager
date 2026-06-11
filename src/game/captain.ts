// Captain resolution — picks the rosterId of the match captain from a
// starting XV. The manager's explicit nomination wins when it still maps to a
// selected starter; otherwise the highest-composure starter is captain by
// default. Pure + deterministic (ties break on selection order), so the
// pre-match UI badge and the in-match narrative always agree on who's captain.

interface CaptainCandidate {
  rosterId?: number;
  baseStats: { composure: number };
}

export function resolveCaptainRosterId(
  starters: CaptainCandidate[],
  explicit?: number,
): number | undefined {
  if (explicit !== undefined && starters.some(p => p.rosterId === explicit)) {
    return explicit;
  }
  let best: CaptainCandidate | undefined;
  for (const p of starters) {
    if (p.rosterId === undefined) continue;
    if (!best || p.baseStats.composure > best.baseStats.composure) best = p;
  }
  return best?.rosterId;
}
